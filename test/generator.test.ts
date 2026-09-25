import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveApcaContract } from "../src/apca.ts";
import { apcaContrast, contrast, grayLightness, luminance, normalizeHex, okhslToHex } from "../src/color.ts";
import { contractPairs, emittedTokens, validateContract } from "../src/contract.ts";
import { generateTheme } from "../src/solve.ts";
import type { ContrastContract, Mode, Target, ThemeRecipe } from "../src/types.ts";

const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
const recipe = readJson<ThemeRecipe>("../theme-recipe.json");
const wcag = readJson<ContrastContract>("../contrast-requirements.json");
const apca = deriveApcaContract(recipe, wcag);
const clone = <T>(value: T): T => structuredClone(value);

/** Direct calculation uses the gray formula, so saturated colors land a few percent off a minimum. */
const TOLERANCE = 0.88;

/** Ratio of every contract pair in a generated theme, against the recipe background. */
function measure(contract: ContrastContract, mode: Mode, target: Target) {
  const { theme } = generateTheme(recipe, contract, mode, target);
  const colors: Record<string, string> = { ...theme.colors, background: recipe.terminalBackground[mode] };
  return contractPairs(contract, target, mode).map((pair) => ({
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

for (const [name, contract] of [["WCAG", wcag], ["APCA", apca]] as const) {
  for (const mode of ["dark", "light"] as const) {
    test(`${name} ${mode}: every pair lands at or near its minimum`, () => {
      for (const target of ["current", "extended"] as const) {
        for (const pair of measure(contract, mode, target)) {
          assert.ok(pair.actual >= pair.contrast * TOLERANCE,
            `${target} ${pair.token} on ${pair.background}: ${pair.actual.toFixed(2)} < ${pair.contrast}`);
        }
      }
    });
  }
}

test("higher minimums produce more prominent colors", () => {
  const onCanvas = (token: string) => measure(wcag, "dark", "current")
    .find((pair) => pair.token === token && pair.background === "background")!.actual;
  const hierarchy = ["text", "muted", "dim"].map(onCanvas);
  assert.deepEqual(hierarchy, [...hierarchy].sort((a, b) => b - a));
  const thinking = ["thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "thinkingMax"].map(onCanvas);
  assert.deepEqual(thinking, [...thinking].sort((a, b) => a - b));
});

test("dark themes are lighter than the background, light themes darker", () => {
  for (const mode of ["dark", "light"] as const) {
    const background = luminance(recipe.terminalBackground[mode]);
    for (const [token, hex] of Object.entries(generateTheme(recipe, wcag, mode, "extended").theme.colors)) {
      assert.ok(mode === "dark" ? luminance(hex) > background : luminance(hex) < background, `${mode} ${token}`);
    }
  }
});

test("current omits proposed tokens and applies their rules to the fallback", () => {
  const current = generateTheme(recipe, wcag, "dark", "current").theme;
  const extended = generateTheme(recipe, wcag, "dark", "extended").theme;
  for (const [token, fallback] of Object.entries(wcag.proposed)) {
    assert.equal(current.colors[token], undefined);
    assert.ok(extended.colors[token]);
    assert.ok(contractPairs(wcag, "current", "dark").some((pair) => pair.token === fallback));
  }
  assert.equal(Object.keys(extended.colors).length, Object.keys(current.colors).length + Object.keys(wcag.proposed).length);
  assert.ok(!emittedTokens(wcag, "extended").includes("background"));
});

test("theme names distinguish every variant", () => {
  const names = [wcag, apca].flatMap((contract) => (["current", "extended"] as const).flatMap((target) =>
    (["dark", "light"] as const).map((mode) => generateTheme(recipe, contract, mode, target).theme.name)));
  assert.equal(new Set(names).size, 8);
  assert.ok(names.includes("generated-pi-dark"));
  assert.ok(names.includes("generated-pi-apca-extended-light"));
});

test("a custom terminal background moves the theme with it", () => {
  const custom = generateTheme(recipe, wcag, "dark", "current", "#000000");
  assert.equal(custom.relaxation, undefined);
  assert.notEqual(custom.theme.colors.text, generateTheme(recipe, wcag, "dark", "current").theme.colors.text);
  assert.ok(contrast(custom.theme.colors.text, "#000000") >= 11 * TOLERANCE);
});

test("a mid-gray background relaxes the contract instead of failing", () => {
  const { theme, relaxation } = generateTheme(recipe, wcag, "dark", "current", "#777777");
  assert.ok(relaxation !== undefined && relaxation > 0 && relaxation <= 2);
  assert.ok(contrast(theme.colors.text, "#777777") > contrast(theme.colors.dim, "#777777"));
});

test("APCA dark minimums reproduce the WCAG dark theme", () => {
  const wcagColors = generateTheme(recipe, wcag, "dark", "extended").theme.colors;
  const apcaColors = generateTheme(recipe, apca, "dark", "extended").theme.colors;
  // Same families, so only lightness differs: by rounding, and by the gray formula on saturated colors.
  const lightness = (hex: string) => grayLightness(luminance(hex));
  for (const token of Object.keys(wcagColors)) {
    assert.ok(Math.abs(lightness(wcagColors[token]) - lightness(apcaColors[token])) < 0.04, `${token}: ${wcagColors[token]} vs ${apcaColors[token]}`);
  }
  // Faint surfaces measure below APCA's low clip, so they use the unclipped formula.
  assert.equal(apca.relationships.find((rule) => rule.token === "userMessageBg")?.apcaLowClip, false);
  assert.equal(apca.relationships.find((rule) => rule.token === "text")?.apcaLowClip, undefined);
});

test("contract validation rejects broken rules", () => {
  assert.doesNotThrow(() => validateContract(wcag));
  const broken = (edit: (contract: ContrastContract) => void) => {
    const contract = clone(wcag);
    edit(contract);
    return () => validateContract(contract);
  };
  assert.throws(broken((c) => { c.relationships[0].contrast = 30; }), /Invalid contrast/);
  assert.throws(broken((c) => { c.relationships[0].backgrounds = []; }), /Invalid backgrounds/);
  assert.throws(broken((c) => { (c.relationships[0] as unknown as Record<string, unknown>).kind = "text"; }), /Unknown field/);
  assert.throws(broken((c) => { c.relationships[0].apcaLowClip = false; }), /apcaLowClip/);
  assert.throws(broken((c) => { c.relationships = c.relationships.filter((rule) => rule.token !== "selectedBg"); }), /without a contrast rule/);
  assert.throws(broken((c) => { c.proposed.toolArgument = "missing"; }), /Proposed token/);
});

test("recipe validation requires a family for every token", () => {
  const withoutRole = clone(recipe);
  withoutRole.roles = withoutRole.roles.filter((role) => !role.tokens.includes("text"));
  assert.throws(() => generateTheme(withoutRole, wcag, "dark", "current"), /without a family/);
  const badFamily = clone(recipe);
  badFamily.families.neutral.saturation.max = 2;
  assert.throws(() => generateTheme(badFamily, wcag, "dark", "current"), /Invalid family/);
});
