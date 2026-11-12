import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../src/data/load.ts";

const realData = join(import.meta.dirname, "..", "data");

describe("loadDataset with the real files", () => {
  const ds = loadDataset(realData);

  it("loads all three series over the same months", () => {
    expect(ds.series.map((s) => s.id)).toEqual(["WPU101", "WPU08", "WPU133"]);
    expect(ds.start).toBe("1926-01");
    expect(ds.end).toBe("2026-09");
    for (const s of ds.series) {
      expect(s.values).toHaveLength(1209);
      expect(s.mom).toHaveLength(1209);
      expect(s.yoy).toHaveLength(1209);
      expect(s.volatility).toHaveLength(1209);
    }
  });

  it("computes stats on the full series (hand-checked Sep 2026 values)", () => {
    const [steel, lumber, concrete] = ds.series;
    expect(steel?.values.at(-1)).toBe(383.33);
    expect(steel?.mom.at(-1)).toBeCloseTo(1.462126, 5);
    expect(steel?.yoy.at(-1)).toBeCloseTo(20.726253, 5);
    expect(steel?.volatility.at(-1)).toBeCloseTo(1.835117, 5);
    expect(lumber?.yoy.at(-1)).toBeCloseTo(5.540977, 5);
    expect(lumber?.volatility.at(-1)).toBeCloseTo(0.661855, 5);
    expect(concrete?.yoy.at(-1)).toBeCloseTo(4.210802, 5);
    expect(concrete?.volatility.at(-1)).toBeCloseTo(0.309227, 5);
  });

  it("carries metadata for the UI", () => {
    expect(ds.retrievedOn).toBe("2026-11-09");
    expect(ds.preliminaryMonths).toBe(4);
    expect(ds.series[0]?.title).toBe("Producer Price Index by Commodity: Metals and Metal Products: Iron and Steel");
  });
});

describe("loadDataset alignment and errors", () => {
  function fixture(files: Record<string, string>, ids = ["AAA", "BBB"], extra: object = {}) {
    const dir = mkdtempSync(join(tmpdir(), "cmpt-"));
    const sources = {
      retrievedOn: "2026-11-09",
      preliminaryMonths: 4,
      series: ids.map((id) => ({ id, key: id.toLowerCase(), name: id, title: id, file: `${id}.csv` })),
      ...extra,
    };
    writeFileSync(join(dir, "sources.json"), JSON.stringify(sources));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  }

  const csv = (id: string, startYear: number, values: number[]) =>
    [`observation_date,${id}`, ...values.map((v, i) => `${startYear + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01,${v}`)].join("\n");

  it("trims every series to the months they all cover, keeping stats aligned", () => {
    const dir = fixture({
      "AAA.csv": "observation_date,AAA\n2026-01-01,100\n2026-02-01,110\n2026-03-01,121",
      "BBB.csv": "observation_date,BBB\n2026-02-01,20\n2026-03-01,30\n2026-04-01,40",
    });
    const ds = loadDataset(dir);
    expect([ds.start, ds.end]).toEqual(["2026-02", "2026-03"]);
    const [a, b] = ds.series;
    expect(a?.values).toEqual([110, 121]);
    expect(a?.mom).toEqual([10, 10]); // Feb's MoM uses January, which was trimmed away but still counts
    expect(b?.values).toEqual([20, 30]);
    expect(b?.mom).toEqual([null, 50]);
    for (const s of ds.series) expect([s.mom.length, s.yoy.length, s.volatility.length]).toEqual([2, 2, 2]);
  });

  it("computes stats before trimming, so an earlier-starting series keeps its YoY history", () => {
    // AAA has 2025 and 2026; BBB starts in 2026. The shared range starts Jan 2026.
    const dir = fixture({
      "AAA.csv": csv("AAA", 2025, [...Array(12).fill(100), 110, 110]),
      "BBB.csv": csv("BBB", 2026, [50, 55]),
    });
    const ds = loadDataset(dir);
    expect(ds.start).toBe("2026-01");
    expect(ds.series[0]?.yoy[0]).toBeCloseTo(10, 10);
    expect(ds.series[1]?.yoy[0]).toBeNull();
  });

  it("accepts series that share exactly one month", () => {
    const dir = fixture({
      "AAA.csv": "observation_date,AAA\n2025-12-01,1\n2026-01-01,2",
      "BBB.csv": "observation_date,BBB\n2026-01-01,3\n2026-02-01,4",
    });
    const ds = loadDataset(dir);
    expect([ds.start, ds.end]).toEqual(["2026-01", "2026-01"]);
  });

  it("fails clearly when the series do not overlap, even by one month", () => {
    const dir = fixture({
      "AAA.csv": "observation_date,AAA\n2025-12-01,1",
      "BBB.csv": "observation_date,BBB\n2026-01-01,1",
    });
    expect(() => loadDataset(dir)).toThrow("share no common months");
  });

  it("fails clearly when a file is empty", () => {
    const dir = fixture({ "AAA.csv": "observation_date,AAA\n", "BBB.csv": "observation_date,BBB\n2026-01-01,1" });
    expect(() => loadDataset(dir)).toThrow("AAA: no observations");
  });

  it("refuses a sources.json file name that points outside the data folder", () => {
    const dir = fixture({}, []);
    // The target really exists, so only the file-name rule can stop it.
    writeFileSync(join(dir, "..", "outside.csv"), "observation_date,A\n2026-01-01,1");
    writeFileSync(
      join(dir, "sources.json"),
      JSON.stringify({ retrievedOn: "2026-11-09", preliminaryMonths: 4, series: [{ id: "A", key: "a", name: "A", title: "A", file: "../outside.csv" }] }),
    );
    expect(() => loadDataset(dir)).toThrow(/file/);
  });

  it("rejects duplicate series ids", () => {
    const dir = fixture({ "AAA.csv": "observation_date,AAA\n2026-01-01,1" }, ["AAA", "AAA"]);
    expect(() => loadDataset(dir)).toThrow("unique");
  });

  it("rejects an out-of-range preliminaryMonths", () => {
    const dir = fixture({ "AAA.csv": "observation_date,AAA\n2026-01-01,1" }, ["AAA"], { preliminaryMonths: 99 });
    expect(() => loadDataset(dir)).toThrow(/preliminaryMonths/);
  });
});
