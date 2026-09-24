import {
  apcaScreenLuminance, apcaTargetLuminance, colorAt, contrast, grayLightness, luminance, normalizeHex,
  wcagTargetLuminance, type PaletteColor,
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
/** Correction passes for colors whose luminance differs from a gray of the same lightness. */
const MAX_CORRECTIONS = 8;

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

function meets(token: string, hex: string, requirements: RequiredPair[], colors: Record<string, string>): boolean {
  return requirements.every((pair) => {
    const foreground = pair.token === token ? hex : colors[pair.token];
    const background = pair.background === token ? hex : colors[pair.background];
    return contrast(foreground, background, pair.algorithm, pair.apcaLowClip) + TOLERANCE >= pair.contrast;
  });
}

/**
 * Compute a token's lightness directly: each requirement's inverse contrast formula
 * gives the luminance the token needs; the strictest one wins. Converting that
 * luminance to OKHSL lightness is exact for grays; saturated colors are corrected
 * by the gap between their actual luminance and the target.
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

  const at = (lightness: number): PaletteColor => colorAt(family, 1000 * (1 - Math.min(1, Math.max(0, lightness))));
  let lightness = Number.isNaN(target)
    ? canvasLightness + (lighter ? NO_REQUIREMENT_OFFSET : -NO_REQUIREMENT_OFFSET)
    : grayLightness(target);
  // Never cross the canvas: dark themes get lighter colors, light themes darker ones.
  lightness = lighter ? Math.max(lightness, canvasLightness) : Math.min(lightness, canvasLightness);
  let color = at(lightness);

  // Saturated colors can over- or undershoot the target luminance. Correct toward it
  // from both sides (secant steps on the lightness axis), keeping the closest color
  // that meets every requirement.
  const measure = (hex: string) => grayLightness(luminance(hex));
  if (!Number.isNaN(target)) {
    const goal = grayLightness(target);
    let best = meets(token, color.hex, requirements, colors) ? color : undefined;
    for (let pass = 0; pass < MAX_CORRECTIONS; pass++) {
      const gap = goal - measure(color.hex);
      if (Math.abs(gap) < 0.0005) break;
      lightness += gap;
      if (lightness > 1 || lightness < 0) break;
      color = at(lightness);
      if (meets(token, color.hex, requirements, colors)
        && (!best || Math.abs(goal - measure(color.hex)) < Math.abs(goal - measure(best.hex)))) best = color;
    }
    // Hex rounding can leave the closest color a hair short: nudge outward until it meets.
    for (let pass = 0; pass < MAX_CORRECTIONS && !best; pass++) {
      lightness += lighter ? 0.002 : -0.002;
      if (lightness > 1 || lightness < 0) break;
      color = at(lightness);
      if (meets(token, color.hex, requirements, colors)) best = color;
    }
    if (best) color = best;
  }
  if (!meets(token, color.hex, requirements, colors)) {
    throw new Error(`No feasible ${mode} color for ${token} in family ${roles[token].family}.`);
  }

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
