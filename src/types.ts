/**
 * Types for the contrast contract, the color recipe, and generated themes.
 *
 * @module
 */

/** Theme mode: a dark theme has light colors on a dark background, and vice versa. */
export type Mode = "dark" | "light";

/** Contrast algorithm. WCAG 2 ratios run 1-21 and are symmetric; perceptual contrast runs 0-108 and is text-on-background. */
export type Algorithm = "wcag" | "perceptual";

/**
 * Which Pi a theme is for. `current` emits only tokens Pi supports today, with a
 * proposed token's rules applied to its fallback (the color Pi renders in its place).
 * `extended` also emits proposed tokens.
 */
export type Target = "current" | "extended";

/** Every target, in output order. */
export const TARGETS: readonly Target[] = ["current", "extended"];

/** The terminal background token: anchored by the recipe, never emitted into a theme. */
export const TERMINAL_BACKGROUND = "background";

/** Minimum contrast in each algorithm. */
export interface Minimums {
  /** WCAG 2 ratio, 1-21. */
  wcag: number;
  /** Absolute perceptual contrast, 0-108. */
  perceptual: number;
}

/**
 * A contrast requirement: `token` must reach at least the minimum on each of
 * `backgrounds`. A rule gives `dark`, `light`, or both; a missing mode uses the
 * other's minimums.
 */
export interface ContrastRule {
  /** The token being solved. */
  token: string;
  /** Tokens it is measured against; `background` is the terminal background. */
  backgrounds: string[];
  /** Minimums in dark themes. */
  dark?: Minimums;
  /** Minimums in light themes. */
  light?: Minimums;
  /** Targets where the rule applies; defaults to both. */
  targets?: Target[];
  /** Why the rule exists. */
  note?: string;
}

/** The contrast requirements file, `contrast-requirements.json`. */
export interface ContrastContract {
  /** Tokens Pi does not support yet, mapped to the token Pi renders instead. */
  proposed: Record<string, string>;
  /** Every contrast requirement. */
  relationships: ContrastRule[];
}

/**
 * How a palette color's saturation carries over to tokens at other lightnesses:
 * `constant` keeps it everywhere; `anchored` keeps it at the palette color's own lightness and
 * lets it fall off toward black and white along the recipe family's saturation curve, never
 * rising above the palette's.
 */
export type PaletteSaturation = "constant" | "anchored";

/** A color family: one OKHSL hue, with saturation varying by lightness. */
export interface ColorFamily {
  /** OKHSL hue in degrees, 0-360. */
  hue: number;
  /** Saturation at black and white (`min`) and at mid lightness (`max`), each 0-1. */
  saturation: { min: number; max: number };
}

/** Assigns tokens to a color family. */
export interface RecipeRole {
  /** Tokens colored from the family. */
  tokens: string[];
  /** Name of a family in {@link ThemeRecipe.families}. */
  family: string;
}

/** The color recipe file, `theme-recipe.json`. */
export interface ThemeRecipe {
  /** Theme name prefix. */
  name: string;
  /** The terminal background assumed for each mode, `#rrggbb`. */
  terminalBackground: Record<Mode, string>;
  /** Color families by name. */
  families: Record<string, ColorFamily>;
  /** The family of every token. */
  roles: RecipeRole[];
  /**
   * ANSI palette slot (0-15) each family, or a single token, takes its hue and saturation
   * from when a theme is generated from a terminal palette. Token slots override family slots.
   */
  ansiSlots: { families: Record<string, number>; tokens: Record<string, number> };
}

/** One rule against one background, resolved for an algorithm, target, and mode. */
export interface Pair {
  /** The token being solved. */
  token: string;
  /** The token it is measured against. */
  background: string;
  /** The minimum, in `algorithm`'s units. */
  contrast: number;
  /** The algorithm `contrast` is measured in. */
  algorithm: Algorithm;
  /** Perceptual only: whether the minimum is measured with the low clip. */
  lowClip: boolean;
}

/** A Pi theme file. */
export interface Theme {
  /** Theme name, also the file name. */
  name: string;
  /** Hex color of every emitted token. */
  colors: Record<string, string>;
}

/** The result of generating one theme. */
export interface GenerationResult {
  /** The Pi theme. */
  theme: Theme;
  /**
   * How far minimums were relaxed, from 0 (as written) to 2 (lowest), when the
   * background cannot meet the contract. Absent otherwise.
   */
  relaxation?: number;
}
