import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { monthNumber } from "../src/data/months.ts";
import { parseFredCsv } from "../src/data/parse.ts";
import { analyze, breakEven, extraCost, group, higherThan, median, rank, round9, select, strategySets, summarizeBreakEven, type Input, type Phase } from "../src/risk/analysis.ts";

describe("group", () => {
  it("counts exactly ±5% as within, despite floating-point error", () => {
    expect(105 / 100 - 1).toBeGreaterThan(0.05); // the trap the rounding exists for
    expect(group(105 / 100 - 1)).toBe("within");
    expect(group(95 / 100 - 1)).toBe("within");
    expect(group(0.0500001)).toBe("rose");
    expect(group(-0.0500001)).toBe("fell");
  });
});

describe("median", () => {
  it("takes the middle value, or the average of the two middle values", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

const ph = (...ds: number[]): Phase[] => ds.map((d) => ({ d, share: 1 / ds.length }));

describe("strategySets", () => {
  it("buys every future phase for all-now and the future ones among the first half (rounded up)", () => {
    expect(strategySets(ph(4, 10, 16))).toEqual([
      { id: "asNeeded", boughtNow: [] },
      { id: "allNow", boughtNow: [0, 1, 2] },
      { id: "firstHalf", boughtNow: [0, 1] },
    ]);
  });

  it("hides first-half when it buys nothing now (first phase needed this month)", () => {
    expect(strategySets(ph(0, 6)).map((s) => s.id)).toEqual(["asNeeded", "allNow"]);
  });

  it("hides first-half when it equals all-now (one phase)", () => {
    expect(strategySets(ph(5)).map((s) => s.id)).toEqual(["asNeeded", "allNow"]);
  });

  it("shows only buy-as-needed when nothing is needed after this month", () => {
    expect(strategySets(ph(0, 0)).map((s) => s.id)).toEqual(["asNeeded"]);
  });
});

describe("extraCost and breakEven (the doc's worked example)", () => {
  // B = $1M, phases at months 0 and 6 with 50% each, r = 2%/month, g = 0 and 15%.
  const phases = ph(0, 6);
  const g = [0, 0.15];
  it("costs $75,000 bought as needed and $60,000 bought now", () => {
    expect(extraCost(phases, [], g, 0.02) * 1e6).toBeCloseTo(75_000, 6);
    expect(extraCost(phases, [1], g, 0.02) * 1e6).toBeCloseTo(60_000, 6);
  });
  it("breaks even at 2.5% a month", () => {
    expect(breakEven(phases, g)).not.toBe(0.025); // 0.024999999999999984 before rounding
    expect(round9(breakEven(phases, g))).toBe(0.025);
  });
});

describe("extraCost and breakEven with three phases and unequal shares", () => {
  it("buys the first half now and the rest as needed", () => {
    // Shares 1/3 each, needed in 4, 10, 16 months, first two bought now at 1%/month:
    // 1/3 × (0.04 + 0.10) + 1/3 × 0.30 (third bought as needed) = 0.44 / 3.
    expect(extraCost(ph(4, 10, 16), [0, 1], [0.01, 0.02, 0.3], 0.01)).toBeCloseTo(0.44 / 3, 12);
  });

  it("weights each phase by its share", () => {
    // Shares 20/30/50% at months 0, 6, 12; g = 0, 6%, 18%.
    // As needed: 0.3 × 0.06 + 0.5 × 0.18 = 0.108. All now at 1%: 0.01 × (0.3 × 6 + 0.5 × 12) = 0.078. r* = 0.108 / 7.8.
    const phases = [
      { d: 0, share: 0.2 },
      { d: 6, share: 0.3 },
      { d: 12, share: 0.5 },
    ];
    const g = [0, 0.06, 0.18];
    expect(extraCost(phases, [], g, 0.01)).toBeCloseTo(0.108, 12);
    expect(extraCost(phases, [1, 2], g, 0.01)).toBeCloseTo(0.078, 12);
    expect(breakEven(phases, g)).toBeCloseTo(0.108 / 7.8, 12);
  });
});

describe("summarizeBreakEven", () => {
  it("says buying early never paid off only when more than half the rates are at or below 0", () => {
    expect(summarizeBreakEven([0, -0.01, 0.01, 0.02], 0.005).neverPaid).toBe(false); // exactly half
    expect(summarizeBreakEven([0, -0.01, 0, 0.02], 0.005)).toEqual({ median: 0, ahead: 1, n: 4, neverPaid: true, rates: [0, -0.01, 0, 0.02] });
  });

  it("rounds before comparing with the user's rate", () => {
    // 0.1 + 0.2 is 0.30000000000000004: without rounding, 0.3 would count as below it.
    expect(summarizeBreakEven([0.1 + 0.2], 0.3).ahead).toBe(0);
  });

  it("rounds the user's rate too, so a tie never counts as ahead", () => {
    // 0.7% a month arrives as 0.7 / 100 = 0.006999999999999999.
    expect(0.7 / 100).toBeLessThan(0.007);
    expect(summarizeBreakEven([0.007], 0.7 / 100).ahead).toBe(0);
    expect(summarizeBreakEven([0.007000001], 0.7 / 100).ahead).toBe(1);
  });
});

describe("higherThan", () => {
  it("counts costs strictly below, after rounding", () => {
    expect(higherThan(0.1 + 0.2, [0.3, 0.2, 0.4])).toBe(1);
  });
});

describe("rank", () => {
  // Two measures with equal spread (sample SD = sqrt(4/3) each). Distances from (1.8, 0.2), raw:
  // (2,0) 0.283, (0,0) 1.811, (2,2) 1.811, (0,2) 2.546; standardizing divides all by the same SD.
  const pool = [
    { s: 0, x: [0, 0] },
    { s: 1, x: [2, 0] },
    { s: 2, x: [0, 2] },
    { s: 3, x: [2, 2] },
  ];
  it("orders by distance, with ties going to the earlier month", () => {
    expect(rank(pool, [1.8, 0.2])).toEqual([1, 0, 3, 2]);
  });

  it("standardizes, so a measure's units don't change the order", () => {
    const scaled = pool.map((c) => ({ s: c.s, x: [c.x[0] as number, (c.x[1] as number) * 10] }));
    expect(rank(scaled, [1.8, 2])).toEqual([1, 0, 3, 2]);
  });

  it("leaves out a measure with no spread", () => {
    // The second measure is 5 everywhere; today's 100 there would dominate if it were used.
    const flat = [
      { s: 0, x: [1, 5] },
      { s: 1, x: [2, 5] },
      { s: 2, x: [3, 5] },
    ];
    expect(rank(flat, [2.9, 100])).toEqual([2, 1, 0]);
  });

  it("ties every month when no measure has spread", () => {
    expect(rank([{ s: 5, x: [1] }, { s: 2, x: [1] }, { s: 9, x: [1] }], [7])).toEqual([2, 5, 9]);
  });
});

describe("select", () => {
  it("keeps a month only if it's more than 6 months from every kept month", () => {
    // 14 is 4 from 10; 16 is exactly 6 from 10 (excluded); 17 and 3 are 7 away (kept).
    expect(select([10, 14, 17, 3, 16, 25])).toEqual([10, 17, 3, 25]);
  });

  it("stops at 20", () => {
    expect(select(Array.from({ length: 25 }, (_, i) => i * 7))).toHaveLength(20);
  });
});

// A hand-worked series: 100 for months 0–48, 110 from month 49 on, 100 months long, last 4 preliminary.
// L = 95. Its measures are all 0, and so are those of every candidate whose 12-month lookback misses the
// step (months 12–48 and 61–81), so those tie at distance 0. Candidates 49–60 differ from L.
const START = monthNumber("2000-01");
const step = (i: number) => (i < 49 ? 100 : 110);
const series = (edit?: (v: (number | null)[]) => void) => {
  const v: (number | null)[] = Array.from({ length: 100 }, (_, i) => step(i));
  edit?.(v);
  return v;
};
const base: Input = {
  values: series(),
  start: START,
  preliminary: 4,
  today: START + 97, // G = 2
  windowStart: null,
  phases: ph(0, 12), // D = 12, so candidates need data through s + 2 + 12 ≤ 95: s ≤ 81
  rate: 0.01,
  eventMonth: null,
};

describe("analyze on the hand-worked step series", () => {
  const a = analyze(base);

  it("measures the clocks: L, and the gap to today", () => {
    expect(a.asOf).toBe(START + 95);
    expect(a.gap).toBe(2);
    expect(a.recent).toEqual({ c3: 0, c6: 0, c12: 0, vol: 0 });
  });

  it("uses months 12–81 as candidates", () => {
    expect(a.candidates).toEqual({ count: 70, first: START + 12, last: START + 81 });
  });

  it("needs data only through the latest need date, not a fixed 12 months", () => {
    // D = 3: s + 2 + 3 ≤ 95, so s runs 12–90 (79 months). Under the old G + max(D, 12) rule it would stop at 81.
    expect(analyze({ ...base, phases: ph(0, 3) }).candidates).toEqual({ count: 79, first: START + 12, last: START + 90 });
  });

  it("selects the 0-distance months 7 apart, then the one differing month that fits the spacing", () => {
    // Ties go earliest: 12, 19, …, 47, then 61, 68, 75 (49–60 differ). Of 49–60, only 54 is more than 6 from both 47 and 61.
    expect(a.similar).toEqual([12, 19, 26, 33, 40, 47, 61, 68, 75, 54].map((s) => START + s));
    expect(a.status).toBe("ok");
  });

  it("measures where prices went by the one future need date, from the similar month plus the gap", () => {
    // From s + 2 to s + 14, a move crosses the step at month 49 only for s = 40 (42 → 54, +10%).
    // (Without the gap, s = 47 would also cross it: 47 → 59.)
    // All candidates: the move crosses month 49 when s + 2 < 49 ≤ s + 14, i.e. s = 35–46, 12 of the 70.
    expect(a.outlook).toEqual([{ months: 12, similar: { rose: 1, within: 9, fell: 0 }, all: { rose: 12, within: 58, fell: 0 }, low: 0, high: 0.1 }]);
  });

  it("gives one outlook per distinct future need date, soonest first, skipping this month", () => {
    // Need dates 0, 3, 12, 12 → horizons 3 and 12. D is still 12, so the candidates and similar periods don't change.
    // Over 3 months from s + 2, a move crosses month 49 only for s = 44–46: none of the similar periods, 3 of all 70.
    const b = analyze({ ...base, phases: ph(0, 3, 12, 12) });
    expect(b.similar).toEqual(a.similar);
    expect(b.outlook).toEqual([
      { months: 3, similar: { rose: 0, within: 10, fell: 0 }, all: { rose: 3, within: 67, fell: 0 }, low: 0, high: 0 },
      { months: 12, similar: { rose: 1, within: 9, fell: 0 }, all: { rose: 12, within: 58, fell: 0 }, low: 0, high: 0.1 },
    ]);
  });

  it("costs each strategy across the similar periods", () => {
    // As needed: half the budget at month 12 moves +10% only for s = 40 → 0.05 once, 0 nine times.
    // All now: 1% × 0.5 × 12 = 6% in every scenario. First half buys nothing now, so it's hidden.
    expect(a.strategies).toEqual([
      { id: "asNeeded", boughtNow: [], median: 0, min: 0, max: expect.closeTo(0.05, 12) },
      { id: "allNow", boughtNow: [1], median: expect.closeTo(0.06, 12), min: expect.closeTo(0.06, 12), max: expect.closeTo(0.06, 12) },
    ]);
  });

  it("reports the break-even rate and when buying early never paid off", () => {
    // r* = 0.5 × 0.1 / (0.5 × 12) = 0.008333… for s = 40, and 0 for the other nine.
    expect(a.breakEven).toMatchObject({ median: 0, ahead: 0, n: 10, neverPaid: true });
    expect(analyze({ ...base, rate: 0.005 }).breakEven).toMatchObject({ median: 0, ahead: 1, n: 10, neverPaid: true });
    expect(analyze({ ...base, rate: 0.008333 }).breakEven?.ahead).toBe(1);
  });

  it("lists each similar period's break-even rate in the order of the similar periods", () => {
    // 0.1 / 12 rounded to 9 places for the period starting at month 40; 0 for the other nine.
    const expected = a.similar.map((m) => (m === base.start + 40 ? 0.008333333 : 0));
    expect(expected.filter((r) => r > 0)).toHaveLength(1);
    expect(a.breakEven?.rates).toEqual(expected);
  });

  it("does not count a rate equal to the break-even rate as coming out ahead", () => {
    expect(analyze({ ...base, rate: round9(0.1 / 12) }).breakEven?.ahead).toBe(0);
  });
});

describe("analyze: the past-event case", () => {
  it("measures from the event month with no gap, and compares with the similar periods", () => {
    // From month 45: +12 → 57 is 110 (+10%).
    // As needed: 0.5 × 10% = 0.05, above the nine similar periods at 0 and equal to the one at 0.05.
    const e = analyze({ ...base, eventMonth: START + 45 }).event;
    expect(e).toEqual({
      month: START + 45,
      moves: [0.1],
      costs: { asNeeded: expect.closeTo(0.05, 12), allNow: expect.closeTo(0.06, 12) },
      higherThan: 9,
    });
  });

  it("measures the event's moves from the event month itself, without the gap", () => {
    // From month 36: +12 → 48 is still 100 (0). With the 2-month gap it would reach 50, which is 110 (+10%).
    expect(analyze({ ...base, eventMonth: START + 36 }).event?.moves).toEqual([0]);
  });

  it("says not enough data yet for a horizon or a strategy whose months pass L", () => {
    // From month 90: the phase at +12 → 102 is past L = 95.
    // Buying that phase now needs no later index value, so all-now still has a cost: 1% × 0.5 × 12.
    const e = analyze({ ...base, eventMonth: START + 90 }).event;
    expect(e?.moves).toEqual([null]);
    expect(analyze({ ...base, phases: ph(0, 3, 12), eventMonth: START + 90 }).event?.moves).toEqual([0, null]); // 90 → 93 fits
    expect(e?.costs).toEqual({ asNeeded: null, allNow: expect.closeTo(0.06, 12) });
    expect(e?.higherThan).toBeNull();
  });

  it("has no data for an event before the series starts", () => {
    const e = analyze({ ...base, eventMonth: START - 5 }).event;
    expect(e?.moves).toEqual([null]);
    expect(e?.costs).toEqual({ asNeeded: null, allNow: null });
  });

  it("costs nothing when every phase is needed this month", () => {
    expect(analyze({ ...base, phases: ph(0), eventMonth: START + 45 }).event?.costs).toEqual({ asNeeded: 0 });
  });
});

describe("analyze: edge cases", () => {
  it("ignores the 4 preliminary months", () => {
    const a = analyze({ ...base, values: series((v) => v.splice(96, 4, 999, 1, null, 5)) });
    expect(a).toEqual(analyze(base));
  });

  it("limits candidates to the history window, and reports too few similar periods", () => {
    // Candidates 30–81. Kept: 30, 37, 44, 61, 68, 75, plus one of 51–54 → 7, under the minimum of 8.
    const a = analyze({ ...base, windowStart: START + 30, eventMonth: START + 45 });
    expect(a.candidates).toEqual({ count: 52, first: START + 30, last: START + 81 });
    expect(a.status).toBe("tooFew");
    expect(a.lean).toBeNull();
    expect(a.similar.slice(0, 6)).toEqual([30, 37, 44, 61, 68, 75].map((s) => START + s));
    expect(a.similar).toHaveLength(7);
    expect(a.strategies).toBeNull();
    expect(a.breakEven).toBeNull();
    // Candidates 30–81: the 12-month move from s + 2 crosses month 49 for s = 35–46 (12), the rest stay (40).
    expect(a.outlook).toEqual([{ months: 12, similar: null, all: { rose: 12, within: 40, fell: 0 }, low: null, high: null }]);
    // The past event is still shown as a single case, without the comparison.
    expect(a.event?.moves).toEqual([0.1]);
    expect(a.event?.higherThan).toBeNull();
  });

  it("skips candidates with a missing value anywhere in their lookback or future, without filling it in", () => {
    // A gap at month 20 rules out every s with s − 12 ≤ 20 ≤ s + 14, so candidates 12–32 (21 months) are dropped.
    const a = analyze({ ...base, values: series((v) => (v[20] = null)) });
    expect(a.candidates).toEqual({ count: 49, first: START + 33, last: START + 81 });
  });

  it("can't measure recent conditions when a value L needs is missing", () => {
    const a = analyze({ ...base, values: series((v) => (v[92] = null)) });
    expect(a.status).toBe("unmeasurable");
    expect(a.recent).toBeNull();
    expect(a.strategies).toBeNull();
  });

  it("treats data more than 24 months behind today as out of date", () => {
    expect(analyze({ ...base, today: START + 95 + 24 }).status).not.toBe("stale");
    const a = analyze({ ...base, today: START + 95 + 25 });
    expect(a.status).toBe("stale");
    expect(a.strategies).toBeNull();
  });

  it("refuses phases that aren't ordered by need date", () => {
    expect(() => analyze({ ...base, phases: ph(12, 0) })).toThrow();
  });

  it("refuses a today earlier than the latest final month", () => {
    expect(() => analyze({ ...base, today: START + 94 })).toThrow();
  });

  it("flags no timing decision when every phase is needed this month", () => {
    const a = analyze({ ...base, phases: ph(0) });
    expect(a.noTimingDecision).toBe(true);
    expect(a.lean).toBeNull();
    expect(a.strategies?.map((s) => s.id)).toEqual(["asNeeded"]);
    expect(a.breakEven).toBeNull();
    expect(a.outlook).toEqual([]);
  });

  it("reports too few similar periods for a series with no usable candidates", () => {
    // 30 months: L = 25, and candidates would need data through s + 14 with s ≥ 12.
    const a = analyze({ ...base, values: series().slice(0, 30), today: START + 27 });
    expect(a.candidates).toBeNull();
    expect(a.similar).toEqual([]);
    expect(a.status).toBe("tooFew");
    expect(a.lean).toBeNull();
  });
});

describe("analyze on WPU101 (steel), today 2026-11", () => {
  const csv = parseFredCsv(readFileSync(join(import.meta.dirname, "..", "data", "WPU101.csv"), "utf8"), "WPU101");
  const a = analyze({
    values: csv.values,
    start: monthNumber(csv.start),
    preliminary: 4,
    today: monthNumber("2026-11"),
    windowStart: monthNumber("1970-01"),
    phases: ["2027-03", "2027-09", "2028-03"].map((m) => ({ d: monthNumber(m) - monthNumber("2026-11"), share: 1 / 3 })),
    rate: 0.02,
    eventMonth: null,
  });

  it("measures recent conditions at May 2026, 6 months before today", () => {
    // By hand from the CSV: May 2026 358.104; Feb 2026 340.509; Nov 2025 307.944; May 2025 333.703.
    expect(a.asOf).toBe(monthNumber("2026-05"));
    expect(a.gap).toBe(6);
    expect(a.recent?.c3).toBeCloseTo(358.104 / 340.509 - 1, 12); // 0.0516726
    expect(a.recent?.c6).toBeCloseTo(358.104 / 307.944 - 1, 12); // 0.1628868
    expect(a.recent?.c12).toBeCloseTo(358.104 / 333.703 - 1, 12); // 0.0731219
  });

  // Cross-check against two independent scripts written without the app code.
  it("matches the independent scripts: candidates, closest periods and outcomes at the need dates", () => {
    expect(a.recent?.vol).toBeCloseTo(2.4757, 4);
    expect(a.candidates).toEqual({ count: 655, first: monthNumber("1970-01"), last: monthNumber("2024-07") });
    expect(a.similar.slice(0, 5)).toEqual(["2011-05", "2017-04", "2007-05", "2016-07", "2018-06"].map(monthNumber));
    // Outlook at the need dates (4, 10, 16 months), from the same independent script.
    expect(a.outlook?.map((o) => [o.months, o.similar, o.all])).toEqual([
      [4, { rose: 5, within: 14, fell: 1 }, { rose: 110, within: 492, fell: 53 }],
      [10, { rose: 9, within: 7, fell: 4 }, { rose: 256, within: 302, fell: 97 }],
      [16, { rose: 10, within: 4, fell: 6 }, { rose: 322, within: 220, fell: 113 }],
    ]);
    expect(a.outlook?.[0]?.low).toBeCloseTo(-0.335597826, 9);
    expect(a.outlook?.[1]?.high).toBeCloseTo(0.385237614, 9);
    expect(a.breakEven?.ahead).toBe(0);
    // The history lean, from a third independent script: as needed, cheapest in 18 of the 20.
    expect(a.lean).toEqual({ strategy: "asNeeded", cheapest: 18, n: 20, strength: "strong" });
  });
});
