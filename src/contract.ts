/**
 * Validate the contrast contract and color recipe, and expand rules into pairs.
 *
 * @module
 */
import { normalizeHex } from "./color.ts";
import { TARGETS, TERMINAL_BACKGROUND, type Algorithm, type ContrastContract, type Minimums, type Mode, type Pair, type Target, type ThemeRecipe } from "./types.ts";

/** Fields a contrast rule may have. */
const RULE_FIELDS = new Set(["token", "backgrounds", "dark", "light", "targets", "note"]);

/**
 * The perceptual low clip reports contrast below about 10 as 0. Minimums below this use
 * the unclipped formula, so faint surfaces (panels, the scrollbar track) stay measurable.
 */
const LOW_CLIP_BELOW = 15;

/**
 * Check that minimums have exactly a WCAG ratio (1-21) and a perceptual contrast (0-108).
 *
 * @param value - The minimums to check.
 * @returns Whether they are valid.
 */
const validMinimums = (value: Minimums | undefined): boolean =>
  typeof value === "object" && value !== null && Object.keys(value).length === 2
  && typeof value.wcag === "number" && value.wcag >= 1 && value.wcag <= 21
  && typeof value.perceptual === "number" && value.perceptual >= 0 && value.perceptual <= 108;

/**
 * List every themed token: each rule's token and backgrounds.
 *
 * @param contract - The contrast contract.
 * @returns The tokens, excluding the terminal background.
 */
export function contractTokens(contract: ContrastContract): string[] {
  const tokens = new Set(contract.relationships.flatMap((rule) => [rule.token, ...rule.backgrounds]));
  tokens.delete(TERMINAL_BACKGROUND);
  return [...tokens];
}

/**
 * List the tokens a target emits into Pi theme JSON.
 *
 * @param contract - The contrast contract.
 * @param target - The target Pi.
 * @returns The tokens; `current` omits proposed tokens.
 */
export function emittedTokens(contract: ContrastContract, target: Target): string[] {
  return contractTokens(contract).filter((token) => target === "extended" || !(token in contract.proposed));
}

/**
 * Validate the contrast contract.
 *
 * @param contract - The contrast contract.
 * @throws If a rule is malformed, a token has no rule, or a proposed token lacks a valid fallback.
 */
export function validateContract(contract: ContrastContract): void {
  const { proposed, relationships } = contract;
  if (!Array.isArray(relationships) || typeof proposed !== "object") throw new Error("Contract needs proposed and relationships");

  relationships.forEach((rule, index) => {
    const label = `rule ${index} (${rule.token})`;
    const unknown = Object.keys(rule).filter((field) => !RULE_FIELDS.has(field));
    if (unknown.length) throw new Error(`Unknown field ${unknown} in ${label}`);
    if (typeof rule.token !== "string" || rule.token === TERMINAL_BACKGROUND) throw new Error(`Invalid token in ${label}`);
    if (!Array.isArray(rule.backgrounds) || rule.backgrounds.length === 0 || rule.backgrounds.includes(rule.token)) {
      throw new Error(`Invalid backgrounds in ${label}`);
    }
    if (!rule.dark && !rule.light) throw new Error(`Missing dark or light minimums in ${label}`);
    for (const mode of ["dark", "light"] as const) {
      if (rule[mode] !== undefined && !validMinimums(rule[mode])) {
        throw new Error(`Invalid ${mode} minimums in ${label}: expected { wcag: 1-21, perceptual: 0-108 }`);
      }
    }
    if (rule.targets !== undefined && !(Array.isArray(rule.targets) && rule.targets.length && rule.targets.every((t) => TARGETS.includes(t)))) {
      throw new Error(`Invalid targets in ${label}`);
    }
  });

  // Every token is solved from its own rules, so each needs at least one.
  const tokens = contractTokens(contract);
  const ruled = new Set(relationships.map((rule) => rule.token));
  const unruled = tokens.filter((token) => !ruled.has(token));
  if (unruled.length) throw new Error(`Tokens without a contrast rule: ${unruled}`);
  for (const [token, fallback] of Object.entries(proposed)) {
    if (!ruled.has(token) || !tokens.includes(fallback) || fallback in proposed) {
      throw new Error(`Proposed token ${token} needs rules and an existing, non-proposed fallback`);
    }
  }
}

/**
 * Expand rules into pairs as Pi renders them. In `current`, a proposed token's
 * rules land on its fallback.
 *
 * @param contract - The contrast contract.
 * @param algorithm - The algorithm whose minimums to use.
 * @param target - The target Pi.
 * @param mode - The mode whose minimums to use; a rule without them uses the other mode's.
 * @returns One pair per rule and background.
 */
export function contractPairs(contract: ContrastContract, algorithm: Algorithm, target: Target, mode: Mode): Pair[] {
  return contract.relationships
    .filter((rule) => !rule.targets || rule.targets.includes(target))
    .flatMap((rule) => {
      const minimums = (mode === "dark" ? rule.dark ?? rule.light : rule.light ?? rule.dark)!;
      const minimum = minimums[algorithm];
      return rule.backgrounds.map((background) => ({
        // In `current`, a proposed token does not exist: its rules land on its fallback.
        token: target === "current" ? contract.proposed[rule.token] ?? rule.token : rule.token,
        background,
        contrast: minimum,
        algorithm,
        lowClip: minimum >= LOW_CLIP_BELOW,
      }));
    });
}

/**
 * Validate the recipe and map every contract token to its color family.
 *
 * @param recipe - The color recipe.
 * @param contract - The contrast contract.
 * @returns The family name of every token.
 * @throws If a background or family is invalid, or a token has no family or two.
 */
export function validateRecipe(recipe: ThemeRecipe, contract: ContrastContract): Record<string, string> {
  normalizeHex(recipe.terminalBackground?.dark);
  normalizeHex(recipe.terminalBackground?.light);
  for (const [name, { hue, saturation }] of Object.entries(recipe.families ?? {})) {
    const valid = hue >= 0 && hue < 360 && saturation?.min >= 0 && saturation.min <= saturation.max && saturation.max <= 1;
    if (!valid) throw new Error(`Invalid family ${name}: hue must be in [0, 360) and 0 <= saturation.min <= max <= 1`);
  }

  const tokens = contractTokens(contract);
  const families: Record<string, string> = {};
  for (const { tokens: roleTokens, family } of recipe.roles ?? []) {
    if (!recipe.families[family]) throw new Error(`Unknown family ${family}`);
    for (const token of roleTokens) {
      if (families[token]) throw new Error(`Token ${token} has two families`);
      if (!tokens.includes(token)) throw new Error(`Unknown recipe token ${token}`);
      families[token] = family;
    }
  }
  const missing = tokens.filter((token) => !families[token]);
  if (missing.length) throw new Error(`Tokens without a family: ${missing}`);

  const { families: familySlots = {}, tokens: tokenSlots = {} } = recipe.ansiSlots ?? {};
  for (const slot of [...Object.values(familySlots), ...Object.values(tokenSlots)]) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 15) throw new Error(`Invalid ANSI slot ${slot}: expected 0-15`);
  }
  const unslotted = tokens.filter((token) => tokenSlots[token] === undefined && familySlots[families[token]] === undefined);
  if (unslotted.length) throw new Error(`Tokens without an ANSI slot: ${unslotted}`);
  return families;
}
