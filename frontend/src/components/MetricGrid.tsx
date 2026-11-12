// The grid of small charts: every material × index level, month-over-month, year-over-year and volatility.
import { useMemo } from "react";
import { buildChart, extent } from "@/lib/chart";
import type { Measure } from "@/lib/dataset";
import { axisPct, index, pct, swing } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";
import { Plot } from "./Plot";
import type { TrackerContext } from "./Tracker";

/** How one measure is titled, explained, scaled and formatted. */
export interface MeasureDef {
  key: Measure;
  title: string;
  note: string;
  bar?: boolean;
  zero?: boolean;
  tick: (v: number) => string;
  show: (v: number | null) => string;
}

/** The four required measures, in display order (CLAUDE.md §1 definitions). */
export const MEASURES: MeasureDef[] = [
  { key: "values", title: "Index level", note: "1982 = 100", tick: (v) => String(v), show: index },
  { key: "mom", title: "Month-over-month", note: "Not seasonally adjusted", bar: true, zero: true, tick: axisPct, show: pct },
  { key: "yoy", title: "Year-over-year", note: "Against the same month a year earlier", zero: true, tick: axisPct, show: pct },
  { key: "volatility", title: "Volatility", note: "Standard deviation of the last 12 monthly changes", zero: true, tick: (v) => `${v}%`, show: swing },
];

interface Props extends TrackerContext {
  from: number;
  to: number;
  selected: number | null;
  /** Open the enlarged chart for this material and measure, showing `month` in detail. */
  onExpand: (seriesKey: string, measure: Measure, month: number) => void;
}

/** The required views: 4 measures × each material. Each row shares one y-scale. */
export function MetricGrid({ dataset, calendar, prelimStart, from, to, selected, onExpand }: Props) {
  // Every grid chart has the same width, so measuring the first one is enough.
  const [firstPlot, width] = useWidth<HTMLDivElement>(240);
  const rows = useMemo(
    () =>
      MEASURES.map((m) => {
        const slices = dataset.series.map((s) => s[m.key].slice(from, to + 1));
        const domain = extent(slices);
        return {
          ...m,
          charts: dataset.series.map((s, k) => ({
            series: s,
            latest: s[m.key][to] ?? null,
            geometry: buildChart([slices[k]!], { calendar, start: from, prelimStart, bar: m.bar, zero: m.zero, domain, yTickCount: 3, width }),
          })),
        };
      }),
    [dataset, calendar, prelimStart, from, to, width],
  );

  const span = `${calendar.label(from)} to ${calendar.label(to)}`;
  return (
    <section aria-labelledby="detail-h" className="section">
      <div className="head">
        <h2 id="detail-h">Month by month</h2>
        <p className="muted">Each row uses one scale for all three materials. Click a chart to enlarge it and see that month in detail.</p>
      </div>
      <div className="grid">
        <div aria-hidden="true" />
        {dataset.series.map((s) => (
          <div key={s.id} className="ghead" aria-hidden="true">
            <span className={`sw sw-${s.key}`} />
            {s.name}
          </div>
        ))}
        {rows.map((row) => (
          <div key={row.key} className="grid-row">
            <div className="rowlab">
              <h3>{row.title}</h3>
              <p className="muted">{row.note}</p>
            </div>
            {row.charts.map(({ series, latest, geometry }, k) => (
              <div key={series.id} className="cell">
                <div className="v">
                  <span className="cell-name" aria-hidden="true">
                    <span className={`sw sw-${series.key}`} />
                    {series.name}
                  </span>
                  <span>
                    {row.show(latest)} <span className="muted">{calendar.label(to)}</span>
                  </span>
                </div>
                <Plot
                  geometry={geometry}
                  keys={[series.key]}
                  ref={row.key === "values" && k === 0 ? firstPlot : undefined}
                  tickLabel={row.tick}
                  onPick={(i) => onExpand(series.key, row.key, from + i)}
                  markerPos={selected !== null && selected >= from && selected <= to ? geometry.x(selected - from) : null}
                  label={`${series.name}, ${row.title.toLowerCase()}, ${span}. Latest ${row.show(latest)}.`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
