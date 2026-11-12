// The enlarged chart dialog: one material and one measure, with summary figures.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { buildChart } from "@/lib/chart";
import type { Series } from "@/lib/dataset";
import { useWidth } from "@/lib/useWidth";
import type { MeasureDef } from "./MetricGrid";
import { MonthTable } from "./MonthTable";
import { Plot } from "./Plot";
import type { TrackerContext } from "./Tracker";

interface Props extends TrackerContext {
  series: Series;
  measure: MeasureDef;
  from: number;
  to: number;
  /** The month first shown below the chart (absolute index). Picking others stays inside this panel. */
  initialMonth: number;
  onClose: () => void;
}

/** One material and one measure, full size: summary stats plus a chart you can read month by month. */
export function ChartDetail({ dataset, calendar, prelimStart, series, measure, from, to, initialMonth, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [plotRef, width] = useWidth<HTMLDivElement>(820);
  const [hover, setHover] = useState<number | null>(null);
  // Local on purpose: exploring here must not change the page, so closing leaves it as it was.
  const [month, onPickMonth] = useState(initialMonth);
  const values = useMemo(() => series[measure.key].slice(from, to + 1), [series, measure, from, to]);
  const n = values.length;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const geometry = useMemo(
    () => buildChart([values], { calendar, start: from, prelimStart, bar: measure.bar, zero: measure.zero, yTickCount: 5, width }),
    [values, calendar, from, prelimStart, measure, width],
  );

  const stats = useMemo(() => {
    let hi: number | null = null;
    let lo: number | null = null;
    let sum = 0;
    let count = 0;
    values.forEach((v, i) => {
      if (v === null) return;
      if (hi === null || v > values[hi]!) hi = i;
      if (lo === null || v < values[lo]!) lo = i;
      sum += v;
      count++;
    });
    const at = (i: number | null) => (i === null ? "" : calendar.label(from + i));
    return [
      { label: "Latest", value: measure.show(values[n - 1] ?? null), when: calendar.label(to) },
      { label: "Highest", value: measure.show(hi === null ? null : values[hi]!), when: at(hi) },
      { label: "Lowest", value: measure.show(lo === null ? null : values[lo]!), when: at(lo) },
      { label: "Average", value: measure.show(count ? sum / count : null), when: `${calendar.label(from)} to ${calendar.label(to)}` },
    ];
  }, [values, measure, calendar, from, to, n]);

  const active = hover !== null && hover < n ? hover : null;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.querySelector(".plot")!.getBoundingClientRect();
    setHover(geometry.indexAt((e.clientX - r.left) / r.width));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPickMonth(from + (active ?? n - 1));
      return;
    }
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)));
  };
  const readout =
    active === null ? null : `${calendar.label(from + active, true)}${from + active >= prelimStart ? ", preliminary" : ""}: ${measure.show(values[active] ?? null)}`;

  return (
    <dialog ref={ref} className="detail chart-detail" aria-labelledby="chart-detail-title" onClose={onClose}>
      <div className="detail-head">
        <div>
          <h2 id="chart-detail-title">
            <span className={`sw sw-${series.key}`} aria-hidden="true" /> {series.name}: {measure.title}
          </h2>
          <p className="muted chart-detail-sub">
            {calendar.label(from, true)} to {calendar.label(to, true)}. {measure.note}.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => ref.current?.close()}>
          Close
        </button>
      </div>

      <dl className="chart-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="muted">{s.label}</dt>
            <dd>
              <b>{s.value}</b>
              <span className="muted">{s.when}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div
        className="chart-detail-wrap"
        role="group"
        aria-label="Chart. Point at it, or use the left and right arrow keys, to read each month. Click or press Enter to show that month below."
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const plot = e.currentTarget.querySelector(".plot")!.getBoundingClientRect();
          onPickMonth(from + geometry.indexAt((e.clientX - plot.left) / plot.width));
        }}
        onKeyDown={onKey}
      >
        <Plot
          ref={plotRef}
          geometry={geometry}
          keys={[series.key]}
          tickLabel={measure.tick}
          className="chart-detail-plot"
          markerPos={month >= from && month <= to ? geometry.x(month - from) : null}
          label={`${series.name}, ${measure.title.toLowerCase()}, ${calendar.label(from)} to ${calendar.label(to)}, enlarged.`}
        >
          {active !== null && (
            <>
              <div className="tipline" style={{ left: `${geometry.x(active)}%` }} aria-hidden="true" />
              <div
                className="tip"
                style={{ left: `${geometry.x(active)}%`, transform: geometry.x(active) > 60 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
                aria-hidden="true"
              >
                <div className="tip-h">
                  {calendar.label(from + active, true)}
                  {from + active >= prelimStart ? ", preliminary" : ""}
                </div>
                <b>{measure.show(values[active] ?? null)}</b>
              </div>
            </>
          )}
        </Plot>
      </div>
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>

      <section className="chart-detail-month" aria-labelledby="chart-detail-month-h">
        <h3 id="chart-detail-month-h">
          {calendar.label(month, true)}
          {month >= prelimStart && <span className="muted detail-p">, preliminary and may be revised</span>}
        </h3>
        <MonthTable dataset={dataset} calendar={calendar} month={month} />
      </section>
    </dialog>
  );
}
