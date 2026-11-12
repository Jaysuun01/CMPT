// "Should you buy now?": the first thing in the results. History sets each suggestion and its evidence;
// the AI can only add a supply warning, with the news it cites.
import { useEffect, useId, useRef, useState } from "react";
import { dollars, monthLabel, type Advice as AdviceItem, type Analysis, type Development, type MaterialResult } from "@/lib/risk";

/** Whether AI advice is available, and if not, why (each reason has its own message). */
export type AdviceState =
  | { state: "off" | "no-news" | "news-failed" | "failed" | "limit" | "expired" }
  | { state: "ok"; items: AdviceItem[] };

type Strategy = NonNullable<MaterialResult["lean"]>["strategy"];
// The history lean picks the way to buy; the AI's lock-supply only adds booking supply to the headline.
const CONSIDER: Record<Strategy, string> = {
  allNow: "Consider buying early",
  asNeeded: "Consider buying as each phase needs it",
  firstHalf: "Consider buying the first half now",
};
// With a supply warning the headline says how buying and booking fit together, so they never read as opposite advice.
const WITH_SUPPLY: Record<Strategy, string> = {
  allNow: "Consider buying early",
  asNeeded: "Consider buying as each phase needs it, but booking supply now",
  firstHalf: "Consider buying the first half now, and booking supply for the rest",
};
/** The line under a supply-warning headline, worded to fit what history suggests so the two never read as opposite advice. */
function supplyLine(strategy: Strategy | undefined): string {
  if (strategy === "allNow") return "The news shows a supply risk too, and buying early also covers it.";
  if (strategy === "firstHalf") return "Booking means reserving supply or fixing prices with your supplier for the later phases.";
  if (strategy) return "Booking means reserving supply or fixing prices with your supplier, not storing materials early.";
  return "The news shows a supply risk: consider reserving supply or fixing prices with your supplier for later deliveries.";
}
const WAY: Record<Strategy, string> = {
  allNow: "Buying early",
  asNeeded: "Buying as needed",
  firstHalf: "Buying the first half now",
};
const WHY_NO_AI: Record<Exclude<AdviceState["state"], "ok">, string> = {
  off: "AI advice needs a Gemini key, so these come from price history only.",
  "no-news": "There is no current news to weigh, so these come from price history only.",
  "news-failed": "These come from price history only, because the news couldn't be checked.",
  failed: "The AI advice couldn't be written, so these come from price history only.",
  limit: "The AI request limit was reached, so these come from price history only. Try again in a minute.",
  expired: "The news check expired, so these come from price history only. Run the check again for AI advice.",
};
const STRENGTH = { strong: "Strong evidence", moderate: "Moderate evidence", weak: "Weak evidence" } as const;

interface Props {
  analysis: Analysis;
  advice: AdviceState;
  developments: Development[];
  /** News the user dismissed; the advice step never sees it. */
  dismissed: ReadonlySet<number>;
  /** The user dismissed news or changed a past event since the advice was written. */
  stale: boolean;
  /** The next need date, when to look again. */
  reCheck: string | null;
  onRefresh: () => void;
  busy: boolean;
}

/** One tick per similar period; filled where the history lean was the cheapest way to buy. */
function Meter({ material, filled, n }: { material: string; filled: number; n: number }) {
  return (
    <span className="meter" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={i < filled ? `tick tick-${material}` : "tick"} />
      ))}
    </span>
  );
}

/** Why the evidence has its rating, in code's words, from the same numbers that set it. */
export function evidenceReason(lean: NonNullable<MaterialResult["lean"]>): string {
  const { cheapest: k, n } = lean;
  // Rounded down, so a share just under a cut-off never reads as reaching it.
  const pct = Math.floor((k * 100) / n);
  if (n < 15) return `Only ${n} comparable past periods were found; at least 15 are needed for a rating above weak.`;
  if (lean.strength === "strong") return `That's ${pct}% of past periods like today. Strong means at least 85%.`;
  if (lean.strength === "moderate") return `That's ${pct}% of past periods like today. Moderate means 60% to 84%; strong needs 85%.`;
  return `That's ${pct}%, under the 60% needed for moderate: the cheapest way to buy varied in past periods like today.`;
}

/**
 * "Why weak?": a show/hide button. A mouse hovering it or its text shows it; a click or tap opens or closes it;
 * Escape or a press outside closes it; focus leaving it closes it.
 */
