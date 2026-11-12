// The dialog opened by clicking a month on a chart.
import { useEffect, useRef } from "react";
import { MonthTable } from "./MonthTable";
import type { TrackerContext } from "./Tracker";

interface Props extends TrackerContext {
  month: number;
  onClose: () => void;
}

/** One month across all materials. */
export function MonthDetail({ dataset, calendar, prelimStart, month, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={ref} className="detail" aria-labelledby="detail-title" onClose={onClose}>
      <div className="detail-head">
        <h2 id="detail-title">
          {calendar.label(month, true)}
          {month >= prelimStart && <span className="muted detail-p">, preliminary and may be revised</span>}
        </h2>
        <button type="button" className="btn" onClick={() => ref.current?.close()}>
          Close
        </button>
      </div>
      <MonthTable dataset={dataset} calendar={calendar} month={month} />
    </dialog>
  );
}
