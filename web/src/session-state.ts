// State and keyboard handling for the interactive session. Kept outside the view so
// both halves of the wiper render the same state.
import { MODELS, SESSIONS, THINKING_LEVELS, TREE_ROWS, type ThinkingLevel } from "./pi-elements.tsx";

export type Overlay = "none" | "settings" | "tree" | "resume" | "model" | "search";

export interface SessionState {
  input: string;
  thinking: ThinkingLevel;
  overlay: Overlay;
  selected: number;
  expanded: boolean;
  thinkingVisible: boolean;
  searchQuery: string;
  searchIndex: number;
  settings: Record<string, string>;
}

export const COMMANDS = [
  { label: "/settings", description: "Open settings" },
  { label: "/model", description: "Select model" },
  { label: "/tree", description: "Navigate the session tree" },
  { label: "/resume", description: "Resume a session" },
  { label: "/search", description: "Find in transcript" },
];

export const SETTING_CHOICES: Record<string, string[]> = {
  "Auto-compact": ["true", "false"],
  "Steering mode": ["one-at-a-time", "all"],
  "Transport": ["sse", "websocket", "auto"],
  "Hide thinking": ["false", "true"],
  "Quiet startup": ["false", "true"],
};

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

export function suggestions(state: SessionState) {
  return state.input.startsWith("/") ? COMMANDS.filter((command) => command.label.startsWith(state.input)) : [];
}

const overlaySize = (state: SessionState): number => ({
  none: suggestions(state).length,
  settings: Object.keys(SETTING_CHOICES).length,
  tree: TREE_ROWS.length,
  resume: SESSIONS.length,
  model: MODELS.length,
  search: 0,
})[state.overlay];

function open(state: SessionState, overlay: Overlay): SessionState {
  return { ...state, overlay, selected: 0, input: "" };
}

/** Pi-like key handling. Sending messages and saving changes do nothing. */
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
