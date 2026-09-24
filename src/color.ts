import Color from "colorjs.io";
import type { Algorithm, ColorFamily } from "./types.ts";

// Matches ../design-tokens/packages/design-tokens/generation/src/generators/color.ts:
// normalized Gaussian, center .5, sigma .25; step 0=white, 1000=black.
export function bellWeight(step: number): number {
  const gaussian = (x: number): number => Math.exp(-((x - 0.5) ** 2) / (2 * 0.25 ** 2));
  return (gaussian(step / 1000) - gaussian(0)) / (1 - gaussian(0));
}

export interface PaletteColor {
  hex: string;
  step: number;
  saturation: number;
}

export function colorAt(family: ColorFamily, step: number): PaletteColor {
  const saturation = family.saturation.min + (family.saturation.max - family.saturation.min) * bellWeight(step);
  const hex = new Color("okhsl", [family.hue, saturation, 1 - step / 1000])
    .to("srgb").toString({ format: "hex", collapse: false }).toLowerCase();
  return { hex, step, saturation };
}

export function normalizeHex(value: string): string {
  try {
    const color = new Color(value);
    if (color.alpha !== 1 || !color.inGamut("srgb")) throw new Error("Must be opaque and in the sRGB gamut");
    return color.to("srgb").toString({ format: "hex", collapse: false }).toLowerCase();
  } catch (error) {
    throw new Error(`Invalid terminal color ${JSON.stringify(value)}: ${error instanceof Error ? error.message : error}`);
  }
}

// APCA 0.0.98G constants, as in Color.js src/contrast/APCA.js.
const APCA = {
  normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, loClip: 0.1, deltaYmin: 0.0005,
  scale: 1.14, loOffset: 0.027,
};

function apcaLuminance(hex: string): number {
  // Soft toe clamp for very dark colors (flare).
  return apcaClamp(apcaScreenLuminance(hex));
}

/**
 * Signed APCA Lc of `foreground` text on `background`, reimplemented from Color.js
 * so the low clip can be skipped. The spec reports |C| < 0.1 as 0 and subtracts an
 * offset above it; that makes near-background surfaces (panels at ~Lc 5) unmeasurable.
 * With `lowClip: false` the raw scaled contrast is returned instead. Values below
 * Lc 10 carry no readability meaning; they only place faint surfaces.
 */
export function apcaContrast(foreground: string, background: string, lowClip = true): number {
  const text = apcaLuminance(foreground);
  const back = apcaLuminance(background);
  if (Math.abs(back - text) < APCA.deltaYmin) return 0;
  const raw = back > text
    ? (back ** APCA.normBG - text ** APCA.normTXT) * APCA.scale
    : (back ** APCA.revBG - text ** APCA.revTXT) * APCA.scale;
  if (!lowClip) return raw * 100;
  if (Math.abs(raw) < APCA.loClip) return 0;
  return (raw > 0 ? raw - APCA.loOffset : raw + APCA.loOffset) * 100;
}

function wcagRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Contrast of `foreground` on `background`. WCAG2 is symmetric; APCA is not, and
 * returns the absolute Lc so both algorithms read as "at least N".
 */
export function contrast(foreground: string, background: string, algorithm: Algorithm = "WCAG2", apcaLowClip = true): number {
  return algorithm === "APCA"
    ? Math.abs(apcaContrast(foreground, background, apcaLowClip))
    : wcagRatio(luminance(foreground), luminance(background));
}

/** sRGB channels (0-1) of a #rrggbb hex. */
function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

const decode = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance, with the same sRGB matrix row as Color.js. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.21263900587151027 * decode(r) + 0.715168678767756 * decode(g) + 0.07219231536073371 * decode(b);
}

// ---------------------------------------------------------------- inverse contrast

/**
 * Luminance a color must have to reach `ratio` against a color of luminance `other`,
 * on the lighter (`lighter` true) or darker side. From wcag-contrast-palette's
 * reverseWCAGContrast. May fall outside 0-1 when the ratio is unreachable.
 */
export function wcagTargetLuminance(ratio: number, other: number, lighter: boolean): number {
  return lighter ? ratio * (other + 0.05) - 0.05 : (other + 0.05) / ratio - 0.05;
}

/**
 * APCA screen luminance (simple 2.4 gamma, before the toe clamp) that `role` must
 * have to reach Lc `lc` against a color of screen luminance `other`. From
 * perceptual-contrast-palette's reversePerceptualContrast, extended to the unclipped
 * formula. `lighter` says which side of `other` the solved color is on. Returns NaN
 * when unreachable.
 */
export function apcaTargetLuminance(
  lc: number, other: number, lighter: boolean, role: "text" | "background", lowClip = true,
): number {
  const offset = lowClip ? APCA.loOffset : 0;
  const delta = (lc / 100 + offset) / APCA.scale;
  const y = apcaClamp(other);
  let solved: number;
  if (role === "text") {
    // Solved color is the text; `other` is the background.
    solved = lighter
      ? (y ** APCA.revBG + delta) ** (1 / APCA.revTXT)       // light text on darker background
      : (y ** APCA.normBG - delta) ** (1 / APCA.normTXT);    // dark text on lighter background
  } else {
    // Solved color is the background; `other` is the text.
    solved = lighter
      ? (y ** APCA.normTXT + delta) ** (1 / APCA.normBG)     // lighter background behind dark text
      : (y ** APCA.revTXT - delta) ** (1 / APCA.revBG);      // darker background behind light text
  }
  return apcaUnclamp(solved);
}

function apcaClamp(y: number): number {
  return y >= APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp;
}

/** Inverse of the toe clamp (perceptual-contrast-palette unclampY). */
function apcaUnclamp(y: number): number {
  if (!(y > APCA.blkThrs)) {
    return Number.isNaN(y) ? y : ((y + 0.0387393816571401) * 1.9468554433171) ** (0.283343396420869 / 1.414) / 1.9468554433171 - 0.312865795870758;
  }
  return y;
}

/** APCA screen luminance of a hex (simple 2.4 gamma, no toe clamp). */
export function apcaScreenLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return r ** 2.4 * 0.2126729 + g ** 2.4 * 0.7151522 + b ** 2.4 * 0.072175;
}

// ---------------------------------------------------------------- OKHSL lightness from luminance

/** Oklab L to OKHSL lightness (toe), from Björn Ottosson's okhsl definition. */
function toe(lightness: number): number {
  const k1 = 0.206, k2 = 0.03, k3 = (1 + k1) / (1 + k2);
  const a = k3 * lightness - k1;
  return 0.5 * (a + Math.sqrt(a * a + 4 * k2 * k3 * lightness));
}

/**
 * OKHSL lightness of a neutral gray with WCAG luminance `y` (Oklab L = cbrt(Y) for
 * neutrals). Exact for grays, close for saturated colors; callers correct the rest.
 */
export function grayLightness(y: number): number {
  return toe(Math.cbrt(Math.min(1, Math.max(0, y))));
}
