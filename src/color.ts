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

// Color.js implements WCAG 2.1 contrast directly. Cache parsed final hex colors
// because the solver checks many candidate steps against the same backgrounds.
const parsed = new Map<string, Color>();
function fromHex(hex: string): Color {
  let color = parsed.get(hex);
  if (!color) {
    color = new Color(hex);
    parsed.set(hex, color);
  }
  return color;
}

// APCA 0.0.98G constants, as in Color.js src/contrast/APCA.js.
const APCA = {
  normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, loClip: 0.1, deltaYmin: 0.0005,
  scale: 1.14, loOffset: 0.027,
};

function apcaLuminance(hex: string): number {
  const [r, g, b] = fromHex(hex).coords.map((value) => {
    const channel = value ?? 0;
    return Math.sign(channel) * Math.abs(channel) ** 2.4;
  });
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  // Soft toe clamp for very dark colors (flare).
  return y >= APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp;
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

/**
 * Contrast of `foreground` on `background`. WCAG2 is symmetric; APCA is not, and
 * returns the absolute Lc so both algorithms read as "at least N".
 */
export function contrast(foreground: string, background: string, algorithm: Algorithm = "WCAG2", apcaLowClip = true): number {
  return algorithm === "APCA"
    ? Math.abs(apcaContrast(foreground, background, apcaLowClip))
    : Color.contrastWCAG21(fromHex(foreground), fromHex(background));
}

export function luminance(hex: string): number {
  return fromHex(hex).luminance;
}
