// Color math: OKHSL to sRGB, WCAG 2 and APCA contrast, and their inverses.
// Formulas: OKHSL/Oklab (Björn Ottosson, constants as in Color.js), WCAG 2.1,
// APCA 0.0.98G; inverse contrast from wcag-contrast-palette and perceptual-contrast-palette.
import type { Algorithm, ColorFamily } from "./types.ts";

type Vector = [number, number, number];
type Matrix = [Vector, Vector, Vector];

const multiply = (m: Matrix, [x, y, z]: Vector): Vector =>
  m.map((row) => row[0] * x + row[1] * y + row[2] * z) as Vector;

// ---------------------------------------------------------------- hex

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Validate a `#rgb` or `#rrggbb` color and return it as lowercase `#rrggbb`. */
export function normalizeHex(value: unknown): string {
  if (typeof value !== "string" || !HEX.test(value)) throw new Error(`Invalid color ${JSON.stringify(value)}: expected #rrggbb`);
  const hex = value.toLowerCase();
  return hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex;
}

/** sRGB channels (0-1) of a `#rrggbb` color. */
function channels(hex: string): Vector {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as Vector;
}

// ---------------------------------------------------------------- OKHSL -> sRGB

// Oklab <-> LMS and LMS -> linear sRGB.
const LAB_TO_LMS: Matrix = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
const LMS_TO_LINEAR_SRGB: Matrix = [
  [4.0767416360759583, -3.3077115392580629, 0.2309699031821043],
  [-1.2684379732850315, 2.6097573492876882, -0.341319376002657],
  [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117],
];
// Per sRGB channel: the (a, b) half-plane where it clips first, and the polynomial
// approximating the maximum saturation there.
const SATURATION_FIT: [[number, number], number[]][] = [
  [[-1.8817031, -0.80936501], [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245]],
  [[1.8144408, -1.19445267], [0.73956515, -0.45954404, 0.08285427, 0.12541073, -0.14503204]],
  [[0.13110758, 1.81333971], [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167]],
];
const K1 = 0.206;
const K2 = 0.03;
const K3 = (1 + K1) / (1 + K2);

/** Oklab lightness to OKHSL lightness. */
const toe = (x: number): number => 0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) ** 2 + 4 * K2 * K3 * x));
const toeInverse = (x: number): number => (x * x + K1 * x) / (K3 * (x + K2));

function oklabToLinearSrgb(lab: Vector): Vector {
  return multiply(LMS_TO_LINEAR_SRGB, multiply(LAB_TO_LMS, lab).map((value) => value ** 3) as Vector);
}

/** Derivative helpers along a chroma direction (a, b) in LMS space. */
function lmsSlopes(a: number, b: number): Vector {
  return [LAB_TO_LMS[0], LAB_TO_LMS[1], LAB_TO_LMS[2]].map((row) => row[1] * a + row[2] * b) as Vector;
}

/** Largest saturation (C/L) at hue (a, b) inside sRGB: polynomial fit plus one Halley step. */
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

/** Lightness and chroma of the most saturated sRGB color at hue (a, b). */
function cusp(a: number, b: number): [number, number] {
  const saturation = maxSaturation(a, b);
  const lightness = Math.cbrt(1 / Math.max(...oklabToLinearSrgb([1, saturation * a, saturation * b])));
  return [lightness, lightness * saturation];
}

/** Chroma where the constant-lightness line at `lightness` leaves the sRGB gamut. */
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

/** Smooth approximation of the cusp's (S, T) for hue (a, b). */
function midSt(a: number, b: number): [number, number] {
  const s = 0.11516993 + 1 / (7.4477897 + 4.1590124 * b
    + a * (-2.19557347 + 1.75198401 * b + a * (-2.13704948 - 10.02301043 * b + a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a))));
  const t = 0.11239642 + 1 / (1.6132032 - 0.68124379 * b
    + a * (0.40370612 + 0.90148123 * b + a * (-0.27087943 + 0.6122399 * b + a * (0.00299215 - 0.45399568 * b - 0.14661872 * a))));
  return [s, t];
}

/** OKHSL (hue in degrees, saturation and lightness 0-1) to Oklab. */
function okhslToOklab(hue: number, saturation: number, lightness: number): Vector {
  const L = toeInverse(lightness);
  if (L === 0 || L === 1 || saturation === 0) return [L, 0, 0];

  const angle = (2 * Math.PI * (((hue % 360) + 360) % 360)) / 360;
  const a = Math.cos(angle);
  const b = Math.sin(angle);
  const peak = cusp(a, b);
  const cMax = maxChroma(a, b, L, peak);
  const [cuspS, cuspT] = [peak[1] / peak[0], peak[1] / (1 - peak[0])];
  const k = cMax / Math.min(L * cuspS, (1 - L) * cuspT);
  const [midS, midT] = midSt(a, b);
  const cMid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / (L * midS) ** 4 + 1 / ((1 - L) * midT) ** 4)));
  const c0 = Math.sqrt(1 / (1 / (L * 0.4) ** 2 + 1 / ((1 - L) * 0.8) ** 2));

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

const encode = (value: number): number => (value > 0.0031308 ? 1.055 * value ** (1 / 2.4) - 0.055 : 12.92 * value);
const decode = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

