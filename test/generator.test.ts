/**
 * Generator tests: color math, contrast, targets, relaxation, and validation.
 *
 * @module
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contrast, hexToOkhsl, luminance, normalizeHex, okhslToHex, perceptualContrast } from "../src/color.ts";
import { contractPairs, emittedTokens, validateContract } from "../src/contract.ts";
import { generateTheme } from "../src/solve.ts";
import type { Algorithm, ContrastContract, Mode, Target, ThemeRecipe } from "../src/types.ts";

/**
 * Read a JSON file relative to this test.
 *
 * @param path - The file path.
 * @returns The parsed contents.
 */
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;

/** The project's color recipe. */
const recipe = readJson<ThemeRecipe>("../theme-recipe.json");

/** The project's contrast contract. */
const contract = readJson<ContrastContract>("../contrast-requirements.json");

/**
 * Deep-copy a value, so tests can break it.
 *
 * @param value - The value.
 * @returns The copy.
 */
const clone = <T>(value: T): T => structuredClone(value);

/** Direct calculation uses the gray formula, so saturated colors land a few percent off a minimum. */
const TOLERANCE = 0.88;

/**
 * Generate a theme and measure every contract pair in it.
 *
 * @param algorithm - The contrast algorithm.
 * @param mode - The theme mode.
 * @param target - The target Pi.
 * @returns Each pair with its actual contrast.
 */
function measure(algorithm: Algorithm, mode: Mode, target: Target) {
  const { theme } = generateTheme(recipe, contract, algorithm, mode, target);
  const colors: Record<string, string> = { ...theme.colors, background: recipe.terminalBackground[mode] };
  return contractPairs(contract, algorithm, target, mode).map((pair) => ({
    ...pair,
    actual: contrast(colors[pair.token], colors[pair.background], pair.algorithm, pair.lowClip),
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
  // Perceptual contrast is directional: dark text on white is positive, light text on black negative.
  assert.ok(Math.abs(perceptualContrast("#000000", "#ffffff") - 106.04067321268862) < 1e-9);
  assert.ok(Math.abs(perceptualContrast("#ffffff", "#000000") + 107.88473318309848) < 1e-9);
  assert.equal(perceptualContrast("#777777", "#777777"), 0);

  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.throws(() => normalizeHex("red"));
});

for (const algorithm of ["wcag", "perceptual"] as const) {
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
  for (const algorithm of ["wcag", "perceptual"] as const) {
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
  const rule = { token: "text", backgrounds: ["background"], dark: { wcag: 7, perceptual: 70 } };
  const pairs = (mode: Mode, algorithm: Algorithm) => contractPairs({ proposed: {}, relationships: [rule] }, algorithm, "current", mode);
  assert.equal(pairs("light", "wcag")[0].contrast, 7);
  assert.equal(pairs("light", "perceptual")[0].contrast, 70);
  const lightOnly = { proposed: {}, relationships: [{ ...rule, dark: undefined, light: { wcag: 8, perceptual: 80 } }] };
  assert.equal(contractPairs(lightOnly, "wcag", "current", "dark")[0].contrast, 8);
});

test("faint perceptual minimums use the unclipped formula", () => {
  const perceptualPairs = contractPairs(contract, "perceptual", "current", "dark");
  assert.equal(perceptualPairs.find((pair) => pair.token === "userMessageBg")?.lowClip, false);
  assert.equal(perceptualPairs.find((pair) => pair.token === "text")?.lowClip, true);
});

test("dark themes are lighter than the background, light themes darker", () => {
  for (const mode of ["dark", "light"] as const) {
    const background = luminance(recipe.terminalBackground[mode]);
    for (const [token, hex] of Object.entries(generateTheme(recipe, contract, "wcag", mode, "extended").theme.colors)) {
      assert.ok(mode === "dark" ? luminance(hex) > background : luminance(hex) < background, `${mode} ${token}`);
    }
  }
});

test("current omits proposed tokens and applies their rules to the fallback", () => {
  const current = generateTheme(recipe, contract, "wcag", "dark", "current").theme;
  const extended = generateTheme(recipe, contract, "wcag", "dark", "extended").theme;
  const currentPairs = contractPairs(contract, "wcag", "current", "dark");
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
  const names = (["wcag", "perceptual"] as const).flatMap((algorithm) => (["current", "extended"] as const).flatMap((target) =>
    (["dark", "light"] as const).map((mode) => generateTheme(recipe, contract, algorithm, mode, target).theme.name)));
  assert.equal(new Set(names).size, 8);
  assert.ok(names.includes("generated-pi-dark"));
  assert.ok(names.includes("generated-pi-perceptual-extended-light"));
});

test("a custom terminal background moves the theme with it", () => {
  const custom = generateTheme(recipe, contract, "wcag", "dark", "current", "#000000");
  assert.equal(custom.relaxation, undefined);
  assert.notEqual(custom.theme.colors.text, generateTheme(recipe, contract, "wcag", "dark", "current").theme.colors.text);
  assert.ok(contrast(custom.theme.colors.text, "#000000") >= 11 * TOLERANCE);
});

test("a mid-gray background relaxes the contract instead of failing", () => {
  const { theme, relaxation } = generateTheme(recipe, contract, "wcag", "dark", "current", "#777777");
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
  assert.throws(broken((c) => { c.relationships[0].dark = { wcag: 30, perceptual: 90 }; }), /Invalid dark minimums/);
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
  assert.throws(() => generateTheme(withoutRole, contract, "wcag", "dark", "current"), /without a family/);
  const badFamily = clone(recipe);
  badFamily.families.neutral.saturation.max = 2;
  assert.throws(() => generateTheme(badFamily, contract, "wcag", "dark", "current"), /Invalid family/);
});

test("a terminal palette supplies hue and saturation through the recipe's ANSI slots", () => {
  const palette = ["#1d1f21", "#cc6666", "#b5bd68", "#f0c674", "#81a2be", "#b294bb", "#8abeb7", "#c5c8c6", "#666666", "#d54e53", "#b9ca4a", "#e7c547", "#7aa6da", "#c397d8", "#70c0b1", "#eaeaea"];
  const { theme } = generateTheme(recipe, contract, "perceptual", "dark", "extended", undefined, palette);
  const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  for (const [token, slot] of [["error", 1], ["success", 2], ["syntaxString", 2], ["syntaxNumber", 5], ["searchMatchBg", 3], ["thinkingMax", 1]] as const) {
    assert.ok(hueDistance(hexToOkhsl(theme.colors[token]).hue, hexToOkhsl(palette[slot]).hue) < 8, token);
  }
  // Near-background panels keep the hue but fall off in saturation, away from the palette color's lightness.
  assert.ok(hexToOkhsl(theme.colors.toolSuccessBg).saturation < hexToOkhsl(palette[2]).saturation);
  // Bright black (slot 8) is gray, so neutral text is gray.
  assert.match(theme.colors.text, /^#([0-9a-f]{2})\1\1$/);
  assert.throws(() => generateTheme(recipe, contract, "perceptual", "dark", "extended", undefined, palette.slice(0, 8)), /16 colors/);
});
