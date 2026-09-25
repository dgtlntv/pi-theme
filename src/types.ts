export type Mode = "dark" | "light";

/** WCAG 2 ratios run 1-21 and are symmetric. APCA Lc runs 0-108 and is text-on-background. */
export type Algorithm = "WCAG2" | "APCA";

/**
 * `current` emits only tokens Pi supports today; `extended` also emits proposed
 * tokens. In `current`, a proposed token's rules apply to its fallback, the color
 * Pi renders in its place.
 */
export type Target = "current" | "extended";
export const TARGETS: readonly Target[] = ["current", "extended"];

/** The terminal background: anchored by the recipe, never emitted into a theme. */
export const TERMINAL_BACKGROUND = "background";

/** Minimum contrast in each algorithm: a WCAG 2 ratio and an absolute APCA Lc. */
export interface Minimums {
  wcag: number;
  apca: number;
}

/**
 * `token` must reach at least the minimum on each of `backgrounds`. A rule gives
 * `dark`, `light`, or both; a missing mode uses the other's minimums.
 */
export interface ContrastRule {
  token: string;
  backgrounds: string[];
  dark?: Minimums;
  light?: Minimums;
  /** Targets where the rule applies; defaults to both. */
  targets?: Target[];
  note?: string;
}

export interface ContrastContract {
  /** Tokens Pi does not support yet, mapped to the token Pi renders instead. */
  proposed: Record<string, string>;
  relationships: ContrastRule[];
}

export interface ColorFamily {
  hue: number;
  saturation: { min: number; max: number };
}

export interface RecipeRole {
  tokens: string[];
  family: string;
}

export interface ThemeRecipe {
  name: string;
  terminalBackground: Record<Mode, string>;
  families: Record<string, ColorFamily>;
  roles: RecipeRole[];
}

/** One rule against one background, with the minimum resolved for a mode. */
export interface Pair {
  token: string;
  background: string;
  contrast: number;
  algorithm: Algorithm;
  apcaLowClip: boolean;
}

export interface Theme {
  name: string;
  colors: Record<string, string>;
}

export interface GenerationResult {
  theme: Theme;
  /** Present when the background could not meet the contract; see relaxPairs(). */
  relaxation?: number;
}
