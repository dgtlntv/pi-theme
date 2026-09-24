// Editable input files: contrast-requirements.json and theme-recipe.json
export type Mode = "dark" | "light";
export type TokenType = "background" | "foreground";
export type RelationshipKind = "text" | "nonText";

/** WCAG2 ratios run 1-21 and are symmetric. APCA Lc runs 0-108 and is text-on-background. */
export type Algorithm = "WCAG2" | "APCA";
export const ALGORITHMS: readonly Algorithm[] = ["WCAG2", "APCA"];

/**
 * `current` emits only tokens Pi supports today. `extended` also emits proposed
 * tokens. In `current`, each proposed token's rules apply to its fallback, since
 * that is the color Pi renders in its place.
 */
export type Target = "current" | "extended";
export const TARGETS: readonly Target[] = ["current", "extended"];

export interface TokenDefinition {
  type: TokenType;
  origin?: "virtual-terminal";
  optionalFallback?: string;
  /** A token Pi does not support yet; `fallback` is what Pi renders instead. */
  proposed?: { fallback: string };
}

export interface ContrastRule {
  kind: RelationshipKind;
  token: string;
  backgrounds: string[];
  contrast: number | null;
  reason?: string;
  note?: string;
  /** Targets where this rule applies; defaults to all targets. */
  targets?: Target[];
  /** Minimum used in light mode instead of `contrast`. Light mode needs different ratios for the same perceived weight. */
  lightContrast?: number;
  /**
   * WCAG contract only: APCA light-mode Lc for the derived APCA contract. Without it,
   * APCA light minimums are measured from the WCAG light theme.
   */
  apcaLightContrast?: number;
  /**
   * APCA only: false skips the spec's low clip, for faint surfaces whose Lc is below
   * the clip (~10) and would otherwise always measure 0.
   */
  apcaLowClip?: boolean;
}

export interface ContrastContract {
  version: number;
  scope: string;
  source: string;
  algorithm: Algorithm;
  semantics: Record<string, string>;
  tokens: Record<string, TokenDefinition>;
  relationships: ContrastRule[];
  limitations: string[];
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
  description: string;
  terminalBackground: Record<Mode, string>;
  families: Record<string, ColorFamily>;
  roles: RecipeRole[];
}

// Internal form: a rule with multiple backgrounds becomes one pair per background.
export interface Pair {
  kind: RelationshipKind;
  token: string;
  background: string;
  contrast: number | null;
  reason: string | null;
  /** Proposed token whose rule was applied to this fallback token. */
  via?: string;
  algorithm: Algorithm;
  apcaLowClip: boolean;
  /** Light-mode minimum; generateTheme() resolves it into `contrast` for light themes. */
  lightContrast?: number;
}

export interface CheckedPair extends Pair {
  ratio: number;
  passes: boolean | null;
}

// Output: Pi theme JSON plus a report explaining every chosen palette step.
export interface Selection {
  family: string | null;
  step: number | null;
  hex: string;
  saturation?: number;
  source?: "terminal-override" | "recipe-assumption" | "contrast-derived";
}

export interface ContrastReport {
  mode: Mode;
  target: Target;
  algorithm: Algorithm;
  terminal: { background: Selection };
  selected: Record<string, Selection>;
  checks: CheckedPair[];
  summary: { required: number; noRequirement: number };
  /**
   * Present only when the background could not satisfy the contract as written.
   * `checks` then compare against the original minimums, so `unmet` lists them.
   */
  relaxation?: { value: number; unmet: number };
}

export interface GenerationResult {
  theme: { name: string; colors: Record<string, string> };
  report: ContrastReport;
}
