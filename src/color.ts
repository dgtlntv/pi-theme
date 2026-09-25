/**
 * Color math: OKHSL to sRGB, WCAG 2 and perceptual contrast, and their inverses.
 *
 * Formulas: OKHSL and Oklab by Björn Ottosson (constants as in Color.js), WCAG 2.1, and
 * perceptual contrast. Inverse contrast follows wcag-contrast-palette and
 * perceptual-contrast-palette.
 *
 * @module
 */
import type { Algorithm, ColorFamily } from "./types.ts";

/** A three-component color vector. */
type Vector = [number, number, number];

/** A 3×3 matrix, stored as rows. */
type Matrix = [Vector, Vector, Vector];

/**
 * Multiply a matrix by a column vector.
 *
 * @param m - The matrix.
 * @param vector - The vector.
 * @returns The product `m · vector`.
 */
const multiply = (m: Matrix, [x, y, z]: Vector): Vector =>
  m.map((row) => row[0] * x + row[1] * y + row[2] * z) as Vector;

// ---------------------------------------------------------------- hex

/** A `#rgb` or `#rrggbb` color. */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Validate a hex color and normalize it.
 *
 * @param value - A `#rgb` or `#rrggbb` color, in any case.
 * @returns The color as lowercase `#rrggbb`.
 * @throws If `value` is not a hex color.
 */
export function normalizeHex(value: unknown): string {
  if (typeof value !== "string" || !HEX.test(value)) throw new Error(`Invalid color ${JSON.stringify(value)}: expected #rrggbb`);
  const hex = value.toLowerCase();
  return hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex;
}

/**
 * Split a hex color into its sRGB channels.
 *
 * @param hex - A `#rrggbb` color.
 * @returns The red, green, and blue channels, each 0-1.
 */
function channels(hex: string): Vector {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as Vector;
}

// ---------------------------------------------------------------- OKHSL -> sRGB

/** Oklab to cube-root LMS. */
const LAB_TO_LMS: Matrix = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];

/** Linear sRGB to LMS. */
const LINEAR_SRGB_TO_LMS: Matrix = [
  [0.4122214694707629, 0.5363325372617349, 0.0514459932675022],
  [0.2119034958178251, 0.6806995506452344, 0.1073969535369405],
  [0.0883024591900564, 0.2817188391361215, 0.6299787016738222],
];

/** Cube-root LMS to Oklab. */
const LMS_TO_LAB: Matrix = [
  [0.210454268309314, 0.793617774702305, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

/** LMS to linear sRGB. */
const LMS_TO_LINEAR_SRGB: Matrix = [
  [4.0767416360759583, -3.3077115392580629, 0.2309699031821043],
  [-1.2684379732850315, 2.6097573492876882, -0.341319376002657],
  [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117],
];

/**
 * Per sRGB channel (red, green, blue): the (a, b) half-plane where that channel
 * clips first, and the polynomial approximating the maximum saturation there.
 */
const SATURATION_FIT: [[number, number], number[]][] = [
  [[-1.8817031, -0.80936501], [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245]],
  [[1.8144408, -1.19445267], [0.73956515, -0.45954404, 0.08285427, 0.12541073, -0.14503204]],
  [[0.13110758, 1.81333971], [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167]],
];

/** OKHSL toe constant k1. */
const K1 = 0.206;

/** OKHSL toe constant k2. */
const K2 = 0.03;

/** OKHSL toe constant k3, derived so the toe maps 1 to 1. */
const K3 = (1 + K1) / (1 + K2);

/**
 * Convert Oklab lightness to OKHSL lightness.
 *
 * @param x - Oklab L, 0-1.
 * @returns OKHSL lightness, 0-1.
 */
const toe = (x: number): number => 0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) ** 2 + 4 * K2 * K3 * x));

/**
 * Convert OKHSL lightness to Oklab lightness.
 *
 * @param x - OKHSL lightness, 0-1.
 * @returns Oklab L, 0-1.
 */
const toeInverse = (x: number): number => (x * x + K1 * x) / (K3 * (x + K2));

/**
 * Convert Oklab to linear sRGB.
 *
 * @param lab - Oklab L, a, b.
 * @returns Linear red, green, blue; outside 0-1 when out of gamut.
 */
