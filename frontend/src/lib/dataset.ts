// The dataset's shape, checked in the browser like any untrusted input (CLAUDE.md §5).
import { z } from "zod";

const Values = z.array(z.number().nullable());
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// The backend response is validated like any other untrusted input (CLAUDE.md §5).
export const DatasetSchema = z
  .strictObject({
    start: z.string().regex(MONTH),
    end: z.string().regex(MONTH),
    retrievedOn: z.iso.date(),
    preliminaryMonths: z.int().min(0).max(12),
    series: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[A-Z0-9]+$/),
          key: z.string().regex(/^[a-z]+$/),
          name: z.string(),
          title: z.string(),
          values: Values,
          mom: Values,
          yoy: Values,
          volatility: Values,
        }),
      )
      .min(1),
  })
  .refine((d) => d.series.every((s) => [s.mom, s.yoy, s.volatility].every((a) => a.length === s.values.length)), {
    message: "Series arrays have different lengths",
  })
  .refine((d) => new Set(d.series.map((s) => s.values.length)).size === 1 && (d.series[0]?.values.length ?? 0) > 0, {
    message: "Series cover different months",
  })
  .refine((d) => monthsBetween(d.start, d.end) + 1 === d.series[0]?.values.length, {
    message: "start/end do not match the number of months",
  });

/** Months from a to b, both "YYYY-MM". */
function monthsBetween(a: string, b: string) {
  const n = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return n(b) - n(a);
}

/** The validated dataset. */
export type Dataset = z.infer<typeof DatasetSchema>;
/** One material's series and its stats. */
export type Series = Dataset["series"][number];
/** Which of a series' arrays a chart plots. */
export type Measure = "values" | "mom" | "yoy" | "volatility";
