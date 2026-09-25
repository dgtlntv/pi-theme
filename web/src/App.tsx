/**
 * The review app: controls, and the terminal showing the catalog or session.
 *
 * @module
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Algorithm, ColorFamily, PaletteSaturation, Target, ThemeRecipe } from "../../src/types.ts";
import { CatalogView } from "./CatalogView.tsx";
import { handleKey, initialSession, type SessionState } from "./session-state.ts";
import { SessionView } from "./SessionView.tsx";
import { TermContext } from "./term.tsx";
import {
  BASE_RECIPE,
  DEFAULT_BACKGROUND,
  runEngine,
  TERMINAL_THEMES,
  type HueSource,
  type ThemeOutput,
  type Variant,
} from "./theme-engine.ts";

/** Which content the terminal shows. */
type View = "catalog" | "session";

/** Which theme the terminal shows, or both with a wiper. */
type Compare = Variant | "wipe";

/** Pi's theme renders with today's token usage; the proposal with the new tokens and remappings. */
const TOKEN_USAGE: Record<Variant, Target> = { pi: "current", proposed: "extended" };

/** A complete `#rrggbb` color, for the background text field. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Render a view against one theme.
 *
 * @param props - The theme, the target whose token usage to render, and the view.
 * @returns The terminal.
 */
function Terminal({ theme, target, children }: { theme: ThemeOutput; target: Target; children: ReactNode }) {
  const style = {
    background: theme.palette.background,
    color: theme.palette.terminalForeground,
    "--surface": theme.palette.background,
  } as CSSProperties;
  return (
    <TermContext.Provider value={{ palette: theme.palette, target }}>
      <div className="terminal" style={style}>{children}</div>
    </TermContext.Provider>
  );
}

/**
 * Compare two themes: Pi's left of a draggable handle, the proposal right of it.
 *
 * @param props - Both themes and the view.
 * @returns The wiper.
 */
