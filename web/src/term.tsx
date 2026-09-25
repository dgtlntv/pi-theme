/**
 * Terminal-like rendering primitives. Views name tokens, not colors, so the same tree
 * renders against any generated theme.
 *
 * @module
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { Palette } from "./theme-engine.ts";

/** What terminal primitives render against. */
export interface TermContextValue {
  /** Hex colors by token. */
  palette: Palette;
}

/** Provides the palette to every primitive below it. */
export const TermContext = createContext<TermContextValue>({ palette: {} });

/**
 * Read the current palette.
 *
 * @returns Hex colors by token.
 */
export const usePalette = (): Palette => useContext(TermContext).palette;

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
  bg?: string;
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
export function C({ t = "terminalForeground", bold, italic, underline, strike, inverse, bg, children, title }: StyleProps & { t?: string }) {
  const palette = usePalette();
  const fgToken = t;
  const bgToken = bg ?? "background";
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
export function Panel({ bg, padX = 1, padY = 1, children, marginTop = 1 }: { bg: string; padX?: number; padY?: number; children: ReactNode; marginTop?: number }) {
  const palette = usePalette();
  const token = bg;
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
export function Rule({ t = "border", label }: { t?: string; label?: string }) {
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
 * A key hint, like Pi's `keyHint()`: muted key, dim description.
 *
 * @param props - The key `k` and description `d`.
 * @returns The hint.
 */
export function KeyHint({ k, d }: { k: string; d: string }) {
  return (
    <>
      <C t="muted">{k}</C>
      <C t="dim"> {d}</C>
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
