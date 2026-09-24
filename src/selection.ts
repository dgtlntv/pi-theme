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

function chooseColor(token: string, context: SelectionContext): void {
  const { roles, mode, pairs, candidates, result } = context;
  const requirements = applicablePairs(token, pairs, result.colors);
  const canvas = result.colors.background;
  const canvasLuminance = luminance(canvas);
  let best: { color: PaletteColor; score: number; distance: number } | undefined;

  for (const candidate of candidates[token]) {
    const brightness = luminance(candidate.hex) - canvasLuminance;
    if (mode === "dark" ? brightness < -TOLERANCE : brightness > TOLERANCE) continue;
    const excessScore = candidateScore(token, candidate, requirements, result.colors);
    if (excessScore === null) continue;

    const isSurface = BACKGROUND_ORDER.includes(token);
    const canvasRequirement = requirements.find((pair) =>
      pair.token === token && pair.background === "background");
    // Surface placement is controlled by its relationship to the canvas.
    // Other constraints (such as measured terminal text) restrict viable steps,
    // but must not drag an unconstrained surface away from the canvas.
    const canvasAlgorithm = canvasRequirement?.algorithm ?? "WCAG2";
    const canvasRatio = contrast(candidate.hex, canvas, canvasAlgorithm, canvasRequirement?.apcaLowClip);
    const score = isSurface
      ? excessOver(canvasRatio, canvasRequirement?.contrast ?? 1, canvasAlgorithm)
      : excessScore;

    // A null canvas relationship means no visibility guarantee. Still choose
    // a distinct hex, rather than returning the terminal color verbatim.
    if (isSurface && !canvasRequirement && candidate.hex === canvas) continue;
    const distance = Math.abs(brightness);
    if (!best || score < best.score - TOLERANCE ||
        (Math.abs(score - best.score) <= TOLERANCE && distance < best.distance - TOLERANCE) ||
        (Math.abs(score - best.score) <= TOLERANCE && Math.abs(distance - best.distance) <= TOLERANCE
          && candidate.step < best.color.step)) {
      best = { color: candidate, score, distance };
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

  const context: SelectionContext = { roles, mode, pairs, candidates: buildCandidates(recipe, roles), result };
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
