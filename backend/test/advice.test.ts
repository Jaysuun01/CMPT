import { describe, expect, it, vi } from "vitest";
import { allowedActions, check, facts, tidy, type AdviceInput } from "../src/risk/advice.ts";
import { lean } from "../src/risk/analysis.ts";
import { advise } from "../src/risk/gemini.ts";

describe("lean", () => {
  // asNeeded costs 0.01, 0.03, 0.05 (median 0.03); allNow costs 0.04 each (median 0.04).
  // asNeeded has the lower median; it is no dearer than allNow in periods 1 and 2 (0.01, 0.03 ≤ 0.04), not in 3.
  it("picks the lowest median and counts the periods where it was the cheapest", () => {
    const costs = [
      [0.01, 0.03, 0.05],
      [0.04, 0.04, 0.04],
    ];
    expect(lean([{ id: "asNeeded", median: 0.03 }, { id: "allNow", median: 0.04 }], costs)).toEqual({ strategy: "asNeeded", cheapest: 2, n: 3, strength: "weak" });
  });

  it("counts a tie in a period as cheapest, and breaks a tie in medians by display order", () => {
    const costs = [
      [0.04, 0.02],
      [0.04, 0.02],
    ];
    expect(lean([{ id: "asNeeded", median: 0.03 }, { id: "allNow", median: 0.03 }], costs)).toMatchObject({ strategy: "asNeeded", cheapest: 2 });
  });

  // n = 20: 17/20 = 0.85 is strong, 16/20 = 0.8 and 12/20 = 0.6 are moderate, 11/20 = 0.55 is weak.
  // n = 14 is below the 15 needed for anything above weak, even when it is always the cheapest.
  it.each([
    [17, 20, "strong"],
    [16, 20, "moderate"],
    [12, 20, "moderate"],
    [11, 20, "weak"],
    [14, 14, "weak"],
    [15, 15, "strong"],
  ])("rates %i of %i cheapest as %s", (k, n, strength) => {
    // allNow costs 0.05 throughout; asNeeded is 0 in the first k periods and 0.1 after, with a median set below 0.05.
    const asNeeded = Array.from({ length: n }, (_, p) => (p < k ? 0 : 0.1));
    const allNow = Array.from({ length: n }, () => 0.05);
    expect(lean([{ id: "asNeeded", median: 0 }, { id: "allNow", median: 0.05 }], [asNeeded, allNow])).toEqual({ strategy: "asNeeded", cheapest: k, n, strength });
  });
});

const INPUT: AdviceInput = {
  material: "steel",
  name: "Iron and steel",
  today: 2026 * 12 + 10, // Nov 2026
  rate: 0.01,
  outlook: [{ months: 11, similar: { rose: 8, within: 8, fell: 4 }, all: { rose: 300, within: 300, fell: 55 }, low: -0.395, high: 0.197 }],
  strategies: [
    { id: "asNeeded", median: 0.034, min: -0.372, max: 0.23 },
    { id: "allNow", median: 0.08, min: 0.08, max: 0.08 },
  ],
  breakEven: { median: 0.0042, ahead: 4, n: 20, neverPaid: false },
  lean: { strategy: "asNeeded", cheapest: 14, n: 20, strength: "moderate" },
  event: { name: "2018 Section 232 steel tariffs", moves: [0.066] },
};
const NEWS = [
  { devId: 3, summary: "Mills extended rebar lead times to about 10 weeks.", risk: "availability" as const },
  { devId: 5, summary: "Scrap prices fell.", risk: "price" as const },
];

