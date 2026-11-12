// Months are handled as "YYYY-MM" strings and integer offsets, never Date objects,
// so there is no timezone or locale drift.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" → a month count (year × 12 + month index), so month arithmetic is plain integer maths. Throws on a bad month. */
export function monthNumber(month: string): number {
  const m = MONTH.exec(month);
  if (!m) throw new Error(`Invalid month "${month}"`);
  return Number(m[1]) * 12 + Number(m[2]) - 1;
}

/** The inverse of monthNumber: a month count back to "YYYY-MM". */
export function monthFromNumber(n: number): string {
  const year = Math.floor(n / 12);
  const month = (n % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}
