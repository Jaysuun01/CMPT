"use client";
// Plan a purchase: describe the project, confirm the details, then the answer. The AI reads the description and
// the news; code computes every figure (docs/ai-feature.md).

import { useEffect, useRef, useState } from "react";
import {
  analyzeProject,
  checkNews,
  extractProject,
  getAdvice,
  getDrivers,
  getEvents,
  getStatus,
  MATERIALS,
  MAX_DESCRIPTION,
  MAX_PHASES,
  type Analysis,
  type Driver,
  type Extracted,
  type Material,
  type PastEventOption,
  type Project,
  type Window,
  monthLabel,
} from "@/lib/risk";
import { Advice, type AdviceState } from "./Advice";
import { ResultsNav } from "./ResultsNav";
import { CostDrivers } from "./CostDrivers";
import { newsNote, RiskRegister, type NewsState } from "./RiskRegister";

const NAMES: Record<Material, string> = { lumber: "Lumber and wood", steel: "Iron and steel", concrete: "Concrete products" };
const WINDOW_LABEL: Record<Window, string> = { "1970": "Since 1970", "1990": "Since 1990", all: "Full history" };

interface Form {
  materials: Record<Material, { on: boolean; budget: string }>;
  phases: { needMonth: string; share: string }[];
  carryingCost: string;
  window: Window;
}

const emptyForm = (): Form => ({
  materials: { lumber: { on: false, budget: "" }, steel: { on: false, budget: "" }, concrete: { on: false, budget: "" } },
  phases: [{ needMonth: "", share: "" }],
  carryingCost: "",
  window: "1970",
});