function oklabToLinearSrgb(lab: Vector): Vector {
  return multiply(LMS_TO_LINEAR_SRGB, multiply(LAB_TO_LMS, lab).map((value) => value ** 3) as Vector);
}

/**
 * Rate of change of each cube-root LMS component along a chroma direction.
 *
 * @param a - Normalized hue direction, a component.
 * @param b - Normalized hue direction, b component.
 * @returns The L, M, and S slopes.
 */
function lmsSlopes(a: number, b: number): Vector {
  return [LAB_TO_LMS[0], LAB_TO_LMS[1], LAB_TO_LMS[2]].map((row) => row[1] * a + row[2] * b) as Vector;
}

/**
 * Find the largest saturation (C/L) inside sRGB for a hue: a polynomial fit, refined
 * with one Halley step.
 *
 * @param a - Normalized hue direction, a component (`a² + b² = 1`).
 * @param b - Normalized hue direction, b component.
 * @returns The maximum saturation.
 */
function maxSaturation(a: number, b: number): number {
  const channel = SATURATION_FIT.findIndex(([[x, y]], index) => index === 2 || x * a + y * b > 1);
  const [k0, k1, k2, k3, k4] = SATURATION_FIT[channel][1];
  const weights = LMS_TO_LINEAR_SRGB[channel];
  const saturation = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;

  const slopes = lmsSlopes(a, b);
  const base = slopes.map((k) => 1 + saturation * k);
  const dot = (values: number[]) => values.reduce((sum, value, index) => sum + weights[index] * value, 0);
  const f = dot(base.map((value) => value ** 3));
  const f1 = dot(base.map((value, index) => 3 * slopes[index] * value ** 2));
  const f2 = dot(base.map((value, index) => 6 * slopes[index] ** 2 * value));
  return saturation - (f * f1) / (f1 * f1 - 0.5 * f * f2);
}

/**
 * Find the most saturated sRGB color of a hue.
 *
 * @param a - Normalized hue direction, a component.
 * @param b - Normalized hue direction, b component.
 * @returns The cusp's Oklab lightness and chroma.
 */
function cusp(a: number, b: number): [number, number] {
  const saturation = maxSaturation(a, b);
  const lightness = Math.cbrt(1 / Math.max(...oklabToLinearSrgb([1, saturation * a, saturation * b])));
  return [lightness, lightness * saturation];
}

/**
 * Find where a constant-lightness line leaves the sRGB gamut.
 *
 * @param a - Normalized hue direction, a component.
 * @param b - Normalized hue direction, b component.
 * @param lightness - Oklab L.
 * @param cuspPoint - The hue's cusp, from {@link cusp}.
 * @returns The maximum chroma at that lightness.
 */
function maxChroma(a: number, b: number, lightness: number, [cuspL, cuspC]: [number, number]): number {
  if (lightness <= cuspL) {
    return (cuspC * lightness) / cuspL; // lower half: the triangle edge is exact
  }
  // Upper half: triangle edge, then one Halley step against each channel reaching 1.
  let t = (cuspC * (lightness - 1)) / (cuspL - 1);
  const slopes = lmsSlopes(a, b);
  const lms = slopes.map((k) => lightness + t * k);
  const cubes = lms.map((value) => value ** 3);
  const first = lms.map((value, index) => 3 * slopes[index] * value ** 2);
  const second = lms.map((value, index) => 6 * slopes[index] ** 2 * value);
  const dot = (row: Vector, values: number[]) => row[0] * values[0] + row[1] * values[1] + row[2] * values[2];
  const steps = LMS_TO_LINEAR_SRGB.map((row) => {
    const f = dot(row, cubes) - 1;
    const f1 = dot(row, first);
    const f2 = dot(row, second);
    const u = f1 / (f1 * f1 - 0.5 * f * f2);
    return u >= 0 ? -f * u : Number.MAX_VALUE;
  });
  return t + Math.min(...steps);
}

/**
 * Approximate the cusp's shape smoothly, so OKHSL saturation varies without kinks.
 *
 * @param a - Normalized hue direction, a component.
 * @param b - Normalized hue direction, b component.
 * @returns The cusp's S (C/L) and T (C/(1-L)).
 */
