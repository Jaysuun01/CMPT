// The comparison table's figures. Pure functions over the validated dataset; the server already computed the stats.
import type { Series } from "./dataset";

/** How the volatility at the end month sits against the material's own 10 years up to it. */
export type Norm = "Above" | "Near" | "Below";

/** One material's figures for the comparison table: the two months, their change, and volatility. */
export interface Comparison {
  base: number | null;
  current: number | null;
  /** later ÷ base: multiply a base-month price by this to bring it to the later month. */
  factor: number | null;
  changePct: number | null;
  volatility: number | null;
  /** Current volatility against the material's own last 10 years (the 120 months up to and including `to`). */
  norm: Norm | null;
}

/** Compares a material between two month positions (`from`, `to`) for the results table. */
export function compare(s: Series, from: number, to: number): Comparison {
  const base = s.values[from] ?? null;
  const current = s.values[to] ?? null;
  const factor = base !== null && current !== null ? current / base : null;
  const volatility = s.volatility[to] ?? null;
  return { base, current, factor, changePct: factor === null ? null : (factor - 1) * 100, volatility, norm: norm(s.volatility, to) };
}

/** Above, near or below the material's usual volatility: its rank among the last 120 months, needing at least 24 of them. */
function norm(vol: readonly (number | null)[], to: number): Norm | null {
  const current = vol[to];
  if (current == null) return null;
  const window = vol.slice(Math.max(0, to - 119), to + 1).filter((v): v is number => v !== null);
  if (window.length < 24) return null;
  const share = window.filter((v) => v < current).length / window.length;
  return share >= 2 / 3 ? "Above" : share <= 1 / 3 ? "Below" : "Near";
}
