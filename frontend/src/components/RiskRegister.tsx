// The per-material details under "The details behind it".
import { useRef } from "react";
import { pct, swing } from "@/lib/format";
import { dollars, monthLabel, type Analysis, type Development, type MaterialResult, type PastEventOption } from "@/lib/risk";
import { BreakEvenStrip } from "./BreakEvenStrip";
import { Outlook } from "./Outlook";

const STRATEGY: Record<string, string> = {
  asNeeded: "Buy each phase as needed",
  allNow: "Buy all future phases now",
  firstHalf: "Buy the first half of phases now",
};
const RISK = {
  price: "Price risk",
  availability: "Availability risk",
  both: "Price and availability risk",
};
// Display order for the news, by topic.
const TOPIC: Record<Development["topic"], string> = {
  trade: "Tariffs and trade",
  shipping: "Shipping and freight",
  conflict: "Conflicts and geopolitics",
  energy: "Energy",
  labor: "Labor",
  production: "Production and capacity",
  other: "Other",
};
const fr = (x: number | null | undefined) => pct(x == null ? x : x * 100);
const plain = (x: number) => `${(x * 100).toFixed(2)}%`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The news check's state for the whole page: off (no key), loading, failed (and at which step), or the items. */
export type NewsState =
  { state: "off" } | { state: "loading" } | { state: "failed"; step: "search" | "classify" | "other" } | { state: "ok"; developments: Development[] };

/** Why the news isn't shown, for the whole page, or null when it is. */
export function newsNote(news: NewsState): string | null {
  if (news.state === "off") return "Current news needs a Gemini key, so it isn't checked.";
  if (news.state === "loading") return "Checking current news…";
  if (news.state === "failed") {
    return `${
      news.step === "search"
        ? "News couldn't be checked. Searching the news needs a Gemini key on a paid tier, or the search limit was reached."
        : "News couldn't be checked."
    } The analysis runs without it.`;
  }
  return null;
}

interface Props {
  analysis: Analysis;
  result: MaterialResult;
  rate: number;
  events: PastEventOption[];
  eventId: string;
  onEvent: (id: string) => void;
  busy: boolean;
  news: NewsState;
  dismissed: ReadonlySet<number>;
  onDismiss: (devId: number) => void;
}

/** Why there's no comparison for a material, or null when there is one. */
function noAnswer(r: MaterialResult): string | null {
  if (r.status === "stale") return "The data ends more than 24 months before today, so the analysis is skipped.";
  if (r.status === "unmeasurable") return "Recent conditions can't be measured: a value they need is missing.";
  if (r.status === "tooFew") return `Too few similar periods to draw a pattern (${r.similar.length} found, 8 needed).`;
  if (r.noTimingDecision) return "Everything is needed this month, so there's no timing decision to compare.";
  return null;
}

