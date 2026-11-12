// The advice step's code half (docs/ai-feature.md, "Advice"): the facts the model is given, the actions it may choose,
// and the checks on its reply. The history lean sets the suggestion; the model either confirms it or adds a supply
// warning ("lock-supply"), which it may only do when it cites a supply risk in the news. Its sentence holds no figures
// (they're shown beside it), and a reply that breaks a rule falls back to the history lean alone, for that material only.
import { monthFromNumber } from "../data/months.ts";
import type { Lean, Outlook, StrategyId } from "./analysis.ts";
import type { Material } from "./events.ts";

/** What the model may answer: the history lean's own action, or lock-supply (a supply warning). */
export const ACTIONS = ["buy-early", "as-needed", "split", "lock-supply"] as const;
/** One of ACTIONS. */
export type Action = (typeof ACTIONS)[number];
/** Longest reason the model may write, in characters. */
export const MAX_REASON = 160;
/** Most news items one reason may cite. */
export const MAX_CITED = 5;

/** The action that confirms each history lean. */
export const FOLLOW: Record<StrategyId, Action> = { asNeeded: "as-needed", allNow: "buy-early", firstHalf: "split" };
const LABEL: Record<StrategyId, string> = {
  asNeeded: "buying each phase as needed",
  allNow: "buying all future phases now",
  firstHalf: "buying the first half of phases now",
};

/** One figure from code, given to the model as context only; the model may never repeat it. */
export interface Fact {
  text: string;
  /** The figure itself, formatted by code. */
  cite: string;
}

/** One material's analysis, as the advice step needs it. Never includes the budget. */
export interface AdviceInput {
  material: Material;
  name: string;
  /** Today's month number, to name the need dates. */
  today: number;
  rate: number;
  outlook: Outlook[] | null;
  strategies: { id: StrategyId; median: number; min: number; max: number }[] | null;
  breakEven: { median: number; ahead: number; n: number; neverPaid: boolean } | null;
  lean: Lean | null;
  event: { name: string; moves: (number | null)[] } | null;
}

