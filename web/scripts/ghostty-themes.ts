#!/usr/bin/env node
/**
 * Collect Ghostty's bundled themes into web/src/ghostty-themes.json: background, foreground,
 * and the 16 ANSI colors of each. Ghostty's default comes first. Run with Ghostty installed:
 * `npm run web:ghostty-themes`. Set GHOSTTY_THEMES_DIR to read themes from another directory.
 *
 * @module
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** A terminal color theme. */
interface TerminalTheme {
  name: string;
  background: string;
  foreground: string;
  /** ANSI colors 0-15. */
  palette: string[];
}

const THEMES_DIR = process.env.GHOSTTY_THEMES_DIR ?? "/Applications/Ghostty.app/Contents/Resources/ghostty/themes";

/**
 * Parse Ghostty config lines (`key = value`, `palette = N=#hex`) into a theme.
 *
 * @param name - The theme name.
 * @param config - Ghostty config text.
 * @param fallback - Values for keys the config omits.
 * @returns The theme.
 */
function parseTheme(name: string, config: string, fallback?: TerminalTheme): TerminalTheme {
  const theme: TerminalTheme = {
    name,
    background: fallback?.background ?? "",
    foreground: fallback?.foreground ?? "",
    palette: [...(fallback?.palette ?? Array.from({ length: 16 }, () => ""))],
  };
  for (const line of config.split("\n")) {
    const match = line.match(/^\s*(background|foreground|palette)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "palette") {
      const [index, color] = value.split("=");
      if (Number(index) < 16) theme.palette[Number(index)] = color.trim().toLowerCase();
    } else {
      theme[key as "background" | "foreground"] = value.toLowerCase();
    }
  }
  const hex = (color: string) => (color.startsWith("#") ? color : `#${color}`);
  return { ...theme, background: hex(theme.background), foreground: hex(theme.foreground), palette: theme.palette.map(hex) };
}

const defaults = parseTheme("Ghostty default", execFileSync("ghostty", ["+show-config", "--default"], { encoding: "utf8" }));
const themes = readdirSync(THEMES_DIR)
  .sort((a, b) => a.localeCompare(b))
  .map((name) => parseTheme(name, readFileSync(join(THEMES_DIR, name), "utf8"), defaults));

const out = resolve(import.meta.dirname, "../src/ghostty-themes.json");
writeFileSync(out, `${JSON.stringify([defaults, ...themes])}\n`);
console.log(`${out}: ${themes.length + 1} themes`);
