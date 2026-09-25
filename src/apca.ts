/**
 * Derive the APCA contract from the WCAG contract: each rule's APCA minimum is the
 * lowest Lc its pairs reach in the WCAG theme, rounded down, so APCA reproduces the
 * approved WCAG dark theme and applies the same perceptual targets to light mode
 * (or `apcaLightContrast` where set).
 *
 * APCA clips contrast below about Lc 10 to 0. Rules measuring below LOW_CLIP_LC
 * (faint panels, the scrollbar track) use the unclipped formula instead.
 */
import { contrast } from "./color.ts";
import { generateTheme } from "./solve.ts";
import { TARGETS, TERMINAL_BACKGROUND, type ContrastContract, type ContrastRule, type Mode, type ThemeRecipe } from "./types.ts";

const LOW_CLIP_LC = 15;

export function deriveApcaContract(recipe: ThemeRecipe, wcag: ContrastContract): ContrastContract {
  if (wcag.algorithm !== "WCAG2") throw new Error("The APCA contract derives from a WCAG2 contract");
  const colors = (mode: Mode): Record<string, Record<string, string>> => Object.fromEntries(TARGETS.map((target) => [target, {
    ...generateTheme(recipe, wcag, mode, target).theme.colors,
    [TERMINAL_BACKGROUND]: recipe.terminalBackground[mode],
  }]));
  const themes = { dark: colors("dark"), light: colors("light") };

  /** APCA Lc of every pair a rule produces, in every target where it applies. */
  const lowest = (rule: ContrastRule, mode: Mode, lowClip: boolean): number => Math.min(...(rule.targets ?? TARGETS).flatMap((target) => {
    const theme = themes[mode][target];
    const token = target === "current" ? wcag.proposed[rule.token] ?? rule.token : rule.token;
    return rule.backgrounds.map((background) => contrast(theme[token], theme[background], "APCA", lowClip));
  }));

  const relationships = wcag.relationships.map(({ apcaLightContrast, lightContrast: _, ...rule }): ContrastRule => {
    const clipped = lowest(rule, "dark", true) >= LOW_CLIP_LC && (apcaLightContrast ?? lowest(rule, "light", true)) >= LOW_CLIP_LC;
    const round = (value: number) => (clipped ? Math.floor(value) : Math.floor(value * 10) / 10);
    const dark = round(lowest(rule, "dark", clipped));
    const light = apcaLightContrast ?? round(lowest(rule, "light", clipped));
    return { ...rule, contrast: dark, ...(light !== dark && { lightContrast: light }), ...(!clipped && { apcaLowClip: false }) };
  });
  return { ...wcag, algorithm: "APCA", relationships };
}
