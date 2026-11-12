// A one-month table across all materials, used by the month detail dialog and the enlarged chart.
import type { Dataset } from "@/lib/dataset";
import { monthDetail } from "@/lib/detail";
import { index, pct, swing } from "@/lib/format";
import type { Calendar } from "@/lib/months";

/** One month across every material: index, MoM, YoY, volatility, and any standout move. */
export function MonthTable({ dataset, calendar, month }: { dataset: Dataset; calendar: Calendar; month: number }) {
  const rows = monthDetail(dataset, calendar, month);
  return (
    <div className="tw">
      <table className="detail-table">
        <thead>
          <tr>
            <th scope="col">Material</th>
            <th scope="col">Index</th>
            <th scope="col">Month-over-month</th>
            <th scope="col">Year-over-year</th>
            <th scope="col">Volatility</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <span className="mname">
                  <span className={`sw sw-${r.key}`} aria-hidden="true" />
                  {r.name}
                </span>
                {r.note && <span className="detail-note">{r.note}</span>}
              </th>
              <td data-label="Index">{index(r.index)}</td>
              <td data-label="Month-over-month">{pct(r.mom)}</td>
              <td data-label="Year-over-year">{pct(r.yoy)}</td>
              <td data-label="Volatility">{swing(r.volatility)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