export function okhslToHex(hue: number, saturation: number, lightness: number): string {
  const rgb = oklabToLinearSrgb(okhslToOklab(hue, saturation, lightness));
  return `#${rgb.map((value) => Math.round(Math.min(1, Math.max(0, encode(value))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------- color families

/**
 * Saturation weight at a lightness, as in ../design-tokens: a Gaussian centered at
 * 0.5 (sigma 0.25), normalized to 0 at black and white and 1 in the middle.
 */
export function bellWeight(lightness: number): number {
  const gaussian = (x: number): number => Math.exp(-((x - 0.5) ** 2) / (2 * 0.25 ** 2));
  return (gaussian(lightness) - gaussian(0)) / (1 - gaussian(0));
}

export function colorAt(family: ColorFamily, lightness: number): string {
  const { min, max } = family.saturation;
  return okhslToHex(family.hue, min + (max - min) * bellWeight(lightness), lightness);
}

/**
 * OKHSL lightness of a neutral gray with WCAG luminance `y` (Oklab L = cbrt(Y) for
 * neutrals). Exact for grays; saturated colors land a few percent off.
 */
export function grayLightness(y: number): number {
  return toe(Math.cbrt(Math.min(1, Math.max(0, y))));
}

// ---------------------------------------------------------------- WCAG 2

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(decode);
  return 0.21263900587151027 * r + 0.715168678767756 * g + 0.07219231536073371 * b;
}

const wcagRatio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Luminance needed to reach `ratio` against luminance `other`, on the lighter or
 * darker side. Outside 0-1 when the ratio is unreachable.
 */
export function wcagTargetLuminance(ratio: number, other: number, lighter: boolean): number {
  return lighter ? ratio * (other + 0.05) - 0.05 : (other + 0.05) / ratio - 0.05;
}

// ---------------------------------------------------------------- APCA 0.0.98G

const APCA = {
  normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, loClip: 0.1, deltaYmin: 0.0005,
  scale: 1.14, loOffset: 0.027,
};

/** APCA screen luminance: simple 2.4 gamma, before the black soft clamp. */
export function apcaScreenLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
}

const apcaClamp = (y: number): number => (y >= APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp);

/** Inverse of the black soft clamp (perceptual-contrast-palette). */
function apcaUnclamp(y: number): number {
  if (Number.isNaN(y) || y > APCA.blkThrs) return y;
  return ((y + 0.0387393816571401) * 1.9468554433171) ** (0.283343396420869 / 1.414) / 1.9468554433171 - 0.312865795870758;
}

/**
 * Signed APCA Lc of `text` on `background`. The spec reports |raw| < 0.1 as 0 and
 * subtracts an offset above it, which makes faint surfaces (panels near Lc 5)
 * unmeasurable; `lowClip: false` returns the raw scaled contrast instead. Values
 * below Lc 10 carry no readability meaning; they only place faint surfaces.
 */
export function apcaContrast(text: string, background: string, lowClip = true): number {
  const t = apcaClamp(apcaScreenLuminance(text));
  const b = apcaClamp(apcaScreenLuminance(background));
  if (Math.abs(b - t) < APCA.deltaYmin) return 0;
  const raw = b > t
    ? (b ** APCA.normBG - t ** APCA.normTXT) * APCA.scale
    : (b ** APCA.revBG - t ** APCA.revTXT) * APCA.scale;
  if (!lowClip) return raw * 100;
  if (Math.abs(raw) < APCA.loClip) return 0;
  return (raw > 0 ? raw - APCA.loOffset : raw + APCA.loOffset) * 100;
}

/**
 * Screen luminance text needs to reach Lc `lc` on a background of screen luminance
 * `background`, lighter or darker than it. NaN when unreachable.
 */
export function apcaTargetLuminance(lc: number, background: number, lighter: boolean, lowClip = true): number {
  const delta = (lc / 100 + (lowClip ? APCA.loOffset : 0)) / APCA.scale;
  const y = apcaClamp(background);
  return apcaUnclamp(lighter
    ? (y ** APCA.revBG + delta) ** (1 / APCA.revTXT)
    : (y ** APCA.normBG - delta) ** (1 / APCA.normTXT));
}

// ---------------------------------------------------------------- both

/**
 * Contrast of `text` on `background`. WCAG 2 is symmetric; APCA is directional and
 * returns the absolute Lc, so both read as "at least N".
 */
export function contrast(text: string, background: string, algorithm: Algorithm = "WCAG2", apcaLowClip = true): number {
  return algorithm === "APCA"
    ? Math.abs(apcaContrast(text, background, apcaLowClip))
    : wcagRatio(luminance(text), luminance(background));
}

/**
 * WCAG luminance a gray needs to reach `minimum` on `background`, as text lighter
 * (dark themes) or darker (light themes) than it. Outside 0-1 or NaN when unreachable.
 */
export function targetLuminance(minimum: number, background: string, lighter: boolean, algorithm: Algorithm, apcaLowClip = true): number {
  if (algorithm === "WCAG2") return wcagTargetLuminance(minimum, luminance(background), lighter);
  const screen = apcaTargetLuminance(minimum, apcaScreenLuminance(background), lighter, apcaLowClip);
  // A gray's APCA screen luminance is its channel ** 2.4; convert that channel to WCAG luminance.
  return screen >= 0 && screen <= 1 ? decode(screen ** (1 / 2.4)) : Number.NaN;
}
