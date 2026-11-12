// Figures for the month detail dialog, opened by clicking a chart.
import type { Dataset } from "./dataset";
import type { Calendar } from "./months";

/** One material's figures for one month, for the month detail dialog. */
export interface MaterialMonth {
  id: string;
  key: string;
  name: string;
  index: number | null;
  mom: number | null;
  yoy: number | null;
  volatility: number | null;
  /** e.g. "Largest monthly rise since June 2008", or null when the move is unremarkable. */
  note: string | null;
}

/** Only call out a move if nothing as large happened for at least this many months. */
const NOTABLE_GAP = 24;

/** Every material's figures for month position `i`, with a note when its move was the largest in a long while. */
export function monthDetail(ds: Dataset, cal: Calendar, i: number): MaterialMonth[] {
  return ds.series.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    index: s.values[i] ?? null,
    mom: s.mom[i] ?? null,
    yoy: s.yoy[i] ?? null,
    volatility: s.volatility[i] ?? null,
    note: notableMove(s.mom, i, cal),
  }));
}

/** Compare a month's change with every earlier month moving the same way. */
export function notableMove(mom: readonly (number | null)[], i: number, cal: Calendar): string | null {
  const v = mom[i];
  if (v == null || v === 0) return null;
  const word = v > 0 ? "rise" : "fall";
  for (let j = i - 1; j >= 0; j--) {
    const w = mom[j];
    if (w == null) continue;
    if (v > 0 ? w >= v : w <= v) {
      return i - j >= NOTABLE_GAP ? `Largest monthly ${word} since ${cal.label(j, true)}` : null;
    }
  }
  const first = mom.findIndex((x) => x != null);
  return i >= NOTABLE_GAP ? `Largest monthly ${word} in the data (since ${cal.label(first, true)})` : null;
}