describe("facts", () => {
  it("states every figure as code's own text, with no budget or dollars", () => {
    const f = facts(INPUT);
    expect(f.map((x) => x.cite)).toEqual([
      "1.00% a month",
      "14 of 20 similar periods",
      "4 of 20 similar periods",
      "0.42% a month",
      "+3.4% of the budget",
      "−37.2% to +23.0% of the budget",
      "+8.0% of the budget",
      "+8.0% to +8.0% of the budget",
      "Oct 2027",
      "8 of 20 similar periods",
      "4 of 20 similar periods",
      "2018 Section 232 steel tariffs",
      "+6.6% within 11 months",
    ]);
    expect(f.map((x) => x.text).join(" ")).not.toMatch(/\$/);
  });

  it("leaves out figures that don't exist: outlook counts with too few periods, and event moves with no data yet", () => {
    const f = facts({
      ...INPUT,
      outlook: [{ months: 11, similar: null, all: { rose: 300, within: 300, fell: 55 }, low: null, high: null }],
      event: { name: "2018 Section 232 steel tariffs", moves: [null] },
    });
    expect(f.some((x) => x.text.startsWith("By Oct 2027, prices rose"))).toBe(false);
    expect(f.some((x) => x.text.startsWith("After 2018"))).toBe(false);
    // The need date and the event's name are still given.
    expect(f.map((x) => x.cite)).toEqual(expect.arrayContaining(["Oct 2027", "2018 Section 232 steel tariffs"]));
  });

  it("leaves out the break-even median when buying early mostly never paid", () => {
    const f = facts({ ...INPUT, breakEven: { median: -0.003, ahead: 0, n: 20, neverPaid: true } });
    expect(f.some((x) => x.text.startsWith("Buying early would have paid off"))).toBe(false);
  });
});

describe("allowedActions", () => {
  it("offers the history lean's own action, plus lock-supply only when the news has a supply risk", () => {
    expect(allowedActions(INPUT, NEWS)).toEqual(["as-needed", "lock-supply"]);
    expect(allowedActions(INPUT, [NEWS[1] as (typeof NEWS)[number]])).toEqual(["as-needed"]);
    expect(allowedActions({ ...INPUT, lean: { strategy: "firstHalf", cheapest: 12, n: 20, strength: "moderate" } }, [])).toEqual(["split"]);
    // Never buy-early against a lean of buying as needed, however the news reads.
    expect(allowedActions(INPUT, NEWS)).not.toContain("buy-early");
  });

  it("offers nothing without a lean unless there is a supply risk", () => {
    expect(allowedActions({ ...INPUT, lean: null }, [NEWS[1] as (typeof NEWS)[number]])).toEqual([]);
    expect(allowedActions({ ...INPUT, lean: null }, NEWS)).toEqual(["lock-supply"]);
  });
});

describe("tidy", () => {
  it.each([
    ["  the news adds nothing", "The news adds nothing."],
    ["Lead times are longer:", "Lead times are longer."],
    ["Mills call it \"tight.\"", "Mills call it \"tight.\""],
    ["Supply may tighten…", "Supply may tighten…"],
    ["\"tight\" supply is reported", "\"Tight\" supply is reported."],
    ["Is supply at risk?", "Is supply at risk?"],
  ])("tidies %j", (raw, want) => {
    expect(tidy(raw)).toBe(want);
  });
});

