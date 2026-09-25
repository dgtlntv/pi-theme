import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apcaContrast, contrast, luminance, normalizeHex, okhslToHex } from "../src/color.ts";
import { contractPairs, emittedTokens, validateContract } from "../src/contract.ts";
import { generateTheme } from "../src/solve.ts";
import type { Algorithm, ContrastContract, Mode, Target, ThemeRecipe } from "../src/types.ts";

const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
const recipe = readJson<ThemeRecipe>("../theme-recipe.json");
const contract = readJson<ContrastContract>("../contrast-requirements.json");
const clone = <T>(value: T): T => structuredClone(value);

/** Direct calculation uses the gray formula, so saturated colors land a few percent off a minimum. */
const TOLERANCE = 0.88;

/** Ratio of every contract pair in a generated theme, against the recipe background. */
function measure(algorithm: Algorithm, mode: Mode, target: Target) {
  const { theme } = generateTheme(recipe, contract, algorithm, mode, target);
  const colors: Record<string, string> = { ...theme.colors, background: recipe.terminalBackground[mode] };
  return contractPairs(contract, algorithm, target, mode).map((pair) => ({
    ...pair,
    actual: contrast(colors[pair.token], colors[pair.background], pair.algorithm, pair.apcaLowClip),
  }));
}

test("color math matches reference values", () => {
  assert.equal(okhslToHex(0, 0, 0), "#000000");
  assert.equal(okhslToHex(0, 0, 1), "#ffffff");
  // Reference values from Color.js.
  assert.equal(okhslToHex(250, 0.05, 0.9), "#e1e3e5");
  assert.equal(okhslToHex(20, 1, 0.6), "#ff3752");
  assert.equal(okhslToHex(295, 0.4, 0.5), "#7b6da5");

  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(luminance("#ffffff"), 1);
  // APCA is directional: dark text on white is positive, light text on black negative.
  assert.ok(Math.abs(apcaContrast("#000000", "#ffffff") - 106.04067321268862) < 1e-9);
  assert.ok(Math.abs(apcaContrast("#ffffff", "#000000") + 107.88473318309848) < 1e-9);
  assert.equal(apcaContrast("#777777", "#777777"), 0);

  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.throws(() => normalizeHex("red"));
});

for (const algorithm of ["WCAG2", "APCA"] as const) {
  for (const mode of ["dark", "light"] as const) {
    test(`${algorithm} ${mode}: every pair lands at or near its minimum`, () => {
      for (const target of ["current", "extended"] as const) {
        for (const pair of measure(algorithm, mode, target)) {
          assert.ok(pair.actual >= pair.contrast * TOLERANCE,
            `${target} ${pair.token} on ${pair.background}: ${pair.actual.toFixed(2)} < ${pair.contrast}`);
        }
      }
    });
  }
}

