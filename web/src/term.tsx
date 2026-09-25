/**
 * Terminal-like rendering primitives. Views name tokens, not colors, so the same tree
 * renders against any palette (Pi's theme or the proposal, for the wiper).
 *
 * @module
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { Target } from "../../src/types.ts";
import type { Palette } from "./theme-engine.ts";

/** What terminal primitives render against. */
export interface TermContextValue {
  /** Hex colors by token. */
  palette: Palette;
  /** Whose token usage to render: today's Pi or the proposal. */
  target: Target;
}

/** Provides the palette and target to every primitive below it. */
export const TermContext = createContext<TermContextValue>({ palette: {}, target: "current" });

/**
 * Read the current palette.
 *
 * @returns Hex colors by token.
 */
export const usePalette = (): Palette => useContext(TermContext).palette;

/**
 * Read the current target.
 *
 * @returns Whether views use today's or the proposed token usage.
 */
export const useTarget = (): Target => useContext(TermContext).target;

/**
 * The token Pi uses at a spot, per target. Most spots use one token; remapped and
 * proposed spots differ between current Pi and the extended branch.
 */
export type TokenRef = string | { current: string; extended: string };

/**
 * Resolve a token reference for the current target.
 *
 * @param ref - A token, or one token per target.
 * @returns The token name.
 */
export function useToken(ref: TokenRef): string {
  const target = useTarget();
  return typeof ref === "string" ? ref : ref[target];
}

/** Text styling, like Pi's theme helpers. */
interface StyleProps {
  /** Bold text. */
  bold?: boolean;
  /** Italic text. */
  italic?: boolean;
  /** Underlined text. */
  underline?: boolean;
  /** Struck-through text. */
  strike?: boolean;
  /** Swap foreground and background, like ANSI reverse video. */
  inverse?: boolean;
  /** Background token; defaults to the surface below. */
  bg?: TokenRef;
  /** The text. */
  children?: ReactNode;
  /** Tooltip; defaults to the foreground token. */
  title?: string;
}

/**
 * A styled run of text, like `theme.fg(token, text)`.
 *
 * @param props - The foreground token `t` (`terminalForeground` is Pi's "" terminal default), an optional background token, and text styles.
 * @returns The styled text.
 */
export function C({ t = "terminalForeground", bold, italic, underline, strike, inverse, bg, children, title }: StyleProps & { t?: TokenRef }) {
  const palette = usePalette();
  const fgToken = useToken(t);
  const bgToken = useToken(bg ?? "background");
  let color = palette[fgToken];
  let background = bg ? palette[bgToken] : undefined;
  if (inverse) {
    // Reverse video swaps the rendered colors; with no explicit bg, that is the surface below.
    const surface = background ?? "var(--surface)";
    background = color;
    color = surface;
  }
  const style: CSSProperties = {
    color,
    background,
    fontWeight: bold ? 700 : undefined,
    fontStyle: italic ? "italic" : undefined,
    textDecoration: [underline && "underline", strike && "line-through"].filter(Boolean).join(" ") || undefined,
  };
  return <span style={style} data-token={fgToken} title={title ?? fgToken}>{children}</span>;
}

/**
 * A full-width block with a background token, like Pi's `Box(paddingX, paddingY, bg)`.
 *
 * @param props - The background token, padding in cells, top margin in rows, and content.
 * @returns The panel.
 */
export function Panel({ bg, padX = 1, padY = 1, children, marginTop = 1 }: { bg: TokenRef; padX?: number; padY?: number; children: ReactNode; marginTop?: number }) {
  const palette = usePalette();
  const token = useToken(bg);
  const style = {
    background: palette[token],
    padding: `calc(var(--lh) * ${padY}) ${padX}ch`,
    marginTop: `calc(var(--lh) * ${marginTop})`,
    "--surface": palette[token],
  } as CSSProperties;
  return <div className="panel" style={style} data-token={token} title={token}>{children}</div>;
}

/**
 * A full-width horizontal rule of box-drawing characters, like Pi's `DynamicBorder`.
 *
 * @param props - The line token and an optional label.
 * @returns The rule.
 */
export function Rule({ t = "border", label }: { t?: TokenRef; label?: string }) {
  return (
    <div className="rule">
      <C t={t}>{label ? `── ${label} ` : ""}{"─".repeat(400)}</C>
    </div>
  );
}

/**
 * An empty row, like Pi's `Spacer(1)`.
 *
 * @returns The spacer.
 */
export const Gap = () => <div className="gap" />;

/**
 * A key hint, like Pi's `keyHint()`. Current Pi: dim key, muted description; the proposal swaps them.
 *
 * @param props - The key `k` and description `d`.
 * @returns The hint.
 */
export function KeyHint({ k, d }: { k: string; d: string }) {
  return (
    <>
      <C t={{ current: "dim", extended: "muted" }}>{k}</C>
      <C t={{ current: "muted", extended: "dim" }}> {d}</C>
    </>
  );
}

/**
 * One terminal row.
 *
 * @param props - Content, and indentation in cells.
 * @returns The row; empty rows keep their height.
 */
export function Line({ children, indent = 0 }: { children?: ReactNode; indent?: number }) {
  return <div className="line">{" ".repeat(indent)}{children}{children === undefined ? " " : null}</div>;
}
