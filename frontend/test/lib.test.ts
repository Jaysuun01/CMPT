import { describe, expect, it } from "vitest";
import { buildChart, extent, niceTicks } from "@/lib/chart";
import { compare } from "@/lib/compare";
import { DatasetSchema } from "@/lib/dataset";
import { notableMove } from "@/lib/detail";
import { axisPct, index, pct, swing } from "@/lib/format";
import { Calendar } from "@/lib/months";
import { makeDataset } from "./fixture";

describe("Calendar (real data shape: Jan 1926, 1,209 months)", () => {
  const cal = new Calendar("1926-01", 1209);

  it("maps indexes to months without Date objects", () => {
    expect(cal.label(0, true)).toBe("January 1926");
    expect(cal.label(1208)).toBe("Sep 2026");
    expect(cal.key(1148)).toBe("2021-09");
    expect(cal.indexOf(2021, 8)).toBe(1148);
    expect(cal.label(11)).toBe("Dec 1926");
    expect(cal.label(12)).toBe("Jan 1927");
  });

  it("parses only well-formed months inside the data", () => {
    expect(cal.parseKey("2021-09")).toBe(1148);
    expect(cal.parseKey("1925-12")).toBeNull();
    expect(cal.parseKey("2026-10")).toBeNull();
    expect(cal.parseKey("2021-13")).toBeNull();
    expect(cal.parseKey("2021-9")).toBeNull();
    expect(cal.parseKey("<script>")).toBeNull();
  });

  it("explains invalid ranges", () => {
    expect(cal.rangeError(1100, 1208)).toBeNull();
    expect(cal.rangeError(1208, 1208)).toMatch(/earlier than the end month/);
    expect(cal.rangeError(1208, 1100)).toMatch(/earlier than the end month/);
    expect(cal.rangeError(-1, 10)).toMatch(/starts in January 1926/);
    expect(cal.rangeError(10, 1209)).toMatch(/latest data is for September 2026/);
    expect(cal.rangeError(1211, 1208)).toMatch(/latest data is for September 2026/);
  });

  it("builds presets that end in the latest month and clamp at the start", () => {
    expect(cal.preset(60)).toEqual({ from: 1148, to: 1208 });
    expect(new Calendar("2020-01", 10).preset(60)).toEqual({ from: 0, to: 9 });
  });

  it("reads URL params, falling back to the last 5 years for anything bad", () => {
    const fallback = { from: 1148, to: 1208 };
    expect(cal.rangeFromParams({ from: "2010-01", to: "2020-06" })).toEqual({ from: cal.indexOf(2010, 0), to: cal.indexOf(2020, 5) });
    expect(cal.rangeFromParams({})).toEqual(fallback);
    expect(cal.rangeFromParams({ from: "2020-06", to: "2010-01" })).toEqual(fallback);
    expect(cal.rangeFromParams({ from: "garbage", to: "2020-06" })).toEqual(fallback);
    expect(cal.rangeFromParams({ from: ["2010-01", "2011-01"], to: "2020-06" })).toEqual(fallback);
    expect(cal.rangeFromParams({ from: "1800-01", to: "2020-06" })).toEqual(fallback);
  });

  it("rejects a malformed start month", () => {
    expect(() => new Calendar("1926", 10)).toThrow();
  });
});

describe("format", () => {
  it("uses a true minus sign and never shows −0.0%", () => {
    expect(pct(1.462)).toBe("+1.5%");
    expect(pct(-5.5)).toBe("−5.5%");
    expect(pct(-0.04)).toBe("0.0%");
    expect(pct(null)).toBe("n/a");
  });

  it("formats volatility, index levels and axis ticks", () => {
    expect(swing(1.835117)).toBe("±1.84%");
    expect(index(383.33)).toBe("383.3");
    expect(axisPct(-5)).toBe("−5%");
    expect(axisPct(0)).toBe("0%");
  });
});

