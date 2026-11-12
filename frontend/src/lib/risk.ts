// Browser-side calls for the Material Risk Check. Same-origin /api/risk/* (proxied to the backend), so no
// server-only import and no key here. Every response is untrusted and checked with zod (CLAUDE.md §5).
import { z } from "zod";

/** The three tracked materials, in display order (matches the backend). */
export const MATERIALS = ["lumber", "steel", "concrete"] as const;
/** One of MATERIALS. */
export type Material = (typeof MATERIALS)[number];
/** How far back the similar-period search looks: from 1970, from 1990, or all history. */
export type Window = "1970" | "1990" | "all";
/** Longest project description, matching the backend's limit. */
export const MAX_DESCRIPTION = 2000;
/** Most phases a project can have, matching the backend's limit. */
export const MAX_PHASES = 12;

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Num = z.number().finite();

/** Only a parsed https link may become an href. */
const HttpsUrl = z.string().refine((s) => {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
});

const StatusSchema = z.strictObject({ aiAvailable: z.boolean(), demo: z.boolean() });
const EventsSchema = z.strictObject({
  events: z.array(z.strictObject({ id: z.string().max(40), name: z.string().max(120), month: Month, materials: z.array(z.enum(MATERIALS)) })).max(20),
});
/** One curated past event, as the event picker lists it. */
export type PastEventOption = z.infer<typeof EventsSchema>["events"][number];

const ExtractSchema = z.strictObject({
  materials: z.array(z.strictObject({ name: z.string().max(60), material: z.enum(MATERIALS).nullable(), budget: Num.nullable() })).max(3),
  phases: z.array(z.strictObject({ needMonth: Month.nullable(), share: Num.nullable() })).max(MAX_PHASES),
});
/** What the AI read from the description, before the user confirms it. */
export type Extracted = z.infer<typeof ExtractSchema>;

const DevelopmentSchema = z.strictObject({
  devId: z.int().min(1),
  // Lengths are counted in code points, as the backend cuts them, so an emoji near a cap isn't counted twice.
  summary: z.string().refine((s) => [...s].length <= 300),
  sources: z.array(z.strictObject({ url: HttpsUrl, title: z.string().refine((s) => [...s].length <= 200) })).min(1).max(5),
  material: z.enum(MATERIALS),
  risk: z.enum(["price", "availability", "both"]),
  topic: z.enum(["trade", "shipping", "weather", "conflict", "energy", "labor", "production", "other"]),
  eventId: z.string().max(40),
});
/** The areas the backend searches, one search each. Must match AREAS in backend/src/risk/gemini.ts. */
export const AREAS = ["trade", "shipping", "energy", "weather", "production", "conflict"] as const;
const AreaStatus = z.enum(["ok", "failed"]);
const NewsSchema = z.strictObject({
  newsId: z.string().regex(/^[0-9a-f]{32}$/),
  areas: z.strictObject(Object.fromEntries(AREAS.map((a) => [a, AreaStatus])) as Record<(typeof AREAS)[number], typeof AreaStatus>),
  developments: z.array(DevelopmentSchema).max(30),
});
/** Whether each area's search ran ("ok") or couldn't ("failed"). */
export type Areas = z.infer<typeof NewsSchema>["areas"];
/** One classified news item, with its source links. */
export type Development = z.infer<typeof DevelopmentSchema>;

const DriversSchema = z.strictObject({
  drivers: z
    .array(
      z.strictObject({
        id: z.string().max(20),
        name: z.string().max(80),
        unit: z.string().max(40),
        preliminary: z.boolean(),
        available: z.boolean(),
        figures: z
          .strictObject({
            month: Month,
            value: Num,
            change3: Num.nullable(),
            change12: Num.nullable(),
            higherThan: z.int().min(0).nullable(),
            compared: z.int().min(0),
          })
          .nullable(),
      }),
    )
    .max(10),
});
/** One energy or freight series and its figures (or why it's unavailable). */
export type Driver = z.infer<typeof DriversSchema>["drivers"][number];

const Group = z.strictObject({ rose: z.int(), within: z.int(), fell: z.int() });
const Outlook = z.strictObject({ months: z.int().min(1).max(36), similar: Group.nullable(), all: Group, low: Num.nullable(), high: Num.nullable() });
/** Where prices went by one need date, in the similar periods and across all history. */
export type Outlook = z.infer<typeof Outlook>;
const StrategyId = z.enum(["asNeeded", "allNow", "firstHalf"]);

