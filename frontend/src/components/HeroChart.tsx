// The main comparison chart: all materials rebased to 100 at the range start, with drag-to-zoom, keyboard reading and undo.
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { buildChart } from "@/lib/chart";
import { useWidth } from "@/lib/useWidth";
import type { Range } from "@/lib/months";
import { HistoryButtons, type HistoryProps } from "./HistoryButtons";
import { Plot } from "./Plot";
import type { TrackerContext } from "./Tracker";

interface Props extends TrackerContext {
  from: number;
  to: number;
  selected: number | null;
  onSelect: (i: number) => void;
  onZoom: (r: Range) => void;
  history: HistoryProps;
}

/** Pointer movement below this many pixels is a click, not a drag (on "All", one month is under 1px). */
const DRAG_THRESHOLD_PX = 5;

/** "steel" -> "Steel": compact labels for the end of each line and the tooltip. */
const short = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/**
 * All materials rebased to 100 at the start month.
 * Hover or arrow keys read a month; click or Enter opens its details; drag across a period to zoom to it.
 */
export function HeroChart({ dataset, calendar, prelimStart, from, to, selected, onSelect, onZoom, history }: Props) {
  const n = to - from + 1;
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number; startX: number } | null>(null);
  const active = hover !== null && hover < n ? hover : null;
  const [plotRef, width] = useWidth<HTMLDivElement>(900);

  const { rebased, geometry } = useMemo(() => {
    const rebased = dataset.series.map((s) => {
      const base = s.values[from];
      return s.values.slice(from, to + 1).map((v) => (v == null || base == null ? null : (v / base) * 100));
    });
    return { rebased, geometry: buildChart(rebased, { calendar, start: from, prelimStart, yTickCount: 5, width }) };
  }, [dataset, calendar, prelimStart, from, to, width]);

  // End labels, nudged apart so they never overlap.
  const ends = dataset.series
    .map((s, k) => {
      const v = rebased[k]!.at(-1) ?? null;
      return { s, v, top: v === null ? 0 : geometry.y(v) };
    })
    .sort((a, b) => a.top - b.top);
  ends.forEach((e, k) => {
    const prev = ends[k - 1];
    if (prev && e.top - prev.top < 8) e.top = prev.top + 8;
  });

  // Positions are measured against the plot box itself, not the padded wrapper.
  const pointAt = (e: PointerEvent<HTMLDivElement>) => {
    const plot = e.currentTarget.querySelector(".plot")!.getBoundingClientRect();
    return geometry.indexAt((e.clientX - plot.left) / plot.width);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const i = pointAt(e);
    setDrag({ start: i, end: i, startX: e.clientX });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = pointAt(e);
    setHover(i);
    if (drag) setDrag({ ...drag, end: i });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag(null);
    const end = pointAt(e);
    const moved = Math.abs(e.clientX - drag.startX) >= DRAG_THRESHOLD_PX;
    if (moved && end !== drag.start) onZoom({ from: from + Math.min(drag.start, end), to: from + Math.max(drag.start, end) });
    else onSelect(from + drag.start);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(from + (active ?? n - 1));
      return;
    }
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)));
  };

  const readout =
    active === null
      ? null
      : `${calendar.label(from + active, true)}${from + active >= prelimStart ? ", preliminary" : ""}: ` +
        dataset.series.map((s, k) => `${short(s.key)} ${rebased[k]![active]?.toFixed(1) ?? "n/a"}`).join(", ");

  const brush = drag && drag.end !== drag.start ? [Math.min(drag.start, drag.end), Math.max(drag.start, drag.end)] : null;

  return (
    <section aria-labelledby="hero-h" className="section">
      <div className="hero-head">
        <div>
          <h2 id="hero-h">How they got there</h2>
          <p className="muted">
            Each index set to 100 in {calendar.label(from)}. Drag across the chart to zoom in, or click a month for details.
          </p>
        </div>
        <HistoryButtons {...history} />
      </div>
      <div
        className="hero-wrap"
        role="group"
        aria-label="Comparison chart. Left and right arrow keys read each month, Home and End jump to the ends, Enter shows that month in detail."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => !drag && setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        <Plot
          geometry={geometry}
          keys={dataset.series.map((s) => s.key)}
          tickLabel={String}
          className="hero"
          ref={plotRef}
          markerPos={selected !== null && selected >= from && selected <= to ? geometry.x(selected - from) : null}
          label={`Line chart of the three indexes set to 100 in ${calendar.label(from)}, through ${calendar.label(to)}.`}
        >
          {brush && (
            <div
              className="brush"
              style={{ left: `${geometry.x(brush[0]!)}%`, width: `${geometry.x(brush[1]!) - geometry.x(brush[0]!)}%` }}
              aria-hidden="true"
            >
              <span>
                {calendar.label(from + brush[0]!)} to {calendar.label(from + brush[1]!)}
              </span>
            </div>
          )}
          {ends.map((e) => (
            <div key={e.s.id} className="end" style={{ top: `${e.top}%` }} aria-hidden="true">
              <b>{e.v?.toFixed(1) ?? "n/a"}</b> {short(e.s.key)}
            </div>
          ))}
          {active !== null && !brush && (
            <>
              <div className="tipline" style={{ left: `${geometry.x(active)}%` }} aria-hidden="true" />
              <div
                className="tip"
                style={{ left: `${geometry.x(active)}%`, transform: geometry.x(active) > 60 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
                aria-hidden="true"
              >
                <div className="tip-h">
                  {calendar.label(from + active, true)}
                  {from + active >= prelimStart ? ", preliminary" : ""}
                </div>
                {dataset.series.map((s, k) => (
                  <div key={s.id} className="tip-r">
                    <span className={`sw sw-${s.key}`} />
                    <span>{short(s.key)}</span>
                    <b>{rebased[k]![active]?.toFixed(1) ?? "n/a"}</b>
                    <span className="muted">index {s.values[from + active]?.toFixed(1) ?? "n/a"}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Plot>
      </div>
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </section>
  );
}