function midSt(a: number, b: number): [number, number] {
  const s = 0.11516993 + 1 / (7.4477897 + 4.1590124 * b
    + a * (-2.19557347 + 1.75198401 * b + a * (-2.13704948 - 10.02301043 * b + a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a))));
  const t = 0.11239642 + 1 / (1.6132032 - 0.68124379 * b
    + a * (0.40370612 + 0.90148123 * b + a * (-0.27087943 + 0.6122399 * b + a * (0.00299215 - 0.45399568 * b - 0.14661872 * a))));
  return [s, t];
}

/**
 * OKHSL's chroma reference points at a lightness and hue: the chroma at low saturation
 * (`c0`), at saturation 0.8 (`cMid`), and at the gamut edge (`cMax`).
 *
 * @param L - Oklab lightness.
 * @param a - Normalized hue direction, a component.
 * @param b - Normalized hue direction, b component.
 * @returns `[c0, cMid, cMax]`.
 */
function chromaStops(L: number, a: number, b: number): [number, number, number] {
  const peak = cusp(a, b);
  const cMax = maxChroma(a, b, L, peak);
  const [cuspS, cuspT] = [peak[1] / peak[0], peak[1] / (1 - peak[0])];
  const k = cMax / Math.min(L * cuspS, (1 - L) * cuspT);
  const [midS, midT] = midSt(a, b);
  const cMid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / (L * midS) ** 4 + 1 / ((1 - L) * midT) ** 4)));
  const c0 = Math.sqrt(1 / (1 / (L * 0.4) ** 2 + 1 / ((1 - L) * 0.8) ** 2));
  return [c0, cMid, cMax];
}

/**
 * Convert OKHSL to Oklab.
 *
 * @param hue - Hue in degrees.
 * @param saturation - Saturation, 0-1.
 * @param lightness - Lightness, 0-1.
 * @returns Oklab L, a, b.
 */
function okhslToOklab(hue: number, saturation: number, lightness: number): Vector {
  const L = toeInverse(lightness);
  if (L === 0 || L === 1 || saturation === 0) return [L, 0, 0];

  const angle = (2 * Math.PI * (((hue % 360) + 360) % 360)) / 360;
  const a = Math.cos(angle);
  const b = Math.sin(angle);
  const [c0, cMid, cMax] = chromaStops(L, a, b);

  // Chroma rises from 0 through cMid at s = 0.8 to cMax at s = 1.
  let chroma: number;
  if (saturation < 0.8) {
    const t = 1.25 * saturation;
    const k1 = 0.8 * c0;
    chroma = (t * k1) / (1 - (1 - k1 / cMid) * t);
  } else {
    const t = 5 * (saturation - 0.8);
    const k1 = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
    chroma = cMid + (t * k1) / (1 - (1 - k1 / (cMax - cMid)) * t);
  }
  return [L, chroma * a, chroma * b];
}

/**
 * Apply the sRGB transfer function.
 *
 * @param value - A linear channel, 0-1.
 * @returns The encoded channel, 0-1.
 */
const encode = (value: number): number => (value > 0.0031308 ? 1.055 * value ** (1 / 2.4) - 0.055 : 12.92 * value);

/**
 * Undo the sRGB transfer function.
 *
 * @param value - An encoded channel, 0-1.
 * @returns The linear channel, 0-1.
 */
const decode = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/**
 * Convert OKHSL to a hex color, clipping out-of-gamut channels.
 *
 * @param hue - Hue in degrees.
 * @param saturation - Saturation, 0-1.
 * @param lightness - Lightness, 0-1.
 * @returns A lowercase `#rrggbb` color.
 */