function Why({ strength, text }: { strength: keyof typeof STRENGTH; text: string }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const open = hover || pinned;
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setHover(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // Safari doesn't focus a tapped button, so a press outside is what closes it there, not blur.
    const onDown = (e: PointerEvent) => !wrapper.current?.contains(e.target as Node) && close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <span
      ref={wrapper}
      className="ev-why"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setPinned(false)}
    >
      <button type="button" className="ev-why-btn" aria-expanded={open} aria-controls={id} onClick={() => {
          // A mouse hovers before it clicks, so the first click keeps it open; a click on a kept-open one closes it,
          // even with the mouse still over it.
          setPinned(!pinned);
          if (pinned) setHover(false);
        }}
      >
        Why {strength}?
      </button>
      {/* Focusable so clicking the text keeps focus inside, and the pinned state with it. */}
      <span id={id} className="ev-why-pop" tabIndex={-1} hidden={!open}>
        {text}
      </span>
    </span>
  );
}

/** The answer to "should I buy now?", first in the results. Evidence always comes from code, never from the AI. */
export function Advice({ analysis, advice, developments, dismissed, stale, reCheck, onRefresh, busy }: Props) {
  const items = advice.state === "ok" ? advice.items : [];
  return (
    <section className="advice" id="advice" aria-labelledby="advice-h">
      <h3 id="advice-h">Should you buy now?</h3>
      {advice.state !== "ok" && <p className="advice-why">{WHY_NO_AI[advice.state]}</p>}
      {advice.state === "ok" && stale && (
        <p className="advice-why">
          This advice was written before you dismissed news or changed a past event.{" "}
          <button type="button" className="btn btn-small" onClick={onRefresh} disabled={busy}>
            Refresh advice
          </button>
        </p>
      )}
      <ul className="advice-list">
        {analysis.materials.map((r) => {
          const ai = items.find((a) => a.material === r.material);
          // The items the AI cites; if it cites none, every item it was given for this material (all of them shaped its reading).
          const given = developments.filter((d) => d.material === r.material && !dismissed.has(d.devId));
          const cited = ai ? (ai.devIds.length ? developments.filter((d) => ai.devIds.includes(d.devId)) : given) : [];
          // One link per site, keyed by host (titles are set by the pages themselves): two articles from one site read as a repeat.
          const sources = [...new Map(cited.flatMap((d) => d.sources).map((s) => [new URL(s.url).hostname, s])).values()];
          const warn = ai?.action === "lock-supply";
          const headline = r.lean ? (warn ? WITH_SUPPLY : CONSIDER)[r.lean.strategy] : r.noTimingDecision ? "Nothing to time" : "Not enough history to compare";
          return (
            <li key={r.material} className="advice-row">
              <div className="advice-name">
                <span className={`sw sw-${r.material}`} aria-hidden="true" />
                <span>
                  {r.name}
                  <span className="advice-budget">{dollars(r.budget)}</span>
                  <a className="advice-more" href={`#details-${r.material}`}>
                    See the details <span className="sr-only">for {r.name.toLowerCase()}</span>
                  </a>
                </span>
              </div>

              <div className="advice-main">
                <p className="advice-head">{headline}</p>
                {warn && <p className="advice-warn">{supplyLine(r.lean?.strategy)}</p>}
                <p className="advice-reason">
                  {ai
                    ? ai.reason
                    : r.noTimingDecision
                      ? "Every phase is needed now, so there is no buying date to choose."
                      : !r.lean
                        ? "Too few comparable past periods to compare ways of buying."
                        : advice.state === "ok"
                          ? "No AI reading for this material: no news to weigh, or it didn't pass the app's checks."
                          : "From price history only."}
                </p>
                {ai && (
                  <p className="advice-src">
                    {cited.length > 0 ? `AI reading of ${cited.length} news item${cited.length > 1 ? "s" : ""}: ` : "AI reading: no current news for this material."}
                    {sources.map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ", "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </div>

              <div className="advice-ev">
                {r.lean ? (
                  <>
                    <p className={`ev-word ev-${r.lean.strength}`}>{STRENGTH[r.lean.strength]}</p>
                    <Meter material={r.material} filled={r.lean.cheapest} n={r.lean.n} />
                    <p className="ev-cap">
                      {WAY[r.lean.strategy]} was cheapest in {r.lean.cheapest} of {r.lean.n} past periods like today
                    </p>
                    <Why strength={r.lean.strength} text={evidenceReason(r.lean)} />
                  </>
                ) : (
                  <p className="ev-cap">No history comparison</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="advice-check">
        Check lead times and price-lock terms with your supplier before deciding, and run this again{" "}
        {reCheck ? `before ${monthLabel(reCheck)}, your next need date, or ` : ""}when new FRED data arrives.
      </p>
      <p className="note advice-note">
        Evidence comes from price history, not the AI: strong when one way of buying was cheapest in at least 85% of past periods like today, moderate at 60%,
        weak below that. The AI only reads the news: it can add a supply warning, never change which way to buy. Past periods aren&apos;t a forecast, and the AI
        can be wrong.
      </p>
    </section>
  );
}