/** Plain decimals only, with optional thousands commas; anything else is not a number. */
function parse(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const money = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The description folded to about two lines, cut at a word. */
const excerpt = (s: string) => (s.length <= 200 ? s : `${s.slice(0, s.lastIndexOf(" ", 200) > 0 ? s.lastIndexOf(" ", 200) : 200)}…`);

/** Turns what the AI read into the confirm form, listing any materials it couldn't match. */
function fromExtracted(x: Extracted): { form: Form; unmatched: string[] } {
  const form = emptyForm();
  const unmatched: string[] = [];
  for (const m of x.materials) {
    if (!m.material) unmatched.push(m.name);
    else form.materials[m.material] = { on: true, budget: m.budget === null ? "" : money(m.budget) };
  }
  // An even split ("33.333…" three times) reads as blank, which already means even; any other share shows one decimal.
  const even = x.phases.every((p) => p.share !== null && Math.abs(p.share - 100 / x.phases.length) < 0.5);
  if (x.phases.length > 0) {
    form.phases = x.phases.map((p) => ({ needMonth: p.needMonth ?? "", share: p.share === null || even ? "" : String(Math.round(p.share * 10) / 10) }));
  }
  return { form, unmatched };
}

/** The request for the form, or the problems that stop it being sent. */
function toProject(f: Form, events: Partial<Record<Material, string>>): { project: Project } | { problems: string[] } {
  const problems: string[] = [];
  const materials = MATERIALS.filter((m) => f.materials[m].on).map((m) => {
    const budget = parse(f.materials[m].budget);
    if (budget === null) problems.push(`Enter the ${NAMES[m].toLowerCase()} budget as a number of dollars.`);
    return { material: m, budget: budget ?? 0, eventId: events[m] ?? "none" };
  });
  if (materials.length === 0) problems.push("Choose at least one material.");
  if (f.phases.some((p) => !p.needMonth)) problems.push("Give every phase a need month.");
  const anyShare = f.phases.some((p) => p.share.trim() !== "");
  const shares = f.phases.map((p) => parse(p.share));
  if (anyShare && shares.some((s) => s === null)) problems.push("Give every phase a share as a number, or leave all shares blank.");
  const carryingCost = parse(f.carryingCost);
  if (carryingCost === null) problems.push("Enter your carrying cost as a percent a month.");
  if (problems.length > 0) return { problems };
  return {
    project: {
      materials,
      phases: f.phases.map((p, i) => ({ needMonth: p.needMonth, ...(anyShare ? { share: shares[i] as number } : {}) })),
      carryingCost: carryingCost as number,
      window: f.window,
    },
  };
}

/** The Plan a purchase page. "Start over" remounts the check, so every field, answer and pending state is cleared at once. */
export function RiskCheck() {
  const [round, setRound] = useState(0);
  return <PlanCheck key={round} restarted={round > 0} onStartOver={() => setRound((r) => r + 1)} />;
}

/** The three-step check: describe, confirm the details, then the answer. Holds all of the page's state. */
function PlanCheck({ restarted, onStartOver }: { restarted: boolean; onStartOver: () => void }) {
  const [ai, setAi] = useState<boolean | null>(null);
  const [events, setEvents] = useState<PastEventOption[]>([]);
  const [description, setDescription] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [problems, setProblems] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ran, setRan] = useState<Project | null>(null);
  const [news, setNews] = useState<NewsState>({ state: "off" });
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  // The user's own event choices, and the defaults taken from the latest news; the user's choice wins.
  const [picked, setPicked] = useState<Partial<Record<Material, string>>>({});
  const [auto, setAuto] = useState<Partial<Record<Material, string>>>({});
  const [announce, setAnnounce] = useState("");
  const [drivers, setDrivers] = useState<Driver[] | "failed" | null>(null);
  // While a check runs, which parts have finished; null when no check is running. Results show only once all are done.
  const [progress, setProgress] = useState<{ history: boolean; news: boolean | null; costs: boolean | null; advice: boolean | null } | null>(null);
  const [advice, setAdvice] = useState<AdviceState>({ state: "off" });
  // What the advice was written from, to tell when dismissing news or changing an event has made it stale.
  const [adviceBasis, setAdviceBasis] = useState<string | null>(null);
  // A finished step folds to a one-line summary until the user edits it.
  const [editDescription, setEditDescription] = useState(true);
  const [editDetails, setEditDetails] = useState(true);
  const newsKey = useRef<string | null>(null);
  const newsId = useRef<string | null>(null);
  // A ref, not state: the first run can call analyze twice before a re-render.
  const driversAsked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // After "Start over", put focus back at the top of the page, where the fresh form begins.
  useEffect(() => {
    if (restarted) titleRef.current?.focus();
  }, [restarted]);
  const focusForm = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("input, select")?.focus());

  useEffect(() => {
    getStatus().then((r) => {
      setAi(r.ok && r.data.aiAvailable);
      if (!(r.ok && r.data.aiAvailable)) setShowForm(true);
    });
    getEvents().then((r) => r.ok && setEvents(r.data.events));
  }, []);

  function edit(next: Form) {
    setForm(next);
    setProblems([]);
  }

  async function read(e: React.FormEvent) {
    e.preventDefault();
    if (reading) return;
    setReading(true);
    setReadError(null);
    const r = await extractProject(description);
    setReading(false);
    if (r.ok) {
      const { form: f, unmatched: u } = fromExtracted(r.data);
      setForm(f);
      setUnmatched(u);
      setExtracted(true);
      setEditDescription(false);
      setPicked({});
      setAuto({});
      // A new project gets its own news check, even with the same materials and dates.
      newsKey.current = null;
    } else {
      setReadError(r.status === 400 && r.issues.length ? r.issues.join(" ") : "Couldn't read the description. Please fill in the form.");
      setExtracted(false);
    }
    // Either way the user is now working on a new project: open its form and drop the old answer.
    setEditDetails(true);
    setAnalysis(null);
    setRan(null);
    setRunError(null);
    setProblems([]);
    setShowForm(true);
    focusForm();
  }

  async function analyze(project: Project): Promise<boolean> {
    const r = await analyzeProject(project);
    if (r.ok) {
      setAnalysis(r.data);
      setRan(project);
      setRunError(null);
      setAnnounce("Answer updated.");
      return true;
    }
    // Never leave the previous project's results beside an error about this one.
    setAnalysis(null);
    setRan(null);
    if (r.status === 400 && r.issues.length) setProblems(r.issues);
    else setRunError("The analysis couldn't run. Please try again.");
    setAnnounce("The check couldn't run.");
    return false;
  }

  const eventFor = (m: Material, choices = picked, defaults = auto) => choices[m] ?? defaults[m] ?? "none";
  const basisOf = (project: Project, excluded: ReadonlySet<number>) => JSON.stringify([project.materials.map((m) => m.eventId ?? "none"), [...excluded].sort()]);

  /** AI advice for the project as finally analyzed; the history lean shows on its own whenever this can't run. */
  async function writeAdvice(project: Project, newsNow: NewsState, excluded: ReadonlySet<number>) {
    if (newsNow.state === "off") return setAdvice({ state: "off" });
    if (newsNow.state !== "ok" || !newsId.current) return setAdvice({ state: "news-failed" });
    if (!newsNow.developments.some((d) => !excluded.has(d.devId))) return setAdvice({ state: "no-news" });
    const r = await getAdvice(project, newsId.current, [...excluded]);
    setAdviceBasis(basisOf(project, excluded));
    if (r.ok) setAdvice({ state: "ok", items: r.data.advice });
    else setAdvice({ state: r.status === 429 ? "limit" : r.status === 409 ? "expired" : "failed" });
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (running) return;
    const built = toProject(form, Object.fromEntries(MATERIALS.map((m) => [m, eventFor(m)])));
    if ("problems" in built) {
      setProblems(built.problems);
      return;
    }
    setRunning(true);
    const { project } = built;
    const materials = project.materials.map((m) => m.material);
    const needMonths = project.phases.map((p) => p.needMonth);
    const key = JSON.stringify([materials, needMonths]);
    // News is checked once per confirmed project; carrying cost, window or event changes only re-run the analysis.
    const newsCall =
      ai && key !== newsKey.current
        ? (setNews({ state: "loading" }), setDismissed(new Set()), checkNews(materials, needMonths))
        : null;
    if (!ai) setNews({ state: "off" });
    // Energy and freight costs don't depend on the project: loaded on the first check, and again only after a failure.
    const costsCall = driversAsked.current ? null : ((driversAsked.current = true), getDrivers());
    setProgress({ history: false, news: newsCall ? false : null, costs: costsCall ? false : null, advice: ai ? false : null });
    const done = (part: "history" | "news" | "costs" | "advice") => setProgress((p) => p && { ...p, [part]: true });
    const [ok, newsResult] = await Promise.all([
      analyze(project).then((r) => (r && done("history"), r)),
      newsCall?.then((r) => (done("news"), r)) ?? null,
      costsCall?.then((r) => {
        setDrivers(r.ok ? r.data.drivers : "failed");
        if (!r.ok) driversAsked.current = false;
        done("costs");
      }),
    ]);
    let shown = ok;
    let final = project;
    // The news this check ends with: fresh from this run, or kept from the last run of the same project.
    let newsNow: NewsState = ai ? news : { state: "off" };
    let excluded = dismissed;
    if (newsResult) {
      excluded = new Set();
      if (newsResult.ok) {
        newsKey.current = key;
        newsId.current = newsResult.data.newsId;
        newsNow = { state: "ok", developments: newsResult.data.developments };
        setNews(newsNow);
        // Default each material's past event to its first development's match; the user's own choice still wins.
        const defaults: Partial<Record<Material, string>> = {};
        for (const m of materials) {
          const first = newsResult.data.developments.find((d) => d.material === m && d.eventId !== "none");
          if (first) defaults[m] = first.eventId;
        }
        setAuto(defaults);
        if (ok && materials.some((m) => eventFor(m, picked, defaults) !== eventFor(m))) {
          // Applying the news's past event re-runs the analysis, so that part is in progress again.
          setProgress((p) => p && { ...p, history: false });
          final = { ...project, materials: project.materials.map((m) => ({ ...m, eventId: eventFor(m.material, picked, defaults) })) };
          shown = await analyze(final);
        }
      } else {
        newsKey.current = null;
        newsId.current = null;
        // The app's own AI limit (429) reads the same as a search that couldn't run.
        newsNow = { state: "failed", step: newsResult.status === 429 ? "search" : (newsResult.step ?? "other") };
        setNews(newsNow);
      }
    }
    if (shown) {
      await writeAdvice(final, newsNow, excluded);
      done("advice");
    }
    setProgress(null);
    if (shown) {
      setEditDetails(false);
      requestAnimationFrame(() => answerRef.current?.focus());
    }
    setRunning(false);
  }

  async function refreshAdvice() {
    if (!ran || running) return;
    setRunning(true);
    await writeAdvice(ran, news, dismissed);
    setRunning(false);
  }

  async function chooseEvent(material: Material, id: string) {
    if (!ran || running) return;
    const next = { ...picked, [material]: id };
    setPicked(next);
    setRunning(true);
    await analyze({ ...ran, materials: ran.materials.map((m) => ({ ...m, eventId: eventFor(m.material, next) })) });
    setRunning(false);
  }

  const setMaterial = (m: Material, patch: Partial<Form["materials"][Material]>) =>
    edit({ ...form, materials: { ...form.materials, [m]: { ...form.materials[m], ...patch } } });
  const setPhase = (i: number, patch: Partial<Form["phases"][number]>) => edit({ ...form, phases: form.phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const describeStep = (
    <li className="step" aria-labelledby="step-describe">
      <h2 id="step-describe">Describe your project</h2>
      {!editDescription ? (
        <div className="step-done">
          <p className="step-sum">“{excerpt(description)}”</p>
          <button
            type="button"
            className="btn btn-small"
            aria-label="Edit the description"
            disabled={running}
            onClick={() => {
              setEditDescription(true);
              requestAnimationFrame(() => descRef.current?.focus());
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <form className="risk-describe" onSubmit={read} aria-label="Describe the project">
          <label htmlFor="risk-desc" className="sr-only">
            Describe the project
          </label>
          <p className="step-hint" id="risk-desc-hint">
            Say which materials, roughly how much of each, and when each phase needs them. The AI fills in the form for you to check.
          </p>
          <textarea
            ref={descRef}
            id="risk-desc"
            rows={4}
            maxLength={MAX_DESCRIPTION}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby="risk-desc-hint risk-desc-count"
          />
          <div className="risk-row">
            <span id="risk-desc-count" className="note">
              {description.length.toLocaleString("en-US")} / {MAX_DESCRIPTION.toLocaleString("en-US")} characters. Budgets go to Gemini; the news search sees only
              materials and dates.
            </span>
            <div className="btns">
              {!showForm && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setShowForm(true);
                    focusForm();
                  }}
                >
                  Fill in the form yourself
                </button>
              )}
              <button type="submit" className="btn primary" disabled={reading || running || description.trim() === ""}>
                {reading ? "Reading…" : "Read the description"}
              </button>
            </div>
          </div>
          {readError && (
            <p className="err" role="alert">
              {readError}
            </p>
          )}
        </form>
      )}
    </li>
  );

  const detailsStep = (
    <li className="step" aria-labelledby="risk-form-h">
      <h2 id="risk-form-h">{ai ? "Check the details" : "Enter your project"}</h2>
      {ai === false && (
        <p className="note step-hint">
          Describing the project in words and checking current news need a Gemini key in <code>backend/.env</code>. The analysis works without it.
        </p>
      )}
      {!showForm ? (
        <p className="step-later">Read a description first, or fill in the form yourself.</p>
      ) : !editDetails && ran ? (
        <div className="step-done">
          <p className="step-sum">
            {ran.materials.map((m) => `${NAMES[m.material]} $${money(m.budget)}`).join("; ")}. Needed {ran.phases.map((p) => monthLabel(p.needMonth)).join(", ")}.
            Carrying cost {ran.carryingCost}% a month, history {WINDOW_LABEL[ran.window].toLowerCase()}.
          </p>
          <button
            type="button"
            className="btn btn-small"
            aria-label="Edit the details"
            disabled={running}
            onClick={() => {
              setEditDetails(true);
              focusForm();
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <form ref={formRef} className="risk-form" onSubmit={run} aria-label={extracted ? "Check the details the AI read" : "Project details"} noValidate>
          {extracted && <p className="step-hint">The AI filled these in from your description. Edit anything that&apos;s wrong; nothing runs until you confirm.</p>}
          {unmatched.length > 0 && <p className="note">Not tracked here, so left out: {unmatched.join(", ")}.</p>}

          <fieldset className="risk-set">
            <legend>Materials and budgets</legend>
            {MATERIALS.map((m) => (
              <div key={m} className="risk-mat">
                <label className="mname">
                  <input type="checkbox" checked={form.materials[m].on} onChange={(e) => setMaterial(m, { on: e.target.checked })} />
                  <span className={`sw sw-${m}`} aria-hidden="true" />
                  {NAMES[m]}
                </label>
                <label className="risk-money">
                  <span className="sr-only">{NAMES[m]} budget in dollars</span>
                  <span aria-hidden="true">$</span>
                  <input
                    inputMode="decimal"
                    value={form.materials[m].budget}
                    disabled={!form.materials[m].on}
                    onChange={(e) => setMaterial(m, { budget: e.target.value })}
                    onBlur={(e) => {
                      const x = parse(e.target.value);
                      if (x !== null) setMaterial(m, { budget: money(x) });
                    }}
                    placeholder="Budget"
                  />
                </label>
              </div>
            ))}
          </fieldset>

          <fieldset className="risk-set">
            <legend>Phases</legend>
            <p className="note">Every material is bought in the same phases. Leave the shares blank to split each budget evenly.</p>
            <div className="risk-phase risk-phase-head" aria-hidden="true">
              <span />
              <span>Need month</span>
              <span>Share of budget</span>
            </div>
            {form.phases.map((p, i) => (
              <div key={i} className="risk-phase">
                <span className="risk-pn">Phase {i + 1}</span>
                <input type="month" value={p.needMonth} onChange={(e) => setPhase(i, { needMonth: e.target.value })} aria-label={`Phase ${i + 1} need month`} />
                <span className="risk-pct">
                  <input inputMode="decimal" value={p.share} placeholder="Even" onChange={(e) => setPhase(i, { share: e.target.value })} aria-label={`Phase ${i + 1} share, percent`} />%
                </span>
                {form.phases.length > 1 && (
                  <button type="button" className="btn btn-small" onClick={() => edit({ ...form, phases: form.phases.filter((_, j) => j !== i) })}>
                    Remove <span className="sr-only">phase {i + 1}</span>
                  </button>
                )}
              </div>
            ))}
            {form.phases.length < MAX_PHASES && (
              <button type="button" className="btn btn-small" onClick={() => edit({ ...form, phases: [...form.phases, { needMonth: "", share: "" }] })}>
                Add a phase
              </button>
            )}
          </fieldset>

          <div className="risk-pairs">
            <div className="risk-pair">
              <label htmlFor="risk-carry">Carrying cost</label>
              <span className="risk-pct">
                <input id="risk-carry" inputMode="decimal" value={form.carryingCost} onChange={(e) => edit({ ...form, carryingCost: e.target.value })} aria-describedby="risk-carry-hint" />% a
                month
              </span>
              <span id="risk-carry-hint" className="note">
                Storage, damage, theft and cash tied up. A common benchmark is 20–30% a year, about 1.7–2.5% a month; use your own.
              </span>
            </div>
            <div className="risk-pair">
              <label htmlFor="risk-window">History to compare with</label>
              <select id="risk-window" value={form.window} onChange={(e) => edit({ ...form, window: e.target.value as Window })}>
                {(Object.keys(WINDOW_LABEL) as Window[]).map((w) => (
                  <option key={w} value={w}>
                    {WINDOW_LABEL[w]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!progress && problems.length > 0 && (
            <ul className="err risk-problems" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <button type="submit" className="btn primary risk-run" disabled={running}>
            {running ? "Running…" : "Run the check"}
          </button>
          {!progress && runError && (
            <p className="err" role="alert">
              {runError}
            </p>
          )}
        </form>
      )}
    </li>
  );

  const note = newsNote(news);
  const answerStep = (
    <li className="step" aria-labelledby="step-answer">
      <h2 id="step-answer" ref={answerRef} tabIndex={-1}>
        Your answer
      </h2>
      {progress ? (
        <div className="risk-loading">
          <p className="risk-loading-h">
            <span className="spinner" aria-hidden="true" />
            Running the check. The results appear when every part is ready.
          </p>
          <ul>
            {(
              [
                ["history", "Comparing today with similar past periods"],
                ["news", "Checking current supply-chain news with Gemini"],
                ["costs", "Loading energy and freight costs from FRED"],
                ["advice", "Writing the advice with Gemini"],
              ] as const
            )
              .filter(([part]) => progress[part] !== null)
              .map(([part, label]) => (
                <li key={part} className={progress[part] ? "is-done" : undefined}>
                  <span aria-hidden="true">{progress[part] ? "✓" : "…"}</span> {label}
                  <span className="sr-only">{progress[part] ? ", done" : ", in progress"}</span>
                </li>
              ))}
          </ul>
        </div>
      ) : !(analysis && ran) ? (
        <p className="step-later">Run the check to see where prices went after past periods like today, and what that would mean for your budget.</p>
      ) : (
        <div className="risk-results">
          <ResultsNav analysis={analysis} onStartOver={onStartOver} busy={running} />
          <Advice
            analysis={analysis}
            advice={advice}
            reCheck={analysis.reCheck}
            developments={news.state === "ok" ? news.developments : []}
            dismissed={dismissed}
            stale={advice.state === "ok" && adviceBasis !== basisOf(ran, dismissed)}
            onRefresh={refreshAdvice}
            busy={running}
          />
          <h3 className="risk-details-h">The details behind it</h3>
          <p className="note step-hint">
            Each material is compared with the past periods whose prices looked most like {monthLabel(analysis.asOf)}, the latest final data. Today is{" "}
            {monthLabel(analysis.today)}, {analysis.gap} months later, so each past period is followed from the same point. This is what happened before, not a
            forecast.
          </p>
          {note && <p className="note risk-news-note">{note}</p>}
          {analysis.materials.map((r) => (
            <RiskRegister
              key={r.material}
              analysis={analysis}
              result={r}
              rate={ran.carryingCost / 100}
              events={events}
              eventId={eventFor(r.material)}
              onEvent={(id) => chooseEvent(r.material, id)}
              busy={running}
              news={news}
              dismissed={dismissed}
              onDismiss={(id) => setDismissed(new Set([...dismissed, id]))}
            />
          ))}

          <section className="risk-block" id="risk-drivers" aria-labelledby="risk-drivers-h">
            <h3 id="risk-drivers-h">Energy and freight costs</h3>
            {drivers && <CostDrivers drivers={drivers} />}
          </section>

          <div className="risk-notes note">
            <p>
              Assumptions: material costs move one-for-one with the national index (not seasonally adjusted; local prices differ); each phase&apos;s materials are bought in
              one purchase; carrying cost is a simple monthly rate on the value held; availability risks are described from the news, not measured.
            </p>
            <p>
              The advice rests on what happened in similar past periods and after similar past events, weighed against current news. It is not a price forecast;
              purchasing decisions should consider your own costs, contracts and supplier terms.
            </p>
          </div>

          <div className="start-new">
            <button type="button" className="btn" onClick={onStartOver} disabled={running}>
              Start a new plan
            </button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <div className="plan">
      <h1 ref={titleRef} tabIndex={-1}>
        Plan a purchase
      </h1>
      <p className="risk-lede">
        Should you buy materials now, or as each phase of the project needs them? This compares today&apos;s prices with similar past periods, checks current
        supply-chain news, and shows when buying early would have paid off. It shows what happened before, not a forecast.
      </p>
      <p className="sr-only" aria-live="polite">
        {running ? "Running the check…" : announce}
      </p>
      {ai !== null && (
        <ol className="steps">
          {ai && describeStep}
          {detailsStep}
          {answerStep}
        </ol>
      )}
    </div>
  );
}
