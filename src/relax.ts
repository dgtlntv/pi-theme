import type { Algorithm, Pair } from "./types.ts";

/**
 * Best-effort relaxation for backgrounds that cannot satisfy the contract, such
 * as mid-range grays. One value `t` from 0 (contract as written) to 2 (every
 * minimum at its algorithm's lowest value) scales minimums in two stages:
 *
 * 1. t in [0, 1]: compress the hierarchy. Minimums above the readable floor move
 *    toward it (text 9 -> 4.5 at t = 1); minimums at or below it are unchanged.
 *    Levels keep their order and colors keep their hue as long as possible.
 * 2. t in [1, 2]: give up readability. Every remaining minimum moves toward the
 *    algorithm's lowest value. At t = 2 the solver effectively picks the most
 *    contrasting color available for each token.
 *
 * generateTheme() uses the smallest t for which a theme exists.
 */
export const MAX_RELAXATION = 2;

const FLOOR: Record<Algorithm, { readable: number; lowest: number }> = {
  WCAG2: { readable: 4.5, lowest: 1 },
  // Lc 45 is roughly APCA's minimum for readable non-body text.
  APCA: { readable: 45, lowest: 0 },
};

export function relaxMinimum(minimum: number, algorithm: Algorithm, t: number): number {
  const { readable, lowest } = FLOOR[algorithm];
  const hierarchy = Math.min(t, 1);
  const compressed = minimum > readable ? minimum - (minimum - readable) * hierarchy : minimum;
  const readability = Math.max(0, t - 1);
  return compressed - (compressed - lowest) * readability;
}

export function relaxPairs(pairs: Pair[], t: number): Pair[] {
  if (t === 0) return pairs;
  return pairs.map((pair) => pair.contrast === null
    ? pair
    : { ...pair, contrast: relaxMinimum(pair.contrast, pair.algorithm, t) });
}
