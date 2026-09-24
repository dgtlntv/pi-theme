import { colorAt, contrast } from "./color.ts";
import { emittedTokens } from "./contract.ts";
import type { ColorSelection } from "./selection.ts";
import type { Algorithm, CheckedPair, ContrastContract, GenerationResult, Mode, Pair, Target, ThemeRecipe } from "./types.ts";

const CONTRAST_TOLERANCE = 1e-9;

function checkPairs(pairs: Pair[], colors: Record<string, string>): CheckedPair[] {
  return pairs.map((pair) => {
    const ratio = contrast(colors[pair.token], colors[pair.background], pair.algorithm, pair.apcaLowClip);
    return {
      ...pair,
      ratio: Number(ratio.toFixed(4)),
      passes: pair.contrast === null ? null : ratio + CONTRAST_TOLERANCE >= pair.contrast,
    };
  });
}

function assertContrastRequirementsPass(checks: CheckedPair[]): void {
  const failures = checks.filter((check) => check.passes === false);
  if (failures.length === 0) return;

  const details = failures.map((check) =>
    `${check.token}${check.via ? ` (for ${check.via})` : ""}/${check.background} ${check.ratio} < ${check.contrast}`,
  );
  throw new Error(`Solver produced ${failures.length} failing minimum pair(s): ${details.join("; ")}`);
}

/** Only the steps actually selected for semantic roles appear in the palette report. */
function usedPalette(recipe: ThemeRecipe, selection: ColorSelection): Record<string, Record<string, string>> {
  const usedSteps: Record<string, Set<number>> = {};

  for (const choice of Object.values(selection.selected)) {
    if (choice.family && choice.step !== null) {
      (usedSteps[choice.family] ??= new Set()).add(choice.step);
    }
  }

  const palette: Record<string, Record<string, string>> = {};
  for (const [family, steps] of Object.entries(usedSteps)) {
    palette[family] = {};
    for (const step of [...steps].sort((a, b) => a - b)) {
      palette[family][step] = colorAt(recipe.families[family], step).hex;
    }
  }
  return palette;
}

function piThemeColors(contract: ContrastContract, target: Target, colors: Record<string, string>): Record<string, string> {
  const piColors: Record<string, string> = {};
  for (const token of emittedTokens(contract, target)) piColors[token] = colors[token];
  return piColors;
}

/**
 * WCAG current keeps the original theme names. Extended and APCA get their own
 * suffixes so every variant can be installed side by side.
 */
export function themeName(recipe: ThemeRecipe, mode: Mode, target: Target, algorithm: Algorithm = "WCAG2"): string {
  const parts = [recipe.name, algorithm === "APCA" ? "apca" : undefined, target === "extended" ? "extended" : undefined, mode];
  return parts.filter(Boolean).join("-");
}

/** Recheck all pairs after selection, including the explicitly unconstrained pairs. */
export function buildResult(
  recipe: ThemeRecipe,
  contract: ContrastContract,
  mode: Mode,
  target: Target,
  pairs: Pair[],
  selection: ColorSelection,
  relaxation: { value: number; pairs: Pair[] } | undefined,
): GenerationResult {
  // Always audit against what the solver was asked to satisfy; report against the contract.
  assertContrastRequirementsPass(checkPairs(relaxation?.pairs ?? pairs, selection.colors));
  const checks = checkPairs(pairs, selection.colors);

  return {
    theme: {
      name: themeName(recipe, mode, target, contract.algorithm),
      colors: piThemeColors(contract, target, selection.colors),
    },
    report: {
      mode,
      target,
      algorithm: contract.algorithm,
      terminal: {
        background: selection.selected.background,
      },
      selected: selection.selected,
      palette: usedPalette(recipe, selection),
      checks,
      summary: {
        required: checks.filter((check) => check.contrast !== null).length,
        noRequirement: checks.filter((check) => check.contrast === null).length,
      },
      ...(relaxation && {
        relaxation: {
          value: Number(relaxation.value.toFixed(3)),
          unmet: checks.filter((check) => check.passes === false).length,
        },
      }),
    },
  };
}