const MaterialResult = z.strictObject({
  material: z.enum(MATERIALS),
  name: z.string().max(60),
  seriesId: z.string().max(20),
  budget: Num,
  status: z.enum(["ok", "tooFew", "unmeasurable", "stale"]),
  recent: z.strictObject({ c3: Num, c6: Num, c12: Num, vol: Num }).nullable(),
  candidates: z.strictObject({ count: z.int(), first: Month, last: Month }).nullable(),
  similar: z.array(Month),
  outlook: z.array(Outlook).max(12).nullable(),
  noTimingDecision: z.boolean(),
  strategies: z
    .array(
      z.strictObject({
        id: StrategyId,
        boughtNow: z.array(z.int()),
        median: Num,
        min: Num,
        max: Num,
        dollars: z.strictObject({ median: Num, min: Num, max: Num }),
      }),
    )
    .nullable(),
  breakEven: z.strictObject({ median: Num, ahead: z.int(), n: z.int(), neverPaid: z.boolean(), rates: z.array(Num).max(20) }).nullable(),
  lean: z.strictObject({ strategy: StrategyId, cheapest: z.int().min(0), n: z.int().min(1), strength: z.enum(["strong", "moderate", "weak"]) }).nullable(),
  event: z
    .strictObject({
      id: z.string().max(40),
      name: z.string().max(120),
      month: Month,
      description: z.string().max(400),
      next: z.string().max(400),
      source: HttpsUrl,
      nextSource: HttpsUrl,
      moves: z.array(Num.nullable()).max(12),
      costs: z.partialRecord(StrategyId, Num.nullable()),
      higherThan: z.int().nullable(),
    })
    .nullable(),
});
/** One material's analysis, as the results show it. */
export type MaterialResult = z.infer<typeof MaterialResult>;

const AnalysisSchema = z.strictObject({
  today: Month,
  asOf: Month,
  gap: z.int(),
  windowStart: Month.nullable(),
  phases: z.array(z.strictObject({ needMonth: Month, monthsAhead: z.int(), share: Num })),
  reCheck: Month.nullable(),
  materials: z.array(MaterialResult),
});
/** The whole /analyze response. */
export type Analysis = z.infer<typeof AnalysisSchema>;

const AdviceSchema = z.strictObject({
  advice: z
    .array(
      z.strictObject({
        material: z.enum(MATERIALS),
        action: z.enum(["buy-early", "as-needed", "split", "lock-supply"]),
        // The backend's 160, plus the full stop it may add.
        reason: z.string().min(1).max(161),
        devIds: z.array(z.int().min(1)).max(5),
      }),
    )
    .max(3),
});
/** One material's checked AI advice. */
export type Advice = z.infer<typeof AdviceSchema>["advice"][number];

const BadRequest = z.strictObject({ error: z.string().max(200), issues: z.array(z.string().max(200)).max(20) });
const FailedStep = z.strictObject({ error: z.string().max(200), step: z.enum(["search", "classify"]) });

/** The confirmed project, as sent to /analyze and /advise. */
export interface Project {
  materials: { material: Material; budget: number; eventId?: string }[];
  phases: { needMonth: string; share?: number }[];
  carryingCost: number;
  window: Window;
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; issues: string[]; step?: "search" | "classify" };

/**
 * One request to /api/risk/<path>, validated with `schema`. Never throws: a network error, timeout (30 s), error status
 * or a reply that fails the schema all come back as { ok: false }, with any validation messages from a 400.
 */
async function call<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`/api/risk/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const bad = BadRequest.safeParse(json);
      const step = FailedStep.safeParse(json);
      return { ok: false, status: res.status, issues: res.status === 400 && bad.success ? bad.data.issues : [], step: step.success ? step.data.step : undefined };
    }
    const parsed = schema.safeParse(json);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: 0, issues: [] };
  } catch {
    return { ok: false, status: 0, issues: [] };
  }
}

/** Whether the backend has a Gemini key (or mock mode). */
export const getStatus = () => call("status", StatusSchema);
/** The curated past events, for the picker. */
export const getEvents = () => call("events", EventsSchema);
/** Energy and freight costs from FRED. */
export const getDrivers = () => call("drivers", DriversSchema);
/** Step 1: the AI reads the description. */
export const extractProject = (description: string) => call("extract", ExtractSchema, { description });
/** Steps 2 and 3: search and classify current news. Returns a newsId for /advise. */
export const checkNews = (materials: Material[], needMonths: string[]) => call("news", NewsSchema, { materials, needMonths });
/** The similar-period analysis. Pure code on the backend; works without a key. */
export const analyzeProject = (project: Project) => call("analyze", AnalysisSchema, project);
/** The advice step, on the news held under `newsId`, leaving out the dismissed items in `exclude`. */
export const getAdvice = (project: Project, newsId: string, exclude: number[]) => call("advise", AdviceSchema, { project, newsId, exclude });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-03" → "Mar 2027" */
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** Whole US dollars, with a proper minus sign: −$1,234. */
export const dollars = (x: number) => usd.format(Math.round(x)).replace("-", "−");
