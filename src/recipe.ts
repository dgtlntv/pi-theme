import { normalizeHex } from "./color.ts";
import type { ColorFamily, ContrastContract, RecipeRole, ThemeRecipe } from "./types.ts";

function validateFamily(name: string, family: ColorFamily): void {
  const { hue, saturation } = family;
  const validHue = Number.isFinite(hue) && hue >= 0 && hue < 360;
  const validSaturation = Number.isFinite(saturation?.min)
    && Number.isFinite(saturation?.max)
    && saturation.min >= 0
    && saturation.min <= saturation.max
    && saturation.max <= 1;

  if (!validHue || !validSaturation) {
    throw new Error(`Invalid OKHSL family ${name}: hue must be [0,360); saturation 0 <= min <= max <= 1`);
  }
}

/** Expand recipe groups into exactly one color family per non-anchor token. */
export function validateRecipe(recipe: ThemeRecipe, contract: ContrastContract): Record<string, RecipeRole> {
  for (const mode of ["dark", "light"] as const) {
    normalizeHex(recipe.terminalBackground?.[mode]);
  }
  for (const [name, family] of Object.entries(recipe.families ?? {})) {
    validateFamily(name, family);
  }

  const roles: Record<string, RecipeRole> = {};
  for (const role of recipe.roles ?? []) {
    if (!Array.isArray(role.tokens) || role.tokens.length === 0 || !recipe.families[role.family]) {
      throw new Error("Invalid recipe role");
    }
    const unexpected = Object.keys(role).filter((field) => field !== "tokens" && field !== "family");
    if (unexpected.length > 0) {
      throw new Error(`Unknown recipe role field: ${unexpected.join(", ")}. Lightness is derived from contrast requirements.`);
    }

    for (const name of role.tokens) {
      if (roles[name]) throw new Error(`Duplicate recipe token ${name}`);
      if (name === "background") throw new Error("background is anchored by terminalBackground, not a color family");
      if (!contract.tokens[name]) throw new Error(`Unknown recipe token ${name}`);
      roles[name] = role;
    }
  }

  const missing = Object.keys(contract.tokens).filter((name) => name !== "background" && !roles[name]);
  if (missing.length > 0) {
    throw new Error(`Missing recipe roles: ${missing.join(", ")}`);
  }
  return roles;
}