/** One material's details: where prices went, what's different now (news and past event), and the budget figures. */
export function RiskRegister({ analysis, result: r, rate, events, eventId, onEvent, busy, news, dismissed, onDismiss }: Props) {
  const id = `reg-${r.material}`;
  const phases = analysis.phases;
  const n = r.similar.length;
  const half = Math.ceil(phases.length / 2);
  const own = events.filter((e) => e.materials.includes(r.material));
  const none = noAnswer(r);
  const needMonth = (months: number) => phases.find((p) => p.monthsAhead === months)?.needMonth ?? analysis.today;
  const outlook = r.outlook ?? [];
  const nowHeading = useRef<HTMLHeadingElement>(null);
  // The dismissed item's button disappears, so keep keyboard users in this material's news.
  const dismiss = (devId: number) => {
    onDismiss(devId);
    nowHeading.current?.focus();
  };
  return (
    <article className="reg" id={`details-${r.material}`} aria-labelledby={id}>
      <h3 id={id} className="reg-h">
        <span className="mname">
          <span className={`sw sw-${r.material}`} aria-hidden="true" />
          {r.name}
        </span>
        <span className="muted reg-sub">
          {dollars(r.budget)}, needed {list(phases.map((p) => monthLabel(p.needMonth)))}
        </span>
      </h3>
      {none && <p className="reg-none">{none}</p>}

      {outlook[0]?.similar && (
        <section className="reg-part" aria-labelledby={`${id}-outlook`}>
          <h4 id={`${id}-outlook`}>Where prices went next</h4>
          <p className="reg-lead">
            In the {n} past periods when {r.name.toLowerCase()} prices looked most like today, by each of your need dates, beside all {r.candidates?.count ?? 0}{" "}
            comparable months:
          </p>
          <Outlook name={r.name} outlook={outlook} needMonth={needMonth} n={n} candidates={r.candidates?.count ?? 0} />
        </section>
      )}

      <section className="reg-part" aria-labelledby={`${id}-now`}>
        <h4 id={`${id}-now`} ref={nowHeading} tabIndex={-1}>
          What&apos;s different now
        </h4>
        <News material={r.material} name={r.name} news={news} dismissed={dismissed} onDismiss={dismiss} events={events} />
        <div className="reg-event">
          <label htmlFor={`${id}-event`}>Closest past event</label>
          <select id={`${id}-event`} value={eventId} onChange={(e) => onEvent(e.target.value)} disabled={busy}>
            <option value="none">No close past event</option>
            {own.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {r.event ? (
            <>
              <p>
                {r.event.description}{" "}
                <a href={r.event.source} target="_blank" rel="noopener noreferrer">
                  Source
                </a>
              </p>
              {outlook.length > 0 && (
                <p>
                  After {monthLabel(r.event.month)}, {r.name.toLowerCase()} moved{" "}
                  {list(outlook.map((o, k) => `${r.event!.moves[k] == null ? "n/a (not enough data yet)" : fr(r.event!.moves[k])} within ${o.months} months`))}.
                  {r.event.costs.asNeeded == null
                    ? " Buying each phase as needed: not enough data yet."
                    : ` Buying each phase as needed would have cost ${fr(r.event.costs.asNeeded)} of the budget${
                        r.event.higherThan === null ? "." : `, higher than ${r.event.higherThan} of the ${n} similar periods.`
                      }`}
                </p>
              )}
              <p>
                What happened next: {r.event.next}{" "}
                <a href={r.event.nextSource} target="_blank" rel="noopener noreferrer">
                  Source
                </a>
              </p>
              <p className="note">One past case, shown on its own. Prices moved after it, not necessarily because of it.</p>
            </>
          ) : (
            <p className="note">No past event is matched, so none is shown.</p>
          )}
        </div>
      </section>

      {!none && r.strategies && r.breakEven && (
        <section className="reg-part" aria-labelledby={`${id}-budget`}>
          <h4 id={`${id}-budget`}>Your budget</h4>
          <div className="tw">
            <table className="reg-table">
              <caption className="sr-only">
                Extra cost of each buying strategy for {r.name}, across {n} similar periods
              </caption>
              <thead>
                <tr>
                  <th scope="col">Strategy</th>
                  <th scope="col">On your {dollars(r.budget)}</th>
                  <th scope="col">Typical</th>
                  <th scope="col">As a share of the budget</th>
                </tr>
              </thead>
              <tbody>
                {r.strategies.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">
                      {STRATEGY[s.id]}
                      {s.id === "firstHalf" && (
                        <span className="id">
                          first {half} of {phases.length} phases
                        </span>
                      )}
                    </th>
                    <td data-label={`On your ${dollars(r.budget)}`}>{s.min === s.max ? dollars(s.dollars.min) : `${dollars(s.dollars.min)} to ${dollars(s.dollars.max)}`}</td>
                    <td data-label="Typical">{dollars(s.dollars.median)}</td>
                    <td data-label="As a share of the budget">{s.min === s.max ? fr(s.min) : `${fr(s.min)} to ${fr(s.max)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Extra cost against today&apos;s prices, across the {n} similar periods. Buying now costs only carrying cost; buying later costs whatever the index moved.
            Negative means prices fell.
          </p>
          <p className="reg-be">
            {r.breakEven.neverPaid
              ? `In most similar periods, buying early didn't pay off at any carrying cost. At your ${plain(rate)} a month, it came out ahead in ${r.breakEven.ahead} of ${r.breakEven.n}.`
              : `Buying all future phases now came out ahead in ${r.breakEven.ahead} of ${r.breakEven.n} similar past periods at your ${plain(rate)} a month. It would have paid off at carrying costs below a median of ${plain(r.breakEven.median)} a month.`}
          </p>
        </section>
      )}

      <details className="reg-more">
        <summary>
          More on {r.name.toLowerCase()}
          <span className="muted"> {r.breakEven ? "break-even in each period, recent prices, method" : "recent prices, method"}</span>
        </summary>
        <div className="reg-grid">
          {!none && r.breakEven && (
            <>
              <div className="reg-k">Break-even in each period</div>
              <div className="reg-v">
                <BreakEvenStrip material={r.material} name={r.name} rates={r.breakEven.rates} similar={r.similar} rate={rate} ahead={r.breakEven.ahead} />
              </div>
            </>
          )}
          {r.recent && (
            <>
              <div className="reg-k">Recent prices</div>
              <div className="reg-v">
                <p>
                  As of {monthLabel(analysis.asOf)}, the latest final data, {r.name.toLowerCase()} moved {fr(r.recent.c6)} over 6 months, {fr(r.recent.c3)} over 3 and{" "}
                  {fr(r.recent.c12)} over 12, with a typical monthly move of {swing(r.recent.vol)}. Today is {monthLabel(analysis.today)}, {analysis.gap} months later, so
                  each past period is followed from {analysis.gap} months after its match.
                </p>
              </div>
            </>
          )}
          <div className="reg-k">Method</div>
          <div className="reg-v">
            <p className="note">
              Similar periods are judged by four price measures only, and are at least 6 months apart, but their price paths can overlap, so they aren&apos;t independent.
              {n > 0 && ` With ${n} periods, one count is worth about ${Math.round(100 / n)} points.`}
              {r.material === "concrete" && " Concrete rarely moves 5% over a few months, so it mostly lands in “within ±5%”."}
            </p>
          </div>
        </div>
      </details>
    </article>
  );
}

interface NewsProps {
  material: MaterialResult["material"];
  name: string;
  news: NewsState;
  dismissed: ReadonlySet<number>;
  onDismiss: (devId: number) => void;
  events: PastEventOption[];
}

/** One material's current risk factors, grouped by topic. The page explains once when there's no news at all. */
function News({ material, name, news, dismissed, onDismiss, events }: NewsProps) {
  if (news.state !== "ok") return null;
  const own = news.developments.filter((d) => d.material === material);
  const shown = own.filter((d) => !dismissed.has(d.devId));
  if (own.length === 0) return <p>No current risk factors found in the news.</p>;
  if (shown.length === 0) return <p className="note">You dismissed every development.</p>;
  return (
    <div className="news-list" role="region" aria-label={`Current risk factors for ${name}`}>
      {(Object.keys(TOPIC) as Development["topic"][])
        .map((t) => [t, shown.filter((d) => d.topic === t)] as const)
        .filter(([, ds]) => ds.length > 0)
        .map(([t, ds]) => (
          <section key={t} className="news-group" aria-labelledby={`news-${material}-${t}`}>
            <h5 id={`news-${material}-${t}`}>{TOPIC[t]}</h5>
            <ul className="news">
              {ds.map((d) => (
                <li key={d.devId}>
                  <p className="news-mat">{RISK[d.risk]}</p>
                  <p>
                    <span className="news-tag">AI summary of the news:</span> {d.summary}
                  </p>
                  <p className="news-meta">
                    {d.eventId !== "none" && events.some((e) => e.id === d.eventId) && `Closest past event: ${events.find((e) => e.id === d.eventId)?.name}. `}
                    {d.sources.map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ", "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                      </span>
                    ))}
                    {" · "}
                    <button type="button" className="linkish" onClick={() => onDismiss(d.devId)}>
                      Dismiss
                      <span className="sr-only">: {d.summary.slice(0, 60)}</span>
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      <p className="note">Figures in a summary are quoted from the news, not from this analysis.</p>
    </div>
  );
}