test("higher minimums produce more prominent colors", () => {
  for (const algorithm of ["WCAG2", "APCA"] as const) {
    for (const mode of ["dark", "light"] as const) {
      const pairs = measure(algorithm, mode, "current");
      const onCanvas = (token: string) => pairs.find((pair) => pair.token === token && pair.background === "background")!.actual;
      const hierarchy = ["text", "muted", "dim"].map(onCanvas);
      assert.deepEqual(hierarchy, [...hierarchy].sort((a, b) => b - a), `${algorithm} ${mode}`);
      const thinking = ["thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "thinkingMax"].map(onCanvas);
      assert.deepEqual(thinking, [...thinking].sort((a, b) => a - b), `${algorithm} ${mode}`);
    }
  }
});

test("a rule without light minimums uses its dark minimums in light mode, and vice versa", () => {
  const rule = { token: "text", backgrounds: ["background"], dark: { wcag: 7, apca: 70 } };
  const pairs = (mode: Mode, algorithm: Algorithm) => contractPairs({ proposed: {}, relationships: [rule] }, algorithm, "current", mode);
  assert.equal(pairs("light", "WCAG2")[0].contrast, 7);
  assert.equal(pairs("light", "APCA")[0].contrast, 70);
  const lightOnly = { proposed: {}, relationships: [{ ...rule, dark: undefined, light: { wcag: 8, apca: 80 } }] };
  assert.equal(contractPairs(lightOnly, "WCAG2", "current", "dark")[0].contrast, 8);
});

test("faint APCA minimums use the unclipped formula", () => {
  const apcaPairs = contractPairs(contract, "APCA", "current", "dark");
  assert.equal(apcaPairs.find((pair) => pair.token === "userMessageBg")?.apcaLowClip, false);
  assert.equal(apcaPairs.find((pair) => pair.token === "text")?.apcaLowClip, true);
});

test("dark themes are lighter than the background, light themes darker", () => {
  for (const mode of ["dark", "light"] as const) {
    const background = luminance(recipe.terminalBackground[mode]);
    for (const [token, hex] of Object.entries(generateTheme(recipe, contract, "WCAG2", mode, "extended").theme.colors)) {
      assert.ok(mode === "dark" ? luminance(hex) > background : luminance(hex) < background, `${mode} ${token}`);
    }
  }
});

test("current omits proposed tokens and applies their rules to the fallback", () => {
  const current = generateTheme(recipe, contract, "WCAG2", "dark", "current").theme;
  const extended = generateTheme(recipe, contract, "WCAG2", "dark", "extended").theme;
  const currentPairs = contractPairs(contract, "WCAG2", "current", "dark");
  for (const [token, fallback] of Object.entries(contract.proposed)) {
    assert.equal(current.colors[token], undefined);
    assert.ok(extended.colors[token]);
    assert.ok(!currentPairs.some((pair) => pair.token === token));
    assert.ok(currentPairs.some((pair) => pair.token === fallback));
  }
  assert.equal(Object.keys(extended.colors).length, Object.keys(current.colors).length + Object.keys(contract.proposed).length);
  assert.ok(!emittedTokens(contract, "extended").includes("background"));
});

test("theme names distinguish every variant", () => {
  const names = (["WCAG2", "APCA"] as const).flatMap((algorithm) => (["current", "extended"] as const).flatMap((target) =>
    (["dark", "light"] as const).map((mode) => generateTheme(recipe, contract, algorithm, mode, target).theme.name)));
  assert.equal(new Set(names).size, 8);
  assert.ok(names.includes("generated-pi-dark"));
  assert.ok(names.includes("generated-pi-apca-extended-light"));
});

test("a custom terminal background moves the theme with it", () => {
  const custom = generateTheme(recipe, contract, "WCAG2", "dark", "current", "#000000");
  assert.equal(custom.relaxation, undefined);
  assert.notEqual(custom.theme.colors.text, generateTheme(recipe, contract, "WCAG2", "dark", "current").theme.colors.text);
  assert.ok(contrast(custom.theme.colors.text, "#000000") >= 11 * TOLERANCE);
});

test("a mid-gray background relaxes the contract instead of failing", () => {
  const { theme, relaxation } = generateTheme(recipe, contract, "WCAG2", "dark", "current", "#777777");
  assert.ok(relaxation !== undefined && relaxation > 0 && relaxation <= 2);
  assert.ok(contrast(theme.colors.text, "#777777") > contrast(theme.colors.dim, "#777777"));
});

test("contract validation rejects broken rules", () => {
  assert.doesNotThrow(() => validateContract(contract));
  const broken = (edit: (copy: ContrastContract) => void) => {
    const copy = clone(contract);
    edit(copy);
    return () => validateContract(copy);
  };
  assert.throws(broken((c) => { c.relationships[0].dark = { wcag: 30, apca: 90 }; }), /Invalid dark minimums/);
  assert.throws(broken((c) => { c.relationships[0].light = { wcag: 7 } as never; }), /Invalid light minimums/);
  assert.throws(broken((c) => { delete c.relationships[0].dark; delete c.relationships[0].light; }), /Missing dark or light/);
  assert.throws(broken((c) => { c.relationships[0].backgrounds = []; }), /Invalid backgrounds/);
  assert.throws(broken((c) => { (c.relationships[0] as unknown as Record<string, unknown>).contrast = 4.5; }), /Unknown field/);
  assert.throws(broken((c) => { c.relationships = c.relationships.filter((rule) => rule.token !== "selectedBg"); }), /without a contrast rule/);
  assert.throws(broken((c) => { c.proposed.toolArgument = "missing"; }), /Proposed token/);
});

test("recipe validation requires a family for every token", () => {
  const withoutRole = clone(recipe);
  withoutRole.roles = withoutRole.roles.filter((role) => !role.tokens.includes("text"));
  assert.throws(() => generateTheme(withoutRole, contract, "WCAG2", "dark", "current"), /without a family/);
  const badFamily = clone(recipe);
  badFamily.families.neutral.saturation.max = 2;
  assert.throws(() => generateTheme(badFamily, contract, "WCAG2", "dark", "current"), /Invalid family/);
});
