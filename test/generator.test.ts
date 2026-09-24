import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bellWeight, colorAt, contrast, luminance, normalizeHex } from "../src/color.ts";
import Color from "colorjs.io";

const deltaE = (a: string, b: string): number => new Color(a).deltaE(new Color(b), "OK");
import { expandRelationships, pairsForTarget, validateContract, validatePiInventory } from "../src/contract.ts";
import { deriveApcaContract } from "../src/apca-derivation.ts";
import { generateTheme, validateRecipe } from "../src/solve.ts";
import type { ContrastContract, ThemeRecipe } from "../src/types.ts";

const recipe = JSON.parse(readFileSync(resolve("theme-recipe.json"), "utf8")) as ThemeRecipe;
const contract = JSON.parse(readFileSync(resolve("contrast-requirements.json"), "utf8")) as ContrastContract;

test("OKHSL bell curve, Color.js WCAG contrast, and terminal color parsing", () => {
  assert.equal(bellWeight(0), 0);
  assert.equal(bellWeight(1000), 0);
  assert.ok(Math.abs(bellWeight(500) - 1) < 1e-12);
  assert.equal(colorAt(recipe.families.blue, 0).hex, "#ffffff");
  assert.equal(colorAt(recipe.families.blue, 1000).hex, "#000000");
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 0.001);
  assert.equal(normalizeHex("rgb(255 0 0)"), "#ff0000");
  assert.throws(() => normalizeHex("transparent"), /opaque/);
});

