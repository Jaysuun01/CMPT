// Request validators for the risk routes (docs/ai-feature.md, "Input limits" and "Routes, validation and failures").
// The same /analyze validator serves the AI path and the manual form. Today is passed in, never read here.
import { z } from "zod";
import { monthNumber } from "../data/months.ts";
import type { Phase } from "./analysis.ts";
import { EVENT_IDS, eventById, type Material } from "./events.ts";

/** The three tracked materials, in display order. */
export const MATERIALS = ["lumber", "steel", "concrete"] as const satisfies readonly Material[];
const MAX_AHEAD = 36;
const MAX_PHASES = 12;
const MAX_BUDGET = 1e9;
const SHARE_TOLERANCE = 0.5;
const MAX_DESCRIPTION = 2000;
/** History windows the user can compare against: the start month, or null for all history. */
export const WINDOWS = { "1970": "1970-01", "1990": "1990-01", all: null } as const;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const unique = <T>(xs: readonly T[]) => new Set(xs).size === xs.length;

/** A need date: a calendar month from this month through MAX_AHEAD months ahead. */
const needMonth = (today: number) =>
  z
    .string()
    .regex(MONTH, { message: "Need dates must be months like 2027-03", abort: true })
    .refine((m) => monthNumber(m) >= today, "Need dates can't be in the past")
    .refine((m) => monthNumber(m) <= today + MAX_AHEAD, `Need dates must be within ${MAX_AHEAD} months`);

/** /extract body: the project description, trimmed and length-capped. */
export const ExtractBody = z.strictObject({
  description: z.string().trim().min(1, "Describe the project").max(MAX_DESCRIPTION, `Keep the description under ${MAX_DESCRIPTION} characters`),
});

/** /news body: which materials and need months to search for. Takes today so past or far-off months are rejected. */
export function newsBody(today: number) {
  return z.strictObject({
    materials: z.array(z.enum(MATERIALS)).min(1).max(MATERIALS.length).refine(unique, "Each material can appear once"),
    needMonths: z.array(needMonth(today)).min(1).max(MAX_PHASES),
  });
}

/** /analyze body: the confirmed project. Strict: unknown fields, bad months, events for the wrong material and shares not totalling 100% are rejected. */
export function analyzeBody(today: number) {
  return z
    .strictObject({
      materials: z
        .array(
          z.strictObject({
            material: z.enum(MATERIALS),
            budget: z.number().gt(0, "Budgets must be above $0").max(MAX_BUDGET, "Budgets can be up to $1 billion"),
            eventId: z.enum([...EVENT_IDS, "none"]).optional(),
          }),
        )
        .min(1, "Choose at least one material")
        .max(MATERIALS.length)
        .refine((ms) => unique(ms.map((m) => m.material)), "Each material can appear once"),
      phases: z
        .array(z.strictObject({ needMonth: needMonth(today), share: z.number().gt(0, "Phase shares must be above 0%").max(100 + SHARE_TOLERANCE, "Phase shares must add up to 100%").optional() }))
        .min(1, "Add at least one phase")
        .max(MAX_PHASES, `Up to ${MAX_PHASES} phases`),
      carryingCost: z.number().min(0, "Carrying cost can't be negative").max(10, "Carrying cost can be up to 10% a month"),
      window: z.enum(Object.keys(WINDOWS) as [keyof typeof WINDOWS, ...(keyof typeof WINDOWS)[]]),
    })
    .superRefine((body, ctx) => {
      for (const [i, m] of body.materials.entries()) {
        const event = m.eventId && m.eventId !== "none" ? eventById(m.eventId) : undefined;
        if (event && !event.materials.includes(m.material)) {
          ctx.addIssue({ code: "custom", path: ["materials", i, "eventId"], message: `${event.name} doesn't cover ${m.material}` });
        }
      }
      const shares = body.phases.map((p) => p.share);
      if (shares.some((s) => s !== undefined)) {
        if (shares.some((s) => s === undefined)) {
          ctx.addIssue({ code: "custom", path: ["phases"], message: "Give every phase a share, or none" });
        } else {
          const total = (shares as number[]).reduce((a, b) => a + b, 0);
          if (Math.abs(total - 100) > SHARE_TOLERANCE) {
            ctx.addIssue({ code: "custom", path: ["phases"], message: "Phase shares must add up to 100%" });
          }
        }
      }
    });
}

/** /advise: the same project as /analyze, the id /news returned, and the developments the user dismissed. */
export function adviseBody(today: number) {
  return z.strictObject({
    project: analyzeBody(today),
    newsId: z.string().regex(/^[0-9a-f]{32}$/, "Run the check again"),
    exclude: z.array(z.int().min(1).max(100)).max(30),
  });
}

type AnalyzeBody = z.infer<ReturnType<typeof analyzeBody>>;

/**
 * Phases for the analysis: months from today, ordered by need date (ties keep the order entered),
 * with shares rescaled to exactly 100%, or split evenly when none are given.
 */
export function toPhases(phases: AnalyzeBody["phases"], today: number): (Phase & { needMonth: string })[] {
  const total = phases.reduce((a, p) => a + (p.share ?? 0), 0);
  return phases
    .map((p) => ({ needMonth: p.needMonth, d: monthNumber(p.needMonth) - today, share: p.share === undefined ? 1 / phases.length : p.share / total }))
    .sort((a, b) => a.d - b.d);
}

/** Readable messages for a rejected body, one per problem. */
export function issues(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => (i.code === "unrecognized_keys" ? "Unexpected fields in the request" : i.message)))];
}

