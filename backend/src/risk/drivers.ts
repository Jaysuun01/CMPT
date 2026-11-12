// Energy and freight costs: five monthly FRED series fetched live from fixed URLs and cached in memory.
// Every figure is computed here; the LLM never sees or writes them (CLAUDE.md §5).
import { parseFredCsv, type MonthlySeries } from "../data/parse.ts";
import { monthFromNumber, monthNumber } from "../data/months.ts";
import { round9 } from "./analysis.ts";

/** The five series, their units, and whether their latest months are preliminary (the BLS indexes). */
export const DRIVERS = [
  { id: "MHHNGSP", name: "Natural gas, Henry Hub spot price", unit: "$ per million BTU", preliminary: false },
  { id: "GASDESM", name: "Diesel, US sales price", unit: "$ per gallon", preliminary: false },
  { id: "MCOILWTICO", name: "Crude oil, WTI", unit: "$ per barrel", preliminary: false },
  // BLS producer price indexes: the latest 4 months are preliminary, as for the material series.
  { id: "PCU483111483111", name: "Ocean freight, deep-sea freight PPI", unit: "index, Jun 1988 = 100", preliminary: true },
  { id: "PCU484121484121", name: "Trucking, long-distance truckload PPI", unit: "index, Dec 2003 = 100", preliminary: true },
] as const;
/** A FRED id from DRIVERS; the only ids a URL is ever built from. */
export type DriverId = (typeof DRIVERS)[number]["id"];

/** Per-series fetch timeout, covering the whole body as it streams in. */
export const FETCH_TIMEOUT_MS = 6_000;
/** Largest CSV accepted; a bigger reply is cut off and rejected. */
export const MAX_BYTES = 2_000_000;
/** How long a successful download is reused; failures are never cached. */
export const CACHE_MS = 12 * 3_600_000;

/** The figures shown for one series, all computed here. */
export interface Figures {
  month: string;
  value: number;
  /** Fractions, e.g. 0.05 for +5%. Null when a value they need is missing. */
  change3: number | null;
  change12: number | null;
  /** How many earlier 12-month changes are strictly lower than the latest one. */
  higherThan: number | null;
  /** How many earlier 12-month changes `higherThan` compares against. */
  compared: number;
}

/** Latest value and its changes. Any missing value in a window makes that figure null (never interpolated). */
export function figures(s: MonthlySeries): Figures | null {
  const v = s.values;
  const last = v.length - 1;
  const latest = v[last];
  if (latest == null) return null;
  const change = (t: number, h: number) => {
    const a = v[t];
    const b = v[t - h];
    return t - h >= 0 && a != null && b != null ? round9(a / b - 1) : null;
  };
  const change12 = change(last, 12);
  const earlier = v
    .slice(0, last)
    .map((_, t) => change(t, 12))
    .filter((c): c is number => c !== null);
  return {
    month: monthFromNumber(monthNumber(s.start) + last),
    value: latest,
    change3: change(last, 3),
    change12,
    higherThan: change12 === null || earlier.length === 0 ? null : earlier.filter((c) => c < change12).length,
    compared: change12 === null ? 0 : earlier.length,
  };
}

/** A failed download, with a short code that is safe to log (timeout, http-404, too-large…). */
export class SourceError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`source unavailable: ${code}`);
    this.name = "SourceError";
    this.code = code;
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Reads at most MAX_BYTES, counting while the body streams in, so a huge reply is never held in memory. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new SourceError("no-body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new SourceError("too-large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Where series come from: live FRED, or fixtures in tests and mock mode. */
export interface DriverSource {
  get(id: DriverId): Promise<MonthlySeries>;
}

/** Live FRED source: fixed URLs, no redirects, a timeout, a size cap, a 12-hour cache of successes only. */
export function fredSource(fetchImpl: Fetch = fetch, now: () => number = Date.now): DriverSource {
  const cache = new Map<DriverId, { at: number; series: MonthlySeries }>();
  const inFlight = new Map<DriverId, Promise<MonthlySeries>>();

  async function load(id: DriverId): Promise<MonthlySeries> {
    let res: Response;
    try {
      // `redirect: "error"` keeps every request on fred.stlouisfed.org.
      res = await fetchImpl(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      throw new SourceError(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network");
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new SourceError(`http-${res.status}`);
    }
    let text: string;
    try {
      text = await readCapped(res);
    } catch (err) {
      // The timeout also aborts the body read, so a reply that stalls mid-body ends here too.
      if (err instanceof SourceError) throw err;
      throw new SourceError(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network");
    }
    try {
      return parseFredCsv(text, id);
    } catch {
      throw new SourceError("format");
    }
  }

  return {
    get(id) {
      const hit = cache.get(id);
      if (hit && now() - hit.at < CACHE_MS) return Promise.resolve(hit.series);
      const pending = inFlight.get(id);
      if (pending) return pending;
      const p = load(id)
        .then((series) => {
          cache.set(id, { at: now(), series });
          return series;
        })
        .finally(() => inFlight.delete(id));
      inFlight.set(id, p);
      return p;
    },
  };
}

/** The response for GET /drivers: one row per series, with `figures: null` when it couldn't be loaded or has no latest value. */
export async function driverRows(source: DriverSource, onError: (id: DriverId, err: unknown) => void) {
  return Promise.all(
    DRIVERS.map(async (d) => {
      try {
        return { ...d, available: true, figures: figures(await source.get(d.id)) };
      } catch (err) {
        onError(d.id, err);
        return { ...d, available: false, figures: null };
      }
    }),
  );
}
