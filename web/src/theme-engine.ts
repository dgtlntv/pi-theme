// Runs the real generator (../../src) in the browser, and resolves Pi's built-in
// themes for comparison.
import { apcaContrast, contrast } from "../../src/color.ts";
import { deriveApcaContract } from "../../src/apca-derivation.ts";
import { generateTheme } from "../../src/solve.ts";
import type { Algorithm, ContrastContract, GenerationResult, Mode, ThemeRecipe } from "../../src/types.ts";
import wcagContract from "../../contrast-requirements.json";
import baseRecipe from "../../theme-recipe.json";
import piDark from "./pi-themes/dark.json";
import piLight from "./pi-themes/light.json";

export const BASE_RECIPE = baseRecipe as ThemeRecipe;
export const WCAG_CONTRACT = wcagContract as unknown as ContrastContract;
export const DEFAULT_BACKGROUND: Record<Mode, string> = BASE_RECIPE.terminalBackground;

/** Colors a view renders with: Pi tokens plus the virtual terminal colors. */
export type Palette = Record<string, string>;

export interface ThemeOutput {
  /** Shown in the wiper and legends. */
  label: string;
  palette: Palette;
  /** Present for generated themes only. */
  result?: GenerationResult;
}

/** `pi`: Pi's built-in theme with today's token usage. `proposed`: our theme with the new tokens. */
export type Variant = "pi" | "proposed";

export interface EngineOutput {
  mode: Mode;
  themes: Record<Variant, ThemeOutput>;
}

/**
 * Pick dark or light by APCA: a dark theme (light text) when white text on the
 * background has more APCA contrast than black text, otherwise light.
 */
export function modeForBackground(background: string): Mode {
  const white = Math.abs(apcaContrast("#ffffff", background));
  const black = Math.abs(apcaContrast("#000000", background));
  return white >= black ? "dark" : "light";
}

interface PiThemeJson {
  vars?: Record<string, string | number>;
  colors: Record<string, string | number>;
}

/**
 * Resolve a Pi theme like theme.ts: variable references, then the optional-token
 * fallbacks. "" (terminal default) stays as the terminal foreground/background.
 * Pi's own HTML export assumes #e5e5e7 (dark) and #000000 (light) for the terminal
 * foreground, so the same values are used here.
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
 * The APCA contract is derived from the WCAG dark theme of the *given* recipe, so
 * hue/saturation edits in the app flow into APCA exactly like `npm run generate`.
 */
const apcaCache = new Map<string, ContrastContract>();
function contractFor(algorithm: Algorithm, recipe: ThemeRecipe): ContrastContract {
  if (algorithm === "WCAG2") return WCAG_CONTRACT;
  const key = JSON.stringify(recipe);
  let contract = apcaCache.get(key);
  if (!contract) {
    contract = deriveApcaContract(recipe, WCAG_CONTRACT);
    apcaCache.clear();
    apcaCache.set(key, contract);
  }
  return contract;
}

export function runEngine(background: string, algorithm: Algorithm, recipe: ThemeRecipe): EngineOutput | { error: string } {
  try {
    const mode = modeForBackground(background);
    const result = generateTheme(recipe, contractFor(algorithm, recipe), mode, { background }, "extended");
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

export { contrast };
