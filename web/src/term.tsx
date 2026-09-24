// Terminal-like rendering primitives. Views name tokens, not colors, so the same
// tree renders against any palette (current vs extended, for the wiper).
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { Target } from "../../src/types.ts";
import type { Palette } from "./theme-engine.ts";

export interface TermContextValue {
  palette: Palette;
  target: Target;
}

export const TermContext = createContext<TermContextValue>({ palette: {}, target: "current" });

export const usePalette = (): Palette => useContext(TermContext).palette;
export const useTarget = (): Target => useContext(TermContext).target;

/**
 * Token Pi uses at a spot, per target. Most spots use one token; remapped and
 * proposed spots differ between current Pi and the extended branch.
 */
export type TokenRef = string | { current: string; extended: string };

export function useToken(ref: TokenRef): string {
  const target = useTarget();
  return typeof ref === "string" ? ref : ref[target];
}

interface StyleProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Swap foreground and background, like ANSI reverse video. */
  inverse?: boolean;
  bg?: TokenRef;
  children?: ReactNode;
  title?: string;
}

/** A styled run of text, like theme.fg(token, text). Token `terminalForeground` = Pi's "". */
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

/** A full-width block with a Pi background token, like Box(paddingX, paddingY, bg). */
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

/** A horizontal rule of box-drawing characters filling the width, like DynamicBorder. */
export function Rule({ t = "border", label }: { t?: TokenRef; label?: string }) {
  return (
    <div className="rule">
      <C t={t}>{label ? `── ${label} ` : ""}{"─".repeat(400)}</C>
    </div>
  );
}

/** Spacer(1). */
export const Gap = () => <div className="gap" />;

/** keyHint(): key then description. Current Pi: dim key, muted description; extended swaps them. */
export function KeyHint({ k, d }: { k: string; d: string }) {
  return (
    <>
      <C t={{ current: "dim", extended: "muted" }}>{k}</C>
      <C t={{ current: "muted", extended: "dim" }}> {d}</C>
    </>
  );
}

export function Line({ children, indent = 0 }: { children?: ReactNode; indent?: number }) {
  return <div className="line">{" ".repeat(indent)}{children}{children === undefined ? " " : null}</div>;
}
