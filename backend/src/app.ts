// The Express API: wires security middleware, the price data and the Material Risk Check routes together.
// Kept separate from server.ts so tests can build the app without listening on a port.
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Dataset } from "./data/load.ts";
import { monthNumber } from "./data/months.ts";
import { CALL_TIMEOUT_MS, createModels, type Client } from "./risk/gemini.ts";
import { fredSource, type DriverSource } from "./risk/drivers.ts";
import { MOCK_TODAY, mockDrivers, mockModels } from "./risk/mock.ts";
import { AI_LIMIT_PER_HOUR, AI_LIMIT_PER_MINUTE, riskRouter } from "./risk/routes.ts";

// Everything reaches us through the frontend's /api proxy on this machine, so every request
// arrives from 127.0.0.1. We deliberately do NOT trust X-Forwarded-For: the proxy passes a
// client-supplied value straight through, which would let a caller pick their own rate-limit key.
// The limit is therefore one shared bucket for the whole app.
export const RATE_LIMIT_PER_MINUTE = 120;

/** Last-resort error handler: 4xx keep their status with a generic body; anything else is logged and becomes a generic 500. */
export const onError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
  // Only the error's type is logged, so nothing from a request can ever reach the log through it.
  if (status === 500) console.error(JSON.stringify({ route: "global", code: err instanceof Error ? err.name : "unknown" }));
  res.status(status).json({ error: status === 500 ? "Something went wrong" : "Bad request" });
};

/** What createApp can be given instead of the real environment, clock and FRED source (tests, mock mode). */
export interface AppOptions {
  env?: Record<string, string | undefined>;
  /** The server clock; tests inject it. */
  now?: () => Date;
  timeouts?: { callMs: number; newsMs: number };
  /** Replaces the live FRED source; tests inject one. */
  drivers?: DriverSource;
}

/**
 * Builds the Express app: security headers, the global rate limit, a 16 KB JSON body cap, /api/series and /api/health,
 * and the /api/risk routes. The Gemini client is the real SDK with a key, fixtures with GEMINI_MOCK=1, or null.
 */
export function createApp(dataset: Dataset, { env = process.env, now = () => new Date(), timeouts, drivers }: AppOptions = {}) {
  const app = express();
  const mock = env.GEMINI_MOCK === "1";
  const key = env.GEMINI_API_KEY?.trim();
  const timeoutMs = timeouts?.callMs ?? CALL_TIMEOUT_MS;
  const client: Client | null = mock ? { models: mockModels, timeoutMs } : key ? { models: createModels(key), timeoutMs } : null;

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 60_000,
      // Mock mode is only for the parallel E2E run, which loads the page far faster than a person.
      limit: mock ? 10_000 : RATE_LIMIT_PER_MINUTE,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      validate: { xForwardedForHeader: false },
      message: { error: "Too many requests" },
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // The dataset only changes when the CSVs are replaced and the server restarts.
  app.get("/api/series", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600").json(dataset);
  });

  app.use(
    "/api/risk",
    riskRouter(dataset, {
      client,
      today: mock ? () => monthNumber(MOCK_TODAY) : () => now().getFullYear() * 12 + now().getMonth(),
      aiLimits: mock ? { perMinute: 1000, perHour: 10_000 } : { perMinute: AI_LIMIT_PER_MINUTE, perHour: AI_LIMIT_PER_HOUR },
      newsTimeoutMs: timeouts?.newsMs,
      drivers: drivers ?? (mock ? mockDrivers : fredSource()),
    }),
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(onError);

  return app;
}
