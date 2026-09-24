import { pairsForMode, pairsForTarget, validateContract } from "./contract.ts";
import { validateRecipe } from "./recipe.ts";
import { buildResult } from "./report.ts";
import { MAX_RELAXATION, relaxPairs } from "./relax.ts";
import { selectColors, type ColorSelection, type SearchStrategy, type TerminalOverrides } from "./selection.ts";
import { TARGETS, type ContrastContract, type GenerationResult, type Mode, type Target, type ThemeRecipe } from "./types.ts";

export { validateRecipe } from "./recipe.ts";

/**
 * Validate inputs, derive lightness from contrast minimums, then audit every
 * final hex pair. There are no preferred lightness steps.
 *
 * If the background cannot satisfy the contract (e.g. a mid-range gray), relax it
 * as little as possible instead of failing; see relax.ts. The report then marks the
 * theme as relaxed and its checks list every unmet original minimum.
 */
export function generateTheme(
  recipe: ThemeRecipe,
  contract: ContrastContract,
  mode: Mode,
  overrides: TerminalOverrides = {},
  target: Target = "current",
  search: SearchStrategy = "bisect",
): GenerationResult {
  if (mode !== "dark" && mode !== "light") throw new Error(`Unknown mode ${mode}`);
  if (!TARGETS.includes(target)) throw new Error(`Unknown target ${target}`);

  validateContract(contract);
  const roles = validateRecipe(recipe, contract);
  const pairs = pairsForMode(pairsForTarget(contract, target), mode);
  const solve = (t: number): ColorSelection | undefined => {
    try {
      return selectColors(recipe, contract, roles, mode, target, relaxPairs(pairs, t), overrides, search);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("No feasible")) return undefined;
      throw error;
    }
  };

  const exact = solve(0);
  if (exact) return buildResult(recipe, contract, mode, target, pairs, exact, undefined);

  // Feasibility only improves as t grows, so bisect for the smallest workable t.
  let low = 0;
  let high = MAX_RELAXATION;
  let best = solve(high);
  if (!best) throw new Error(`No ${mode} theme is possible on this background, even fully relaxed.`);
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2;
    const attempt = solve(middle);
    if (attempt) {
      high = middle;
      best = attempt;
    } else {
      low = middle;
    }
  }
  return buildResult(recipe, contract, mode, target, pairs, best, { value: high, pairs: relaxPairs(pairs, high) });
}
