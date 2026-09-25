/**
 * The review app: controls, and the terminal showing the catalog or session.
 *
 * @module
 */
import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CatalogView } from "./CatalogView.tsx";
import { handleKey, initialSession, type SessionState } from "./session-state.ts";
import { SessionView } from "./SessionView.tsx";
import { TermContext } from "./term.tsx";
import { DEFAULT_BACKGROUND, generatePreview, TERMINAL_THEMES, type Palette, type PiTheme } from "./theme-engine.ts";

/** Which content the terminal shows. */
type View = "catalog" | "session";

/** A complete `#rrggbb` color, for the background text field. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Render a view against a theme.
 *
 * @param props - The theme's colors and the view.
 * @returns The terminal.
 */
function Terminal({ palette, children }: { palette: Palette; children: ReactNode }) {
  const style = {
    background: palette.background,
    color: palette.terminalForeground,
    "--surface": palette.background,
  } as CSSProperties;
  return (
    <TermContext.Provider value={{ palette }}>
      <div className="terminal" style={style}>{children}</div>
    </TermContext.Provider>
  );
}

/**
 * The review app.
 *
 * @returns The app.
 */
export function App() {
  const [view, setView] = useState<View>("catalog");
  const [theme, setTheme] = useState<PiTheme>("system");
  const [terminalIndex, setTerminalIndex] = useState(0);
  const terminalTheme = TERMINAL_THEMES[terminalIndex];
  const [background, setBackground] = useState(DEFAULT_BACKGROUND.dark);
  const [backgroundText, setBackgroundText] = useState(DEFAULT_BACKGROUND.dark);
  const [session, setSession] = useState<SessionState>(initialSession);

  // Defer so dragging the background color picker stays responsive.
  const deferredBackground = useDeferredValue(background);
  const preview = useMemo(
    () => generatePreview(theme, terminalTheme, deferredBackground),
    [theme, terminalTheme, deferredBackground],
  );

  const applyBackground = (value: string) => {
    setBackgroundText(value);
    if (HEX.test(value)) setBackground(value.toLowerCase());
  };
  const selectTerminal = (index: number) => setTerminalIndex((index + TERMINAL_THEMES.length) % TERMINAL_THEMES.length);

  useEffect(() => {
    if (view !== "session") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const next = handleKey(session, event);
      if (next) {
        event.preventDefault();
        setSession(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, session]);

  const content = view === "catalog" ? <CatalogView /> : <SessionView state={session} />;

  return (
    <div className="app">
      <header className="controls">
        <fieldset>
          <legend>View</legend>
          <label><input type="radio" checked={view === "catalog"} onChange={() => setView("catalog")} /> Catalog</label>
          <label><input type="radio" checked={view === "session"} onChange={() => setView("session")} /> Session</label>
        </fieldset>
        <fieldset>
          <legend>Theme</legend>
          <label title="Hue, saturation, and text color from the terminal theme"><input type="radio" checked={theme === "system"} onChange={() => setTheme("system")} /> System</label>
          <label title="Pi's dark/light themes, from the recipe's color families"><input type="radio" checked={theme === "lightDark"} onChange={() => setTheme("lightDark")} /> Pi light/dark</label>
        </fieldset>
        {theme === "system" ? (
          <fieldset>
            <legend>Terminal theme</legend>
            <button type="button" title="Previous theme" onClick={() => selectTerminal(terminalIndex - 1)}>◀</button>
            <select value={terminalIndex} onChange={(e) => selectTerminal(Number(e.target.value))}>
              {TERMINAL_THEMES.map((terminal, index) => <option key={terminal.name} value={index}>{terminal.name}</option>)}
            </select>
            <button type="button" title="Next theme" onClick={() => selectTerminal(terminalIndex + 1)}>▶</button>
            <span className="swatches" title="ANSI colors 0-15">
              {terminalTheme.palette.map((color, index) => <span key={index} style={{ background: color }} title={`${index}: ${color}`} />)}
            </span>
          </fieldset>
        ) : (
          <fieldset>
            <legend>Terminal background</legend>
            <input type="color" value={background} onChange={(e) => applyBackground(e.target.value)} />
            <input type="text" size={8} value={backgroundText} onChange={(e) => applyBackground(e.target.value)} />
            <button type="button" onClick={() => applyBackground(DEFAULT_BACKGROUND.dark)}>Dark</button>
            <button type="button" onClick={() => applyBackground(DEFAULT_BACKGROUND.light)}>Light</button>
          </fieldset>
        )}
        {view === "session" && (
          <span className="keys">
            Keys: shift+tab thinking · ctrl+o expand · ctrl+t thinking text · / commands · ctrl+l model · ctrl+f search · esc close · enter does nothing
          </span>
        )}
      </header>

      {"relaxation" in preview && preview.relaxation && (
        <div className="warning">
          This background cannot meet the contract: minimums relaxed by {preview.relaxation} (0 = as written, 2 = lowest).
        </div>
      )}
      {"error" in preview ? (
        <div className="warning">Generation failed: {preview.error}</div>
      ) : (
        <main className="stage">
          <Terminal palette={preview.palette}>{content}</Terminal>
        </main>
      )}
    </div>
  );
}
