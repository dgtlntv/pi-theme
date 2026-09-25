/**
 * Runs the real generator (../../src) in the browser, and resolves Pi's built-in
 * themes for comparison.
 *
 * @module
 */
import { apcaContrast } from "../../src/color.ts";
import { generateTheme } from "../../src/solve.ts";
import type { Algorithm, ContrastContract, GenerationResult, Mode, ThemeRecipe } from "../../src/types.ts";
import contract from "../../contrast-requirements.json";
import baseRecipe from "../../theme-recipe.json";
import piDark from "./pi-themes/dark.json";
import piLight from "./pi-themes/light.json";

/** The recipe from `theme-recipe.json`. */
export const BASE_RECIPE = baseRecipe as ThemeRecipe;

/** The contract from `contrast-requirements.json`. */
const CONTRACT = contract as ContrastContract;

/** The recipe's terminal background for each mode. */
export const DEFAULT_BACKGROUND: Record<Mode, string> = BASE_RECIPE.terminalBackground;

/** Colors a view renders with: Pi tokens plus the terminal colors. */
export type Palette = Record<string, string>;

/** One theme, ready to render. */
export interface ThemeOutput {
  /** Shown in the wiper and legends. */
  label: string;
  /** Hex colors by token. */
  palette: Palette;
  /** Present for generated themes only. */
  result?: GenerationResult;
}

/** `pi`: Pi's built-in theme with today's token usage. `proposed`: our theme with the new tokens. */
export type Variant = "pi" | "proposed";

/** Both themes for a background. */
export interface EngineOutput {
  /** The mode picked for the background. */
  mode: Mode;
  /** Pi's built-in theme and the proposal. */
  themes: Record<Variant, ThemeOutput>;
}

/**
 * Pick dark or light by APCA: dark (light text) when white text on the background
 * has more APCA contrast than black text.
 *
 * @param background - The terminal background, `#rrggbb`.
 * @returns The theme mode.
 */
export function modeForBackground(background: string): Mode {
  const white = Math.abs(apcaContrast("#ffffff", background));
  const black = Math.abs(apcaContrast("#000000", background));
  return white >= black ? "dark" : "light";
}

/** A Pi theme file: colors, optionally referencing variables. */
interface PiThemeJson {
  /** Named colors that `colors` can reference. */
  vars?: Record<string, string | number>;
  /** Token colors: hex, a variable name, "" (terminal default), or a 256-color index. */
  colors: Record<string, string | number>;
}

/**
 * Resolve a Pi theme like Pi's theme.ts: variable references, then optional-token
 * fallbacks. "" (terminal default) becomes the terminal foreground or background;
 * like Pi's HTML export, the foreground is assumed to be #e5e5e7 (dark) or #000000 (light).
 *
 * @param json - The Pi theme file.
 * @param mode - The theme mode.
 * @param background - The terminal background, `#rrggbb`.
 * @returns The palette.
 * @throws If a variable is unresolvable or a color is a 256-color index.
 */
function resolvePiTheme(json: PiThemeJson, mode: Mode, background: string): Palette {
  const terminalForeground = mode === "dark" ? "#e5e5e7" : "#000000";
  const resolve = (value: string | number, seen = new Set<string>()): string => {
    if (typeof value === "number") throw new Error("256-color indices are not supported in the preview");
    if (value === "" || value.startsWith("#")) return value;
    if (seen.has(value) || json.vars?.[value] === undefined) throw new Error(`Unresolvable theme var ${value}`);
    seen.add(value);
    return resolve(json.vars[value], seen);
  };
  const colors: Palette = Object.fromEntries(Object.entries(json.colors).map(([key, value]) => [key, resolve(value)]));
  colors.scrollbarTrack ||= colors.muted;
  colors.scrollbarThumb ||= colors.text;
  colors.thinkingMax ||= colors.thinkingXhigh;
  colors.searchMatchBg ||= colors.selectedBg;
  colors.searchMatchText ||= colors.text;
  for (const [key, value] of Object.entries(colors)) {
    if (value === "") colors[key] = key.endsWith("Bg") ? background : terminalForeground;
  }
  return { ...colors, background, terminalForeground };
}

/**
 * Generate the proposal for a background and resolve Pi's matching built-in theme.
 *
 * @param background - The terminal background, `#rrggbb`.
 * @param algorithm - The contrast algorithm.
 * @param recipe - The color recipe, possibly edited in the app.
 * @returns Both themes, or the error message if generation fails.
 */
export function runEngine(background: string, algorithm: Algorithm, recipe: ThemeRecipe): EngineOutput | { error: string } {
  try {
    const mode = modeForBackground(background);
    const result = generateTheme(recipe, CONTRACT, algorithm, mode, "extended", background);
    const proposed: ThemeOutput = {
      label: "Proposed",
      // The proposal colors everything with tokens; uncolored text would use `text`.
      palette: { ...result.theme.colors, background, terminalForeground: result.theme.colors.text },
      result,
    };
    const pi: ThemeOutput = {
      label: `Pi ${mode}`,
      palette: resolvePiTheme((mode === "dark" ? piDark : piLight) as PiThemeJson, mode, background),
    };
    return { mode, themes: { pi, proposed } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

