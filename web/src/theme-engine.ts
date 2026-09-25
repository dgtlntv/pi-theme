/**
 * Runs the real generator (../../src) in the browser.
 *
 * @module
 */
import { perceptualContrast } from "../../src/color.ts";
import { generateTheme } from "../../src/solve.ts";
import type { ContrastContract, Mode, ThemeRecipe } from "../../src/types.ts";
import contract from "../../contrast-requirements.json";
import recipe from "../../theme-recipe.json";
import ghosttyThemes from "./ghostty-themes.json";

/** The recipe from `theme-recipe.json`. */
const RECIPE = recipe as ThemeRecipe;

/** The contract from `contrast-requirements.json`. */
const CONTRACT = contract as ContrastContract;

/** The recipe's terminal background for each mode. */
export const DEFAULT_BACKGROUND: Record<Mode, string> = RECIPE.terminalBackground;

/** A terminal color theme. */
export interface TerminalTheme {
  /** Theme name. */
  name: string;
  /** Default background, `#rrggbb`. */
  background: string;
  /** Default foreground, `#rrggbb`. */
  foreground: string;
  /** ANSI colors 0-15, `#rrggbb`. */
  palette: string[];
}

/** Ghostty's bundled themes, its default first (`npm run web:ghostty-themes`). */
export const TERMINAL_THEMES = ghosttyThemes as TerminalTheme[];

/**
 * Which of Pi's generated themes to preview: `system` takes hue, saturation, and text color
 * from a terminal theme; `lightDark` is Pi's `dark`/`light`, from the recipe.
 */
export type PiTheme = "system" | "lightDark";

/** Colors a view renders with: Pi tokens plus the terminal colors. */
export type Palette = Record<string, string>;

/** A generated theme, ready to render. */
export interface Preview {
  /** Hex colors by token, plus `background` and `terminalForeground`. */
  palette: Palette;
  /** How far minimums were relaxed, when the background cannot meet them. */
  relaxation?: number;
}

/**
 * Pick dark or light by perceptual contrast: dark (light text) when white text on the
 * background has more contrast than black text.
 *
 * @param background - The terminal background, `#rrggbb`.
 * @returns The theme mode.
 */
function modeForBackground(background: string): Mode {
  const white = Math.abs(perceptualContrast("#ffffff", background));
  const black = Math.abs(perceptualContrast("#000000", background));
  return white >= black ? "dark" : "light";
}

/**
 * Generate one of Pi's themes.
 *
 * @param theme - Which theme.
 * @param terminal - The terminal theme, for `system`.
 * @param background - The terminal background, for `lightDark`.
 * @returns The preview, or the error message if generation fails.
 */
export function generatePreview(theme: PiTheme, terminal: TerminalTheme, background: string): Preview | { error: string } {
  try {
    const system = theme === "system";
    const canvas = system ? terminal.background : background;
    const result = generateTheme(
      RECIPE,
      CONTRACT,
      "perceptual",
      modeForBackground(canvas),
      "extended",
      canvas,
      system ? terminal.palette : undefined,
      system ? terminal.foreground : undefined,
    );
    const { colors } = result.theme;
    // Text Pi leaves in the terminal default would use `text`.
    return { palette: { ...colors, background: canvas, terminalForeground: colors.text }, relaxation: result.relaxation };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
