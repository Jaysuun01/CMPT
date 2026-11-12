// Metric definitions (CLAUDE.md §1). Each function returns an array aligned with its input.
// A result is null whenever any value it needs is missing; nothing is interpolated.
// Run these on the FULL series, then slice to a date range, so ranges get YoY/volatility from month one.

type Values = readonly (number | null)[];

/** Percent change from the previous month. */
export function monthOverMonth(values: Values): (number | null)[] {
  return values.map((v, i) => pctChange(values[i - 1], v));
}

/** Percent change from the same month a year earlier. */
export function yearOverYear(values: Values): (number | null)[] {
  return values.map((v, i) => pctChange(values[i - 12], v));
}

const WINDOW = 12;

/** Sample standard deviation (n−1) of the last 12 month-over-month changes. Not annualized. */
export function volatility(values: Values): (number | null)[] {
  const mom = monthOverMonth(values);
  return mom.map((_, i) => {
    if (i < WINDOW) return null;
    const w = mom.slice(i - WINDOW + 1, i + 1);
    if (w.some((x) => x === null)) return null;
    const xs = w as number[];
    const mean = xs.reduce((a, b) => a + b, 0) / WINDOW;
    return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (WINDOW - 1));
  });
}

/** Percent change from `before` to `after`; null when either is missing. */
function pctChange(before: number | null | undefined, after: number | null | undefined): number | null {
  if (before == null || after == null) return null;
  return (after / before - 1) * 100;
}
