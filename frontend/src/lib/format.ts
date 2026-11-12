// Number formatting shared by the charts and tables. One minus sign (−) and one n/a style everywhere.
const MINUS = "−";

const sign = (x: number) => (x > 0 ? "+" : x < 0 ? MINUS : "");

/** +1.5%, −5.5%, 0.0% */
export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null) return "n/a";
  const rounded = Number(x.toFixed(digits));
  return `${sign(rounded)}${Math.abs(rounded).toFixed(digits)}%`;
}

/** ±1.84% for volatility (a typical monthly move in either direction). */
export function swing(x: number | null | undefined): string {
  return x == null ? "n/a" : `±${x.toFixed(2)}%`;
}

/** An index level to one decimal, or n/a. Never shown as dollars: these are indexes, 1982 = 100. */
export function index(x: number | null | undefined): string {
  return x == null ? "n/a" : x.toFixed(1);
}

/** Axis tick labels: whole numbers, signed for percent axes. */
export function axisPct(t: number): string {
  return `${sign(t)}${Math.abs(t)}%`;
}
