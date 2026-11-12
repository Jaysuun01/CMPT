// LLM consistency check: runs the real Gemini steps several times on one fixed input and fails if the answers differ.
// Step 1 (extract) reads the same saved description each run. The advice step gets the same saved news and the same
// numbers each run, so any difference comes from the model, not from what the news search found.
// Needs a key and makes network calls, so it is never part of `npm test`; the scoring rules are in consistency-score.ts and unit-tested.
// From the repo root:
//   node --env-file=backend/.env backend/eval/consistency.ts [runs, default 5]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadDataset } from "../src/data/load.ts";
import { monthNumber } from "../src/data/months.ts";
import { analyze } from "../src/risk/analysis.ts";
import type { Material } from "../src/risk/events.ts";
import { eventById } from "../src/risk/events.ts";
import { advise, CALL_TIMEOUT_MS, createModels, extract, type AdviseMaterial } from "../src/risk/gemini.ts";
import { toPhases, WINDOWS } from "../src/risk/project.ts";
import { judge, type AdviceRun } from "./consistency-score.ts";

interface Cases {
  today: string;
  description: string;
  project: { materials: { material: Material; budget: number }[]; phases: { needMonth: string }[]; carryingCost: number; window: keyof typeof WINDOWS };
  news: { devId: number; material: Material; risk: "price" | "availability" | "both"; eventId: string; summary: string }[];
}

// Stays under the app's own AI limit of 5 calls a minute.
const PAUSE_MS = 13_000;
const runs = Number(process.argv[2] ?? 5);
// Two calls a run; 14 runs is 28 calls, inside the app's own 30-an-hour AI limit.
if (!Number.isInteger(runs) || runs < 2 || runs > 14) {
  console.error("Runs must be a whole number from 2 to 14.");
  process.exit(1);
}

const key = process.env.GEMINI_API_KEY?.trim();
if (process.env.GEMINI_MOCK === "1" || !key) {
  console.error("Set GEMINI_API_KEY in backend/.env and unset GEMINI_MOCK: this script measures the real model.");
  process.exit(1);
}
const client = { models: createModels(key), timeoutMs: CALL_TIMEOUT_MS };
const cases: Cases = JSON.parse(readFileSync(join(import.meta.dirname, "consistency-cases.json"), "utf8"));

// The advice inputs, built the way the /advise route builds them (routes.ts), with each material's past event taken
// from its first news item that names one, as the page does.
const dataset = loadDataset(join(import.meta.dirname, "..", "data"));
const today = monthNumber(cases.today);
const phases = toPhases(cases.project.phases, today);
const rate = cases.project.carryingCost / 100;
const windowStart = WINDOWS[cases.project.window];
const materials: AdviseMaterial[] = cases.project.materials.flatMap(({ material }) => {
  const s = dataset.series.find((x) => x.key === material);
  if (!s) throw new Error(`Missing series ${material}`);
  const event = eventById(cases.news.find((d) => d.material === material && d.eventId !== "none")?.eventId ?? "none");
  const a = analyze({
    values: s.values,
    start: monthNumber(dataset.start),
    preliminary: dataset.preliminaryMonths,
    today,
    windowStart: windowStart === null ? null : monthNumber(windowStart),
    phases,
    rate,
    eventMonth: event ? monthNumber(event.month) : null,
  });
  const news = cases.news.filter((d) => d.material === material).map(({ devId, summary, risk }) => ({ devId, summary, risk }));
  if ((!a.lean && news.length === 0) || a.noTimingDecision) return [];
  const input = { material, name: s.name, today, rate, outlook: a.outlook, strategies: a.strategies, breakEven: a.breakEven, lean: a.lean, event: event && a.event ? { name: event.name, moves: a.event.moves } : null };
  return [{ input, news }];
});

const extracts: unknown[] = [];
for (let i = 1; i <= runs; i++) {
  try {
    const got = await extract(client, cases.description, cases.today);
    extracts.push(got);
    console.log(`extract run ${i}: ${got.materials.map((m) => `${m.material} ${m.budget}`).join(", ")}; ${got.phases.map((p) => p.needMonth).join(", ")}`);
  } catch {
    extracts.push("failed");
    console.log(`extract run ${i}: failed`);
  }
  await sleep(PAUSE_MS);
}

const advice: AdviceRun[] = [];
for (let i = 1; i <= runs; i++) {
  const rejected: string[] = [];
  try {
    const got = await advise(client, materials, (m, code) => rejected.push(`${m} ${code}`));
    advice.push(Object.fromEntries(materials.map(({ input }) => [input.material, got.find((g) => g.material === input.material)?.action ?? null])));
    console.log(`advise run ${i}: ${got.map((g) => `${g.material} ${g.action}`).join(", ")}${rejected.length ? ` (rejected: ${rejected.join(", ")})` : ""}`);
    for (const g of got) console.log(`   ${g.material}: ${g.reason}`);
  } catch {
    advice.push("failed");
    console.log(`advise run ${i}: failed`);
  }
  if (i < runs) await sleep(PAUSE_MS);
}

const verdict = judge(
  extracts,
  advice,
  materials.map((m) => ({ material: m.input.material, hasLean: m.input.lean !== null })),
);
console.log(`\n${verdict.lines.join("\n")}\n${verdict.ok ? "PASS" : "FAIL"}: ${runs} runs each`);
process.exit(verdict.ok ? 0 : 1);
