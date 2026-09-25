#!/usr/bin/env node
/**
 * Record a Pi session replay for the review app: web/public/replay.cast.
 *
 * Runs Pi (the fork in ../pi) with pi-replay under asciinema, using a marker theme where every
 * token has its own color, rgb(1, 2, n) (web/src/replay-markers.json), so the app can recolor
 * the recording to any theme. Aborted responses become normal ones first, because pi-replay stops
 * at them. The replay runs at 100x speed: redraws merge, which keeps the recording small.
 *
 * Needs asciinema 3 and a pi-replay checkout that exits when PI_REPLAY_EXIT_ON_COMPLETE is set
 * (see the README).
 *
 * @example
 * node web/scripts/record-replay.ts ~/.pi/agent/sessions/<dir>/<session>.jsonl /path/to/pi-replay 25
 *
 * @module
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** A session file entry: the fields this script reads. */
interface Entry {
  type: string;
  id?: string;
  parentId?: string | null;
  message?: { role: string; stopReason?: string; toolCallId?: string; content?: Array<{ type: string; id?: string }> };
}

const [sessionPath, replayDir, turnLimit] = process.argv.slice(2);
if (!sessionPath || !replayDir) {
  console.error("Usage: node web/scripts/record-replay.ts <session.jsonl> <pi-replay dir> [user turns]");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "../..");
const work = mkdtempSync(join(tmpdir(), "pi-replay-"));
// Pi's own config lives apart: Pi moves any .jsonl in its config directory into sessions/.
const agentDir = join(work, "agent");
mkdirSync(agentDir);

/**
 * Turn aborted responses into normal ones, without their unanswered tool calls. pi-replay stops
 * at an aborted response, and needs a recorded response for every user message.
 *
 * @param entries - The session entries.
 * @returns The entries, with aborted responses completed.
 */
function completeAborted(entries: Entry[]): Entry[] {
  return entries.map((entry) => {
    const message = entry.message;
    if (message?.role !== "assistant" || message.stopReason !== "aborted") return entry;
    const { errorMessage: _, ...rest } = message as typeof message & { errorMessage?: string };
    const content = message.content?.filter((part) => part.type !== "toolCall");
    return { ...entry, message: { ...rest, stopReason: "stop", content } };
  });
}

/**
 * Keep the session up to its first `turns` user messages.
 *
 * @param entries - The session entries, in file order.
 * @param turns - How many user turns to keep.
 * @returns The entries before the next user message.
 */
function firstTurns(entries: Entry[], turns: number): Entry[] {
  let users = 0;
  const end = entries.findIndex((entry) => entry.message?.role === "user" && ++users > turns);
  return end === -1 ? entries : entries.slice(0, end);
}

/**
 * End at the last final assistant response (one without tool calls). pi-replay needs a recorded
 * answer for every user message and a recorded result for every tool call.
 *
 * @param entries - The session entries.
 * @returns The entries up to the last final response.
 */
function endAtResponse(entries: Entry[]): Entry[] {
  const last = entries.findLastIndex(
    (entry) => entry.message?.role === "assistant" && !entry.message.content?.some((part) => part.type === "toolCall"),
  );
  return entries.slice(0, last + 1);
}

const all = readFileSync(sessionPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Entry);
const entries = turnLimit ? firstTurns(all, Number(turnLimit)) : all;
writeFileSync(join(work, "session.jsonl"), endAtResponse(completeAborted(entries)).map((entry) => JSON.stringify(entry)).join("\n") + "\n");
const markers = JSON.parse(readFileSync(join(root, "web/src/replay-markers.json"), "utf8")) as Record<string, string>;
writeFileSync(join(work, "replay-markers.json"), JSON.stringify({ name: "replay-markers", colors: markers }));
writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ quietStartup: true }));

const pi = [
  resolve(root, "../pi/pi-test.sh"),
  "--offline --no-session --no-extensions --no-builtin-tools --no-skills --no-context-files --no-prompt-templates",
  `--tui-mode fullscreen --extension ${replayDir}`,
  `--theme ${join(work, "replay-markers.json")} --use-theme replay-markers`,
  `--replay-session ${join(work, "session.jsonl")} --replay-speed 100 /replay`,
].join(" ");
const out = join(root, "web/public/replay.cast");
const result = spawnSync(
  "asciinema",
  ["rec", "--headless", "--window-size", "100x32", "-f", "asciicast-v2", "--overwrite", "-i", "2", "-q", "--command", pi, out],
  { stdio: "inherit", env: { ...process.env, COLORTERM: "truecolor", PI_REPLAY_EXIT_ON_COMPLETE: "1", PI_CODING_AGENT_DIR: agentDir } },
);
process.exit(result.status ?? 1);
