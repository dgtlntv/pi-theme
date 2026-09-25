#!/usr/bin/env node
// Writes every theme variant to generated/. Usage:
//   node src/generate.ts                               # recipe backgrounds
//   node src/generate.ts --mode dark --terminal-bg #1e1e2e
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { deriveApcaContract } from "./apca.ts";
import { generateTheme } from "./solve.ts";
import { TARGETS, type ContrastContract, type Mode, type ThemeRecipe } from "./types.ts";

const root = resolve(import.meta.dirname, "..");
const readJson = <T>(name: string): T => JSON.parse(readFileSync(resolve(root, name), "utf8")) as T;

const { values } = parseArgs({ options: { mode: { type: "string" }, "terminal-bg": { type: "string" } } });
if (values.mode !== undefined && values.mode !== "dark" && values.mode !== "light") throw new Error("--mode must be dark or light");
if (values["terminal-bg"] && !values.mode) throw new Error("--terminal-bg needs --mode dark or light");
const modes: Mode[] = values.mode ? [values.mode] : ["dark", "light"];

const recipe = readJson<ThemeRecipe>("theme-recipe.json");
const wcag = readJson<ContrastContract>("contrast-requirements.json");
const results = [wcag, deriveApcaContract(recipe, wcag)].flatMap((contract) => TARGETS.flatMap((target) =>
  modes.map((mode) => generateTheme(recipe, contract, mode, target, values["terminal-bg"]))));

const out = resolve(root, "generated");
mkdirSync(out, { recursive: true });
for (const { theme, relaxation } of results) {
  writeFileSync(resolve(out, `${theme.name}.json`), `${JSON.stringify(theme, null, 2)}\n`);
  console.log(`${theme.name}: ${Object.keys(theme.colors).length} tokens${relaxation ? `, RELAXED ${relaxation} (background cannot meet the contract)` : ""}`);
}
