// Pure chart geometry. Positions are percentages (0–100) of the plot box;
// SVG paths use a 1000×100 viewBox stretched to the box (non-scaling strokes keep lines 2px).
import type { Calendar } from "./months";

/** About `count` evenly spaced, round-numbered y-axis ticks covering lo to hi. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo || Math.abs(hi) || 1) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  for (let t = first; t <= last + step / 2; t += step) out.push(Math.round(t * 1e6) / 1e6);
  if (out.length === 1) out.push(Math.round((out[0]! + step) * 1e6) / 1e6);
  return out;
}

/** One bar's box, in percent of the plot area. */
export interface Bar {
  left: number;
  width: number;
  top: number;
  height: number;
}

/** Everything a chart draws, in plot coordinates: paths, bars, ticks, the preliminary shading and hit-testing. */
export interface ChartGeometry {
  paths: string[];
  bars: Bar[];
  yTicks: { pos: number; value: number }[];
  xTicks: { pos: number; label: string }[];
  /** Left edge of the preliminary-months shading, or null if none are in view. */
  prelimPos: number | null;
  x: (i: number) => number;
  y: (v: number) => number;
  /** Nearest point for a horizontal position given as a 0–1 fraction of the plot width. */
  indexAt: (fraction: number) => number;
}

/** How to lay a chart out: which months, bars or lines, the y-domain, and the width for label spacing. */
export interface ChartOptions {
  calendar: Calendar;
  /** Absolute index of the first point. */
  start: number;
  /** Absolute index of the first preliminary month. */
  prelimStart: number;
  bar?: boolean;
  /** Always include zero on the y-axis. */
  zero?: boolean;
  /** Shared y-domain, so several charts compare on one scale. */
  domain?: [number, number];
  yTickCount?: number;
  /** Plot width in px, used to space the date labels so they never collide. */
  width?: number;
}

/** Min and max of the non-null values across several arrays. */
export function extent(arrays: readonly (readonly (number | null)[])[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of arrays) {
    for (const v of a) {
      if (v === null) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/** Lays out one chart: a nice y-scale, one SVG path per series (broken at missing months), bars, and spaced date ticks. */
export function buildChart(sets: readonly (readonly (number | null)[])[], o: ChartOptions): ChartGeometry {
  const n = sets[0]?.length ?? 0;
  let [lo, hi] = o.domain ?? extent(sets);
  if (o.zero) [lo, hi] = [Math.min(lo, 0), Math.max(hi, 0)];
  const ticks = niceTicks(lo, hi, o.yTickCount ?? 4);
  const tlo = ticks[0]!;
  const thi = ticks.at(-1)!;

  const x = (i: number) => (o.bar ? ((i + 0.5) / n) * 100 : n > 1 ? (i / (n - 1)) * 100 : 50);
  const y = (v: number) => (1 - (v - tlo) / (thi - tlo)) * 100;

  const paths = o.bar
    ? []
    : sets.map((vals) => {
        let d = "";
        let pen = false;
        vals.forEach((v, i) => {
          if (v === null) return void (pen = false);
          d += `${pen ? "L" : "M"}${(x(i) * 10).toFixed(1)} ${y(v).toFixed(2)} `;
          pen = true;
        });
        return d.trim();
      });

  const bars: Bar[] = [];
  if (o.bar) {
    const w = (100 / n) * 0.62;
    const z = y(0);
    sets[0]?.forEach((v, i) => {
      if (v === null) return;
      const t = y(v);
      bars.push({ left: x(i) - w / 2, width: w, top: Math.min(t, z), height: Math.max(Math.abs(t - z), 0.5) });
    });
  }

  const firstPrelim = o.prelimStart - o.start;
  const prelimPos = firstPrelim >= n ? null : Math.max(0, o.bar ? x(firstPrelim) - 50 / n : x(firstPrelim - 0.5));

  const indexAt = (f: number) => Math.max(0, Math.min(n - 1, o.bar ? Math.floor(f * n) : Math.round(f * (n - 1))));

  return { paths, bars, yTicks: ticks.map((value) => ({ pos: y(value), value })), xTicks: xTicks(n, o, x), prelimPos, x, y, indexAt };
}

const MONTH_STEPS = [1, 2, 3, 6];
const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50];
/** Minimum gap between label centres, in px: enough for "Oct" next to "Jan 2026" at 12px. */
const MONTH_GAP_PX = 58;
const YEAR_GAP_PX = 48;
const FULL_PAIR_GAP_PX = 76;
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Date labels spaced to the chart's real width. Up to 48 months: every month when there's room, otherwise every
 * 2nd/3rd/6th month, with the year on the first label and on Januaries ("Oct 2025, Nov, Dec, Jan 2026"), and on both
 * labels when only two fit. Longer ranges: as many years as fit.
 */
function xTicks(n: number, o: ChartOptions, x: (i: number) => number) {
  const cal = o.calendar;
  const width = o.width ?? 600;
  const slots = o.bar ? n : Math.max(n - 1, 1);
  const gapFor = (months: number) => (width * months) / slots;

  const step = MONTH_STEPS.find((s) => gapFor(s) >= MONTH_GAP_PX);
  if (step !== undefined && n <= 48) {
    let picks = [...Array(n).keys()].filter((i) => cal.month(o.start + i) % step === 0);
    if (picks.length < 2) picks = n > 1 ? [0, n - 1] : [0];
    // Two full labels ("Dec 2025", "Jan 2026") side by side need more room than a full + short pair.
    const fullGap = (a: number, b: number) => ((x(b) - x(a)) / 100) * width >= FULL_PAIR_GAP_PX;
    if (picks.length > 2 && cal.month(o.start + picks[1]!) === 0 && !fullGap(picks[0]!, picks[1]!)) picks = picks.slice(1);
    // The year goes on the first label (so the start is never ambiguous) and on every January.
    return picks.map((i, k) => {
      const m = cal.month(o.start + i);
      return { pos: x(i), label: k === 0 || m === 0 || picks.length === 2 ? cal.label(o.start + i) : SHORT[m]! };
    });
  }

  const januaries = [...Array(n).keys()].filter((i) => cal.month(o.start + i) === 0);
  const years = YEAR_STEPS.find((s) => gapFor(12 * s) >= YEAR_GAP_PX) ?? 50;
  return januaries
    .filter((i) => cal.year(o.start + i) % years === 0)
    .map((i) => ({ pos: x(i), label: String(cal.year(o.start + i)) }));
}