export function okhslToHex(hue: number, saturation: number, lightness: number): string {
  const rgb = oklabToLinearSrgb(okhslToOklab(hue, saturation, lightness));
  return `#${rgb.map((value) => Math.round(Math.min(1, Math.max(0, encode(value))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Read a hex color's OKHSL hue and saturation.
 *
 * @param hex - A `#rrggbb` color.
 * @returns Hue in degrees (0 for grays) and saturation, 0-1.
 */
export function hexToOkhsl(hex: string): { hue: number; saturation: number } {
  const lms = multiply(LINEAR_SRGB_TO_LMS, channels(hex).map(decode) as Vector).map(Math.cbrt) as Vector;
  const [L, labA, labB] = multiply(LMS_TO_LAB, lms);
  const chroma = Math.hypot(labA, labB);
  const lightness = toe(L);
  if (chroma < 1e-9 || lightness <= 0 || lightness >= 1) return { hue: 0, saturation: 0 };

  const hue = ((Math.atan2(labB, labA) * 180) / Math.PI + 360) % 360;
  const [c0, cMid, cMax] = chromaStops(L, labA / chroma, labB / chroma);
  let saturation: number;
  if (chroma < cMid) {
    const k1 = 0.8 * c0;
    saturation = 0.8 * (chroma / (k1 + (1 - k1 / cMid) * chroma));
  } else {
    const k1 = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
    const offset = chroma - cMid;
    saturation = 0.8 + 0.2 * (offset / (k1 + (1 - k1 / (cMax - cMid)) * offset));
  }
  return { hue, saturation: Math.min(1, Math.max(0, saturation)) };
}

// ---------------------------------------------------------------- color families

/**
 * Weight a family's saturation by lightness, as in ../design-tokens: a Gaussian
 * centered at 0.5 (sigma 0.25), normalized to 0 at black and white.
 *
 * @param lightness - OKHSL lightness, 0-1.
 * @returns The weight, 0 at black and white and 1 at mid lightness.
 */
export function bellWeight(lightness: number): number {
  const gaussian = (x: number): number => Math.exp(-((x - 0.5) ** 2) / (2 * 0.25 ** 2));
  return (gaussian(lightness) - gaussian(0)) / (1 - gaussian(0));
}

/**
 * Pick a family's color at a lightness.
 *
 * @param family - The family's hue and saturation range.
 * @param lightness - OKHSL lightness, 0-1.
 * @returns A `#rrggbb` color.
 */
export function colorAt(family: ColorFamily, lightness: number): string {
  const { min, max } = family.saturation;
  return okhslToHex(family.hue, min + (max - min) * bellWeight(lightness), lightness);
}

/**
 * Convert a luminance to the OKHSL lightness of a gray with that luminance (for
 * grays, Oklab L = cbrt(Y)). Exact for grays; saturated colors land a few percent off.
 *
 * @param y - WCAG luminance; clamped to 0-1.
 * @returns OKHSL lightness, 0-1.
 */
export function grayLightness(y: number): number {
  return toe(Math.cbrt(Math.min(1, Math.max(0, y))));
}

// ---------------------------------------------------------------- WCAG 2

/**
 * Compute WCAG relative luminance.
 *
 * @param hex - A `#rrggbb` color.
 * @returns The luminance, 0-1.
 */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(decode);
  return 0.21263900587151027 * r + 0.715168678767756 * g + 0.07219231536073371 * b;
}

/**
 * Compute the WCAG contrast ratio of two luminances.
 *
 * @param a - A luminance.
 * @param b - Another luminance.
 * @returns The ratio, 1-21.
 */
const wcagRatio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Find the luminance that reaches a WCAG ratio against another luminance.
 *
 * @param ratio - The WCAG ratio to reach.
 * @param other - The other color's luminance.
 * @param lighter - Whether to solve on the lighter side of `other`.
 * @returns The luminance; outside 0-1 when the ratio is unreachable.
 */
export function wcagTargetLuminance(ratio: number, other: number, lighter: boolean): number {
  return lighter ? ratio * (other + 0.05) - 0.05 : (other + 0.05) / ratio - 0.05;
}

// ---------------------------------------------------------------- perceptual contrast

/** Perceptual contrast constants. */
const PERCEPTUAL = {
  normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, loClip: 0.1, deltaYmin: 0.0005,
  scale: 1.14, loOffset: 0.027,
};

/**
 * Compute perceptual screen luminance: a simple 2.4 gamma, before the black soft clamp.
 *
 * @param hex - A `#rrggbb` color.
 * @returns The screen luminance, 0-1.
 */
export function screenLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
}

/**
 * Apply the perceptual formula's black soft clamp, which models flare on very dark colors.
 *
 * @param y - Screen luminance.
 * @returns The clamped luminance.
 */
const clampBlack = (y: number): number => (y >= PERCEPTUAL.blkThrs ? y : y + (PERCEPTUAL.blkThrs - y) ** PERCEPTUAL.blkClmp);

/**
 * Undo the black soft clamp.
 *
 * @param y - Clamped luminance.
 * @returns The screen luminance; NaN stays NaN.
 */
