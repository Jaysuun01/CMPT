// GEMINI_MOCK=1: a stand-in for the SDK client that returns fixed raw responses, grounding metadata included,
// so the same parsing, validation and source-joining code runs with no network call (CLAUDE.md §2).
// The scenario is picked by what the route sent:
// - extract: a description containing MOCK_FAIL is blocked for safety
// - search: a concrete-only project fails, as on a key without search
// - classify: a lumber-only project gets malformed JSON
// - advise: a steel-only project gets malformed JSON
import type { Candidate, GenerateContentParameters } from "@google/genai";
import type { DriverSource } from "./drivers.ts";
import type { Models } from "./gemini.ts";

/** Today's month in mock mode, so E2E never depends on the real date. */
export const MOCK_TODAY = "2026-11";

const EXTRACTED = {
  materials: [
    { name: "Lumber", budget: 2_000_000 },
    { name: "Concrete", budget: 800_000 },
    { name: "Steel", budget: 200_000 },
  ],
  phases: [
    { needMonth: "2027-03", share: null },
    { needMonth: "2027-09", share: null },
    { needMonth: "2028-03", share: null },
  ],
};

// Each sentence is one grounded span. The em dash makes byte offsets differ from string offsets.
const SPANS = [
  { text: "Trade press reports that U.S. duties on Canadian softwood lumber were raised again this autumn — buyers expect higher lumber quotes.", chunks: [0] },
  { text: "Several steel mills reported longer lead times for rebar and structural shapes.", chunks: [1, 2] },
  { text: "Cement producers cited higher energy costs in recent concrete price announcements.", chunks: [3] },
  { text: "A claim with only an insecure source.", chunks: [2] },
];
const CHUNKS = [
  { web: { uri: "https://www.example.com/lumber-duties", title: "Example Trade News" } },
  { web: { uri: "https://www.example.org/steel-lead-times", title: "" } },
  { web: { uri: "http://insecure.example.net/claim", title: "Insecure" } },
  { web: { uri: "https://www.example.net/cement-energy", title: "Example Construction Daily" } },
];
const CLASSES: { keyword: string; entry: { material: string; risk: string; topic: string; eventId: string } }[] = [
  { keyword: "lumber", entry: { material: "lumber", risk: "price", topic: "trade", eventId: "softwood-duties-2017" } },
  { keyword: "steel", entry: { material: "steel", risk: "availability", topic: "production", eventId: "steel-232-2018" } },
  { keyword: "concrete", entry: { material: "concrete", risk: "price", topic: "energy", eventId: "energy-spike-2022" } },
];

const stop = (text: string, extra: Partial<Candidate> = {}) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] }, ...extra }] }) as { candidates: Candidate[] };

/** A grounded search reply built from SPANS and CHUNKS, with the byte offsets the real API reports. */
function searchReply() {
  let text = "";
  const supports = SPANS.map((s) => {
    const start = Buffer.byteLength(text);
    text += s.text;
    const end = Buffer.byteLength(text);
    text += " ";
    return { segment: { startIndex: start, endIndex: end }, groundingChunkIndices: s.chunks };
  });
  return stop(text.trimEnd(), { groundingMetadata: { groundingChunks: CHUNKS, groundingSupports: supports } } as Partial<Candidate>);
}

/** Classifies each fenced development in the prompt by keyword, so devIds match whatever spans survived. */
function classifyReply(contents: string) {
  const entries = [...contents.matchAll(/devId (\d+):\n<<<[^>]+>>>\n([\s\S]*?)\n<<<END-/g)].flatMap(([, id, text]) => {
    const match = CLASSES.find((c) => text?.toLowerCase().includes(c.keyword));
    return match ? [{ devId: Number(id), ...match.entry }] : [];
  });
  return stop(JSON.stringify({ entries }));
}

/**
 * Advice built from the prompt, like classifyReply: a material with an availability or both-risk news item gets "lock-supply",
 * citing it; any other follows its history lean. Like the real model, it writes no figures.
 */
function adviseReply(contents: string) {
  const advice = contents
    .split(/\n\n(?=Material: )/)
    .flatMap((block) => {
      const material = /^Material: (\w+)/m.exec(block)?.[1];
      const lean = /^History lean: ([\w-]+)/m.exec(block)?.[1];
      const supply = /^devId (\d+) \((availability|both) risk\)/m.exec(block)?.[1];
      if (!material) return [];
      if (supply) return [{ material, action: "lock-supply", reason: "mills report longer lead times, so booking supply with the supplier would protect the later phases", devIds: [Number(supply)] }];
      if (!lean || lean === "none") return [];
      return [{ material, action: lean, reason: "The current news doesn't change what history shows for this material.", devIds: [] }];
    });
  return stop(JSON.stringify({ advice }));
}

/** Stands in for the SDK's models object; picks the step from the request (tools, prompt prefix) and answers from fixtures. */
export const mockModels: Models = {
  async generateContent(params: GenerateContentParameters) {
    const contents = String(params.contents);
    if (params.config?.tools) {
      const materials = /^Materials: (.*)$/m.exec(contents)?.[1] ?? "";
      if (materials === "concrete products") throw Object.assign(new Error("Search isn't available on this key"), { status: 400 });
      return searchReply();
    }
    if (contents.startsWith("Project materials:")) {
      if (/^Project materials: lumber$/m.test(contents)) return stop("{ not json");
      return classifyReply(contents);
    }
    if (contents.startsWith("Advise:")) {
      if (!/^Material: (?!steel)/m.test(contents)) return stop("{ not json");
      return adviseReply(contents);
    }
    if (contents.includes("MOCK_FAIL")) return { candidates: [{ finishReason: "SAFETY" }] } as { candidates: Candidate[] };
    return stop(JSON.stringify(EXTRACTED));
  },
};

/** Fixed energy and freight series for mock mode: 36 months from 2023-10, rising 1 a month, so no network call is made. */
export const mockDrivers: DriverSource = {
  get: async () => ({ start: "2023-10", values: Array.from({ length: 36 }, (_, i) => 100 + i) }),
};
