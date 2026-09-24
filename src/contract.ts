import { ALGORITHMS, TARGETS, type Algorithm, type ContrastContract, type ContrastRule, type Pair, type Target, type TokenDefinition } from "./types.ts";

const TOKEN_FIELDS = new Set(["type", "origin", "optionalFallback", "proposed"]);
const RULE_FIELDS = new Set(["kind", "token", "backgrounds", "contrast", "reason", "note", "targets", "apcaLowClip", "lightContrast", "apcaLightContrast"]);

function assertKnownFields(value: object, allowed: Set<string>, label: string): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new Error(`Unknown property ${label}.${field}`);
    }
  }
}

function validateTokens(tokens: Record<string, TokenDefinition>): void {
  if (tokens.background?.type !== "background" || tokens.background.origin !== "virtual-terminal") {
    throw new Error("Missing virtual terminal background");
  }

  for (const [name, token] of Object.entries(tokens)) {
    if (!token || (token.type !== "background" && token.type !== "foreground")) {
      throw new Error(`Invalid token type: ${name}`);
    }
    assertKnownFields(token, TOKEN_FIELDS, `tokens.${name}`);

    if (token.optionalFallback && tokens[token.optionalFallback]?.type !== token.type) {
      throw new Error(`Invalid fallback: ${name}`);
    }
    if (token.proposed) validateProposedToken(name, token, tokens);
  }
}

function validateProposedToken(name: string, token: TokenDefinition, tokens: Record<string, TokenDefinition>): void {
  const fallbackName = token.proposed?.fallback;
  const fallback = fallbackName ? tokens[fallbackName] : undefined;
  if (token.origin || token.optionalFallback) {
    throw new Error(`Proposed token ${name} cannot be virtual or have an optionalFallback`);
  }
  if (!fallback || fallback.proposed || fallback.type !== token.type) {
    // Virtual terminal tokens are valid fallbacks: they model Pi's "" (terminal default).
    throw new Error(`Proposed token ${name} needs an existing ${token.type} fallback`);
  }
}

function isVirtual(tokens: Record<string, TokenDefinition>, name: string): boolean {
  return tokens[name]?.origin === "virtual-terminal";
}

function validateRule(rule: ContrastRule, index: number, tokens: Record<string, TokenDefinition>, contractAlgorithm: Algorithm): void {
  assertKnownFields(rule, RULE_FIELDS, `relationships[${index}]`);
  const source = tokens[rule.token];
  if (!source) {
    throw new Error(`Unknown token ${rule.token} in rule ${index}`);
  }
  if (rule.kind !== "text" && rule.kind !== "nonText") {
    throw new Error(`Invalid kind in rule ${index}`);
  }
  if (rule.kind === "text" && source.type !== "foreground") {
    throw new Error(`Background used as text in rule ${index}`);
  }
  if (!Array.isArray(rule.backgrounds) || rule.backgrounds.length === 0) {
    throw new Error(`Missing backgrounds in rule ${index}`);
  }
  if (rule.apcaLowClip !== undefined && (typeof rule.apcaLowClip !== "boolean" || contractAlgorithm !== "APCA")) {
    throw new Error(`apcaLowClip is only valid as a boolean in APCA contracts (rule ${index})`);
  }
  if (rule.contrast !== null && !validContrast(rule.contrast, contractAlgorithm)) {
    throw new Error(`Invalid contrast in rule ${index}`);
  }
  if (rule.lightContrast !== undefined && !validContrast(rule.lightContrast, contractAlgorithm)) {
    throw new Error(`Invalid lightContrast in rule ${index}`);
  }
  if (rule.apcaLightContrast !== undefined && (contractAlgorithm !== "WCAG2" || !validContrast(rule.apcaLightContrast, "APCA"))) {
    throw new Error(`apcaLightContrast is only valid in WCAG contracts, as an APCA Lc (rule ${index})`);
  }
  if (rule.contrast === null && !rule.reason) {
    throw new Error(`Explicit no-requirement rule ${index} needs a reason`);
  }
  if (rule.targets !== undefined) {
    const valid = Array.isArray(rule.targets) && rule.targets.length > 0
      && rule.targets.every((target) => TARGETS.includes(target));
    if (!valid) throw new Error(`Invalid targets in rule ${index}`);
  }

  for (const background of rule.backgrounds) {
    // Scrollbar characters are foreground-painted; the track is the thumb's backdrop.
    const isTrack = rule.kind === "nonText"
      && rule.token === "scrollbarThumb"
      && background === "scrollbarTrack";
    if (tokens[background]?.type !== "background" && !isTrack) {
      throw new Error(`Invalid background ${background} in rule ${index}`);
    }
    if (background === rule.token) {
      throw new Error(`Self-contrast in rule ${index}`);
    }
  }
}

