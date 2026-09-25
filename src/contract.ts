import { normalizeHex } from "./color.ts";
import { TARGETS, TERMINAL_BACKGROUND, type Algorithm, type ContrastContract, type Mode, type Pair, type Target, type ThemeRecipe } from "./types.ts";

const RULE_FIELDS = new Set(["token", "backgrounds", "contrast", "lightContrast", "apcaLightContrast", "apcaLowClip", "targets", "note"]);
const RANGE: Record<Algorithm, [number, number]> = { WCAG2: [1, 21], APCA: [0, 108] };

const validContrast = (value: unknown, algorithm: Algorithm): boolean =>
  typeof value === "number" && value >= RANGE[algorithm][0] && value <= RANGE[algorithm][1];

/** Every themed token: each rule's token and backgrounds, except the terminal background. */
export function contractTokens(contract: ContrastContract): string[] {
  const tokens = new Set(contract.relationships.flatMap((rule) => [rule.token, ...rule.backgrounds]));
  tokens.delete(TERMINAL_BACKGROUND);
  return [...tokens];
}

/** Tokens a target emits into Pi theme JSON. */
export function emittedTokens(contract: ContrastContract, target: Target): string[] {
  return contractTokens(contract).filter((token) => target === "extended" || !(token in contract.proposed));
}

export function validateContract(contract: ContrastContract): void {
  const { algorithm, proposed, relationships } = contract;
  if (algorithm !== "WCAG2" && algorithm !== "APCA") throw new Error(`Unknown algorithm ${algorithm}`);
  if (!Array.isArray(relationships) || typeof proposed !== "object") throw new Error("Contract needs proposed and relationships");

  relationships.forEach((rule, index) => {
    const label = `rule ${index} (${rule.token})`;
    const unknown = Object.keys(rule).filter((field) => !RULE_FIELDS.has(field));
    if (unknown.length) throw new Error(`Unknown field ${unknown} in ${label}`);
    if (typeof rule.token !== "string" || rule.token === TERMINAL_BACKGROUND) throw new Error(`Invalid token in ${label}`);
    if (!Array.isArray(rule.backgrounds) || rule.backgrounds.length === 0 || rule.backgrounds.includes(rule.token)) {
      throw new Error(`Invalid backgrounds in ${label}`);
    }
    if (!validContrast(rule.contrast, algorithm)) throw new Error(`Invalid contrast in ${label}`);
    if (rule.lightContrast !== undefined && !validContrast(rule.lightContrast, algorithm)) throw new Error(`Invalid lightContrast in ${label}`);
    if (rule.apcaLightContrast !== undefined && (algorithm !== "WCAG2" || !validContrast(rule.apcaLightContrast, "APCA"))) {
      throw new Error(`apcaLightContrast must be an APCA Lc in a WCAG contract (${label})`);
    }
    if (rule.apcaLowClip !== undefined && (algorithm !== "APCA" || typeof rule.apcaLowClip !== "boolean")) {
      throw new Error(`apcaLowClip must be a boolean in an APCA contract (${label})`);
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

/** Expand rules into pairs as Pi renders them for one target and mode. */
export function contractPairs(contract: ContrastContract, target: Target, mode: Mode): Pair[] {
  return contract.relationships
    .filter((rule) => !rule.targets || rule.targets.includes(target))
    .flatMap((rule) => rule.backgrounds.map((background) => ({
      // In `current`, a proposed token does not exist: its rules land on its fallback.
      token: target === "current" ? contract.proposed[rule.token] ?? rule.token : rule.token,
      background,
      contrast: mode === "light" ? rule.lightContrast ?? rule.contrast : rule.contrast,
      algorithm: contract.algorithm,
      apcaLowClip: rule.apcaLowClip ?? true,
    })));
}

/** Map every contract token to its color family, validating anchors and families. */
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
  return families;
}
