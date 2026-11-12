// /api/risk/*: the Material Risk Check. Each POST route checks its body with a strict schema; every route catches its own errors
// and logs only fields (route, step, status, finishReason, code, duration), never prompts, descriptions or budgets.
import { randomBytes } from "node:crypto";
import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { Dataset } from "../data/load.ts";
import { monthFromNumber, monthNumber } from "../data/months.ts";
import { analyze, type Analysis } from "./analysis.ts";
import { driverRows, SourceError, type DriverSource } from "./drivers.ts";
import { EVENTS, eventById, type Material, type PastEvent } from "./events.ts";
import { advise, classify, extract, search, StepError, type Client } from "./gemini.ts";
import { adviseBody, analyzeBody, ExtractBody, issues, newsBody, toPhases, WINDOWS } from "./project.ts";

/** Shared limit across every route that calls Gemini (one bucket: all requests come from the local proxy). */
export const AI_LIMIT_PER_MINUTE = 5;
/** Hourly cap on the same bucket, so a stuck client can't spend the whole day's quota. */
export const AI_LIMIT_PER_HOUR = 30;
/** Hourly cap on news checks alone: each is six billed searches plus a classify call, so this bounds search spend at 60 an hour. */
export const NEWS_LIMIT_PER_HOUR = 10;
/** Overall budget for one /news request (search, then classify), under the frontend proxy's 30 s limit. */
export const NEWS_TIMEOUT_MS = 25_000;
// /news results kept for /advise, so the client never sends news text back (docs/ai-feature.md, "Advice").
export const NEWS_TTL_MS = 30 * 60_000;
/** Most /news results held for /advise at once; the oldest is dropped first. */
export const NEWS_KEPT = 100;

interface RiskOptions {
  /** null when there is no key and mock mode is off. */
  client: Client | null;
  /** Today's month number, from the server clock (or fixed in mock mode). */
  today: () => number;
  /** True with GEMINI_MOCK=1: the AI steps answer from fixed fixtures, and the page says so. */
  demo?: boolean;
  /** Raised in mock mode so E2E can't hit the limit. */
  aiLimits: { perMinute: number; perHour: number; newsPerHour: number };
  newsTimeoutMs?: number;
  /** FRED energy and freight series; fixtures in mock mode. */
  drivers: DriverSource;
  /** Milliseconds now, for the news store; Date.now except in tests. */
  now?: () => number;
}

const GENERIC = { extract: "Couldn't read the description. Please fill in the form.", news: "News couldn't be checked.", advise: "The advice couldn't be written." };

/** One structured log line for a failed route: only fields (step, status, finish reason, code, duration), never text. */
function log(route: string, started: number, err: unknown) {
  const e = err instanceof StepError ? err : null;
  console.error(
    JSON.stringify({
      route,
      step: e?.step,
      status: e?.status,
      finishReason: e?.finishReason,
      code: e ? e.code : err instanceof Error ? err.name : "unknown",
      ms: Date.now() - started,
    }),
  );
}

/** A rate limiter with one shared key, since every request reaches the API from 127.0.0.1. */
function limiter(windowMs: number, limit: number, key = "ai") {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Every request arrives from 127.0.0.1 through the frontend proxy, so this is one shared bucket.
    keyGenerator: () => key,
    message: { error: "Too many requests" },
  });
}

