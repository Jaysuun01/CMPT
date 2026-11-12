// The pinned jump bar over the results, with Start over at its right end.
import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/risk";

/** Jump links to each part of the results, pinned while scrolling, with the section in view marked as current. */
export function ResultsNav({ analysis, onStartOver, busy }: { analysis: Analysis; onStartOver: () => void; busy: boolean }) {
  const links = [
    { id: "advice", label: "Answer" },
    ...analysis.materials.map((m) => ({ id: `details-${m.material}`, label: m.name, material: m.material })),
    { id: "risk-drivers", label: "Energy and freight" },
  ];
  const key = links.map((l) => l.id).join(" ");
  const [current, setCurrent] = useState("advice");
  const list = useRef<HTMLUListElement>(null);

  // On a narrow screen the bar scrolls sideways; keep the current link in view (horizontally only, so the page never jumps).
  useEffect(() => {
    const ul = list.current;
    const a = ul?.querySelector<HTMLElement>('[aria-current="location"]');
    // The pinned Start over covers the right end, so a link under it counts as out of view.
    const pinned = ul?.querySelector<HTMLElement>(".nav-start")?.offsetWidth ?? 0;
    if (ul && a && (a.offsetLeft < ul.scrollLeft || a.offsetLeft + a.offsetWidth > ul.scrollLeft + ul.clientWidth - pinned)) {
      ul.scrollTo({ left: a.offsetLeft - 24 });
    }
  }, [current]);

  useEffect(() => {
    const order = key.split(" ");
    let frame = 0;
    // The current section is the last one whose top has passed under the bar; at the very bottom of the page, the last one,
    // since a short final section can never reach the top.
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      let now = order[0] as string;
      for (const id of order) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= 80) now = id;
      }
      if (max > 0 && window.scrollY >= max - 2) now = order.at(-1) as string;
      setCurrent(now);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);

  return (
    <nav className="results-nav" aria-label="Jump to a part of the results">
      <ul ref={list}>
        {links.map((l) => (
          <li key={l.id}>
            <a href={`#${l.id}`} aria-current={current === l.id ? "location" : undefined}>
              {"material" in l && <span className={`sw sw-${l.material}`} aria-hidden="true" />}
              {l.label}
            </a>
          </li>
        ))}
        {/* Last in the same row, pinned to its right end so it stays in view while the links scroll sideways. */}
        <li className="nav-start">
          <button type="button" className="link-btn" onClick={onStartOver} disabled={busy}>
            Start over
          </button>
        </li>
      </ul>
    </nav>
  );
}
