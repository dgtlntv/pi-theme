import { colorAt, contrast, luminance, normalizeHex, type PaletteColor } from "./color.ts";
import { emittedTokens } from "./contract.ts";
import type { Algorithm, ContrastContract, Mode, Pair, RecipeRole, Selection, Target, ThemeRecipe } from "./types.ts";

// Surfaces are solved before foreground text. Unstyled terminal text is solved
// after surfaces unless its actual color was supplied via --terminal-fg.
const BACKGROUND_ORDER = [
  "userMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg",
  "selectedBg", "customMessageBg", "searchMatchBg",
];
const TOLERANCE = 1e-9;

type RequiredPair = Pair & { contrast: number };

/**
 * `bisect` (default) binary-searches each token's steps; `linear` checks every step.
 * Both return the same colors when feasibility grows monotonically away from the
 * canvas, which the tests verify across many backgrounds.
 */
export type SearchStrategy = "bisect" | "linear";

export interface TerminalOverrides {
  background?: string;
  terminalForeground?: string;
}

export interface ColorSelection {
  colors: Record<string, string>;
  selected: Record<string, Selection>;
}

interface SelectionContext {
  roles: Record<string, RecipeRole>;
  mode: Mode;
  search: SearchStrategy;
  pairs: Pair[];
  candidates: Record<string, PaletteColor[]>;
  result: ColorSelection;
}

function buildCandidates(recipe: ThemeRecipe, roles: Record<string, RecipeRole>): Record<string, PaletteColor[]> {
  const steps = Array.from({ length: 1000 / recipe.stepInterval + 1 }, (_, index) => index * recipe.stepInterval);
  const candidates: Record<string, PaletteColor[]> = {};
  for (const [token, role] of Object.entries(roles)) {
    candidates[token] = steps.map((step) => colorAt(recipe.families[role.family], step));
  }
  return candidates;
}

function applicablePairs(token: string, pairs: Pair[], colors: Record<string, string>): RequiredPair[] {
  return pairs.filter((pair): pair is RequiredPair => {
    if (pair.contrast === null) return false;
    if (pair.token === token) return colors[pair.background] !== undefined;
    if (pair.background === token) return colors[pair.token] !== undefined;
    return false;
  });
}

/** Relative excess over a minimum. APCA adds 1 so its 0 values stay finite. */
function excessOver(actual: number, minimum: number, algorithm: Algorithm): number {
  return algorithm === "APCA" ? Math.log((actual + 1) / (minimum + 1)) : Math.log(actual / minimum);
}

function candidateScore(
  token: string,
  candidate: PaletteColor,
  requirements: RequiredPair[],
  colors: Record<string, string>,
): number | null {
  let excess = 0;
  for (const pair of requirements) {
    const first = pair.token === token ? candidate.hex : colors[pair.token];
    const second = pair.background === token ? candidate.hex : colors[pair.background];
    const actual = contrast(first, second, pair.algorithm, pair.apcaLowClip);
    if (actual + TOLERANCE < pair.contrast) return null;
    excess += excessOver(actual, pair.contrast, pair.algorithm);
  }
  return requirements.length ? excess / requirements.length : 0;
}

interface Scored { color: PaletteColor; score: number; distance: number }

