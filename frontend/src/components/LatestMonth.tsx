// The "latest month" panel at the top of the price page.
import { pct } from "@/lib/format";
import { MONTH_NAMES } from "@/lib/months";
import type { TrackerContext } from "./Tracker";

/** Tiles for the newest month: each material's index level, its change on the month and on the year. */
export function LatestMonth({ dataset, calendar }: TrackerContext) {
  const i = calendar.latest;
  return (
    <section aria-labelledby="latest-h" className="section latest">
      <div className="latest-lab">
        <h2 id="latest-h">{calendar.label(i, true)}</h2>
        <p className="muted">
          Latest month, compared with {MONTH_NAMES[calendar.month(i - 1)]} and with {calendar.label(i - 12, true)}.
        </p>
      </div>
      {dataset.series.map((s) => (
        <div key={s.id} className="mat">
          <span className="mname">
            <span className={`sw sw-${s.key}`} aria-hidden="true" />
            {s.name}
          </span>
          <span className="big">
            {pct(s.yoy[i])}
            <small> on the year</small>
          </span>
          <span className="muted">{pct(s.mom[i])} on the month</span>
        </div>
      ))}
    </section>
  );
}
