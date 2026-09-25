#!/usr/bin/env node
// Writes every theme variant to generated/. Usage:
//   node src/generate.ts                               # recipe backgrounds
//   node src/generate.ts --mode dark --terminal-bg #1e1e2e
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateTheme } from "./solve.ts";
import { TARGETS, type Algorithm, type ContrastContract, type Mode, type ThemeRecipe } from "./types.ts";

const root = resolve(import.meta.dirname, "..");
const readJson = <T>(name: string): T => JSON.parse(readFileSync(resolve(root, name), "utf8")) as T;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const { values } = parseArgs({ options: { mode: { type: "string" }, "terminal-bg": { type: "string" } } });
if (values.mode !== undefined && values.mode !== "dark" && values.mode !== "light") fail("--mode must be dark or light");
if (values["terminal-bg"] && !values.mode) fail("--terminal-bg needs --mode dark or light");
const modes: Mode[] = values.mode ? [values.mode as Mode] : ["dark", "light"];

const recipe = readJson<ThemeRecipe>("theme-recipe.json");
const contract = readJson<ContrastContract>("contrast-requirements.json");
const algorithms: Algorithm[] = ["WCAG2", "APCA"];
let results;
try {
  results = algorithms.flatMap((algorithm) => TARGETS.flatMap((target) =>
    modes.map((mode) => generateTheme(recipe, contract, algorithm, mode, target, values["terminal-bg"]))));
} catch (error) {
  results = fail(error instanceof Error ? error.message : String(error));
}

const out = resolve(root, "generated");
mkdirSync(out, { recursive: true });
for (const { theme, relaxation } of results) {
  writeFileSync(resolve(out, `${theme.name}.json`), `${JSON.stringify(theme, null, 2)}\n`);
  console.log(`${theme.name}: ${Object.keys(theme.colors).length} tokens${relaxation ? `, RELAXED ${relaxation} (background cannot meet the contract)` : ""}`);
}
