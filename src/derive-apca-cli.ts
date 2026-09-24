#!/usr/bin/env node
// Writes contrast-requirements.apca.json. Run after changing the WCAG contract or recipe.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApcaContract } from "./apca-derivation.ts";
import type { ContrastContract, ThemeRecipe } from "./types.ts";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function formatContract(contract: ContrastContract): string {
  const { tokens, relationships, limitations, ...head } = contract;
  const tokenLines = Object.entries(tokens).map(([name, token]) => `    ${JSON.stringify(name)}: ${JSON.stringify(token)}`);
  const ruleLines = relationships.map((rule) => `    ${JSON.stringify(rule)}`);
  return `${JSON.stringify(head, null, 2).replace(/\n}$/, "")},\n`
    + `  "tokens": {\n${tokenLines.join(",\n")}\n  },\n`
    + `  "relationships": [\n${ruleLines.join(",\n")}\n  ],\n`
    + `  "limitations": ${JSON.stringify(limitations, null, 2).replace(/\n/g, "\n  ")}\n}\n`;
}

const recipe = JSON.parse(readFileSync(resolve(PROJECT_DIR, "theme-recipe.json"), "utf8")) as ThemeRecipe;
const wcag = JSON.parse(readFileSync(resolve(PROJECT_DIR, "contrast-requirements.json"), "utf8")) as ContrastContract;
const apca = deriveApcaContract(recipe, wcag);
writeFileSync(resolve(PROJECT_DIR, "contrast-requirements.apca.json"), formatContract(apca));
const unclipped = apca.relationships.filter((rule) => rule.apcaLowClip === false).length;
console.log(`contrast-requirements.apca.json: ${apca.relationships.length} rules (${unclipped} unclipped)`);
