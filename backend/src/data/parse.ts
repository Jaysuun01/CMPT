// The FRED CSV parser and its cleaning rules. Pure: text in, a gap-free monthly series out, or a clear error.
import { monthFromNumber, monthNumber } from "./months.ts";

/** One monthly series with no gaps in the month sequence. Missing observations are null. */
export interface MonthlySeries {
  start: string; // "YYYY-MM" of values[0]
  values: (number | null)[];
}

const DATE = /^(\d{4}-(?:0[1-9]|1[0-2]))-01$/;
const NUMBER = /^\d+(\.\d+)?$/;

/**
 * Parse and clean a FRED CSV download (`observation_date,<SERIES_ID>`).
 *
 * Cleaning rules:
 * - BOM, CRLF line endings, surrounding whitespace and blank lines are ignored.
 * - The header must name the expected series, so the wrong file can't be loaded silently.
 * - FRED's "." (and an empty cell) means "no observation" and becomes null.
 * - Rows may arrive in any order; they are sorted by month.
 * - Months missing from the file are filled with null. Values are never interpolated.
 * - Anything else (bad date, non-numeric or non-positive value, duplicate month,
 *   wrong column count) is rejected with the line number, rather than guessed at.
 */
export function parseFredCsv(text: string, seriesId: string): MonthlySeries {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip a byte-order mark
  const lines = body.split(/\r?\n/);
  const header = lines[0]?.trim();
  if (header !== `observation_date,${seriesId}`) {
    throw new Error(`${seriesId}: expected header "observation_date,${seriesId}", got "${header ?? ""}"`);
  }

  const byMonth = new Map<number, number | null>();
  lines.slice(1).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "") return;
    const where = `${seriesId} line ${i + 2}`;
    const cells = line.split(",");
    if (cells.length !== 2) throw new Error(`${where}: expected 2 columns, got ${cells.length}`);
    const [dateCell = "", valueCell = ""] = cells.map((c) => c.trim());

    const date = DATE.exec(dateCell);
    if (!date?.[1]) throw new Error(`${where}: invalid date "${dateCell}"`);
    const month = monthNumber(date[1]);
    if (byMonth.has(month)) throw new Error(`${where}: duplicate month ${date[1]}`);

    let value: number | null = null;
    if (valueCell !== "." && valueCell !== "") {
      if (!NUMBER.test(valueCell) || Number(valueCell) <= 0) {
        throw new Error(`${where}: invalid value "${valueCell}"`);
      }
      value = Number(valueCell);
    }
    byMonth.set(month, value);
  });

  if (byMonth.size === 0) return { start: "", values: [] };

  const first = Math.min(...byMonth.keys());
  const last = Math.max(...byMonth.keys());
  const values: (number | null)[] = [];
  for (let m = first; m <= last; m++) values.push(byMonth.get(m) ?? null);
  return { start: monthFromNumber(first), values };
}
