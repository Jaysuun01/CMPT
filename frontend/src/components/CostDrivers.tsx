// Energy and freight costs from FRED, shown under the answer. Every figure is computed by the backend's code.
import { pct } from "@/lib/format";
import { monthLabel, type Driver } from "@/lib/risk";

const fr = (x: number | null) => pct(x === null ? null : x * 100, 1);

/** The latest value: dollars for fuel prices, one decimal for indexes, with "p" when it's preliminary. */
function latest(d: Driver, value: number) {
  const shown = d.unit.startsWith("$") ? `$${value.toFixed(2)}` : value.toFixed(1);
  return d.preliminary ? `${shown} p` : shown;
}

/** Energy and freight costs from FRED. Every figure comes from the backend's code; none from the AI. */
export function CostDrivers({ drivers }: { drivers: Driver[] | "failed" }) {
  if (drivers === "failed") return <p className="note">Energy and freight costs couldn&apos;t be loaded from FRED.</p>;
  const shown = drivers.filter((d) => d.available);
  const missing = drivers.filter((d) => !d.available).map((d) => d.name);
  return (
    <>
      {shown.length > 0 && (
        <div className="tw">
          <table className="reg-table cost-table">
            <caption className="sr-only">Energy and freight costs: latest value and recent changes</caption>
            <thead>
              <tr>
                <th scope="col">Cost</th>
                <th scope="col">Latest</th>
                <th scope="col">Over 3 months</th>
                <th scope="col">Over 12 months</th>
                <th scope="col">12-month change vs history</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id}>
                  <th scope="row">
                    {d.name}
                    <span className="id">
                      {d.unit}, {d.id}
                    </span>
                  </th>
                  {d.figures ? (
                    <>
                      <td data-label="Latest">
                        {latest(d, d.figures.value)}
                        <span className="muted reg-all">{monthLabel(d.figures.month)}</span>
                      </td>
                      <td data-label="Over 3 months">{fr(d.figures.change3)}</td>
                      <td data-label="Over 12 months">{fr(d.figures.change12)}</td>
                      <td data-label="12-month change vs history">
                        {d.figures.higherThan === null
                          ? "n/a"
                          : `Higher than ${d.figures.higherThan} of ${d.figures.compared} past 12-month changes`}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4}>The latest value is missing, so no figures are shown.</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {missing.length > 0 && <p className="note">Couldn&apos;t be loaded from FRED: {missing.join(", ")}.</p>}
      <p className="note">
        Drivers of production and delivery costs, shown for context; the similar-period analysis doesn&apos;t use them. Monthly data from FRED, not seasonally adjusted,
        so the 3-month change includes seasonal swings (fuel prices especially). Fuel prices are in dollars; freight figures are producer price indexes. p =
        preliminary, BLS may revise.
      </p>
    </>
  );
}
