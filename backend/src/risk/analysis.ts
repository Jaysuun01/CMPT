// Similar-period analysis and buying-strategy comparison for one material.
// Formulas and every rule are in docs/ai-feature.md (appendix). Rates are fractions; volatility keeps
// the app's percentage-point units, which standardization makes irrelevant.
import { volatility } from "../stats.ts";

const THRESHOLD = 0.05;
const MAX_PERIODS = 20;
const SPACING = 6;
const MIN_CASES = 8;
const MAX_GAP = 24;
// Evidence cut-offs for the lean: how often the leaning strategy was the cheapest (docs/ai-feature.md, "Advice").
const STRONG = 0.85;
const MODERATE = 0.6;
const MIN_FOR_MODERATE = 15;

/** How many periods rose more than 5%, stayed within ±5%, or fell more than 5%. */
export type Group = { rose: number; within: number; fell: number };
/** The buying strategies compared: buy each phase as needed, buy all future phases now, or the first half now. */
export type StrategyId = "asNeeded" | "allNow" | "firstHalf";

/** One phase: d = months from today to its need date, share = fraction of the budget (shares sum to 1). */
export interface Phase {
  d: number;
  share: number;
}

/** Everything analyze() needs for one material; month numbers come from data/months.ts. */
export interface Input {
  values: readonly (number | null)[];
  /** Month number (see data/months.ts) of values[0]. */
  start: number;
  preliminary: number;
  /** Today's month number, from the server clock. */
  today: number;
  /** First month number allowed as a candidate, or null for the full history. */
  windowStart: number | null;
  /** Ordered by need date, then by the order entered. */
  phases: readonly Phase[];
  /** Carrying cost per month, as a fraction. */
  rate: number;
  /** Month number of the matched past event, if any. */
  eventMonth: number | null;
}

/** One strategy's extra cost across the similar periods, as fractions of the budget. */
export interface Strategy {
  id: StrategyId;
  /** Indexes into phases of the phases bought now. */
  boughtNow: number[];
  median: number;
  min: number;
  max: number;
}

/** Where prices went by one of the project's future need dates, `months` after today. */
export interface Outlook {
  months: number;
  /** Counts across the similar periods; null when there are too few. */
  similar: Group | null;
  all: Group;
  /** Lowest and highest move across the similar periods; null when there are too few. */
  low: number | null;
  high: number | null;
}

interface EventCase {
  month: number;
  /** Move from the event month to each outlook horizon, in the order of `outlook`; null = not enough data yet. */
  moves: (number | null)[];
  /** Extra cost per shown strategy; null = not enough data yet. */
  costs: Partial<Record<StrategyId, number | null>>;
  /** How many similar periods the event's buy-as-needed cost was strictly above; null when not comparable. */
  higherThan: number | null;
}

/** The analysis for one material, in month numbers and fractions; routes.ts shapes it for the client. */
export interface Analysis {
  status: "ok" | "tooFew" | "unmeasurable" | "stale";
  /** Latest final month (L) and the gap G from it to today. */
  asOf: number;
  gap: number;
  recent: { c3: number; c6: number; c12: number; vol: number } | null;
  candidates: { count: number; first: number; last: number } | null;
  /** Month numbers of the selected similar periods, closest first. */
  similar: number[];
  /** One entry per distinct future need date, soonest first. */
  outlook: Outlook[] | null;
  noTimingDecision: boolean;
  strategies: Strategy[] | null;
  /** `rates` holds each similar period's break-even rate, in the order of `similar`. */
  breakEven: { median: number; ahead: number; n: number; neverPaid: boolean; rates: number[] } | null;
  /** The shown strategy with the lowest median extra cost, and how often it was the cheapest; null without a timing decision. */
  lean: Lean | null;
  event: EventCase | null;
}

/** The history lean: the cheapest-on-median strategy and how often it was the cheapest, with code's evidence rating. */
export interface Lean {
  strategy: StrategyId;
  /** Similar periods in which this strategy cost no more than every other shown strategy. */
  cheapest: number;
  n: number;
  strength: "strong" | "moderate" | "weak";
}

/**
 * The lean: lowest median extra cost (ties go to the earlier strategy in display order), with how often it was
 * the cheapest in each period. `costs[i][p]` is strategy i's extra cost in period p.
 */
export function lean(strategies: readonly { id: StrategyId; median: number }[], costs: readonly (readonly number[])[]): Lean {
  let best = 0;
  strategies.forEach((st, i) => {
    if (round9(st.median) < round9((strategies[best] as { median: number }).median)) best = i;
  });
  const own = costs[best] as readonly number[];
  const n = own.length;
  const cheapest = own.filter((c, p) => costs.every((other) => round9(c) <= round9(other[p] as number))).length;
  const share = cheapest / n;
  const strength = n >= MIN_FOR_MODERATE && share >= STRONG ? "strong" : n >= MIN_FOR_MODERATE && share >= MODERATE ? "moderate" : "weak";
  return { strategy: (strategies[best] as { id: StrategyId }).id, cheapest, n, strength };
}