/** One classified news item, as the advice step sees it. */
export interface NewsItem {
  devId: number;
  summary: string;
  risk: "price" | "availability" | "both";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (n: number) => {
  const [y, m] = monthFromNumber(n).split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
const signed = (x: number) => `${x < 0 ? "−" : "+"}${Math.abs(x * 100).toFixed(1)}%`;
const rateText = (x: number) => `${(x * 100).toFixed(2)}% a month`;
const of = (k: number, n: number) => `${k} of ${n} similar periods`;

/** Every figure given to the model as context for one material (it may not repeat them). Budgets and dollars are never included. */
export function facts(input: AdviceInput): Fact[] {
  const out: Fact[] = [{ text: "The buyer's carrying cost for holding materials bought early", cite: rateText(input.rate) }];
  const n = input.lean?.n;
  if (input.lean) {
    out.push({
      text: `Across the most similar past periods, ${LABEL[input.lean.strategy]} had the lowest typical extra cost, and was the cheapest strategy in`,
      cite: of(input.lean.cheapest, input.lean.n),
    });
  }
  if (input.breakEven) {
    out.push({ text: "Buying all future phases now beat buying each phase as needed, at the buyer's carrying cost, in", cite: of(input.breakEven.ahead, input.breakEven.n) });
    if (!input.breakEven.neverPaid) out.push({ text: "Buying early would have paid off at carrying costs below a median of", cite: rateText(input.breakEven.median) });
  }
  for (const st of input.strategies ?? []) {
    out.push({ text: `${LABEL[st.id]}: typical extra cost, as a share of the material budget`, cite: `${signed(st.median)} of the budget` });
    out.push({ text: `${LABEL[st.id]}: range of extra cost across the similar periods`, cite: `${signed(st.min)} to ${signed(st.max)} of the budget` });
  }
  for (const o of input.outlook ?? []) {
    const when = monthLabel(input.today + o.months);
    out.push({ text: "A need date", cite: when });
    if (o.similar && n) {
      out.push({ text: `By ${when}, prices rose more than 5% in`, cite: of(o.similar.rose, n) });
      out.push({ text: `By ${when}, prices fell more than 5% in`, cite: of(o.similar.fell, n) });
    }
  }
  if (input.event) {
    out.push({ text: "The past event closest to the current news", cite: input.event.name });
    input.event.moves.forEach((m, i) => {
      const months = input.outlook?.[i]?.months;
      if (m !== null && months !== undefined) out.push({ text: `After ${input.event?.name}, prices moved`, cite: `${signed(m)} within ${months} months` });
    });
  }
  return out;
}

const supplyRisk = (d: NewsItem) => d.risk !== "price";

/** The history lean's own action, plus "lock-supply" when the news has a supply (availability) risk. */
export function allowedActions(input: AdviceInput, news: readonly NewsItem[]): Action[] {
  const out: Action[] = input.lean ? [FOLLOW[input.lean.strategy]] : [];
  if (news.some(supplyRisk)) out.push("lock-supply");
  return out;
}

// Any figure: digits in any script (\p{N}, which includes "３" and "¾"), percent signs,
// and numbers in words with their plurals, ordinals and multiples ("hundreds", "twentieth", "tenfold", "doubling").
// "one", "first", "second", "half" and "quarter" are left out: "no one", "the first half", "next quarter" are ordinary
// wording. "double-check" is allowed.
const NUMBER_WORDS = new RegExp(
  [
    String.raw`\p{N}|[%％]`,
    String.raw`\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen)(?:s|th|ths|fold)?\b`,
    String.raw`\b\w+ieths?\b`,
    String.raw`\b(?:thirds?|fifths?|eighths?|ninths?|twelfths?|twice|halved|percent|percentage|per cent)\b`,
    String.raw`\b(?:doubl|tripl|quadrupl)(?:e|es|ed|ing)\b(?!-check)`,
  ].join("|"),
  "iu",
);

/** One material's checked advice: the action, a tidied sentence with no figures, and the news it cites. */
export interface Advice {
  material: Material;
  action: Action;
  reason: string;
  devIds: number[];
}

/** check()'s result: the advice, or the code of the rule it broke (logged, never shown). */
export type Checked = { ok: true; advice: Advice } | { ok: false; code: string };

/** A capital first letter and closing punctuation, whatever the model sent. */
export const tidy = (text: string) => {
  const t = text.trim().replace(/[:;,\s]+$/, "");
  const capped = t.replace(/\p{L}/u, (c) => c.toUpperCase());
  return /[.!?…]["'”’)]*$/.test(capped) ? capped : `${capped}.`;
};

/** Checks one entry of the model's reply against the actions and news it was given. */
export function check(entry: { action: Action; reason: string; devIds: number[] }, input: AdviceInput, news: readonly NewsItem[]): Checked {
  if (!allowedActions(input, news).includes(entry.action)) return { ok: false, code: "action" };
  if (entry.reason.length > MAX_REASON) return { ok: false, code: "long" };
  const devIds = [...new Set(entry.devIds)];
  if (devIds.length > MAX_CITED || devIds.some((id) => !news.some((d) => d.devId === id))) return { ok: false, code: "dev-id" };
  // Locking prices or supply must rest on a supply risk the model actually cites.
  if (entry.action === "lock-supply" && !news.some((d) => devIds.includes(d.devId) && supplyRisk(d))) return { ok: false, code: "uncited" };
  if (NUMBER_WORDS.test(entry.reason)) return { ok: false, code: "number" };
  if (!/\p{L}/u.test(entry.reason)) return { ok: false, code: "empty" };
  return { ok: true, advice: { material: input.material, action: entry.action, reason: tidy(entry.reason), devIds } };
}
