// Loads the FRED CSVs listed in data/sources.json, checks they share one month axis, and computes the stats.
// Runs once at startup; a malformed file stops the server rather than serving wrong numbers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { monthOverMonth, volatility, yearOverYear } from "../stats.ts";
import { monthFromNumber, monthNumber } from "./months.ts";
import { parseFredCsv } from "./parse.ts";

const Sources = z.strictObject({
  retrievedOn: z.iso.date(),
  preliminaryMonths: z.int().min(0).max(12),
  series: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[A-Z0-9]+$/),
        key: z.string().regex(/^[a-z]+$/),
        name: z.string().min(1),
        title: z.string().min(1),
        file: z.string().regex(/^[A-Za-z0-9_-]+\.csv$/),
      }),
    )
    .min(1)
    .refine((list) => new Set(list.map((s) => s.id)).size === list.length && new Set(list.map((s) => s.key)).size === list.length, {
      message: "Series ids and keys must be unique",
    }),
});

/** The cleaned data the API serves: every series lined up on one month axis, with its stats precomputed. */
export interface Dataset {
  start: string; // first month, "YYYY-MM"
  end: string; // latest month, "YYYY-MM"
  retrievedOn: string;
  preliminaryMonths: number;
  series: {
    id: string;
    key: string;
    name: string;
    title: string;
    values: (number | null)[];
    mom: (number | null)[];
    yoy: (number | null)[];
    volatility: (number | null)[];
  }[];
}

const round = (xs: (number | null)[]) => xs.map((x) => (x === null ? null : Math.round(x * 1e6) / 1e6));

/**
 * Load every series listed in sources.json, compute stats on each full series,
 * then trim everything to the months all series cover (so trimming never costs a series its YoY/volatility history).
 */
export function loadDataset(dataDir: string): Dataset {
  const sources = Sources.parse(JSON.parse(readFileSync(join(dataDir, "sources.json"), "utf8")));
  const parsed = sources.series.map((s) => ({ ...s, ...parseFredCsv(readFileSync(join(dataDir, s.file), "utf8"), s.id) }));

  const empty = parsed.find((p) => p.values.length === 0);
  if (empty) throw new Error(`${empty.id}: no observations`);

  const first = Math.max(...parsed.map((p) => monthNumber(p.start)));
  const last = Math.min(...parsed.map((p) => monthNumber(p.start) + p.values.length - 1));
  if (first > last) throw new Error("The series share no common months");

  return {
    start: monthFromNumber(first),
    end: monthFromNumber(last),
    retrievedOn: sources.retrievedOn,
    preliminaryMonths: sources.preliminaryMonths,
    series: parsed.map((p) => {
      const offset = first - monthNumber(p.start);
      const trim = <T>(xs: T[]) => xs.slice(offset, offset + last - first + 1);
      return {
        id: p.id,
        key: p.key,
        name: p.name,
        title: p.title,
        values: trim(p.values),
        mom: round(trim(monthOverMonth(p.values))),
        yoy: round(trim(yearOverYear(p.values))),
        volatility: round(trim(volatility(p.values))),
      };
    }),
  };
}
