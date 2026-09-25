/**
 * State and keyboard handling for the interactive session, kept outside the view so
 * both halves of the wiper render the same state.
 *
 * @module
 */
import { MODELS, SESSIONS, THINKING_LEVELS, TREE_ROWS, type ThinkingLevel } from "./pi-elements.tsx";

/** The open overlay, if any. */
export type Overlay = "none" | "settings" | "tree" | "resume" | "model" | "search";

/** Everything the interactive session shows. */
export interface SessionState {
  /** Editor text. */
  input: string;
  /** Thinking level, which colors the editor border. */
  thinking: ThinkingLevel;
  /** The open overlay. */
  overlay: Overlay;
  /** Selected row in the overlay or command suggestions. */
  selected: number;
  /** Whether tool output is expanded (ctrl+o). */
  expanded: boolean;
  /** Whether thinking text is shown (ctrl+t). */
  thinkingVisible: boolean;
  /** Transcript search query. */
  searchQuery: string;
  /** Current match among all search matches. */
  searchIndex: number;
  /** Value of each setting in {@link SETTING_CHOICES}. */
  settings: Record<string, string>;
}

/** Slash commands offered while typing `/`. */
export const COMMANDS = [
  { label: "/settings", description: "Open settings" },
  { label: "/model", description: "Select model" },
  { label: "/tree", description: "Navigate the session tree" },
  { label: "/resume", description: "Resume a session" },
  { label: "/search", description: "Find in transcript" },
];

/** Settings in `/settings` and the values each cycles through. */
export const SETTING_CHOICES: Record<string, string[]> = {
  "Auto-compact": ["true", "false"],
  "Steering mode": ["one-at-a-time", "all"],
  "Transport": ["sse", "websocket", "auto"],
  "Hide thinking": ["false", "true"],
  "Quiet startup": ["false", "true"],
};

/** The session at startup. */
export const initialSession: SessionState = {
  input: "",
  thinking: "high",
  overlay: "none",
  selected: 0,
  expanded: false,
  thinkingVisible: true,
  searchQuery: "",
  searchIndex: 0,
  settings: Object.fromEntries(Object.entries(SETTING_CHOICES).map(([key, values]) => [key, values[0]])),
};

/**
 * List slash commands matching the input.
 *
 * @param state - The session.
 * @returns Matching commands; empty unless the input starts with `/`.
 */
export function suggestions(state: SessionState) {
  return state.input.startsWith("/") ? COMMANDS.filter((command) => command.label.startsWith(state.input)) : [];
}

/**
 * Count the selectable rows in the open overlay.
 *
 * @param state - The session.
 * @returns The row count, for wrapping arrow-key selection.
 */
const overlaySize = (state: SessionState): number => ({
  none: suggestions(state).length,
  settings: Object.keys(SETTING_CHOICES).length,
  tree: TREE_ROWS.length,
  resume: SESSIONS.length,
  model: MODELS.length,
  search: 0,
})[state.overlay];

/**
 * Open an overlay with the first row selected and the input cleared.
 *
 * @param state - The session.
 * @param overlay - The overlay to open.
 * @returns The new session.
 */
function open(state: SessionState, overlay: Overlay): SessionState {
  return { ...state, overlay, selected: 0, input: "" };
}

/**
 * Handle a key like Pi does. Sending messages and saving changes do nothing.
 *
 * @param state - The session.
 * @param event - The key event.
 * @returns The new session, or undefined if the key is not handled.
 */
export function handleKey(state: SessionState, event: KeyboardEvent): SessionState | undefined {
  const { key, ctrlKey, metaKey, shiftKey } = event;
  const size = overlaySize(state);
  const move = (delta: number) => (size ? { ...state, selected: (state.selected + delta + size) % size } : state);

  if (key === "Escape") return state.overlay !== "none" || state.input ? { ...state, overlay: "none", input: "", searchQuery: "" } : state;
  if (key === "Tab" && shiftKey) {
    const next = THINKING_LEVELS[(THINKING_LEVELS.indexOf(state.thinking) + 1) % THINKING_LEVELS.length];
    return { ...state, thinking: next };
  }
  if (ctrlKey && key.toLowerCase() === "o") return { ...state, expanded: !state.expanded };
  if (ctrlKey && key.toLowerCase() === "t") return { ...state, thinkingVisible: !state.thinkingVisible };
  if (ctrlKey && key.toLowerCase() === "l") return open(state, "model");
  if ((ctrlKey || metaKey) && key.toLowerCase() === "f") return open(state, "search");

  if (state.overlay === "search") {
    if (key === "Enter") return { ...state, searchIndex: state.searchIndex + (shiftKey ? -1 : 1) };
    if (key === "Backspace") return { ...state, searchQuery: state.searchQuery.slice(0, -1), searchIndex: 0 };
    if (key.length === 1 && !ctrlKey && !metaKey) return { ...state, searchQuery: state.searchQuery + key, searchIndex: 0 };
    return undefined;
  }

  if (key === "ArrowUp") return move(-1);
  if (key === "ArrowDown") return move(1);

  if (state.overlay === "settings" && (key === "Enter" || key === " ")) {
    // Cycling a value previews it; nothing is saved.
    const label = Object.keys(SETTING_CHOICES)[state.selected];
    const values = SETTING_CHOICES[label];
    const next = values[(values.indexOf(state.settings[label]) + 1) % values.length];
    return { ...state, settings: { ...state.settings, [label]: next } };
  }
  if (state.overlay !== "none") return key === "Enter" ? { ...state, overlay: "none" } : undefined;

  if (key === "Enter") {
    const matches = suggestions(state);
    if (matches.length) {
      const command = matches[state.selected % matches.length].label;
      const overlay = ({ "/settings": "settings", "/model": "model", "/tree": "tree", "/resume": "resume", "/search": "search" } as const)[command as "/settings"];
      return open(state, overlay);
    }
    return state; // Sending messages is intentionally disabled.
  }
  if (key === "Backspace") return { ...state, input: state.input.slice(0, -1), selected: 0 };
  if (key.length === 1 && !ctrlKey && !metaKey) return { ...state, input: state.input + key, selected: 0 };
  return undefined;
}
