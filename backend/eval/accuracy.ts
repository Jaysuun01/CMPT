// LLM accuracy check: runs steps 1 (extract) and 3 (classify) of the real Gemini integration on saved,
// hand-labeled inputs, so results are reproducible. Needs a key and makes network calls, so it is never
// part of `npm test` (it isn't a *.test.ts file). From the repo root:
//   node --env-file=backend/.env backend/eval/accuracy.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { CALL_TIMEOUT_MS, classify, createModels, extract, StepError } from "../src/risk/gemini.ts";

interface Cases {
  today: string;
  projects: { id: string; description: string; expect: { materials: Record<string, number | null>; needMonths: string[] } }[];
  developments: {
    materials: ("lumber" | "steel" | "concrete")[];
    items: { text: string; expect: { material: string; risk: string; topic: string; eventId: string } | null }[];
  };
}

// Stays under the app's own AI limit of 5 calls a minute.
const PAUSE_MS = 13_000;

// The HTTP status separates a temporary refusal (429, 503) from a real error.
const why = (err: unknown) =>
  err instanceof StepError ? `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}${err.finishReason ? ` (finish ${err.finishReason})` : ""}` : "unknown error";

const key = process.env.GEMINI_API_KEY?.trim();
if (process.env.GEMINI_MOCK === "1" || !key) {
  console.error("Set GEMINI_API_KEY in backend/.env and unset GEMINI_MOCK: this script measures the real model.");
  process.exit(1);
}
const client = { models: createModels(key), timeoutMs: CALL_TIMEOUT_MS };
const cases: Cases = JSON.parse(readFileSync(join(import.meta.dirname, "cases.json"), "utf8"));

let materialsOk = 0;
let monthsOk = 0;
let errors = 0;
for (const [i, c] of cases.projects.entries()) {
  if (i > 0) await sleep(PAUSE_MS);
  try {
    const got = await extract(client, c.description, cases.today);
    const materials = Object.fromEntries(got.materials.filter((m) => m.material).map((m) => [m.material, m.budget]));
    const months = got.phases.map((p) => p.needMonth).sort();
    const mOk = JSON.stringify(Object.entries(materials).sort()) === JSON.stringify(Object.entries(c.expect.materials).sort());
    const dOk = JSON.stringify(months) === JSON.stringify([...c.expect.needMonths].sort());
    if (mOk) materialsOk++;
    if (dOk) monthsOk++;
    console.log(`${mOk && dOk ? "ok  " : "MISS"} extract ${c.id}${mOk ? "" : `\n       materials: expected ${JSON.stringify(c.expect.materials)}, got ${JSON.stringify(materials)}`}${dOk ? "" : `\n       need months: expected ${c.expect.needMonths.join(",")}, got ${months.join(",")}`}`);
  } catch (err) {
    errors++;
    console.log(`FAIL extract ${c.id}: ${why(err)}`);
  }
}

await sleep(PAUSE_MS);
const items = cases.developments.items;
const devs = items.map((d, i) => ({ devId: i + 1, summary: d.text, sources: [{ url: "https://example.com", title: "saved" }] }));
const tally = { material: 0, risk: 0, topic: 0, event: 0, ignored: 0, relevant: 0, irrelevant: 0 };
try {
  const got = await classify(client, devs, cases.developments.materials);
  for (const [i, d] of items.entries()) {
    const entry = got.find((g) => g.devId === i + 1);
    if (d.expect === null) {
      tally.irrelevant++;
      if (!entry) tally.ignored++;
      console.log(`${entry ? "MISS" : "ok  "} classify #${i + 1} (irrelevant)${entry ? `: kept as ${entry.material}` : ""}`);
      continue;
    }
    tally.relevant++;
    const m = entry?.material === d.expect.material;
    const r = entry?.risk === d.expect.risk;
    const t = entry?.topic === d.expect.topic;
    const e = entry?.eventId === d.expect.eventId;
    tally.material += Number(m);
    tally.risk += Number(r);
    tally.topic += Number(t);
    tally.event += Number(e);
    const ok = m && r && t && e;
    console.log(`${ok ? "ok  " : "MISS"} classify #${i + 1}${ok ? "" : `: expected ${JSON.stringify(d.expect)}, got ${entry ? JSON.stringify({ material: entry.material, risk: entry.risk, topic: entry.topic, eventId: entry.eventId }) : "nothing"}`}`);
  }
} catch (err) {
  errors++;
  console.log(`FAIL classify: ${why(err)}`);
}

const n = cases.projects.length;
console.log(`\nModel run ${new Date().toISOString().slice(0, 10)}`);
console.log(`  extract: materials and budgets ${materialsOk}/${n}, need months ${monthsOk}/${n}`);
console.log(`  classify: material ${tally.material}/${tally.relevant}, risk ${tally.risk}/${tally.relevant}, topic ${tally.topic}/${tally.relevant}, past event ${tally.event}/${tally.relevant}, irrelevant ignored ${tally.ignored}/${tally.irrelevant}`);
console.log(`  errors: ${errors}`);