/** The routes under /api/risk: status, events, drivers (GET), and extract, news, analyze, advise (POST). */
export function riskRouter(dataset: Dataset, options: RiskOptions) {
  const router = Router();
  const { client } = options;
  // One limiter for every route that calls Gemini. A /news request is seven calls (six searches and a classify),
  // so it also has its own hourly limit.
  const ai = [limiter(60_000, options.aiLimits.perMinute), limiter(3_600_000, options.aiLimits.perHour)];
  const newsLimit = limiter(3_600_000, options.aiLimits.newsPerHour, "news");
  const needKey: RequestHandler = (_req, res, next) => {
    if (client) next();
    else res.status(503).json({ error: "The AI feature needs a Gemini key" });
  };
  const series = new Map(dataset.series.map((s) => [s.key, s]));
  const start = monthNumber(dataset.start);
  const now = options.now ?? Date.now;
  // Only the fields /advise reads, so each entry's size is bounded by the summary cap.
  type Stored = { expires: number; developments: { devId: number; material: Material; summary: string; risk: "price" | "availability" | "both" }[] };
  const newsStore = new Map<string, Stored>();
  const keep = (developments: Awaited<ReturnType<typeof classify>>) => {
    const t = now();
    for (const [id, v] of newsStore) if (v.expires <= t) newsStore.delete(id);
    // A Map iterates in insertion order, so the first key is the oldest.
    if (newsStore.size >= NEWS_KEPT) newsStore.delete(newsStore.keys().next().value as string);
    const id = randomBytes(16).toString("hex");
    newsStore.set(id, { expires: t + NEWS_TTL_MS, developments: developments.map(({ devId, material, summary, risk }) => ({ devId, material, summary, risk })) });
    return id;
  };

  /** Runs the analysis for a validated project; shared by /analyze and /advise so advice never uses client numbers. */
  function compute(body: ReturnType<typeof analyzeBody>["_output"], today: number) {
    const { materials, carryingCost, window } = body;
    const phases = toPhases(body.phases, today);
    const rate = carryingCost / 100;
    const windowStart = WINDOWS[window];
    const results = materials.map((m) => {
      const s = series.get(m.material);
      if (!s) throw new Error(`Missing series ${m.material}`);
      const event = m.eventId && m.eventId !== "none" ? eventById(m.eventId) : undefined;
      const analysis = analyze({
        values: s.values,
        start,
        preliminary: dataset.preliminaryMonths,
        today,
        windowStart: windowStart === null ? null : monthNumber(windowStart),
        phases,
        rate,
        eventMonth: event ? monthNumber(event.month) : null,
      });
      return { s, budget: m.budget, event, analysis };
    });
    return { phases, rate, windowStart, results };
  }

  router.get("/status", (_req, res) => {
    res.json({ aiAvailable: client !== null, demo: options.demo === true });
  });

  // The curated list for the past-event picker, which also works without a key.
  router.get("/events", (_req, res) => {
    res.json({ events: EVENTS.map((e) => ({ id: e.id, name: e.name, month: e.month, materials: e.materials })) });
  });

  // Energy and freight costs from FRED. Works without a key; a series that can't be loaded is marked unavailable.
  router.get("/drivers", async (_req, res) => {
    const started = Date.now();
    const drivers = await driverRows(options.drivers, (id, err) =>
      console.error(JSON.stringify({ route: "drivers", series: id, code: err instanceof SourceError ? err.code : "unknown", ms: Date.now() - started })),
    );
    res.json({ drivers });
  });

  router.post("/extract", needKey, ...ai, async (req, res) => {
    const body = ExtractBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Bad request", issues: issues(body.error) });
      return;
    }
    const started = Date.now();
    try {
      res.json(await extract(client as Client, body.data.description, monthFromNumber(options.today())));
    } catch (err) {
      log("extract", started, err);
      res.status(502).json({ error: GENERIC.extract });
    }
  });

  // The news cap is checked first, so a request it refuses doesn't also use up the shared AI budget.
  router.post("/news", needKey, newsLimit, ...ai, async (req, res) => {
    const today = options.today();
    const body = newsBody(today).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Bad request", issues: issues(body.error) });
      return;
    }
    const started = Date.now();
    const signal = AbortSignal.timeout(options.newsTimeoutMs ?? NEWS_TIMEOUT_MS);
    let step: "search" | "classify" = "search";
    try {
      const found = await search(client as Client, body.data.materials, body.data.needMonths, monthFromNumber(today), signal);
      for (const f of found.failures) console.error(JSON.stringify({ route: "news", step: "search", ...f, ms: Date.now() - started }));
      step = "classify";
      const developments = await classify(client as Client, found.developments, body.data.materials, signal);
      // Which areas were searched, so the page can say what was checked and found nothing, or couldn't be checked.
      res.json({ newsId: keep(developments), areas: found.areas, developments });
    } catch (err) {
      log("news", started, err);
      res.status(502).json({ error: GENERIC.news, step });
    }
  });

  router.post("/analyze", (req, res) => {
    const today = options.today();
    const body = analyzeBody(today).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Bad request", issues: issues(body.error) });
      return;
    }
    const started = Date.now();
    try {
      const { phases, windowStart, results } = compute(body.data, today);
      res.json(respond(today, windowStart, phases, results));
    } catch (err) {
      log("analyze", started, err);
      res.status(500).json({ error: "Something went wrong" });
    }
  });

  router.post("/advise", needKey, ...ai, async (req, res) => {
    const today = options.today();
    const body = adviseBody(today).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Bad request", issues: issues(body.error) });
      return;
    }
    const stored = newsStore.get(body.data.newsId);
    if (!stored || stored.expires <= now()) {
      res.status(409).json({ error: "The news check has expired. Run the check again." });
      return;
    }
    const started = Date.now();
    try {
      const { rate, results } = compute(body.data.project, today);
      const kept = stored.developments.filter((d) => !body.data.exclude.includes(d.devId));
      const materials = results.flatMap(({ s, event, analysis: a }, i) => {
        const material = body.data.project.materials[i]?.material as Material;
        const news = kept.filter((d) => d.material === material).map((d) => ({ devId: d.devId, summary: d.summary, risk: d.risk }));
        // Nothing to weigh without a lean or news; nothing to time when every phase is needed now.
        if ((!a.lean && news.length === 0) || a.noTimingDecision) return [];
        const input = {
          material,
          name: s.name,
          today,
          rate,
          outlook: a.outlook,
          strategies: a.strategies,
          breakEven: a.breakEven,
          lean: a.lean,
          event: event && a.event ? { name: event.name, moves: a.event.moves } : null,
        };
        return [{ input, news }];
      });
      if (kept.length === 0 || materials.length === 0) {
        res.json({ advice: [] });
        return;
      }
      const advice = await advise(client as Client, materials, (material, code) =>
        console.error(JSON.stringify({ route: "advise", material, code: `rejected-${code}` })),
      );
      res.json({ advice });
    } catch (err) {
      log("advise", started, err);
      res.status(502).json({ error: GENERIC.advise });
    }
  });

  return router;
}