function unclampBlack(y: number): number {
  if (Number.isNaN(y) || y > PERCEPTUAL.blkThrs) return y;
  return ((y + 0.0387393816571401) * 1.9468554433171) ** (0.283343396420869 / 1.414) / 1.9468554433171 - 0.312865795870758;
}

/**
 * Compute the signed perceptual contrast of text on a background.
 *
 * The low clip reports |raw| < 0.1 as 0 and subtracts an offset above it, which makes
 * faint surfaces (panels near 5) unmeasurable. Values below 10 carry no readability
 * meaning; they only place faint surfaces.
 *
 * @param text - The text color, `#rrggbb`.
 * @param background - The background color, `#rrggbb`.
 * @param lowClip - Whether to apply the low clip; false returns the raw scaled contrast.
 * @returns The contrast, 0-108: positive for dark text on light, negative for light text on dark.
 */
export function perceptualContrast(text: string, background: string, lowClip = true): number {
  const t = clampBlack(screenLuminance(text));
  const b = clampBlack(screenLuminance(background));
  if (Math.abs(b - t) < PERCEPTUAL.deltaYmin) return 0;
  const raw = b > t
    ? (b ** PERCEPTUAL.normBG - t ** PERCEPTUAL.normTXT) * PERCEPTUAL.scale
    : (b ** PERCEPTUAL.revBG - t ** PERCEPTUAL.revTXT) * PERCEPTUAL.scale;
  if (!lowClip) return raw * 100;
  if (Math.abs(raw) < PERCEPTUAL.loClip) return 0;
  return (raw > 0 ? raw - PERCEPTUAL.loOffset : raw + PERCEPTUAL.loOffset) * 100;
}

/**
 * Find the screen luminance text needs to reach a perceptual contrast on a background.
 *
 * @param minimum - The absolute perceptual contrast to reach.
 * @param background - The background's screen luminance.
 * @param lighter - Whether the text is lighter than the background.
 * @param lowClip - Whether the contrast is measured with the low clip.
 * @returns The text's screen luminance; NaN when unreachable.
 */
export function perceptualTargetLuminance(minimum: number, background: number, lighter: boolean, lowClip = true): number {
  const delta = (minimum / 100 + (lowClip ? PERCEPTUAL.loOffset : 0)) / PERCEPTUAL.scale;
  const y = clampBlack(background);
  return unclampBlack(lighter
    ? (y ** PERCEPTUAL.revBG + delta) ** (1 / PERCEPTUAL.revTXT)
    : (y ** PERCEPTUAL.normBG - delta) ** (1 / PERCEPTUAL.normTXT));
}

// ---------------------------------------------------------------- both

/**
 * Compute the contrast of text on a background. WCAG 2 is symmetric; perceptual
 * contrast is directional and returned as an absolute value, so both read as "at least N".
 *
 * @param text - The text color, `#rrggbb`.
 * @param background - The background color, `#rrggbb`.
 * @param algorithm - The contrast algorithm.
 * @param lowClip - Perceptual only: whether to apply the low clip.
 * @returns A WCAG ratio (1-21) or an absolute perceptual contrast (0-108).
 */
export function contrast(text: string, background: string, algorithm: Algorithm = "wcag", lowClip = true): number {
  return algorithm === "perceptual"
    ? Math.abs(perceptualContrast(text, background, lowClip))
    : wcagRatio(luminance(text), luminance(background));
}

/**
 * Find the WCAG luminance a gray needs to reach a minimum on a background.
 *
 * @param minimum - A WCAG ratio or an absolute perceptual contrast.
 * @param background - The background color, `#rrggbb`.
 * @param lighter - Whether the gray is lighter than the background (dark themes).
 * @param algorithm - The algorithm `minimum` is measured in.
 * @param lowClip - Perceptual only: whether the contrast is measured with the low clip.
 * @returns The luminance; outside 0-1 or NaN when unreachable.
 */
export function targetLuminance(minimum: number, background: string, lighter: boolean, algorithm: Algorithm, lowClip = true): number {
  if (algorithm === "wcag") return wcagTargetLuminance(minimum, luminance(background), lighter);
  const screen = perceptualTargetLuminance(minimum, screenLuminance(background), lighter, lowClip);
  // A gray's perceptual screen luminance is its channel ** 2.4; convert that channel to WCAG luminance.
  return screen >= 0 && screen <= 1 ? decode(screen ** (1 / 2.4)) : Number.NaN;
}