describe("chart geometry", () => {
  const cal = new Calendar("2020-01", 72);

  it("picks round tick steps", () => {
    expect(niceTicks(0, 10, 4)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(250, 450, 4)).toEqual([250, 300, 350, 400, 450]);
    expect(niceTicks(5, 5, 4).length).toBeGreaterThan(1);
  });

  it("ignores nulls when finding the extent", () => {
    expect(extent([[null, 3, 1], [null, 7]])).toEqual([1, 7]);
    expect(extent([[null]])).toEqual([0, 1]);
  });

  it("breaks the line at missing months instead of bridging them", () => {
    const g = buildChart([[1, 2, null, 4, 5]], { calendar: cal, start: 0, prelimStart: 999 });
    expect(g.paths[0]!.match(/M/g)).toHaveLength(2);
  });

  it("draws a single month as one point in the middle", () => {
    const g = buildChart([[3]], { calendar: cal, start: 0, prelimStart: 999 });
    expect(g.paths[0]).toMatch(/^M500\.0 /);
  });

  it("puts every mark inside the plot box", () => {
    const g = buildChart([[1, 5, 9]], { calendar: cal, start: 0, prelimStart: 999 });
    for (const v of [1, 5, 9]) expect(g.y(v)).toBeGreaterThanOrEqual(0);
    for (const v of [1, 5, 9]) expect(g.y(v)).toBeLessThanOrEqual(100);
    expect([g.x(0), g.x(2)]).toEqual([0, 100]);
  });

  it("anchors bars at zero, above for rises and below for falls", () => {
    const g = buildChart([[2, -1]], { calendar: cal, start: 0, prelimStart: 999, bar: true, zero: true });
    const zero = g.y(0);
    expect(g.bars[0]!.top + g.bars[0]!.height).toBeCloseTo(zero, 6);
    expect(g.bars[1]!.top).toBeCloseTo(zero, 6);
  });

  it("shades preliminary months only when they are in view", () => {
    expect(buildChart([[1, 2, 3, 4]], { calendar: cal, start: 68, prelimStart: 70 }).prelimPos).not.toBeNull();
    expect(buildChart([[1, 2, 3, 4]], { calendar: cal, start: 0, prelimStart: 70 }).prelimPos).toBeNull();
  });

  it("labels every month of a 1-year range when the chart is wide, with the year on January", () => {
    // Oct 2020 .. Oct 2021 on a 1,000px chart
    const ticks = buildChart([Array(13).fill(1)], { calendar: cal, start: 9, prelimStart: 999, width: 1000 }).xTicks.map((t) => t.label);
    expect(ticks).toEqual(["Oct 2020", "Nov", "Dec", "Jan 2021", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
  });

  it("thins month labels on a narrow chart so they never collide", () => {
    for (const width of [180, 240, 300, 400]) {
      const t = buildChart([Array(13).fill(1)], { calendar: cal, start: 9, prelimStart: 999, width }).xTicks;
      for (let k = 1; k < t.length; k++) expect(((t[k]!.pos - t[k - 1]!.pos) / 100) * width).toBeGreaterThanOrEqual(58);
      expect(t.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("drops the first label rather than crowd a January next to it", () => {
    // Dec 2020 .. Dec 2021 at a width where months are ~60px apart: "Dec 2020" + "Jan 2021" would collide.
    const ticks = buildChart([Array(13).fill(1)], { calendar: cal, start: 11, prelimStart: 999, width: 720 }).xTicks.map((t) => t.label);
    expect(ticks[0]).toBe("Jan 2021");
  });

  it("shows the year on the first label when no January is in view", () => {
    // Feb .. Nov 2020
    const ticks = buildChart([Array(10).fill(1)], { calendar: cal, start: 1, prelimStart: 999, width: 1000 }).xTicks.map((t) => t.label);
    expect(ticks[0]).toBe("Feb 2020");
    expect(ticks[1]).toBe("Mar");
  });

  it("labels both ends of very short ranges", () => {
    expect(buildChart([[1, 2]], { calendar: cal, start: 7, prelimStart: 999, width: 300 }).xTicks.map((t) => t.label)).toEqual(["Aug 2020", "Sep 2020"]);
  });

  it("switches to evenly spaced years on long ranges, as many as fit", () => {
    const full = new Calendar("1926-01", 1209);
    const wide = buildChart([Array(1209).fill(1)], { calendar: full, start: 0, prelimStart: 9999, width: 1000 }).xTicks;
    const narrow = buildChart([Array(1209).fill(1)], { calendar: full, start: 0, prelimStart: 9999, width: 250 }).xTicks;
    expect(wide.every((t) => /^\d{4}$/.test(t.label))).toBe(true);
    expect(wide.length).toBeGreaterThan(narrow.length);
    for (const [ticks, width] of [[wide, 1000], [narrow, 250]] as const) {
      for (let k = 1; k < ticks.length; k++) expect(((ticks[k]!.pos - ticks[k - 1]!.pos) / 100) * width).toBeGreaterThanOrEqual(48);
    }
  });

});

describe("compare", () => {
  const ds = makeDataset();

  it("computes the change and the escalation factor between two months", () => {
    const c = compare(ds.series[0]!, 0, 50); // 100 -> 150
    expect(c.factor).toBeCloseTo(1.5, 10);
    expect(c.changePct).toBeCloseTo(50, 10);
    expect([c.base, c.current]).toEqual([100, 150]);
  });

  it("returns nulls rather than guessing when a value is missing", () => {
    const s = { ...ds.series[0]!, values: [null, ...ds.series[0]!.values.slice(1)] };
    const c = compare(s, 0, 50);
    expect([c.factor, c.changePct]).toEqual([null, null]);
  });

  it("rates volatility against the material's own recent history", () => {
    const flat = { ...ds.series[0]!, volatility: ds.series[0]!.volatility.map((v, i) => (v === null ? null : i === 71 ? 9 : 1)) };
    expect(compare(flat, 0, 71).norm).toBe("Above");
    const low = { ...flat, volatility: flat.volatility.map((v, i) => (v === null ? null : i === 71 ? 0.1 : 1)) };
    expect(compare(low, 0, 71).norm).toBe("Below");
    expect(compare(flat, 0, 20).norm).toBeNull(); // not enough history yet
  });

  it("splits Below / Near / Above at the thirds of the last 120 months", () => {
    // 60 values: 0..59 at months 12..71. The current month (71) sits in the window itself.
    const at = (current: number) => {
      const vol = ds.series[0]!.volatility.map((v, i) => (v === null ? null : i === 71 ? current : i - 12));
      return compare({ ...ds.series[0]!, volatility: vol }, 0, 71).norm;
    };
    expect(at(19.5)).toBe("Below"); // 20 of 60 lower = exactly 1/3
    expect(at(30)).toBe("Near");
    expect(at(39.5)).toBe("Above"); // 40 of 60 lower = exactly 2/3
  });

  it("only looks back 120 months", () => {
    const long: (number | null)[] = Array.from({ length: 200 }, (_, i) => (i < 12 ? null : i < 80 ? 100 : 1));
    long[199] = 2; // high against the last 120 months (mostly 1s), low against everything (100s)
    expect(compare({ ...ds.series[0]!, values: new Array(200).fill(1), volatility: long }, 0, 199).norm).toBe("Above");
  });
});

describe("DatasetSchema", () => {
  it("accepts a well-formed dataset", () => {
    expect(DatasetSchema.safeParse(makeDataset()).success).toBe(true);
  });

  it("rejects unknown fields, misaligned arrays and bad months", () => {
    const ds = makeDataset();
    expect(DatasetSchema.safeParse({ ...ds, extra: 1 }).success).toBe(false);
    expect(DatasetSchema.safeParse({ ...ds, start: "2020-13" }).success).toBe(false);
    const short = { ...ds, series: [{ ...ds.series[0]!, mom: [1] }, ...ds.series.slice(1)] };
    expect(DatasetSchema.safeParse(short).success).toBe(false);
    expect(DatasetSchema.safeParse({ ...ds, end: "2025-11" }).success).toBe(false);
    const badKey = { ...ds, series: [{ ...ds.series[0]!, key: "steel x" }, ...ds.series.slice(1)] };
    expect(DatasetSchema.safeParse(badKey).success).toBe(false);
  });
});

describe("notableMove", () => {
  const cal = new Calendar("2000-01", 100);
  const flat = (): (number | null)[] => Array.from({ length: 100 }, (_, i) => (i === 0 ? null : 0.5));

  it("names the last month with an equal or bigger move in the same direction", () => {
    const mom = flat();
    mom[10] = 3;
    mom[60] = 2.5;
    expect(notableMove(mom, 60, cal)).toBe("Largest monthly rise since November 2000");
    mom[50] = -4;
    mom[90] = -3;
    expect(notableMove(mom, 90, cal)).toBe("Largest monthly fall since March 2004");
  });

  it("says nothing when a similar move happened in the last two years", () => {
    const mom = flat();
    mom[40] = 3;
    mom[60] = 2.5;
    expect(notableMove(mom, 60, cal)).toBeNull();
  });

  it("calls a move a record only with at least two years of history", () => {
    const mom = flat();
    mom[30] = 9;
    expect(notableMove(mom, 30, cal)).toBe("Largest monthly rise in the data (since February 2000)");
    mom[5] = 9;
    expect(notableMove(mom, 5, cal)).toBeNull();
  });

  it("counts an equal earlier move as matching it", () => {
    const mom = flat();
    mom[10] = 3;
    mom[60] = 3;
    expect(notableMove(mom, 60, cal)).toBe("Largest monthly rise since November 2000");
  });

  it("names the first month that has a change when calling a record", () => {
    const mom = flat();
    mom[30] = 9;
    expect(notableMove(mom, 30, cal)).toContain("(since February 2000)");
  });

  it("ignores missing and zero months", () => {
    expect(notableMove(flat(), 0, cal)).toBeNull();
    const mom = flat();
    mom[40] = 0;
    expect(notableMove(mom, 40, cal)).toBeNull();
  });
});

describe("indexAt", () => {
  const cal = new Calendar("2020-01", 72);
  it("maps a horizontal position to the nearest point, clamped to the chart", () => {
    const line = buildChart([[1, 2, 3, 4, 5]], { calendar: cal, start: 0, prelimStart: 999 });
    expect([line.indexAt(0), line.indexAt(0.5), line.indexAt(1), line.indexAt(-1), line.indexAt(2)]).toEqual([0, 2, 4, 0, 4]);
    const bars = buildChart([[1, 2, 3, 4]], { calendar: cal, start: 0, prelimStart: 999, bar: true });
    expect([bars.indexAt(0.1), bars.indexAt(0.3), bars.indexAt(0.99), bars.indexAt(1)]).toEqual([0, 1, 3, 3]);
    // 0.24 separates the two rules: a bar slot (floor) vs the nearest line point (round).
    expect(bars.indexAt(0.24)).toBe(0);
    expect(line.indexAt(0.24)).toBe(1);
  });
});