const month = monthFromNumber;

/** Shapes the analysis for the client: month numbers become "YYYY-MM", and each strategy's extra cost also gets dollars on the budget. */
function respond(
  today: number,
  windowStart: string | null,
  phases: { needMonth: string; d: number; share: number }[],
  results: { s: Dataset["series"][number]; budget: number; event: PastEvent | undefined; analysis: Analysis }[],
) {
  const first = (results[0] as (typeof results)[number]).analysis;
  return {
    today: month(today),
    asOf: month(first.asOf),
    gap: first.gap,
    windowStart,
    phases: phases.map((p) => ({ needMonth: p.needMonth, monthsAhead: p.d, share: p.share })),
    reCheck: phases.find((p) => p.d > 0)?.needMonth ?? null,
    materials: results.map(({ s, budget, event, analysis: a }) => ({
      material: s.key,
      name: s.name,
      seriesId: s.id,
      budget,
      status: a.status,
      recent: a.recent,
      candidates: a.candidates && { count: a.candidates.count, first: month(a.candidates.first), last: month(a.candidates.last) },
      similar: a.similar.map(month),
      outlook: a.outlook,
      noTimingDecision: a.noTimingDecision,
      strategies:
        a.strategies?.map((st) => ({ ...st, dollars: { median: st.median * budget, min: st.min * budget, max: st.max * budget } })) ?? null,
      breakEven: a.breakEven,
      lean: a.lean,
      event:
        event && a.event
          ? {
              id: event.id,
              name: event.name,
              month: event.month,
              description: event.description,
              next: event.next,
              source: event.source,
              nextSource: event.nextSource,
              moves: a.event.moves,
              costs: a.event.costs,
              higherThan: a.event.higherThan,
            }
          : null,
    })),
  };
}
