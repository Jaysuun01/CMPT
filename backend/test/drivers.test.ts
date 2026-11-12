import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { loadDataset } from "../src/data/load.ts";
import { CACHE_MS, DRIVERS, FETCH_TIMEOUT_MS, figures, fredSource, MAX_BYTES, SourceError, type DriverSource } from "../src/risk/drivers.ts";

// Hand-worked series, 2020-01 to 2021-04 (16 months):
// - 3-month change at 2021-04: 132 / 110 − 1 = 0.2
// - 12-month change at 2021-04: 132 / 100 − 1 = 0.32
// - earlier 12-month changes: 2021-01 110/100 − 1 = 0.1, 2021-02 120/100 − 1 = 0.2, 2021-03 99/100 − 1 = −0.01
//   all three are below 0.32, so it is higher than 3 of 3.
const BASE = [...Array<number>(12).fill(100), 110, 120, 99, 132];
const series = (values: (number | null)[]) => ({ start: "2020-01", values });

describe("figures", () => {
  it("computes the latest value, its 3- and 12-month changes and how it ranks", () => {
    expect(figures(series(BASE))).toEqual({ month: "2021-04", value: 132, change3: 0.2, change12: 0.32, higherThan: 3, compared: 3 });
  });

  it("ranks strictly: an earlier change equal to the latest one doesn't count as lower", () => {
    // Latest 12-month change 120/100 − 1 = 0.2 equals 2021-02's; only 0.1 and −0.01 are lower: 2 of 3.
    const v = [...BASE.slice(0, 15), 120];
    expect(figures(series(v))).toMatchObject({ change12: 0.2, higherThan: 2, compared: 3 });
  });

  it("leaves a figure undefined when a value in its window is missing, and never interpolates", () => {
    const v: (number | null)[] = [...BASE];
    v[12] = null; // 2021-01: the 3-month base, and one of the earlier 12-month changes
    // Left to compare: 2021-02 (0.2) and 2021-03 (−0.01), both below 0.32.
    expect(figures(series(v))).toEqual({ month: "2021-04", value: 132, change3: null, change12: 0.32, higherThan: 2, compared: 2 });
    const noBase: (number | null)[] = [...BASE];
    noBase[3] = null; // 2020-04: the 12-month base
    expect(figures(series(noBase))).toMatchObject({ change12: null, higherThan: null, compared: 0 });
  });

  it("has no figures when the latest value is missing", () => {
    expect(figures(series([...BASE.slice(0, 15), null]))).toBeNull();
  });

  it("has no 12-month figures for a series shorter than 13 months", () => {
    expect(figures(series([100, 101, 102, 103]))).toEqual({ month: "2020-04", value: 103, change3: 0.03, change12: null, higherThan: null, compared: 0 });
  });
});

const CSV = `observation_date,MHHNGSP\n2020-01-01,2.5\n2020-02-01,2.0\n`;
const ok = (text: string) => new Response(text, { status: 200 });

describe("fredSource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let clock: number;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ok(CSV));
    clock = 0;
  });
  const source = () => fredSource(fetchMock as never, () => clock);

  it("fetches a fixed FRED URL with redirects refused and a timeout", async () => {
    expect(await source().get("MHHNGSP")).toEqual({ start: "2020-01", values: [2.5, 2.0] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://fred.stlouisfed.org/graph/fredgraph.csv?id=MHHNGSP");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps its limits pinned", () => {
    expect([FETCH_TIMEOUT_MS, MAX_BYTES, CACHE_MS]).toEqual([6_000, 2_000_000, 12 * 3_600_000]);
  });

  it("stops reading a body that never ends once it passes the cap, and cancels it", async () => {
    const cancel = vi.fn();
    const chunk = new TextEncoder().encode("x".repeat(64_000));
    const endless = new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(chunk), cancel });
    fetchMock.mockResolvedValueOnce(new Response(endless, { status: 200 }));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "too-large" });
    expect(cancel).toHaveBeenCalled();
  });

  it("reports a body that times out or breaks mid-read as a timeout or network error", async () => {
    const failing = (err: Error) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode("observation_date,MHHNGSP\n"));
          },
          pull(c) {
            c.error(err);
          },
        }),
        { status: 200 },
      );
    fetchMock.mockResolvedValueOnce(failing(new DOMException("The operation timed out.", "TimeoutError")));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "timeout" });
    fetchMock.mockResolvedValueOnce(failing(new TypeError("terminated")));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "network" });
  });

  it("caches a success for 12 hours, then fetches again", async () => {
    const s = source();
    await s.get("MHHNGSP");
    clock = CACHE_MS - 1;
    await s.get("MHHNGSP");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock = CACHE_MS;
    await s.get("MHHNGSP");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never caches a failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 503 }));
    const s = source();
    await expect(s.get("MHHNGSP")).rejects.toMatchObject({ code: "http-503" });
    expect(await s.get("MHHNGSP")).toMatchObject({ values: [2.5, 2.0] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one fetch between requests made at the same time", async () => {
    const s = source();
    await Promise.all([s.get("MHHNGSP"), s.get("MHHNGSP")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a timeout, a refused redirect, a page that isn't the CSV and an oversized body as unavailable", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "timeout" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed: redirect"));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "network" });
    fetchMock.mockResolvedValueOnce(ok("<html>Error</html>"));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "format" });
    fetchMock.mockResolvedValueOnce(ok(`observation_date,MHHNGSP\n${"2020-01-01,2.5\n".repeat(Math.ceil(MAX_BYTES / 15) + 1)}`));
    // Without the cap this body would be read whole and then fail as a duplicate-month format error.
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "too-large" });
  });

  it("rejects a CSV for a different series", async () => {
    fetchMock.mockResolvedValueOnce(ok(CSV.replace("MHHNGSP", "GASDESM")));
    await expect(source().get("MHHNGSP")).rejects.toMatchObject({ code: "format" });
  });
});

describe("GET /api/risk/drivers", () => {
  const dataset = loadDataset(join(import.meta.dirname, "..", "data"));
  let logs: string[];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
  });
  afterEach(() => vi.restoreAllMocks());

  it("works without a key, and marks a series that couldn't be loaded as unavailable", async () => {
    const drivers: DriverSource = {
      get: async (id) => {
        if (id === "GASDESM") throw new SourceError("timeout");
        return series(BASE);
      },
    };
    const res = await request(createApp(dataset, { env: {}, drivers })).get("/api/risk/drivers");
    expect(res.status).toBe(200);
    expect(res.body.drivers.map((d: { id: string }) => d.id)).toEqual(DRIVERS.map((d) => d.id));
    expect(res.body.drivers[0]).toEqual({
      id: "MHHNGSP",
      name: "Natural gas, Henry Hub spot price",
      unit: "$ per million BTU",
      preliminary: false,
      available: true,
      figures: { month: "2021-04", value: 132, change3: 0.2, change12: 0.32, higherThan: 3, compared: 3 },
    });
    expect(res.body.drivers[1]).toMatchObject({ id: "GASDESM", available: false, figures: null });
    expect(res.body.drivers[3]).toMatchObject({ id: "PCU483111483111", preliminary: true });
    expect(logs).toEqual([expect.stringContaining('"code":"timeout"')]);
  });

  it("uses fixtures in mock mode, so no network call is made", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));
    const res = await request(createApp(dataset, { env: { GEMINI_MOCK: "1" } })).get("/api/risk/drivers");
    expect(res.body.drivers.every((d: { available: boolean }) => d.available)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