describe("check", () => {
  const ok = (entry: Parameters<typeof check>[0], input = INPUT) => check(entry, input, NEWS);

  it("passes advice that follows the lean, tidying the sentence", () => {
    expect(ok({ action: "as-needed", reason: "  the news doesn't change the picture for steel", devIds: [] })).toEqual({
      ok: true,
      advice: { material: "steel", action: "as-needed", reason: "The news doesn't change the picture for steel.", devIds: [] },
    });
  });

  it("rejects an action the history doesn't allow", () => {
    expect(ok({ action: "buy-early", reason: "Tariffs are rising.", devIds: [3] })).toEqual({ ok: false, code: "action" });
    expect(ok({ action: "split", reason: "Hedge.", devIds: [3] })).toEqual({ ok: false, code: "action" });
  });

  it("allows lock-supply only when it cites a supply-risk item", () => {
    expect(ok({ action: "lock-supply", reason: "Securing supply protects the later phase.", devIds: [] })).toEqual({ ok: false, code: "uncited" });
    // devId 5 is a price risk only.
    expect(ok({ action: "lock-supply", reason: "Securing supply protects the later phase.", devIds: [5] })).toEqual({ ok: false, code: "uncited" });
    expect(ok({ action: "lock-supply", reason: "Longer lead times make securing supply worth considering.", devIds: [3, 3] })).toMatchObject({
      ok: true,
      advice: { action: "lock-supply", devIds: [3] },
    });
  });

  it("counts a both-risk item as a supply risk, and a price-only one as not", () => {
    const both = [{ devId: 7, summary: "Mill outages and price rises.", risk: "both" as const }];
    expect(allowedActions(INPUT, both)).toEqual(["as-needed", "lock-supply"]);
    expect(check({ action: "lock-supply", reason: "Mill outages could delay supply.", devIds: [7] }, INPUT, both)).toMatchObject({ ok: true });
  });

  it("rejects news items the material wasn't given, and too many citations", () => {
    expect(ok({ action: "as-needed", reason: "Fine.", devIds: [9] })).toEqual({ ok: false, code: "dev-id" });
    const six = [1, 2, 3, 4, 5, 6].map((devId) => ({ devId, summary: "a", risk: "availability" as const }));
    expect(check({ action: "lock-supply", reason: "Lock supply.", devIds: [1, 2, 3, 4, 5, 6] }, INPUT, six)).toEqual({ ok: false, code: "dev-id" });
  });

  it("rejects an over-long or empty reason", () => {
    expect(ok({ action: "as-needed", reason: "a".repeat(161), devIds: [] })).toEqual({ ok: false, code: "long" });
    expect(ok({ action: "as-needed", reason: "a".repeat(160), devIds: [] })).toMatchObject({ ok: true });
    expect(ok({ action: "as-needed", reason: "   ", devIds: [] })).toEqual({ ok: false, code: "empty" });
    expect(ok({ action: "as-needed", reason: " , ", devIds: [] })).toEqual({ ok: false, code: "empty" });
  });

  it.each([
    ["a fact marker", "It was cheapest in [F2]."],
    ["a digit", "Lead times are about 10 weeks."],
    ["a percentage", "Prices could rise 5%."],
    ["a year", "This looks like 2018."],
    ["a number word", "Prices rose in twenty past cases."],
    ["a spelled percentage", "About eight percent higher."],
    ["a multiple", "Prices could double."],
    ["a plural number word", "Hundreds of tonnes are delayed."],
    ["an ordinal", "A third of the phases is at risk."],
    ["a percent sign", "A double-digit % rise."],
    ["the word percentage", "A percentage rise is likely."],
    ["a -ieth ordinal", "The twentieth delay this year."],
    ["a plural ordinal", "Two fifths of supply is affected."],
    ["a tenfold rise", "Freight rose tenfold."],
    ["doubling", "Lead times are doubling."],
    ["halved", "Output was halved."],
    ["per cent", "Up eight per cent."],
    ["a full-width digit", "Up ３０ points."],
    ["a fraction character", "About ¾ of mills."],
  ])("rejects a reason with %s", (_, reason) => {
    expect(ok({ action: "as-needed", reason, devIds: [] })).toEqual({ ok: false, code: "number" });
  });

  it("allows ordinary wording that only looks numeric", () => {
    for (const reason of [
      "No one phase is at risk; buy the first half later as needed.",
      "Double-check lead times with a second supplier.",
      "Mills announced increases for next quarter; buy the second half later.",
      "Prices are in the first of several rounds; a single supplier is a risk, so double-checking terms helps.",
    ]) {
      expect(ok({ action: "as-needed", reason, devIds: [] }), reason).toMatchObject({ ok: true });
    }
  });
});

describe("advise", () => {
  const PRICE = [NEWS[1] as (typeof NEWS)[number]];
  const reply = (advice: unknown[]) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ advice }) }] } }] });

  it("never sends a material with nothing to choose (no lean, no supply risk), and makes no call when none is left", async () => {
    const generateContent = vi.fn();
    const out = await advise({ models: { generateContent }, timeoutMs: 1000 }, [{ input: { ...INPUT, lean: null }, news: PRICE }], vi.fn());
    expect(out).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("lets the model leave out a material without a lean, but logs a missing one that has a lean", async () => {
    const generateContent = vi.fn().mockResolvedValue(reply([]));
    const onReject = vi.fn();
    await advise({ models: { generateContent }, timeoutMs: 1000 }, [{ input: { ...INPUT, lean: null }, news: NEWS }, { input: { ...INPUT, material: "lumber" }, news: [] }], onReject);
    expect(onReject.mock.calls).toEqual([["lumber", "missing"]]);
    const sent = String(generateContent.mock.calls[0]?.[0].contents);
    expect(sent).toMatch(/^Material: steel[^]*?^History lean: none/m);
    expect(sent).toMatch(/^Allowed actions: lock-supply$/m);
  });
});
