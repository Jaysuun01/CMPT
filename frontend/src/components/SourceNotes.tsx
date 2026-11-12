// The footer of the price page: where the data comes from and how to read it.
import type { Dataset } from "@/lib/dataset";
import { MONTH_NAMES } from "@/lib/months";

/** "2024-03-05" → "5 March 2024", without Date, so server and client match. */
function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

/** Data source, series ids, retrieval date and the caveats (index levels, not seasonally adjusted, preliminary months). */
export function SourceNotes({ dataset }: { dataset: Dataset }) {
  return (
    <footer className="foot">
      <p>
        Source: U.S. Bureau of Labor Statistics,{" "}
        {dataset.series.map((s, i) => (
          <span key={s.id}>
            {i > 0 && "; "}
            {s.title} ({s.id})
          </span>
        ))}
        . Retrieved from FRED, Federal Reserve Bank of St. Louis, on {longDate(dataset.retrievedOn)}.
      </p>
      <p>
        Monthly, not seasonally adjusted, reference base 1982 = 100. The latest {dataset.preliminaryMonths} months are preliminary and may be
        revised. These are broad indexes; a contract may name a narrower series. They track producer prices, not the delivered price of a
        specific item, and look back, not forward.
      </p>
    </footer>
  );
}
