/**
 * A terminal viewport: scrolls in whole rows and draws Pi's fullscreen scrollbar
 * (layout.ts: "│" track, "┃" thumb, "█" thumb while scrolling) instead of the browser's.
 *
 * @module
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePalette } from "./term.tsx";

/** How long the thumb stays in its scrolling style after the last scroll, in milliseconds. */
const ACTIVE_MS = 1000;

/**
 * A scrollbar column of terminal cells, drawn with CSS so rows join without glyph gaps.
 *
 * @param props - Height in rows, thumb position and height in rows, whether scrolling is active, and a pointer handler for dragging.
 * @returns The scrollbar.
 */
export function ScrollbarCells({ rows, thumbTop, thumbHeight, active, onPointer }: {
  /** Height in rows. */
  rows: number;
  /** First thumb row. */
  thumbTop: number;
  /** Thumb height in rows. */
  thumbHeight: number;
  /** Whether scrolling is active, which draws the thumb as full blocks. */
  active?: boolean;
  /** Pointer handler for dragging. */
  onPointer?: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const palette = usePalette();
  return (
    <div className="scrollbar-cells" onPointerDown={onPointer} onPointerMove={onPointer}>
      {Array.from({ length: rows }, (_, row) => {
        const thumb = row >= thumbTop && row < thumbTop + thumbHeight;
        const className = thumb ? (active ? "sb-cell sb-block" : "sb-cell sb-heavy") : "sb-cell sb-light";
        const token = thumb ? "scrollbarThumb" : "scrollbarTrack";
        return <div key={row} className={className} style={{ color: palette[token] }} data-token={token} title={token} />;
      })}
    </div>
  );
}

/** Scroll position and sizes in pixels, and the row height. */
interface Metrics {
  /** Scroll offset. */
  top: number;
  /** Viewport height. */
  view: number;
  /** Content height. */
  content: number;
  /** Row height. */
  row: number;
}

/**
 * A scrollable terminal viewport with Pi's scrollbar.
 *
 * @param props - Content; `startAtEnd` to start at and follow the end, like Pi's follow-end; and a `jumpToLatest` element shown when scrolled up.
 * @returns The viewport.
 */
export function TermScroll({ children, startAtEnd, jumpToLatest }: {
  /** Viewport content. */
  children: ReactNode;
  /** Start at, and keep following, the end while the user is there (Pi's follow-end). */
  startAtEnd?: boolean;
  /** Shown over the bottom when scrolled up from the end. */
  jumpToLatest?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics>({ top: 0, view: 0, content: 0, row: 17 });
  const [active, setActive] = useState(false);
  const following = useRef(Boolean(startAtEnd));
  const idle = useRef<number | undefined>(undefined);

  const rowHeight = (el: HTMLElement) => parseFloat(getComputedStyle(el).getPropertyValue("--lh")) || 17;
  const measure = () => {
    const el = scroller.current;
    if (el) setMetrics({ top: el.scrollTop, view: el.clientHeight, content: el.scrollHeight, row: rowHeight(el) });
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (startAtEnd) el.scrollTop = el.scrollHeight;
    measure();
    const resize = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
      measure();
    });
    resize.observe(el);
    if (el.firstElementChild) resize.observe(el.firstElementChild);
    return () => resize.disconnect();
  }, [startAtEnd]);

  // Wheel scrolls whole rows, like a terminal; trackpad deltas accumulate.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const row = rowHeight(el);
      pending += event.deltaMode === 1 ? event.deltaY * row : event.deltaY;
      const rows = Math.trunc(pending / row);
      if (rows) {
        el.scrollTop = Math.round((el.scrollTop + rows * row) / row) * row;
        pending -= rows * row;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    following.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    measure();
    setActive(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setActive(false), ACTIVE_MS);
  };

  // Thumb geometry in rows, as in layout.ts.
  const rows = Math.max(1, Math.floor(metrics.view / metrics.row));
  const contentRows = metrics.content / metrics.row;
  const thumbHeight = contentRows <= rows ? rows : Math.max(Math.min(2, rows), Math.min(rows, Math.round((rows * rows) / contentRows)));
  const maxScroll = Math.max(0, metrics.content - metrics.view);
  const thumbTop = maxScroll > 0 ? Math.round((metrics.top / maxScroll) * (rows - thumbHeight)) : 0;
  const atEnd = metrics.top >= maxScroll - 2;

  const dragThumb = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el) return;
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    el.scrollTop = Math.round((fraction * maxScroll) / metrics.row) * metrics.row;
  };

  return (
    <div className="term-scroll-frame">
      <div className="term-scroll" ref={scroller} onScroll={onScroll}>
        <div className="term-scroll-content">{children}</div>
      </div>
      <ScrollbarCells rows={rows} thumbTop={thumbTop} thumbHeight={thumbHeight} active={active} onPointer={dragThumb} />
      {jumpToLatest && !atEnd && (
        <div className="jump-to-latest" onClick={() => {
          const el = scroller.current;
          if (el) el.scrollTop = el.scrollHeight;
        }}>{jumpToLatest}</div>
      )}
    </div>
  );
}
