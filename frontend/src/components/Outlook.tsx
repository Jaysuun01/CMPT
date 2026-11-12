// "Where prices went next" for one material: the similar-period outlook at each need date.
import { pct } from "@/lib/format";
import { monthLabel, type Outlook as Row } from "@/lib/risk";

const KEYS = ["rose", "within", "fell"] as const;
const LABEL = { rose: "Rose more than 5%", within: "Within ±5%", fell: "Fell more than 5%" };

interface Props {
  name: string;
  outlook: Row[];
  /** Need month for each horizon, in months after today. */
  needMonth: (months: number) => string;
  n: number;
  candidates: number;
}

/** Where prices went by each need date: the similar periods beside all periods, as split bars with the counts printed, and the range of moves. */
export function Outlook({ name, outlook, needMonth, n, candidates }: Props) {
  return (
    <>
      <ul className="ob-key" aria-hidden="true">
        {KEYS.map((k) => (
          <li key={k}>
            <span className={`ob-sw ob-${k}`} />
            {LABEL[k]}
          </li>
        ))}
      </ul>
      <table className="outlook">
        <caption className="sr-only">
          Where {name.toLowerCase()} prices went by each of your need dates, in the {n} most similar past periods and in all {candidates} comparable months
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">By</th>
            <th scope="col">What happened</th>
            <th scope="col">Lowest and highest move</th>
          </tr>
        </thead>
        <tbody>
          {outlook.map((o) => {
            const total = o.all.rose + o.all.within + o.all.fell;
            const share = (k: (typeof KEYS)[number]) => (total ? Math.round((o.all[k] / total) * 100) : 0);
            return (
              <tr key={o.months}>
                <th scope="row">
                  {monthLabel(needMonth(o.months))}
                  <span className="muted">{o.months} months</span>
                </th>
                <td>
                  {o.similar && (
                    <>
                      <Bar group={o.similar} size="big" />
                      <p className="ob-text">
                        Rose in {o.similar.rose}, within ±5% in {o.similar.within}, fell in {o.similar.fell} <span className="muted">of {n} similar periods</span>
                      </p>
                    </>
                  )}
                  <Bar group={o.all} size="small" />
                  <p className="ob-text muted">
                    Usually: rose {share("rose")}%, within {share("within")}%, fell {share("fell")}%
                  </p>
                </td>
                <td className="ob-range">
                  {o.low !== null && o.high !== null && (
                    <>
                      {pct(o.low * 100)} to {pct(o.high * 100)}
                      <span className="muted">lowest to highest</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** One split bar: rose / within ±5% / fell, sized by counts, with the counts in text beside it for screen readers. */
function Bar({ group, size }: { group: Row["all"]; size: "big" | "small" }) {
  const total = group.rose + group.within + group.fell || 1;
  return (
    <div className={`ob ob-${size}`} aria-hidden="true">
      {KEYS.map((k) => group[k] > 0 && <span key={k} className={`ob-${k}`} style={{ width: `${(group[k] / total) * 100}%` }} />)}
    </div>
  );
}