/** Rounds before comparing so an exact boundary isn't flipped by floating-point error (105/100 − 1 > 0.05). */
export const round9 = (x: number) => Math.round(x * 1e9) / 1e9;

/** The median; for an even count, the mean of the middle two. */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Which group a move falls in (more than +5%, within ±5%, below −5%), after rounding so exact boundaries don't flip. */
export function group(move: number): keyof Group {
  const m = round9(move);
  return m > THRESHOLD ? "rose" : m < -THRESHOLD ? "fell" : "within";
}

/** Tallies moves into rose / within / fell. */
function count(moves: readonly number[]): Group {
  const g = { rose: 0, within: 0, fell: 0 };
  for (const m of moves) g[group(m)]++;
  return g;
}

/** Which phases each strategy buys now, in display order, with duplicate sets removed. */
export function strategySets(phases: readonly Phase[]): { id: StrategyId; boughtNow: number[] }[] {
  const future = phases.map((p, j) => (p.d > 0 ? j : -1)).filter((j) => j >= 0);
  const half = Math.ceil(phases.length / 2);
  const all: { id: StrategyId; boughtNow: number[] }[] = [
    { id: "asNeeded", boughtNow: [] },
    { id: "allNow", boughtNow: future },
    { id: "firstHalf", boughtNow: future.filter((j) => j < half) },
  ];
  const seen = new Set<string>();
  return all.filter((s) => {
    const key = s.boughtNow.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Extra cost as a fraction of the budget, given each phase's price change g. */
export function extraCost(phases: readonly Phase[], boughtNow: readonly number[], g: readonly number[], rate: number): number {
  return phases.reduce((sum, p, j) => sum + p.share * (boughtNow.includes(j) ? rate * p.d : (g[j] as number)), 0);
}

/** Break-even carrying cost: the monthly rate at which buying all future phases now costs the same as buying as needed. */
export function breakEven(phases: readonly Phase[], g: readonly number[]): number {
  let num = 0;
  let den = 0;
  phases.forEach((p, j) => {
    if (p.d > 0) {
      num += p.share * (g[j] as number);
      den += p.share * p.d;
    }
  });
  return num / den;
}

/**
 * Candidates sorted by standardized Euclidean distance to `today`, ties to the earlier month.
 * Each measure is standardized with the candidates' mean and sample SD; a measure with no spread is left out.
 * Distances are rounded so equal distances tie exactly.
 */
export function rank(pool: readonly { s: number; x: readonly number[] }[], today: readonly number[]): number[] {
  const n = pool.length;
  const stats = today.map((_, k) => {
    const mean = pool.reduce((a, c) => a + (c.x[k] as number), 0) / n;
    const sd = Math.sqrt(pool.reduce((a, c) => a + ((c.x[k] as number) - mean) ** 2, 0) / (n - 1));
    return { mean, sd };
  });
  const z = (x: readonly number[]) => stats.flatMap(({ mean, sd }, k) => (sd > 0 ? [((x[k] as number) - mean) / sd] : []));
  const zt = z(today);
  return pool
    .map((c) => ({ s: c.s, dist: round9(Math.hypot(...z(c.x).map((zi, k) => zi - (zt[k] as number)))) }))
    .sort((a, b) => a.dist - b.dist || a.s - b.s)
    .map((c) => c.s);
}

/** Walk the ranking, keeping a month only if it's more than SPACING months from every month kept; stop at MAX_PERIODS. */
export function select(ranked: readonly number[]): number[] {
  const kept: number[] = [];
  for (const s of ranked) {
    if (kept.length === MAX_PERIODS) break;
    if (kept.every((k) => Math.abs(k - s) > SPACING)) kept.push(s);
  }
  return kept;
}

/** How many costs `own` is strictly above, after rounding. */
export function higherThan(own: number, costs: readonly number[]): number {
  return costs.filter((c) => round9(own) > round9(c)).length;
}

/** Median break-even rate, how often the user's rate came out ahead (strictly below it), and whether it mostly never paid. */
export function summarizeBreakEven(rates: readonly number[], rate: number) {
  const rs = rates.map(round9);
  // Both sides rounded: 0.7 / 100 is 0.006999999999999999, which would count a break-even of exactly 0.007 as ahead.
  const r0 = round9(rate);
  return {
    median: median(rs),
    ahead: rs.filter((r) => r0 < r).length,
    n: rs.length,
    neverPaid: rs.filter((r) => r <= 0).length > rs.length / 2,
    rates: rs,
  };
}

/**
 * The similar-period analysis for one material (docs/ai-feature.md, appendix): today's recent conditions, the closest
 * past periods, where prices went by each need date, the buying strategies' costs, the break-even rate and the lean,
 * plus the matched past event's own case. Pure code; no model is involved.
 */
export function analyze(input: Input): Analysis {
  const { values, phases, rate } = input;
  // "Buy first half now" depends on the order, so callers must sort by need date (stable for ties).
  if (phases.some((p, j) => j > 0 && p.d < (phases[j - 1] as Phase).d)) throw new Error("Phases must be ordered by need date");
  const L = values.length - 1 - input.preliminary;
  const asOf = input.start + L;
  const G = input.today - asOf;
  if (G < 0) throw new Error("Today is earlier than the latest final month");
  const D = Math.max(...phases.map((p) => p.d));
  const horizons = [...new Set(phases.map((p) => p.d).filter((d) => d > 0))];
  const vol = volatility(values);
  const at = (i: number) => (i >= 0 && i <= L ? (values[i] ?? null) : null);

  const measures = (m: number) => {
    const v = at(m);
    const lag = (k: number) => at(m - k);
    const [b3, b6, b12, s] = [lag(3), lag(6), lag(12), vol[m] ?? null];
    if (v === null || b3 === null || b6 === null || b12 === null || s === null) return null;
    return [v / b3 - 1, v / b6 - 1, v / b12 - 1, s];
  };

  const base: Analysis = {
    status: "ok",
    asOf,
    gap: G,
    recent: null,
    candidates: null,
    similar: [],
    outlook: null,
    noTimingDecision: phases.every((p) => p.d === 0),
    strategies: null,
    breakEven: null,
    lean: null,
    event: null,
  };
  if (G > MAX_GAP) return { ...base, status: "stale" };
  const today = measures(L);
  if (!today) return { ...base, status: "unmeasurable" };
  const [c3, c6, c12, v] = today as [number, number, number, number];
  base.recent = { c3, c6, c12, vol: v };

  // Candidates: all four measures defined, and every month from s through s + G + D final and present.
  const span = G + D;
  const first = Math.max(0, input.windowStart === null ? 0 : input.windowStart - input.start);
  const pool: { s: number; x: number[] }[] = [];
  for (let s = first; s + span <= L; s++) {
    const x = measures(s);
    if (!x) continue;
    let complete = true;
    for (let i = s; i <= s + span; i++) if (at(i) === null) complete = false;
    if (complete) pool.push({ s, x });
  }

  const sets = strategySets(phases);
  const path = (from: number) => phases.map((p) => (p.d === 0 ? 0 : (at(from + p.d) as number) / (at(from) as number) - 1));
  const move = (from: number, h: number) => ((at(from + h) as number) - (at(from) as number)) / (at(from) as number);
  if (pool.length > 0) base.candidates = { count: pool.length, first: input.start + (pool[0] as { s: number }).s, last: input.start + (pool.at(-1) as { s: number }).s };

  const selected = pool.length >= 2 ? select(rank(pool, today)) : [];
  base.similar = selected.map((s) => input.start + s);

  const tooFew = selected.length < MIN_CASES;
  let asNeededCosts: number[] = [];
  base.outlook = horizons.map((h) => {
    const similar = tooFew ? null : selected.map((s) => round9(move(s + G, h)));
    return {
      months: h,
      similar: similar && count(similar),
      all: count(pool.map((c) => move(c.s + G, h))),
      low: similar && Math.min(...similar),
      high: similar && Math.max(...similar),
    };
  });
  if (!tooFew) {
    const paths = selected.map((s) => path(s + G));
    const allCosts: number[][] = [];
    base.strategies = sets.map(({ id, boughtNow }) => {
      const costs = paths.map((g) => extraCost(phases, boughtNow, g, rate));
      if (id === "asNeeded") asNeededCosts = costs;
      allCosts.push(costs);
      return { id, boughtNow, median: median(costs), min: Math.min(...costs), max: Math.max(...costs) };
    });
    if (!base.noTimingDecision) {
      base.breakEven = summarizeBreakEven(paths.map((g) => breakEven(phases, g)), rate);
      base.lean = lean(base.strategies, allCosts);
    }
  }

  if (input.eventMonth !== null) {
    const e = input.eventMonth - input.start;
    const has = (i: number) => at(e) !== null && at(i) !== null;
    const eventMoves = horizons.map((h) => (has(e + h) ? round9(move(e, h)) : null));
    // A strategy only needs the index at the need dates of the phases it doesn't buy now.
    const costs = Object.fromEntries(
      sets.map(({ id, boughtNow }) => {
        const ok = phases.every((p, j) => boughtNow.includes(j) || has(e + p.d));
        const g = phases.map((p, j) => (boughtNow.includes(j) || p.d === 0 ? 0 : (at(e + p.d) as number) / (at(e) as number) - 1));
        return [id, ok ? extraCost(phases, boughtNow, g, rate) : null];
      }),
    );
    const own = costs.asNeeded ?? null;
    base.event = {
      month: input.eventMonth,
      moves: eventMoves,
      costs,
      higherThan: own === null || tooFew ? null : higherThan(own, asNeededCosts),
    };
  }

  return { ...base, status: tooFew ? "tooFew" : "ok" };
}