function Wiper({ themes, children }: { themes: Record<Variant, ThemeOutput>; children: ReactNode }) {
  const [position, setPosition] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const drag = (event: React.PointerEvent) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setPosition(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
  };

  // Both halves render the same view; keep their inner scroll areas in step.
  useEffect(() => {
    const scrollers = [...(frame.current?.querySelectorAll<HTMLElement>(".term-scroll") ?? [])];
    let syncing = false;
    const listeners = scrollers.map((source) => {
      const onScroll = () => {
        if (syncing) return;
        syncing = true;
        for (const other of scrollers) if (other !== source) other.scrollTop = source.scrollTop;
        requestAnimationFrame(() => { syncing = false; });
      };
      source.addEventListener("scroll", onScroll);
      return () => source.removeEventListener("scroll", onScroll);
    });
    return () => listeners.forEach((remove) => remove());
  });

  return (
    <div className="wiper" ref={frame}>
      <Terminal theme={themes.proposed} target={TOKEN_USAGE.proposed}>{children}</Terminal>
      <div className="wiper-top" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <Terminal theme={themes.pi} target={TOKEN_USAGE.pi}>{children}</Terminal>
      </div>
      <div
        className="wiper-handle"
        style={{ left: `${position}%` }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={drag}
      >
        <div className="wiper-labels"><span>{themes.pi.label}</span><span>{themes.proposed.label}</span></div>
      </div>
    </div>
  );
}

/**
 * Edit each color family's hue and saturation range.
 *
 * @param props - The recipe and a change handler.
 * @returns The editor table.
 */
function FamilyEditor({ recipe, onChange }: { recipe: ThemeRecipe; onChange: (recipe: ThemeRecipe) => void }) {
  const used = new Map<string, string[]>();
  for (const role of recipe.roles) used.set(role.family, [...(used.get(role.family) ?? []), ...role.tokens]);
  const update = (name: string, family: ColorFamily) => onChange({ ...recipe, families: { ...recipe.families, [name]: family } });
  return (
    <table className="families">
      <thead><tr><th>Family</th><th>Hue</th><th>Sat min</th><th>Sat max</th><th>Tokens</th></tr></thead>
      <tbody>
        {Object.entries(recipe.families).map(([name, family]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>
              <input type="range" min={0} max={359.99} step={0.5} value={family.hue} onChange={(e) => update(name, { ...family, hue: Number(e.target.value) })} />
              <input type="number" min={0} max={359.99} step={0.5} value={family.hue} onChange={(e) => update(name, { ...family, hue: Number(e.target.value) })} />
            </td>
            {(["min", "max"] as const).map((bound) => (
              <td key={bound}>
                <input type="range" min={0} max={1} step={0.01} value={family.saturation[bound]}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    const saturation = { ...family.saturation, [bound]: value };
                    if (saturation.min > saturation.max) saturation[bound === "min" ? "max" : "min"] = value;
                    update(name, { ...family, saturation });
                  }} />
                <span className="num">{family.saturation[bound].toFixed(2)}</span>
              </td>
            ))}
            <td className="tokens">{(used.get(name) ?? []).join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The review app.
 *
 * @returns The app.
 */
export function App() {
  const [view, setView] = useState<View>("catalog");
  const [compare, setCompare] = useState<Compare>("proposed");
  const [algorithm, setAlgorithm] = useState<Algorithm>("wcag");
  const [terminalIndex, setTerminalIndex] = useState(0);
  const terminalTheme = TERMINAL_THEMES[terminalIndex];
  const [background, setBackground] = useState(terminalTheme.background);
  const [backgroundText, setBackgroundText] = useState(terminalTheme.background);
  const [hues, setHues] = useState<HueSource>("palette");
  const [paletteSaturation, setPaletteSaturation] = useState<PaletteSaturation>("anchored");
  const [recipe, setRecipe] = useState<ThemeRecipe>(BASE_RECIPE);
  const [advanced, setAdvanced] = useState(false);
  const [session, setSession] = useState<SessionState>(initialSession);

  // Generating runs the solver twice; defer so dragging sliders stays responsive.
  const deferredBackground = useDeferredValue(background);
  const deferredRecipe = useDeferredValue(recipe);
  const engine = useMemo(
    () => runEngine({ ...terminalTheme, background: deferredBackground }, algorithm, deferredRecipe, hues, paletteSaturation),
    [terminalTheme, deferredBackground, algorithm, deferredRecipe, hues, paletteSaturation],
  );

  const applyBackground = (value: string) => {
    setBackgroundText(value);
    if (HEX.test(value)) setBackground(value.toLowerCase());
  };
  /** Select a terminal theme: its background and palette. */
  const selectTerminal = (index: number) => {
    const next = (index + TERMINAL_THEMES.length) % TERMINAL_THEMES.length;
    setTerminalIndex(next);
    applyBackground(TERMINAL_THEMES[next].background);
  };

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
  const relaxation = "themes" in engine ? engine.themes.proposed.result?.relaxation : undefined;

  return (
    <div className="app">
      <header className="controls">
        <fieldset>
          <legend>View</legend>
          <label><input type="radio" checked={view === "catalog"} onChange={() => setView("catalog")} /> Catalog</label>
          <label><input type="radio" checked={view === "session"} onChange={() => setView("session")} /> Session</label>
        </fieldset>
        <fieldset>
          <legend>Terminal theme</legend>
          <button type="button" title="Previous theme" onClick={() => selectTerminal(terminalIndex - 1)}>◀</button>
          <select value={terminalIndex} onChange={(e) => selectTerminal(Number(e.target.value))}>
            {TERMINAL_THEMES.map((theme, index) => <option key={theme.name} value={index}>{theme.name}</option>)}
          </select>
          <button type="button" title="Next theme" onClick={() => selectTerminal(terminalIndex + 1)}>▶</button>
          <span className="swatches" title="ANSI colors 0-15">
            {terminalTheme.palette.map((color, index) => <span key={index} style={{ background: color }} title={`${index}: ${color}`} />)}
          </span>
        </fieldset>
        <fieldset>
          <legend>Terminal background</legend>
          <input type="color" value={background} onChange={(e) => applyBackground(e.target.value)} />
          <input type="text" size={8} value={backgroundText} onChange={(e) => applyBackground(e.target.value)} />
          <button type="button" onClick={() => applyBackground(terminalTheme.background)}>Reset</button>
          <button type="button" onClick={() => applyBackground(DEFAULT_BACKGROUND.light)}>Light</button>
          {"mode" in engine && engine.mode && <span className="mode">→ {engine.mode} theme (auto: higher perceptual contrast)</span>}
        </fieldset>
        <fieldset>
          <legend>Hues</legend>
          <label title="Pi's system theme: hue and saturation from the terminal's ANSI palette"><input type="radio" checked={hues === "palette"} onChange={() => setHues("palette")} /> Terminal palette</label>
          <label title="Pi's dark/light themes: hue and saturation from the recipe's color families"><input type="radio" checked={hues === "recipe"} onChange={() => setHues("recipe")} /> Recipe</label>
        </fieldset>
        {hues === "palette" && (
          <fieldset>
            <legend>Palette saturation</legend>
            <label title="The palette color's saturation at every lightness"><input type="radio" checked={paletteSaturation === "constant"} onChange={() => setPaletteSaturation("constant")} /> Constant</label>
            <label title="The palette color's saturation at its own lightness, falling off toward black and white along the recipe's bell curve"><input type="radio" checked={paletteSaturation === "anchored"} onChange={() => setPaletteSaturation("anchored")} /> Anchored bell</label>
          </fieldset>
        )}
        <fieldset>
          <legend>Contrast</legend>
          <label><input type="radio" checked={algorithm === "wcag"} onChange={() => setAlgorithm("wcag")} /> WCAG 2</label>
          <label><input type="radio" checked={algorithm === "perceptual"} onChange={() => setAlgorithm("perceptual")} /> Perceptual</label>
        </fieldset>
        <fieldset>
          <legend>Theme</legend>
          <label title="Pi's built-in dark/light theme, with today's token usage"><input type="radio" checked={compare === "pi"} onChange={() => setCompare("pi")} /> Pi current</label>
          <label title="Our generated theme with the proposed tokens and remappings"><input type="radio" checked={compare === "proposed"} onChange={() => setCompare("proposed")} /> Proposed</label>
          <label><input type="radio" checked={compare === "wipe"} onChange={() => setCompare("wipe")} /> Wipe</label>
        </fieldset>
        <button type="button" onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide advanced" : "Advanced"}</button>
        {view === "session" && (
          <span className="keys">
            Keys: shift+tab thinking · ctrl+o expand · ctrl+t thinking text · / commands · ctrl+l model · ctrl+f search · esc close · enter does nothing
          </span>
        )}
      </header>

      {advanced && (
        <div className="advanced">
          <p>
            Edit color families; themes regenerate live with the same solver as <code>npm run generate</code>.
            {" "}<button type="button" onClick={() => setRecipe(BASE_RECIPE)}>Reset families</button>
            {" "}<button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(recipe.families, null, 2))}>Copy families JSON</button>
          </p>
          <FamilyEditor recipe={recipe} onChange={setRecipe} />
        </div>
      )}

      {relaxation && (
        <div className="warning">
          This background cannot meet the contract: minimums relaxed by {relaxation} (0 = as written, 2 = lowest).
        </div>
      )}
      {"error" in engine && engine.error ? (
        <div className="warning">Generation failed: {engine.error}</div>
      ) : "themes" in engine ? (
        <main className="stage">
          {compare === "wipe" ? (
            <Wiper themes={engine.themes}>{content}</Wiper>
          ) : (
            <Terminal theme={engine.themes[compare]} target={TOKEN_USAGE[compare]}>{content}</Terminal>
          )}
        </main>
      ) : null}
    </div>
  );
}
