#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTheme } from "./solve.ts";
import type { TerminalOverrides } from "./selection.ts";
import { ALGORITHMS, TARGETS, type Algorithm, type ContrastContract, type GenerationResult, type Mode, type Target, type ThemeRecipe } from "./types.ts";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OPTIONS = ["--mode", "--target", "--algorithm", "--recipe", "--contract", "--apca-contract", "--out", "--terminal-bg", "--terminal-fg"] as const;
type OptionName = (typeof OPTIONS)[number];

function parseOptions(args: string[]): Partial<Record<OptionName, string>> {
  const options: Partial<Record<OptionName, string>> = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!OPTIONS.includes(key as OptionName) || !value || value.startsWith("--")) {
      throw new Error(`Unknown/incomplete argument: ${key}`);
    }
    options[key as OptionName] = value;
  }
  return options;
}

function selectedModes(options: Partial<Record<OptionName, string>>): Mode[] {
  const mode = options["--mode"] ?? "both";
  if (mode !== "dark" && mode !== "light" && mode !== "both") {
    throw new Error("--mode must be dark, light or both");
  }
  if (mode === "both" && (options["--terminal-bg"] || options["--terminal-fg"])) {
    throw new Error("Terminal overrides require --mode dark or --mode light (one actual terminal at a time)");
  }
  return mode === "both" ? ["dark", "light"] : [mode];
}

function selectedTargets(options: Partial<Record<OptionName, string>>): Target[] {
  const target = options["--target"] ?? "both";
  if (target === "both") return [...TARGETS];
  if (!TARGETS.includes(target as Target)) throw new Error("--target must be current, extended or both");
  return [target as Target];
}

function selectedAlgorithms(options: Partial<Record<OptionName, string>>): Algorithm[] {
  const algorithm = options["--algorithm"] ?? "both";
  if (algorithm === "both") return [...ALGORITHMS];
  if (!ALGORITHMS.includes(algorithm as Algorithm)) throw new Error("--algorithm must be WCAG2, APCA or both");
  return [algorithm as Algorithm];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeResult(outputDir: string, result: GenerationResult): void {
  const { theme, report } = result;
  const themePath = resolve(outputDir, `${theme.name}.json`);
  const reportPath = resolve(outputDir, `${theme.name}.report.json`);
  writeFileSync(themePath, `${JSON.stringify(theme, null, 2)}\n`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const outcome = report.relaxation
    ? `RELAXED ${report.relaxation.value} (background too mid-range): ${report.relaxation.unmet} of ${report.summary.required} minimums unmet, `
    : `${report.summary.required} minimums pass, `;
  console.log(
    `${theme.name} (${Object.keys(theme.colors).length} tokens): ${outcome}`
    + `${report.summary.noRequirement} explicit unconstrained pairs; `
    + `background ${report.terminal.background.hex} (${report.terminal.background.source}), `
    + `terminal fg ${report.terminal.foreground.hex} (${report.terminal.foreground.source})`,
  );
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const modes = selectedModes(options);
  const targets = selectedTargets(options);
  const algorithms = selectedAlgorithms(options);
  const recipePath = resolve(options["--recipe"] ?? resolve(PROJECT_DIR, "theme-recipe.json"));
  const contractPaths: Record<Algorithm, string> = {
    WCAG2: resolve(options["--contract"] ?? resolve(PROJECT_DIR, "contrast-requirements.json")),
    APCA: resolve(options["--apca-contract"] ?? resolve(PROJECT_DIR, "contrast-requirements.apca.json")),
  };
  const outputDir = resolve(options["--out"] ?? resolve(PROJECT_DIR, "generated"));

  const recipe = readJson<ThemeRecipe>(recipePath);
  const contracts = algorithms.map((algorithm) => {
    const contract = readJson<ContrastContract>(contractPaths[algorithm]);
    if (contract.algorithm !== algorithm) throw new Error(`${contractPaths[algorithm]} is not a ${algorithm} contract`);
    return contract;
  });
  const terminal: TerminalOverrides = {
    background: options["--terminal-bg"],
    terminalForeground: options["--terminal-fg"],
  };

  // Validate *all* requested outputs before writing any theme files.
  const results = contracts.flatMap((contract) => targets.flatMap((target) =>
    modes.map((mode) => generateTheme(recipe, contract, mode, terminal, target))));
  mkdirSync(outputDir, { recursive: true });
  for (const result of results) writeResult(outputDir, result);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
