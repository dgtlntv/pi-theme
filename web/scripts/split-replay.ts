#!/usr/bin/env node
/**
 * Split a build's replay.cast into parts that fit Radius's upload limit, with a
 * replay-parts.json listing them. The app joins the parts when replay.cast is absent.
 *
 * @example
 * node web/scripts/split-replay.ts web/dist-artifact
 *
 * @module
 */
import { gzipSync } from "node:zlib";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Largest gzipped part: base64 in a 256 KB upload request leaves about 190 KB. */
const MAX_GZIPPED_BYTES = 150_000;

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node web/scripts/split-replay.ts <build dir>");
  process.exit(1);
}
const lines = readFileSync(join(dir, "replay.cast"), "utf8").trimEnd().split("\n");
const gzipped = (text: string) => gzipSync(text).length;
// Split into equal line counts, adding parts until each compresses below the limit.
const split = (count: number) => {
  const size = Math.ceil(lines.length / count);
  return Array.from({ length: count }, (_, index) => lines.slice(index * size, (index + 1) * size).join("\n"));
};
let parts = split(Math.ceil(gzipped(lines.join("\n")) / MAX_GZIPPED_BYTES));
while (parts.some((part) => gzipped(part) > MAX_GZIPPED_BYTES)) parts = split(parts.length + 1);
const names = parts.map((_, index) => `replay-${index + 1}.cast`);
parts.forEach((part, index) => writeFileSync(join(dir, names[index]), `${part}\n`));
writeFileSync(join(dir, "replay-parts.json"), `${JSON.stringify(names)}\n`);
rmSync(join(dir, "replay.cast"));
console.log(`replay.cast → ${names.join(", ")} (gzipped ${parts.map((part) => Math.round(gzipped(part) / 1000)).join(", ")} KB)`);
