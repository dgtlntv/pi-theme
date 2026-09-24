import {
  apcaScreenLuminance, apcaTargetLuminance, colorAt, grayLightness, luminance, normalizeHex, wcagTargetLuminance,
} from "./color.ts";
import { emittedTokens } from "./contract.ts";
import type { ContrastContract, Mode, Pair, RecipeRole, Selection, Target, ThemeRecipe } from "./types.ts";

// Surfaces are solved before foreground text, which is checked against them.
const BACKGROUND_ORDER = [
  "userMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg",
  "selectedBg", "customMessageBg", "searchMatchBg",
];
const TOLERANCE = 1e-9;
/** Lightness offset for a token with no requirement: distinct from, but close to, the canvas. */
const NO_REQUIREMENT_OFFSET = 0.01;

type RequiredPair = Pair & { contrast: number };

export interface TerminalOverrides {
  background?: string;
}

export interface ColorSelection {
  colors: Record<string, string>;
  selected: Record<string, Selection>;
}

function applicablePairs(token: string, pairs: Pair[], colors: Record<string, string>): RequiredPair[] {
  return pairs.filter((pair): pair is RequiredPair => {
    if (pair.contrast === null) return false;
    if (pair.token === token) return colors[pair.background] !== undefined;
    if (pair.background === token) return colors[pair.token] !== undefined;
    return false;
  });
}

/**
 * WCAG luminance a color on the given side must have to meet one requirement, from the
 * inverse contrast formulas. Outside 0-1 (or NaN) means unreachable.
 */
function targetLuminance(token: string, pair: RequiredPair, colors: Record<string, string>, lighter: boolean): number {
  const role = pair.token === token ? "text" : "background";
  const other = colors[role === "text" ? pair.background : pair.token];
  if (pair.algorithm === "WCAG2") return wcagTargetLuminance(pair.contrast, luminance(other), lighter);
  // APCA solves in its own screen luminance; convert that gray back to WCAG luminance.
  const screen = apcaTargetLuminance(pair.contrast, apcaScreenLuminance(other), lighter, role, pair.apcaLowClip);
  if (!(screen >= 0 && screen <= 1)) return Number.NaN;
  const channel = screen ** (1 / 2.4);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Compute a token's lightness directly: each requirement's inverse contrast formula
 * gives the luminance the token needs; the strictest one wins. That luminance is
 * converted to OKHSL lightness with the gray formula: exact for grays, within a few
 * percent of the minimum for saturated colors (up to about ΔE 0.03), which is fine
 * for a theme.
 */
function chooseColor(token: string, roles: Record<string, RecipeRole>, recipe: ThemeRecipe, mode: Mode, pairs: Pair[], result: ColorSelection): void {
  const family = recipe.families[roles[token].family];
  const colors = result.colors;
  const requirements = applicablePairs(token, pairs, colors);
  const lighter = mode === "dark";
  const canvasLightness = grayLightness(luminance(colors.background));

  let target: number;
  if (requirements.length === 0) {
    target = Number.NaN;
  } else {
    const targets = requirements.map((pair) => targetLuminance(token, pair, colors, lighter));
    target = lighter ? Math.max(...targets) : Math.min(...targets);
    if (targets.some((value) => Number.isNaN(value)) || target > 1 + TOLERANCE || target < -TOLERANCE) {
      const known = requirements.map((pair) => `${pair.token}/${pair.background} >= ${pair.contrast}`).join(", ");
      throw new Error(`No feasible ${mode} color for ${token}; known constraints: ${known}. Adjust the contrast rules or terminal anchor.`);
    }
  }

  let lightness = Number.isNaN(target)
    ? canvasLightness + (lighter ? NO_REQUIREMENT_OFFSET : -NO_REQUIREMENT_OFFSET)
    : grayLightness(target);
  // Never cross the canvas: dark themes get lighter colors, light themes darker ones.
  lightness = lighter ? Math.max(lightness, canvasLightness) : Math.min(lightness, canvasLightness);
  const color = colorAt(family, 1000 * (1 - Math.min(1, Math.max(0, lightness))));

  colors[token] = color.hex;
  result.selected[token] = {
    family: roles[token].family,
    step: Number(color.step.toFixed(1)),
    hex: color.hex,
    saturation: Number(color.saturation.toFixed(5)),
    source: "contrast-derived",
  };
}

/** Derive every token's lightness from its contrast requirements against the anchored terminal background. */
export function selectColors(
  recipe: ThemeRecipe,
  contract: ContrastContract,
  roles: Record<string, RecipeRole>,
  mode: Mode,
  target: Target,
  pairs: Pair[],
  overrides: TerminalOverrides,
): ColorSelection {
  const result: ColorSelection = { colors: {}, selected: {} };
  const anchor = normalizeHex(overrides.background ?? recipe.terminalBackground[mode]);
  result.colors.background = anchor;
  result.selected.background = { family: null, step: null, hex: anchor,
    source: overrides.background === undefined ? "recipe-assumption" : "terminal-override" };

  const choose = (token: string) => chooseColor(token, roles, recipe, mode, pairs, result);
  for (const token of BACKGROUND_ORDER) choose(token);

  // Proposed tokens absent from this target are not selected; their rules
  // were already moved onto their fallbacks by pairsForTarget().
  const emitted = new Set(emittedTokens(contract, target));
  const foregrounds = Object.keys(contract.tokens).filter((token) =>
    contract.tokens[token].type === "foreground" && emitted.has(token) && token !== "scrollbarThumb");
  for (const token of foregrounds) choose(token);
  // The scrollbar thumb's required contrast is against the previously chosen track.
  choose("scrollbarThumb");
  return result;
}
