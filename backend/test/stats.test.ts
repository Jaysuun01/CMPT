import { describe, expect, it } from "vitest";
import { monthOverMonth, volatility, yearOverYear } from "../src/stats.ts";

// Expected values were worked out independently (Python, straight from data/WPU101.csv),
// not taken from this code. Last 13 months of iron and steel, Sep 2025 .. Sep 2026:
const STEEL_13 = [317.52, 313.812, 307.944, 323.978, 329.774, 340.509, 346.719, 352.671, 358.104, 365.148, 374.388, 377.806, 383.33];

describe("empty input", () => {
  it("returns empty arrays", () => {
    expect([monthOverMonth([]), yearOverYear([]), volatility([])]).toEqual([[], [], []]);
  });
});

describe("monthOverMonth", () => {
  it("matches the hand calculation for Sep 2026: 383.330 / 377.806 − 1", () => {
    expect(monthOverMonth(STEEL_13).at(-1)).toBeCloseTo(1.462126, 5);
  });

  it("is null for the first month", () => {
    expect(monthOverMonth([100, 110])).toEqual([null, expect.closeTo(10, 10)]);
  });

  it("is null when either month is missing", () => {
    expect(monthOverMonth([100, null, 120])).toEqual([null, null, null]);
  });
});

describe("yearOverYear", () => {
  it("matches the hand calculation for Sep 2026: 383.330 / 317.520 − 1", () => {
    expect(yearOverYear(STEEL_13).at(-1)).toBeCloseTo(20.726253, 5);
  });

  it("is null for the first 12 months", () => {
    const out = yearOverYear(STEEL_13);
    expect(out.slice(0, 12).every((x) => x === null)).toBe(true);
  });

  it("is null when the year-ago month is missing", () => {
    const vals = [null, ...STEEL_13.slice(1)];
    expect(yearOverYear(vals).at(-1)).toBeNull();
  });
});

describe("volatility", () => {
  it("matches the hand calculation for Sep 2026 (sample std. dev. of 12 monthly changes)", () => {
    expect(volatility(STEEL_13).at(-1)).toBeCloseTo(1.835117, 5);
  });

  it("needs 13 months of levels, so the first 12 are null", () => {
    const out = volatility(STEEL_13);
    expect(out.slice(0, 12).every((x) => x === null)).toBe(true);
    expect(out[12]).not.toBeNull();
  });

  it("is zero for perfectly steady growth", () => {
    const steady = Array.from({ length: 13 }, (_, i) => 100 * 1.01 ** i);
    expect(volatility(steady).at(-1)).toBeCloseTo(0, 10);
  });

  it("is null when any month in the window is missing", () => {
    const gap = [...STEEL_13];
    gap[6] = null as unknown as number;
    expect(volatility(gap).at(-1)).toBeNull();
  });
});
