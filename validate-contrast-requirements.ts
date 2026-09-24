#!/usr/bin/env node
// Run: node validate-contrast-requirements.ts [path/to/contrast-requirements.json]
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContract, validatePiInventory } from "./src/contract.ts";
import type { ContrastContract } from "./src/types.ts";

const projectDir = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(process.argv[2] ?? resolve(projectDir, "contrast-requirements.json"));
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as ContrastContract;
const summary = validateContract(contract);

// Optional cross-check when the Pi source checkout is available next door.
const piThemePath = resolve(projectDir, "../pi/packages/coding-agent/src/modes/interactive/theme/dark.json");
if (existsSync(piThemePath)) {
  const piTheme = JSON.parse(readFileSync(piThemePath, "utf8")) as {
    colors: Record<string, unknown>;
  };
  validatePiInventory(contract, piTheme.colors);
}

console.log(
  `Valid: ${Object.keys(contract.tokens).length} tokens (including 2 virtual), `
  + `${contract.relationships.length} rules, ${summary.required} minimum pairs, `
  + `${summary.noRequirement} explicit no-requirement pairs`
  + `${existsSync(piThemePath) ? "; Pi inventory matches" : ""}.`,
);