function chooseColor(token: string, context: SelectionContext): void {
  const { roles, mode, pairs, candidates, result, search } = context;
  const requirements = applicablePairs(token, pairs, result.colors);
  const canvas = result.colors.background;
  const canvasLuminance = luminance(canvas);
  const isSurface = BACKGROUND_ORDER.includes(token);
  const canvasRequirement = requirements.find((pair) =>
    pair.token === token && pair.background === "background");
  const canvasAlgorithm = canvasRequirement?.algorithm ?? "WCAG2";

  // Candidates on the allowed side of the canvas (lighter in dark mode, darker in
  // light mode), ordered from the canvas outward.
  const ordered = candidates[token]
    .map((color) => ({ color, brightness: luminance(color.hex) - canvasLuminance }))
    .filter(({ brightness }) => (mode === "dark" ? brightness >= -TOLERANCE : brightness <= TOLERANCE))
    .map(({ color, brightness }) => ({ color, distance: Math.abs(brightness) }))
    .sort((a, b) => a.distance - b.distance || a.color.step - b.color.step);

  const evaluate = ({ color, distance }: { color: PaletteColor; distance: number }): Scored | undefined => {
    // A null canvas relationship means no visibility guarantee. Still choose
    // a distinct hex, rather than returning the terminal color verbatim.
    if (isSurface && !canvasRequirement && color.hex === canvas) return undefined;
    const excessScore = candidateScore(token, color, requirements, result.colors);
    if (excessScore === null) return undefined;
    // Surface placement is controlled by its relationship to the canvas.
    // Other constraints (such as measured terminal text) restrict viable steps,
    // but must not drag an unconstrained surface away from the canvas.
    const score = isSurface
      ? excessOver(contrast(color.hex, canvas, canvasAlgorithm, canvasRequirement?.apcaLowClip), canvasRequirement?.contrast ?? 1, canvasAlgorithm)
      : excessScore;
    return { color, score, distance };
  };

  let best: Scored | undefined;
  if (search === "bisect") {
    // Contrast against a color at or behind the canvas (relative to the search
    // direction) only grows as a candidate moves away from the canvas, so those
    // requirements are monotonic: bisect for the first candidate meeting them.
    // Requirements against colors farther out (e.g. a pinned white foreground that a
    // panel must contrast with) can fail again far away, so scan forward from there
    // for the first candidate meeting everything. That scan is usually one step.
    const side = mode === "dark" ? 1 : -1;
    const otherOffset = (pair: RequiredPair) =>
      side * (luminance(result.colors[pair.token === token ? pair.background : pair.token]) - canvasLuminance);
    const monotonic = requirements.filter((pair) => otherOffset(pair) <= TOLERANCE);
    const meetsMonotonic = ({ color }: { color: PaletteColor }) =>
      !(isSurface && !canvasRequirement && color.hex === canvas)
      && candidateScore(token, color, monotonic, result.colors) !== null;
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (meetsMonotonic(ordered[middle])) high = middle;
      else low = middle + 1;
    }
    for (let index = low; index < ordered.length && !best; index++) best = evaluate(ordered[index]);
  } else {
    for (const candidate of ordered) {
      const scored = evaluate(candidate);
      if (!scored) continue;
      if (!best || scored.score < best.score - TOLERANCE ||
          (Math.abs(scored.score - best.score) <= TOLERANCE && scored.distance < best.distance - TOLERANCE) ||
          (Math.abs(scored.score - best.score) <= TOLERANCE && Math.abs(scored.distance - best.distance) <= TOLERANCE
            && scored.color.step < best.color.step)) {
        best = scored;
      }
    }
  }

  if (!best) {
    const known = requirements.map((pair) => `${pair.token}/${pair.background} >= ${pair.contrast}`).join(", ");
    throw new Error(`No feasible ${mode} color for ${token}; known constraints: ${known}. Adjust the contrast rules or terminal anchor.`);
  }

  result.colors[token] = best.color.hex;
  result.selected[token] = {
    family: roles[token].family,
    step: best.color.step,
    hex: best.color.hex,
    saturation: Number(best.color.saturation.toFixed(5)),
    source: "contrast-derived",
  };
}

/** Derive every step from pair ratios against an anchored terminal background. */
export function selectColors(
  recipe: ThemeRecipe,
  contract: ContrastContract,
  roles: Record<string, RecipeRole>,
  mode: Mode,
  target: Target,
  pairs: Pair[],
  overrides: TerminalOverrides,
  search: SearchStrategy = "bisect",
): ColorSelection {
  const result: ColorSelection = { colors: {}, selected: {} };
  const anchor = normalizeHex(overrides.background ?? recipe.terminalBackground[mode]);
  result.colors.background = anchor;
  result.selected.background = { family: null, step: null, hex: anchor,
    source: overrides.background === undefined ? "recipe-assumption" : "terminal-override" };

  if (overrides.terminalForeground !== undefined) {
    const foreground = normalizeHex(overrides.terminalForeground);
    result.colors.terminalForeground = foreground;
    result.selected.terminalForeground = { family: null, step: null, hex: foreground, source: "terminal-override" };
  }

  const context: SelectionContext = { roles, mode, search, pairs, candidates: buildCandidates(recipe, roles), result };
  for (const token of BACKGROUND_ORDER) chooseColor(token, context);

  if (overrides.terminalForeground === undefined) chooseColor("terminalForeground", context);

  // Proposed tokens absent from this target are not selected; their rules
  // were already moved onto their fallbacks by pairsForTarget().
  const emitted = new Set(emittedTokens(contract, target));
  const foregrounds = Object.keys(contract.tokens).filter((token) =>
    contract.tokens[token].type === "foreground" && emitted.has(token) && token !== "scrollbarThumb");
  for (const token of foregrounds) chooseColor(token, context);
  // The scrollbar thumb's required contrast is against the previously chosen track.
  chooseColor("scrollbarThumb", context);
  return result;
}
