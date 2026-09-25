/**
 * A replay of a Pi session, recorded with pi-replay and asciinema, shown in the current theme.
 *
 * The recording uses a marker theme: every token has its own color, rgb(1, 2, n). Before
 * playback, each marker becomes the current theme's color for that token, so the same
 * recording shows any theme and terminal. Colors outside the markers (the Pi logo) stay as
 * recorded. Recording: see `web/scripts/record-replay.sh`.
 *
 * @module
 */
import { create, type Player } from "asciinema-player";
import "asciinema-player/dist/bundle/asciinema-player.css";
import { useEffect, useRef, useState } from "react";
import markers from "./replay-markers.json";
import type { Palette } from "./theme-engine.ts";

/** The recording, served from `web/public/`. */
const RECORDING_URL = `${import.meta.env.BASE_URL}replay.cast`;

/** Where builds that split the recording list its parts (`web/scripts/split-replay.ts`). */
const PARTS_URL = `${import.meta.env.BASE_URL}replay-parts.json`;

/**
 * Load the recording: whole, or joined from parts.
 *
 * @returns The asciicast text.
 * @throws If neither the recording nor its parts load.
 */
async function loadRecording(): Promise<string> {
  const text = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    return response.text();
  };
  const whole = await fetch(RECORDING_URL);
  if (whole.ok) return whole.text();
  const parts = JSON.parse(await text(PARTS_URL)) as string[];
  const texts = await Promise.all(parts.map((part) => text(`${import.meta.env.BASE_URL}${part}`)));
  return texts.map((part) => part.trimEnd()).join("\n");
}

/** Marker number `n` of rgb(1, 2, n), by token. */
const MARKER_TOKENS: Record<string, string> = Object.fromEntries(
  Object.entries(markers as Record<string, string>).map(([token, hex]) => [String(parseInt(hex.slice(5), 16)), token]),
);

/**
 * Playback speeds. The recording ran at 100x, so 0.1 plays at 10x the original session's speed.
 */
const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1];

/** A 24-bit foreground (38) or background (48) marker color in an escape sequence. */
const MARKER = /([34]8);2;1;2;(\d+)/g;

/** An escape sequence cut off at the end of an event: asciinema splits output into chunks. */
const UNFINISHED_ESCAPE = /\x1b(?:\[[0-9;]*)?$/;

/**
 * Replace every marker color in a recording with the theme's color for that token.
 *
 * @param recording - The asciicast v2 text.
 * @param palette - Hex colors by token.
 * @returns The recolored asciicast text.
 */
function recolor(recording: string, palette: Palette): string {
  const [header, ...lines] = recording.trimEnd().split("\n");
  let carry = "";
  const events = lines.map((line) => {
    const [time, code, data] = JSON.parse(line) as [number, string, string];
    if (code !== "o") return line;
    // Move an escape sequence cut off at the end into the next event, so markers stay whole.
    let output = carry + data;
    carry = output.match(UNFINISHED_ESCAPE)?.[0] ?? "";
    output = output.slice(0, output.length - carry.length).replace(MARKER, (match, layer: string, marker: string) => {
      const hex = palette[MARKER_TOKENS[marker]];
      if (!hex) return match;
      const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
      return `${layer};2;${r};${g};${b}`;
    });
    return JSON.stringify([time, code, output]);
  });
  return [header, ...events].join("\n");
}

/**
 * Set the player's default colors and 16-color palette, as a player theme named `pi`.
 *
 * @param style - The style element holding the theme.
 * @param palette - Hex colors by token, including `background` and `terminalForeground`.
 * @param ansi - The terminal's ANSI colors 0-15.
 */
function setPlayerTheme(style: HTMLStyleElement, palette: Palette, ansi: string[]): void {
  const colors = ansi.map((color, index) => `--term-color-${index}: ${color};`).join(" ");
  style.textContent = `.asciinema-player-theme-pi { --term-color-foreground: ${palette.terminalForeground}; --term-color-background: ${palette.background}; ${colors} }`;
}

/**
 * The session replay.
 *
 * @param props - The theme's colors, and the terminal's ANSI colors 0-15.
 * @returns The player.
 */
export function ReplayView({ palette, ansi }: { palette: Palette; ansi: string[] }) {
  const container = useRef<HTMLDivElement>(null);
  const style = useRef<HTMLStyleElement | null>(null);
  const player = useRef<Player | undefined>(undefined);
  const playing = useRef(false);
  const [recording, setRecording] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [speed, setSpeed] = useState(0.1);

  useEffect(() => {
    loadRecording().then(setRecording, (reason: Error) => setError(`Could not load the recording: ${reason.message}`));
  }, []);

  useEffect(() => {
    style.current = document.head.appendChild(document.createElement("style"));
    return () => style.current?.remove();
  }, []);

  // Recreate the player when the theme or speed changes, keeping the playback position.
  useEffect(() => {
    if (!recording || !container.current || !style.current) return;
    setPlayerTheme(style.current, palette, ansi);
    const previous = player.current;
    const startAt = previous?.getCurrentTime() ?? 0;
    previous?.dispose();
    const next = create({ data: recolor(recording, palette) }, container.current, {
      theme: "pi",
      fit: "both",
      startAt,
      speed,
      // Keep playing after a theme change; when paused, show the current frame.
      autoPlay: playing.current,
      preload: true,
      poster: `npt:${startAt}`,
      terminalFontFamily: 'Menlo, "SF Mono", Consolas, monospace',
      idleTimeLimit: 2,
    });
    next.addEventListener("playing", () => (playing.current = true));
    next.addEventListener("pause", () => (playing.current = false));
    next.addEventListener("ended", () => (playing.current = false));
    player.current = next;
  }, [recording, palette, ansi, speed]);

  useEffect(() => () => player.current?.dispose(), []);

  if (error) return <div className="warning">{error}</div>;
  return (
    <div className="replay">
      {!recording && <p className="replay-loading">Loading recording…</p>}
      <label className="replay-speed">
        Speed{" "}
        <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          {SPEEDS.map((value) => <option key={value} value={value}>{value * 100}× the session</option>)}
        </select>
      </label>
      <div ref={container} className="replay-player" />
    </div>
  );
}