function validContrast(value: number, algorithm: Algorithm): boolean {
  const [min, max] = algorithm === "APCA" ? [0, 108] : [1, 21];
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** Turn each listed backdrop into an individually checkable contrast pair. */
export function expandRelationships(contract: ContrastContract): Pair[] {
  return contract.relationships.flatMap((rule) => rule.backgrounds.map((background) => ({
    kind: rule.kind,
    token: rule.token,
    background,
    contrast: rule.contrast,
    reason: rule.reason ?? rule.note ?? null,
    algorithm: contract.algorithm,
    apcaLowClip: rule.apcaLowClip ?? true,
    ...(rule.lightContrast !== undefined && rule.contrast !== null && { lightContrast: rule.lightContrast }),
  })));
}

/** Tokens this target emits into Pi theme JSON (virtual tokens never are). */
export function emittedTokens(contract: ContrastContract, target: Target): string[] {
  return Object.entries(contract.tokens)
    .filter(([, definition]) => !definition.origin && (target === "extended" || !definition.proposed))
    .map(([name]) => name);
}

/**
 * Pairs as Pi would render them for one target. In `current`, a proposed
 * token does not exist, so its rules are checked on its fallback instead.
 */
export function pairsForTarget(contract: ContrastContract, target: Target): Pair[] {
  const pairs: Pair[] = [];
  const seen = new Set<string>();
  for (const rule of contract.relationships) {
    if (rule.targets && !rule.targets.includes(target)) continue;
    for (const pair of expandRelationships({ ...contract, relationships: [rule] })) {
      const fallback = target === "current" ? contract.tokens[pair.token].proposed?.fallback : undefined;
      const resolved = fallback ? { ...pair, token: fallback, via: pair.token } : pair;
      const key = `${resolved.kind}:${resolved.token}:${resolved.background}:${resolved.contrast}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push(resolved);
      }
    }
  }
  return pairs;
}

/** Resolve per-mode minimums: light themes use `lightContrast` where a rule sets it. */
export function pairsForMode(pairs: Pair[], mode: "dark" | "light"): Pair[] {
  return mode === "dark" ? pairs : pairs.map((pair) =>
    pair.lightContrast === undefined ? pair : { ...pair, contrast: pair.lightContrast });
}

export function isVirtualToken(contract: ContrastContract, name: string): boolean {
  return isVirtual(contract.tokens, name);
}

function pairKey(pair: Pair, tokens: Record<string, TokenDefinition>): string {
  const isSurfacePair = pair.kind === "nonText" && tokens[pair.token].type === "background";
  const names = isSurfacePair
    ? [pair.token, pair.background].sort().join(":")
    : `${pair.token}:${pair.background}`;
  return `${pair.kind}:${names}`;
}

export interface ContractSummary {
  required: number;
  noRequirement: number;
}

/** Validate structure, explicit nulls, unique pairs, and coverage of every semantic color. */
export function validateContract(contract: ContrastContract): ContractSummary {
  if (contract.version !== 2 || !ALGORITHMS.includes(contract.algorithm)) {
    throw new Error("Unsupported contract version/algorithm");
  }
  if (!contract.tokens || !Array.isArray(contract.relationships)) {
    throw new Error("Missing tokens or relationships");
  }
  validateTokens(contract.tokens);
  contract.relationships.forEach((rule, index) => validateRule(rule, index, contract.tokens, contract.algorithm));

  const seen = new Set<string>();
  const covered = new Set<string>();
  const againstTerminalBackground = new Set<string>();
  const pairs = expandRelationships(contract);

  contract.relationships.forEach((rule, index) => {
    for (const background of rule.backgrounds) {
      const pair = { kind: rule.kind, token: rule.token, background, contrast: rule.contrast, reason: null, algorithm: contract.algorithm, apcaLowClip: true };
      // Rules limited to different targets may describe the same pair differently.
      for (const target of rule.targets ?? TARGETS) {
        const key = `${target}:${pairKey(pair, contract.tokens)}`;
        if (seen.has(key)) {
          throw new Error(`Duplicate relationship ${key} (rule ${index})`);
        }
        seen.add(key);
      }
    }
  });

  for (const pair of pairs) {
    covered.add(pair.token);

    if (pair.background === "background" && contract.tokens[pair.token].type === "background") {
      againstTerminalBackground.add(pair.token);
    }
  }

  for (const [name, token] of Object.entries(contract.tokens)) {
    if (name !== "background" && !covered.has(name)) {
      throw new Error(`Token ${name} has no relationships (even no-requirement)`);
    }
    if (name !== "background" && token.type === "background" && !againstTerminalBackground.has(name)) {
      throw new Error(`Background ${name} has no recorded relationship with background`);
    }
  }

  return {
    required: pairs.filter((pair) => pair.contrast !== null).length,
    noRequirement: pairs.filter((pair) => pair.contrast === null).length,
  };
}

/** Current-target tokens must match the Pi checkout exactly; proposed tokens must not exist there yet. */
export function validatePiInventory(contract: ContrastContract, piColors: Record<string, unknown>): void {
  const piTokens = Object.keys(piColors);
  const recipeTokens = emittedTokens(contract, "current");
  const alreadyInPi = emittedTokens(contract, "extended")
    .filter((name) => contract.tokens[name].proposed && piTokens.includes(name));
  if (alreadyInPi.length) {
    throw new Error(`Proposed tokens already exist in Pi: ${alreadyInPi}; move them to current tokens`);
  }
  const missing = piTokens.filter((name) => !recipeTokens.includes(name));
  const extra = recipeTokens.filter((name) => !piTokens.includes(name));

  if (missing.length || extra.length) {
    throw new Error(`Pi token inventory mismatch: missing ${missing}; extra ${extra}`);
  }
}
