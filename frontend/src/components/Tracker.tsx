"use client";
// The price page: one date range drives the comparison chart, the results table and every small chart,
// and is kept in the URL so a link reopens the same view.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { compare } from "@/lib/compare";
import type { Dataset, Measure } from "@/lib/dataset";
import { Calendar, type Range } from "@/lib/months";
import { HeroChart } from "./HeroChart";
import { LatestMonth } from "./LatestMonth";
import { ChartDetail } from "./ChartDetail";
import { MEASURES, MetricGrid } from "./MetricGrid";
import { MonthDetail } from "./MonthDetail";
import { RangePicker } from "./RangePicker";
import { ResultsTable } from "./ResultsTable";
import { SiteHeader } from "./SiteHeader";
import { SourceNotes } from "./SourceNotes";
import { StickyRange } from "./StickyRange";

const HISTORY_EVENT = "cmpt:history";

/** Re-read the depth on Back/Forward and after our own pushState (which fires no event of its own). */
function subscribeHistory(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(HISTORY_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(HISTORY_EVENT, onChange);
  };
}

/** How many range changes this tab has made on top of the page it was opened at. */
function undoDepth(): number {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "cmptDepth" in state && typeof state.cmptDepth === "number" ? state.cmptDepth : 0;
}

/** The price page's state: the range (with undo/redo and the URL), the selected month and any open dialog. */
export function Tracker({ dataset, initial }: { dataset: Dataset; initial: Range }) {
  const calendar = useMemo(() => new Calendar(dataset.start, dataset.series[0]!.values.length), [dataset]);
  const prelimStart = calendar.length - dataset.preliminaryMonths;
  const [range, setRange] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // The month picked on a chart: marked on every chart, and shown in the detail dialog while it's open.
  const [selected, setSelected] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // The grid chart opened full size, if any.
  const [expanded, setExpanded] = useState<{ series: string; measure: Measure; month: number } | null>(null);
  // Undo/Redo walk the same browser history as Back/Forward, so they never disagree.
  // depth = range changes this tab has stacked on the page as opened (read from history.state);
  // maxDepth = how far Redo can go (unknown after a reload, so Redo starts unavailable).
  const depth = useSyncExternalStore(subscribeHistory, undoDepth, () => 0);
  const [maxDepth, setMaxDepth] = useState(0);
  // Pin a slim range bar once the full controls have scrolled up out of view.
  const compareRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = compareRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setPinned(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The range lives in the URL (?from=YYYY-MM&to=YYYY-MM) so links and the back button work.
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      setRange(calendar.rangeFromParams({ from: p.get("from") ?? undefined, to: p.get("to") ?? undefined }));
      setError(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [calendar]);

  // Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z or Ctrl+Y redoes. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable='true']")) return;
      const key = e.key.toLowerCase();
      const redo = (key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey);
      const undo = key === "z" && !e.shiftKey;
      if (undo && depth > 0) {
        e.preventDefault();
        window.history.back();
      } else if (redo && depth < maxDepth) {
        e.preventDefault();
        window.history.forward();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depth, maxDepth]);

  function apply(next: Range) {
    if (next.from === range.from && next.to === range.to) return;
    const nextDepth = undoDepth() + 1;
    setRange(next);
    window.history.pushState({ cmptDepth: nextDepth }, "", `?from=${calendar.key(next.from)}&to=${calendar.key(next.to)}`);
    window.dispatchEvent(new Event(HISTORY_EVENT));
    setMaxDepth(nextDepth); // a new change discards anything that could have been redone
  }

  function choose(next: Range) {
    const problem = calendar.rangeError(next.from, next.to);
    setError(problem);
    if (!problem) apply(next);
  }

  const def = calendar.defaultRange;
  const isDefault = range.from === def.from && range.to === def.to && selected === null && !error;

  /** Back to how the page opens: the last 5 years, no month picked. Undo can reverse it like any change. */
  function reset() {
    setError(null);
    setSelected(null);
    setDetailOpen(false);
    setExpanded(null);
    apply(def);
  }

  function select(i: number) {
    setSelected(i);
    setDetailOpen(true);
  }

  const { from, to } = range;
  const rows = useMemo(() => dataset.series.map((s) => compare(s, from, to)), [dataset, from, to]);
  const ctx = { dataset, calendar, prelimStart };

  return (
    <>
      <SiteHeader current="/">
        <span className="muted">Data through {calendar.label(calendar.latest, true)}</span>
      </SiteHeader>
      <main className="wrap">
        <LatestMonth {...ctx} />
        <section aria-labelledby="compare-h" className="section">
          <h2 id="compare-h">Compare two months</h2>
          <div ref={compareRef}>
            <RangePicker calendar={calendar} range={range} error={error} onChoose={choose} onReset={reset} isDefault={isDefault} />
          </div>
          <p className="sr-only" role="status">
            Showing {calendar.label(from)} to {calendar.label(to)}.
          </p>
          <ResultsTable {...ctx} from={from} to={to} rows={rows} />
        </section>
        <HeroChart
          {...ctx}
          from={from}
          to={to}
          selected={selected}
          onSelect={select}
          onZoom={choose}
          history={{
            canUndo: depth > 0,
            canRedo: depth < maxDepth,
            onUndo: () => window.history.back(),
            onRedo: () => window.history.forward(),
          }}
        />
        <MetricGrid
          {...ctx}
          from={from}
          to={to}
          selected={selected}
          onExpand={(series, measure, month) => setExpanded({ series, measure, month })}
        />
        <section aria-labelledby="plan-h" className="section plan-link">
          <h2 id="plan-h">Planning a purchase?</h2>
          <p>
            Describe a project to see whether buying materials now, or as each phase needs them, would have paid off in similar past periods.{" "}
            <Link href="/plan">Plan a purchase</Link>
          </p>
        </section>
        <SourceNotes dataset={dataset} />
      </main>
      {pinned && <StickyRange calendar={calendar} range={range} error={error} onChoose={choose} onReset={reset} isDefault={isDefault} />}
      {expanded && (
        <ChartDetail
          {...ctx}
          series={dataset.series.find((s) => s.key === expanded.series)!}
          measure={MEASURES.find((m) => m.key === expanded.measure)!}
          from={from}
          to={to}
          initialMonth={expanded.month}
          onClose={() => setExpanded(null)}
        />
      )}
      {detailOpen && selected !== null && (
        <MonthDetail
          {...ctx}
          month={selected}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

/** What every price-page component needs: the data, its calendar, and where the preliminary months begin. */
export interface TrackerContext {
  dataset: Dataset;
  calendar: Calendar;
  prelimStart: number;
}