test("recipe defines a terminal background anchor and a family for every other token", () => {
  const roles = validateRecipe(recipe, contract);
  assert.equal(roles.background, undefined);
  assert.deepEqual(Object.keys(roles).sort(), Object.keys(contract.tokens).filter((token) => token !== "background").sort());
  assert.ok(recipe.roles.every((role) => !("steps" in role)));
  for (const token of ["accent", "mdCode", "mdListBullet", "syntaxType"]) {
    assert.equal(roles[token].family, "violet");
  }
  assert.equal(roles.thinkingMedium.family, "thinkingPeriwinkle");
  assert.equal(roles.userMessageBg.family, "blue");
  // Custom-message labels share their panel's hue family.
  assert.equal(roles.customMessageLabel.family, roles.customMessageBg.family);
  assert.equal(validateContract(contract).required, 196);
  // Primary reading text: Pi's `text` and the proposed assistant reply body.
  // Primary reading text on the canvas; in current Pi assistant replies use the terminal default.
  assert.deepEqual(contract.relationships.filter((rule) => rule.contrast === 11).map((rule) => rule.token),
    ["text", "terminalForeground"]);
  assert.equal(contract.relationships.find((rule) => rule.token === "border" && rule.kind === "nonText")?.contrast, 4.5);
  const muted = contract.relationships.find((rule) => rule.token === "muted" && rule.kind === "text");
  const dim = contract.relationships.filter((rule) => rule.token === "dim" && rule.kind === "text");
  assert.equal(muted?.contrast, 5);
  // One tertiary level everywhere, including the footer; no panel exception.
  assert.equal(dim.length, 1);
  assert.deepEqual(dim[0].backgrounds, ["background", "selectedBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]);
  assert.equal(dim[0].contrast, 3);

  const legacy = structuredClone(recipe);
  Object.assign(legacy.roles[0], { steps: { dark: 800, light: 200 } });
  assert.throws(() => validateRecipe(legacy, contract), /Unknown recipe role field: steps/);
});

test("dark and light themes derive lightness from contrast, satisfying every required pair", () => {
  for (const mode of ["dark", "light"] as const) {
    const { theme, report } = generateTheme(recipe, contract, mode);
    assert.equal(Object.keys(theme.colors).length, 56);
    assert.equal(theme.colors.background, undefined);
    assert.equal(report.terminal.background.hex, recipe.terminalBackground[mode]);
    assert.equal(report.terminal.foreground.source, "contrast-derived");
    assert.equal(report.summary.required, 190);
    assert.equal(report.summary.noRequirement, 11);
    assert.ok(report.checks.every((pair) => pair.passes !== false));
    // Pi's footer renders the cwd and usage/model lines with `dim` on the terminal canvas.
    // Light mode pushes secondary text further (lightContrast).
    const levels = mode === "dark" ? [["dim", 3], ["muted", 5]] as const : [["dim", 3.75], ["muted", 5.5]] as const;
    for (const [token, minimum] of levels) {
      const canvasPair = report.checks.find((pair) => pair.token === token && pair.background === "background" && pair.kind === "text");
      assert.equal(canvasPair?.contrast, minimum);
      assert.ok(canvasPair && canvasPair.ratio >= minimum);
    }
    for (const surface of ["selectedBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]) {
      const panelPair = report.checks.find((pair) => pair.token === "dim" && pair.background === surface && pair.kind === "text");
      assert.equal(panelPair?.contrast, mode === "dark" ? 3 : 3.75);
    }
    const border = report.checks.find((pair) => pair.token === "border" && pair.background === "background");
    assert.equal(border?.contrast, 4.5);
    assert.ok(border && border.ratio >= 4.5);

    for (const token of ["userMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]) {
      const pair = report.checks.find((check) => check.token === token && check.background === "background");
      assert.equal(pair?.contrast, 1.2);
      assert.ok(pair && pair.ratio >= 1.2);
    }
    // Tool titles and user text are very prominent through a 10:1 minimum, not a fixed color.
    for (const [token, surface] of [["toolTitle", "toolPendingBg"], ["userMessageText", "userMessageBg"]]) {
      assert.equal(report.selected[token].source, "contrast-derived");
      assert.ok(contrast(theme.colors[token], theme.colors[surface]) >= 10);
    }
    assert.equal(report.relaxation, undefined);
    if (mode === "dark") {
      assert.notEqual(theme.colors.accent, "#ffffff");
      assert.notEqual(theme.colors.mdCode, "#ffffff");
    }
  }
});

test("null means no requirement, and the contract validator rejects omitted relationships", () => {
  const pair = expandRelationships(contract).find((item) =>
    item.token === "searchMatchBg" && item.background === "toolPendingBg");
  assert.equal(pair?.contrast, null);
  assert.equal(validateContract(contract).noRequirement, 11);

  const incomplete = structuredClone(contract);
  incomplete.relationships = incomplete.relationships.filter((rule) => rule.token !== "selectedBg");
  assert.throws(() => validateContract(incomplete), /Token selectedBg has no relationships/);
});

const PROPOSED = ["toolArgument", "mdTableBorder"];

test("current target omits proposed tokens and checks their rules on the fallback Pi renders", () => {
  const pairs = pairsForTarget(contract, "current");
  assert.ok(pairs.every((pair) => !PROPOSED.includes(pair.token)));
  const tableBorder = pairs.find((pair) => pair.via === "mdTableBorder");
  assert.equal(tableBorder?.token, "terminalForeground");
  assert.equal(tableBorder?.contrast, 3);

  for (const mode of ["dark", "light"] as const) {
    const { theme } = generateTheme(recipe, contract, mode);
    assert.equal(Object.keys(theme.colors).length, 56);
    assert.ok(PROPOSED.every((token) => !(token in theme.colors)));
  }
});

test("extended target adds the optional tokens", () => {
  for (const mode of ["dark", "light"] as const) {
    const { theme, report } = generateTheme(recipe, contract, mode, {}, "extended");
    assert.equal(theme.name, `generated-pi-extended-${mode}`);
    assert.equal(Object.keys(theme.colors).length, 58);
    assert.ok(report.checks.every((pair) => pair.passes !== false));
    for (const surface of ["selectedBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]) {
      const dim = report.checks.find((pair) => pair.token === "dim" && pair.background === surface && pair.kind === "text");
      assert.equal(dim?.contrast, mode === "dark" ? 3 : 3.75);
    }
    assert.notEqual(theme.colors.toolArgument, theme.colors.accent);

    // Minimums define a hierarchy, so each level must be distinct and ordered.
    const bg = recipe.terminalBackground[mode];
    const ratio = (token: string) => contrast(theme.colors[token], bg);
    const ordered = (tokens: string[]) => tokens.every((token, i) => i === 0 || ratio(tokens[i - 1]) > ratio(token));
    assert.ok(ordered(["text", "muted", "dim"]), "text > muted > dim");
    assert.ok(ordered(["thinkingMax", "thinkingXhigh", "thinkingHigh", "thinkingMedium", "thinkingLow", "thinkingMinimal", "thinkingOff"]));
    assert.ok(ratio("border") > ratio("borderMuted") && Math.abs(ratio("borderAccent") - ratio("border")) < 0.2);
    assert.ok(ratio("scrollbarTrack") < 2 && ratio("scrollbarTrack") >= 1.7);
    assert.equal(theme.colors.mdHr, theme.colors.muted);
  }
  // Only the current-target Pi inventory is compared with a Pi checkout.
  const piColors = Object.fromEntries(Object.keys(generateTheme(recipe, contract, "dark").theme.colors).map((key) => [key, 0]));
  assert.doesNotThrow(() => validatePiInventory(contract, piColors));
  assert.throws(() => validatePiInventory(contract, { ...piColors, toolArgument: 0 }), /already exist in Pi/);
});

test("proposed tokens and targets are validated", () => {
  const missingFallback = structuredClone(contract);
  missingFallback.tokens.toolArgument.proposed = { fallback: "nope" };
  assert.throws(() => validateContract(missingFallback), /needs an existing foreground fallback/);

  const badTarget = structuredClone(contract);
  badTarget.relationships[0].targets = ["future" as never];
  assert.throws(() => validateContract(badTarget), /Invalid targets/);

  const duplicate = structuredClone(contract);
  duplicate.relationships.push({ ...duplicate.relationships.find((rule) => rule.token === "toolArgument")! });
  assert.throws(() => validateContract(duplicate), /Duplicate relationship/);
});

test("changing one contrast ratio derives a different lightness, without preferred steps", () => {
  const relaxed = structuredClone(contract);
  const rule = relaxed.relationships.find((item) => item.token === "userMessageBg" && item.backgrounds.includes("background"));
  assert.ok(rule);
  rule.contrast = null;

  const original = generateTheme(recipe, contract, "dark").report.selected.userMessageBg;
  const changed = generateTheme(recipe, relaxed, "dark").report.selected.userMessageBg;
  assert.notEqual(changed.step, original.step);
  assert.ok(contrast(changed.hex, recipe.terminalBackground.dark) < contrast(original.hex, recipe.terminalBackground.dark));
});

test("increasing a text ratio makes its derived foreground brighter in dark mode", () => {
  const stronger = structuredClone(contract);
  const textRule = stronger.relationships.find((rule) => rule.token === "text");
  assert.ok(textRule);
  textRule.contrast = 13;

  const original = generateTheme(recipe, contract, "dark").report.selected.text;
  const changed = generateTheme(recipe, stronger, "dark").report.selected.text;
  assert.ok(changed.step !== null && original.step !== null && changed.step < original.step);
});

test("Ghostty's default dark terminal colors satisfy every declared contrast pair", () => {
  assert.equal(recipe.terminalBackground.dark, "#282c34");
  const result = generateTheme(recipe, contract, "dark", { terminalForeground: "#ffffff" });
  assert.equal(result.report.terminal.foreground.hex, "#ffffff");
  assert.ok(result.report.checks.every((pair) => pair.passes !== false));
});

test("changing the anchor or hue affects colors", () => {
  const changedRecipe = structuredClone(recipe);
  changedRecipe.terminalBackground.dark = "#151515";
  assert.notEqual(generateTheme(changedRecipe, contract, "dark").report.selected.toolSuccessBg.step,
    generateTheme(recipe, contract, "dark").report.selected.toolSuccessBg.step);

  const accentFamily = changedRecipe.roles.find((role) => role.tokens.includes("accent"))?.family;
  assert.ok(accentFamily);
  changedRecipe.families[accentFamily].hue = 180;
  assert.notEqual(generateTheme(changedRecipe, contract, "dark").theme.colors.accent,
    generateTheme(recipe, contract, "dark").theme.colors.accent);

});

test("mid-range backgrounds relax the contract as little as needed instead of failing", () => {
  // Stage 1: #555555 allows at most 7.5:1, so text (9) cannot be met; the hierarchy compresses.
  const compressed = generateTheme(recipe, contract, "dark", { background: "#555555" }, "extended");
  const relaxation = compressed.report.relaxation;
  assert.ok(relaxation && relaxation.value > 0 && relaxation.value <= 1, `stage 1: ${relaxation?.value}`);
  assert.ok(relaxation.unmet > 0);
  const onBg = (token: string) => contrast(compressed.theme.colors[token], "#555555");
  assert.ok(onBg("text") >= onBg("muted") && onBg("muted") >= onBg("dim"), "hierarchy order survives");
  assert.ok(compressed.report.checks.every((pair) => pair.contrast === null || pair.contrast >= 1),
    "checks report against the original contract");

  // Stage 2: #777777 cannot even reach 4.5:1, so readability gives way too.
  const extreme = generateTheme(recipe, contract, "dark", { background: "#777777" }, "extended");
  assert.ok(extreme.report.relaxation && extreme.report.relaxation.value > 1);

  // Pinned terminal text that no background change can fix still yields a best-effort theme.
  const pinned = generateTheme(recipe, contract, "dark", { background: "#505050", terminalForeground: "#999999" });
  assert.ok(pinned.report.relaxation);
});

test("APCA contract is derived from the WCAG dark theme and reproduces it", () => {
  const apca = deriveApcaContract(recipe, contract);
  assert.equal(apca.algorithm, "APCA");
  assert.equal(validateContract(apca).required, validateContract(contract).required);
  // Whole-number Lc minimums; faint surfaces use the unclipped formula instead of WCAG.
  for (const rule of apca.relationships) {
    if (rule.contrast === null) continue;
    if (rule.apcaLowClip === false) assert.ok(rule.contrast > 0 && rule.contrast < 15, `${rule.token} unclipped Lc ${rule.contrast}`);
    else assert.ok(Number.isInteger(rule.contrast) && rule.contrast >= 15, `${rule.token} Lc ${rule.contrast}`);
  }
  // The committed file matches the derivation.
  const committed = JSON.parse(readFileSync(resolve("contrast-requirements.apca.json"), "utf8")) as ContrastContract;
  assert.deepEqual(committed.relationships, apca.relationships);

  for (const target of ["current", "extended"] as const) {
    const wcagDark = generateTheme(recipe, contract, "dark", {}, target);
    const apcaDark = generateTheme(recipe, apca, "dark", {}, target);
    assert.equal(apcaDark.theme.name, target === "current" ? "generated-pi-apca-dark" : "generated-pi-apca-extended-dark");
    assert.ok(apcaDark.report.checks.every((pair) => pair.passes !== false));
    // Rounding down may shift a step, but never perceptibly (OKLab distance < 0.02).
    for (const [token, hex] of Object.entries(wcagDark.theme.colors)) {
      assert.ok(deltaE(hex, apcaDark.theme.colors[token]) < 0.02, `${target} ${token}: ${hex} vs ${apcaDark.theme.colors[token]}`);
    }
    assert.ok(generateTheme(recipe, apca, "light", {}, target).report.checks.every((pair) => pair.passes !== false));
  }
});

test("APCA contrast is directional and reported as absolute Lc", () => {
  const text = contrast("#ffffff", "#282c34", "APCA");
  assert.ok(text > 90 && text < 110);
  assert.notEqual(contrast("#282c34", "#ffffff", "APCA"), text);
  assert.equal(contrast("#223d4a", "#282c34", "APCA"), 0, "APCA clips near-background pairs to 0");
});
