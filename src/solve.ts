/**
 * Compute theme colors from contrast minimums.
 *
 * @module
 */
import { colorAt, grayLightness, normalizeHex, targetLuminance } from "./color.ts";
import { contractPairs, emittedTokens, validateContract, validateRecipe } from "./contract.ts";
import { TERMINAL_BACKGROUND, type Algorithm, type ContrastContract, type GenerationResult, type Mode, type Pair, type Target, type ThemeRecipe } from "./types.ts";

/**
 * Order tokens so each comes after the backgrounds it is measured on: surfaces
 * before the text on them, the scrollbar track before its thumb.
 *
 * @param pairs - The contract pairs.
 * @returns Every token, in solve order.
 * @throws If rules depend on each other in a circle.
 */
function solveOrder(pairs: Pair[]): string[] {
  const dependencies = new Map<string, Set<string>>();
  for (const { token, background } of pairs) {
    if (!dependencies.has(token)) dependencies.set(token, new Set());
    if (background !== TERMINAL_BACKGROUND) dependencies.get(token)!.add(background);
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const visit = (token: string): void => {
    if (order.includes(token)) return;
    if (visiting.has(token)) throw new Error(`Circular contrast rules through ${token}`);
    visiting.add(token);
    for (const background of dependencies.get(token) ?? []) visit(background);
    order.push(token);
  };
  for (const token of dependencies.keys()) visit(token);
  return order;
}

/**
 * Compute every color from its contrast minimums. The inverse contrast formulas give
 * the luminance each requirement needs, the strictest wins, and that luminance
 * becomes OKHSL lightness via the gray formula (exact for grays, a few percent off
 * for saturated colors).
 *
 * @param recipe - The color recipe.
 * @param families - The family name of every token.
 * @param pairs - The contract pairs.
 * @param mode - The theme mode: dark solves lighter colors, light darker ones.
 * @param background - The terminal background, `#rrggbb`.
 * @returns The color of every token, or undefined if a minimum is unreachable.
 */
function solveColors(recipe: ThemeRecipe, families: Record<string, string>, pairs: Pair[], mode: Mode, background: string): Record<string, string> | undefined {
  const colors: Record<string, string> = { [TERMINAL_BACKGROUND]: background };
  const lighter = mode === "dark";
  for (const token of solveOrder(pairs)) {
    const targets = pairs
      .filter((pair) => pair.token === token)
      .map((pair) => targetLuminance(pair.contrast, colors[pair.background], lighter, pair.algorithm, pair.apcaLowClip));
    const target = lighter ? Math.max(...targets) : Math.min(...targets);
    if (targets.some(Number.isNaN) || target < 0 || target > 1) return undefined;
    colors[token] = colorAt(recipe.families[families[token]], grayLightness(target));
  }
  return colors;
}

/** Full relaxation: every minimum at its algorithm's lowest value. */
const MAX_RELAXATION = 2;

/** Per algorithm: the readable floor relaxation compresses toward first, and the lowest possible value. */
const FLOOR: Record<Algorithm, { readable: number; lowest: number }> = {
  WCAG2: { readable: 4.5, lowest: 1 },
  APCA: { readable: 45, lowest: 0 }, // Lc 45: roughly APCA's minimum for readable non-body text
};

/**
 * Relax minimums for backgrounds that cannot meet the contract, such as mid-range
 * grays. From `t` 0 to 1, minimums above the readable floor move toward it, so
 * levels keep their order; from 1 to 2, all minimums move toward the lowest value.
 *
 * @param pairs - The contract pairs.
 * @param t - How far to relax, from 0 (as written) to 2 (lowest).
 * @returns The pairs with relaxed minimums.
 */
function relaxPairs(pairs: Pair[], t: number): Pair[] {
  return pairs.map((pair) => {
    const { readable, lowest } = FLOOR[pair.algorithm];
    const compressed = pair.contrast > readable ? pair.contrast - (pair.contrast - readable) * Math.min(t, 1) : pair.contrast;
    return { ...pair, contrast: compressed - (compressed - lowest) * Math.max(0, t - 1) };
  });
}

/**
 * Name a theme. WCAG current keeps the plain name; APCA and extended get suffixes,
 * so all variants install side by side.
 *
 * @param recipe - The color recipe, whose name is the prefix.
 * @param algorithm - The contrast algorithm.
 * @param target - The target Pi.
 * @param mode - The theme mode.
 * @returns A name like `generated-pi-apca-extended-dark`.
 */
export function themeName(recipe: ThemeRecipe, algorithm: Algorithm, target: Target, mode: Mode): string {
  return [recipe.name, algorithm === "APCA" && "apca", target === "extended" && "extended", mode].filter(Boolean).join("-");
}

/**
 * Generate one Pi theme. If the background cannot meet the contract, minimums are
 * relaxed as little as possible.
 *
 * @param recipe - The color recipe.
 * @param contract - The contrast contract.
 * @param algorithm - The contrast algorithm.
 * @param mode - The theme mode.
 * @param target - The target Pi.
 * @param terminalBackground - The terminal background; defaults to the recipe's for `mode`.
 * @returns The theme, and how far minimums were relaxed if they had to be.
 * @throws If the contract or recipe is invalid, or no theme exists even fully relaxed.
 */
export function generateTheme(
  recipe: ThemeRecipe,
  contract: ContrastContract,
  algorithm: Algorithm,
  mode: Mode,
  target: Target,
  terminalBackground: string = recipe.terminalBackground[mode],
): GenerationResult {
  validateContract(contract);
  const families = validateRecipe(recipe, contract);
  const background = normalizeHex(terminalBackground);
  const pairs = contractPairs(contract, algorithm, target, mode);
  const solve = (t: number) => solveColors(recipe, families, t === 0 ? pairs : relaxPairs(pairs, t), mode, background);

  let colors = solve(0);
  let relaxation: number | undefined;
  if (!colors) {
    // Feasibility only improves as t grows: bisect for the smallest workable t.
    let [low, high] = [0, MAX_RELAXATION];
    colors = solve(high);
    if (!colors) throw new Error(`No ${mode} theme is possible on ${background}, even fully relaxed`);
    for (let i = 0; i < 20; i++) {
      const middle = (low + high) / 2;
      const attempt = solve(middle);
      if (attempt) [high, colors] = [middle, attempt];
      else low = middle;
    }
    relaxation = Number(high.toFixed(3));
  }

  const themeColors = Object.fromEntries(emittedTokens(contract, target).map((token) => [token, colors[token]]));
  return { theme: { name: themeName(recipe, algorithm, target, mode), colors: themeColors }, relaxation };
}
