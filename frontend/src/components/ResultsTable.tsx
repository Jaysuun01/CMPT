// The "Compare two months" results on the price page. Index levels, never dollars.
import type { Comparison } from "@/lib/compare";
import { index, pct, swing } from "@/lib/format";
import type { TrackerContext } from "./Tracker";

interface Props extends TrackerContext {
  from: number;
  to: number;
  rows: Comparison[];
}

/** The comparison table: each material between the two chosen months, with change and volatility. */
export function ResultsTable({ dataset, calendar, prelimStart, from, to, rows }: Props) {
  const p = (i: number) =>
    i >= prelimStart ? (
      <abbr title="Preliminary, may be revised" className="p">
        {" "}
        p
      </abbr>
    ) : null;
  return (
    <>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Change</th>
              <th scope="col">Factor</th>
              <th scope="col">Index, {calendar.label(from)}</th>
              <th scope="col">Index, {calendar.label(to)}</th>
              <th scope="col" className="left">
                Typical monthly move
              </th>
            </tr>
          </thead>
          <tbody>
            {dataset.series.map((s, k) => {
              const r = rows[k]!;
              return (
                <tr key={s.id}>
                  <th scope="row">
                    <span className="mname">
                      <span className={`sw sw-${s.key}`} aria-hidden="true" />
                      {s.name}
                    </span>
                    <span className="id">{s.id}</span>
                  </th>
                  <td className="chg">{pct(r.changePct)}</td>
                  <td>{r.factor === null ? "n/a" : r.factor.toFixed(3)}</td>
                  <td>
                    {index(r.base)}
                    {p(from)}
                  </td>
                  <td>
                    {index(r.current)}
                    {p(to)}
                  </td>
                  <td className="vol left">
                    {r.volatility === null ? "Not enough data" : `${swing(r.volatility)} a month`}
                    {r.norm && <span className="muted">{r.norm} its own 10-year norm</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Index values, 1982 = 100. p = preliminary. Factor = {calendar.label(to)} index ÷ {calendar.label(from)} index.
      </p>
    </>
  );
}
