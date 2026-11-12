import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BreakEvenStrip } from "@/components/BreakEvenStrip";
import { evidenceReason } from "@/components/Advice";
import { RiskCheck } from "@/components/RiskCheck";
import { SiteHeader } from "@/components/SiteHeader";

// The backend is stood in for by a fetch stub: each route answers from `routes`, and every request is recorded.
type Handler = (body: unknown) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
let routes: Record<string, Handler>;
let calls: { path: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  routes = {
    status: () => ({ body: { aiAvailable: true, demo: false } }),
    events: () => ({ body: { events: EVENTS } }),
    extract: () => ({ body: EXTRACTED }),
    news: () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV] } }),
    analyze: () => ({ body: analysis() }),
    drivers: () => ({ body: { drivers: DRIVERS } }),
    advise: () => ({ body: { advice: [ADVICE] } }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("/api/risk/", "");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      const handler = routes[path];
      if (!handler) throw new Error(`Unexpected ${url}`);
      const r = await handler(body);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    }),
  );
});

const EVENTS = [
  { id: "steel-232-2018", name: "2018 Section 232 steel tariffs", month: "2018-03", materials: ["steel"] },
  { id: "financial-crisis-2008", name: "2008 financial crisis", month: "2008-09", materials: ["lumber", "steel", "concrete"] },
];
const EXTRACTED = {
  materials: [
    { name: "Steel", material: "steel", budget: 200000 },
    { name: "Glass", material: null, budget: 5000 },
  ],
  phases: [
    { needMonth: "2027-03", share: null },
    { needMonth: "2027-09", share: null },
  ],
};
const NEWS_ID = "a".repeat(32);
const AREAS_OK = { trade: "ok", shipping: "ok", energy: "ok", weather: "ok", production: "ok", conflict: "ok" };
const ADVICE = {
  material: "steel",
  action: "lock-supply",
  reason: "Mills report longer lead times, so booking supply with the supplier would protect the later phase.",
  devIds: [1],
};
const DEV = {
  devId: 1,
  summary: "Mills report longer steel lead times.",
  sources: [{ url: "https://news.example.com/steel", title: "Steel Daily" }],
  material: "steel",
  risk: "availability",
  topic: "production",
  eventId: "steel-232-2018",
};
const driver = (id: string, name: string, unit: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  unit,
  preliminary: !unit.startsWith("$"),
  available: true,
  figures: { month: "2026-10", value: 2.99, change3: 0.05, change12: -0.12, higherThan: 86, compared: 345 },
  ...over,
});
const DRIVERS = [
  driver("MHHNGSP", "Natural gas, Henry Hub spot price", "$ per million BTU"),
  driver("PCU483111483111", "Ocean freight, deep-sea freight PPI", "index, Jun 1988 = 100", { figures: { month: "2026-09", value: 534.796, change3: null, change12: 0.3, higherThan: 446, compared: 447 } }),
];
const group = (rose: number, within: number, fell: number) => ({ rose, within, fell });

function steel(over: Record<string, unknown> = {}) {
  return {
    material: "steel",
    name: "Iron and steel",
    seriesId: "WPU101",
    budget: 200000,
    status: "ok",
    recent: { c3: 0.05, c6: 0.16, c12: 0.07, vol: 2.48 },
    candidates: { count: 655, first: "1970-01", last: "2024-07" },
    similar: Array.from({ length: 20 }, (_, i) => `${1971 + i}-01`),
    // The steel figures from the independent script, at the two need dates below (4 and 10 months).
    outlook: [
      { months: 4, similar: group(5, 14, 1), all: group(110, 492, 53), low: -0.336, high: 0.177 },
      { months: 10, similar: group(9, 7, 4), all: group(256, 302, 97), low: -0.419, high: 0.385 },
    ],
    noTimingDecision: false,
    strategies: [
      { id: "asNeeded", boughtNow: [], median: 0.055, min: -0.36, max: 0.14, dollars: { median: 11000, min: -72000, max: 28000 } },
      { id: "allNow", boughtNow: [0, 1], median: 0.2, min: 0.2, max: 0.2, dollars: { median: 40000, min: 40000, max: 40000 } },
    ],
    // Hand-picked: three periods above the 2% test rate and one exactly at it (not ahead).
    breakEven: { median: 0.0055, ahead: 3, n: 20, neverPaid: false, rates: [0.03, 0.025, 0.021, 0.02, ...Array.from({ length: 16 }, (_, i) => -0.004 + i * 0.001)] },
    lean: { strategy: "asNeeded", cheapest: 14, n: 20, strength: "moderate" },
    event: null,
    ...over,
  };
}
function analysis(materials = [steel()]) {
  return {
    today: "2026-11",
    asOf: "2026-05",
    gap: 6,
    windowStart: "1970-01",
    phases: [
      { needMonth: "2027-03", monthsAhead: 4, share: 0.5 },
      { needMonth: "2027-09", monthsAhead: 10, share: 0.5 },
    ],
    reCheck: "2027-03",
    materials,
  };
}

// Typing and re-rendering the whole form can pass the default 1 s wait when test files run in parallel.
const SLOW = 5000;
const register = (name: string) => screen.getByRole("article", { name: new RegExp(name) });
// Each material lists its own news; the fixture's news is all steel.
const newsBlock = () => within(register("Iron and steel")).getByRole("region", { name: "Current risk factors for Iron and steel" });

async function describeAndRead(user: ReturnType<typeof userEvent.setup>) {
  render(<RiskCheck />);
  const box = await screen.findByRole("textbox", { name: "Describe the project" });
  await user.type(box, "Steel");
  await user.click(screen.getByRole("button", { name: "Read the description" }));
  await screen.findByRole("form", { name: "Check the details the AI read" }, { timeout: SLOW });
  await focusSettles();
}

// The form moves focus to its first field on the next frame; wait so typing doesn't race it.
const focusSettles = () =>
  waitFor(() => expect(screen.getByRole("form", { name: /^(Check the details the AI read|Project details)$/ })).toContainElement(document.activeElement as HTMLElement));

/** After a run the details fold to a summary; this opens them again. */
async function editDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Edit the details" }, { timeout: SLOW }));
  await focusSettles();
}

async function run(user: ReturnType<typeof userEvent.setup>, carrying = "2") {
  if (!screen.queryByRole("textbox", { name: /Carrying cost/ })) await editDetails(user);
  const field = screen.getByRole("textbox", { name: /Carrying cost/ });
  await user.clear(field);
  await user.type(field, carrying);
  await user.click(screen.getByRole("button", { name: "Run the check" }));
  await screen.findByRole("button", { name: "Edit the details" }, { timeout: SLOW });
}

describe("RiskCheck without a key", () => {
  it("explains the key, skips the description box and runs from the form", async () => {
    routes.status = () => ({ body: { aiAvailable: false, demo: false } });
    const user = userEvent.setup();
    render(<RiskCheck />);
    expect(await screen.findByText(/need a Gemini key/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Describe the project" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /Iron and steel/ }));
    await user.type(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" }), "200,000");
    await user.type(screen.getByLabelText("Phase 1 need month"), "2027-03");
    await run(user);
    expect(calls.find((c) => c.path === "analyze")?.body).toEqual({
      materials: [{ material: "steel", budget: 200000, eventId: "none" }],
      phases: [{ needMonth: "2027-03" }],
      carryingCost: 2,
      window: "1970",
    });
    expect(calls.some((c) => c.path === "news" || c.path === "extract")).toBe(false);
    expect(screen.getByText(/Current news needs a Gemini key/)).toBeInTheDocument();
  });

  it("treats a failed status call as no key", async () => {
    routes.status = () => ({ status: 500, body: { error: "Something went wrong" } });
    render(<RiskCheck />);
    expect(await screen.findByText(/need a Gemini key/)).toBeInTheDocument();
  });
});

describe("RiskCheck with the AI", () => {
  it("fills the form from the description and flags materials it doesn't track", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    expect(screen.getByRole("checkbox", { name: /Iron and steel/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Lumber and wood/ })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" })).toHaveValue("200,000");
    expect(screen.getAllByLabelText(/need month$/).map((i) => (i as HTMLInputElement).value)).toEqual(["2027-03", "2027-09"]);
    expect(screen.getByText(/Not tracked here, so left out: Glass/)).toBeInTheDocument();
    // Nothing runs until the user confirms.
    expect(calls.some((c) => c.path === "analyze")).toBe(false);
  });

  it("falls back to the manual form when the description can't be read", async () => {
    routes.extract = () => ({ status: 502, body: { error: "SERVER TEXT that must not be shown" } });
    const user = userEvent.setup();
    render(<RiskCheck />);
    await user.type(await screen.findByRole("textbox", { name: "Describe the project" }), "MOCK_FAIL");
    await user.click(screen.getByRole("button", { name: "Read the description" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read the description. Please fill in the form.");
    expect(screen.queryByText(/SERVER TEXT/)).toBeNull();
    expect(screen.getByRole("form", { name: "Project details" })).toBeInTheDocument();
  });

  it("treats a reply that fails the schema as a failure", async () => {
    routes.extract = () => ({ body: { ...EXTRACTED, extra: true } });
    const user = userEvent.setup();
    render(<RiskCheck />);
    await user.type(await screen.findByRole("textbox", { name: "Describe the project" }), "x");
    await user.click(screen.getByRole("button", { name: "Read the description" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read the description");
  });

  it("runs the analysis and the news, shows the register, and sends no budget to the news", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const reg = register("Iron and steel");
    await within(newsBlock()).findByText("Mills report longer steel lead times.", { selector: "p" }, { timeout: SLOW });
    expect(calls.find((c) => c.path === "news")?.body).toEqual({ materials: ["steel"], needMonths: ["2027-03", "2027-09"] });
    expect(within(reg).getByText(/came out ahead in 3 of 20 similar past periods at your 2.00% a month/)).toBeInTheDocument();
    expect(within(reg).getByText(/below a median of 0.55% a month/)).toBeInTheDocument();
    expect(within(reg).getByRole("row", { name: /Buy each phase as needed/ })).toHaveTextContent("−$72,000 to $28,000");
    // Sep 2027 is 10 months out. Usually: 256, 302 and 97 of 655 are 39%, 46% and 15%.
    const sep = within(reg).getByRole("row", { name: /Sep 2027/ });
    expect(sep).toHaveTextContent("10 months");
    expect(sep).toHaveTextContent("Rose in 9, within ±5% in 7, fell in 4 of 20 similar periods");
    expect(sep).toHaveTextContent("Usually: rose 39%, within 46%, fell 15%");
    expect(sep).toHaveTextContent("−41.9% to +38.5%");
    expect(within(reg).getByRole("row", { name: /Mar 2027/ })).toHaveTextContent("Rose in 5, within ±5% in 14, fell in 1");
    expect(screen.getByText(/most like May 2026, the latest final data\. Today is Nov 2026, 6 months later/)).toBeInTheDocument();
    const link = within(newsBlock()).getByRole("link", { name: "Steel Daily" });
    expect(link).toHaveAttribute("href", "https://news.example.com/steel");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(newsBlock()).getByText("AI summary of the news:")).toBeInTheDocument();
    expect(within(newsBlock()).getByText("Availability risk")).toBeInTheDocument();
    expect(screen.getByText(/run this again before Mar 2027, your next need date, or when new FRED data arrives\./)).toBeInTheDocument();
    expect(screen.getByText(/weighed against current news\. It is not a price forecast/)).toBeInTheDocument();
  });

  it("defaults the past event to the news match, re-running only the analysis", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze")).toHaveLength(2), { timeout: SLOW });
    const second = calls.filter((c) => c.path === "analyze")[1]?.body as { materials: { eventId: string }[] };
    expect(second.materials[0]?.eventId).toBe("steel-232-2018");
    expect(screen.getByRole("combobox", { name: "Closest past event" })).toHaveValue("steel-232-2018");
    expect(calls.filter((c) => c.path === "news")).toHaveLength(1);
  });

  it("changing the event or the carrying cost re-runs only the analysis", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze")).toHaveLength(2), { timeout: SLOW });
    await user.selectOptions(screen.getByRole("combobox", { name: "Closest past event" }), "financial-crisis-2008");
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze")).toHaveLength(3));
    expect((calls.at(-1)?.body as { materials: { eventId: string }[] }).materials[0]?.eventId).toBe("financial-crisis-2008");
    await run(user, "1.5");
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze")).toHaveLength(4));
    expect(calls.filter((c) => c.path === "news")).toHaveLength(1);
  });

  it("doesn't check the news again when only the budget or the history window changes", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await editDetails(user);
    await user.type(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" }), "0");
    await user.selectOptions(screen.getByRole("combobox", { name: "History to compare with" }), "1990");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze").length).toBeGreaterThanOrEqual(3), { timeout: SLOW });
    expect(calls.filter((c) => c.path === "news")).toHaveLength(1);
    // The advice then runs on the same project, after the analysis.
    expect((calls.filter((c) => c.path === "analyze").at(-1)?.body as { window: string }).window).toBe("1990");
  });

  it("updates the automatic event default when new news matches a different event, but keeps the user's own choice", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Closest past event" })).toHaveValue("steel-232-2018"), { timeout: SLOW });
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, eventId: "financial-crisis-2008" }] } });
    await editDetails(user);
    let second = screen.getAllByLabelText(/need month$/)[1] as HTMLElement;
    await user.clear(second);
    await user.type(second, "2027-10");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Closest past event" })).toHaveValue("financial-crisis-2008"), { timeout: SLOW });

    await user.selectOptions(screen.getByRole("combobox", { name: "Closest past event" }), "none");
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV] } });
    await editDetails(user);
    second = screen.getAllByLabelText(/need month$/)[1] as HTMLElement;
    await user.clear(second);
    await user.type(second, "2027-11");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "news")).toHaveLength(3), { timeout: SLOW });
    await screen.findByRole("button", { name: "Edit the details" }, { timeout: SLOW });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Closest past event" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "Closest past event" })).toHaveValue("none");
  });

  it("clears the previous results when a re-run fails", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    routes.analyze = () => ({ status: 500, body: { error: "Something went wrong" } });
    await editDetails(user);
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    expect(await screen.findByText("The analysis couldn't run. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("checks the news again when the materials or dates change", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await editDetails(user);
    await user.type(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" }), "0");
    await user.clear(screen.getAllByLabelText(/need month$/)[1] as HTMLElement);
    await user.type(screen.getAllByLabelText(/need month$/)[1] as HTMLElement, "2027-10");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "news")).toHaveLength(2));
  });

  it("dismisses a development on the page only", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await within(newsBlock()).findByText("Mills report longer steel lead times.", { selector: "p" }, { timeout: SLOW });
    const before = calls.length;
    await user.click(within(newsBlock()).getByRole("button", { name: /Dismiss/ }));
    expect(within(register("Iron and steel")).queryByText(/Mills report/)).toBeNull();
    // The advice above was written with that news, so it says so instead of re-running on its own.
    expect(screen.getByText(/This advice was written before you dismissed news or changed a past event/)).toBeInTheDocument();
    expect(within(register("Iron and steel")).getByText("You dismissed every development.")).toBeInTheDocument();
    // What was searched is still shown, so a dismissed page never hides an area that couldn't be checked.
    expect(within(register("Iron and steel")).getByText(/^Also checked, nothing current found:/)).toBeInTheDocument();
    expect(within(register("Iron and steel")).getByRole("heading", { name: "What's different now" })).toHaveFocus();
    expect(calls.length).toBe(before);
  });

  it("states the news status once for the page, however many materials", async () => {
    routes.analyze = () => ({ body: analysis([steel(), steel({ material: "lumber", name: "Lumber and wood", seriesId: "WPU08" })]) });
    routes.news = () => ({ status: 502, body: { error: "News couldn't be checked.", step: "classify" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await screen.findByText(/^News couldn't be checked\./, {}, { timeout: SLOW });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByText(/News couldn't be checked/)).toHaveLength(1);
  });

  it("says when search is unavailable, and the analysis still runs", async () => {
    routes.news = () => ({ status: 502, body: { error: "News couldn't be checked.", step: "search" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/needs a Gemini key on a paid tier/)).toBeInTheDocument();
    expect(within(register("Iron and steel")).getByText(/came out ahead in 3 of 20/)).toBeInTheDocument();
  });

  it("hides the news when classify fails", async () => {
    routes.news = () => ({ status: 502, body: { error: "News couldn't be checked.", step: "classify" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/^News couldn't be checked\. The analysis runs without it\./)).toBeInTheDocument();
    expect(screen.queryByText(/AI summary/)).toBeNull();
  });

  it("treats the app's own AI limit like a search that couldn't run", async () => {
    routes.news = () => ({ status: 429, body: { error: "Too many requests" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/search limit was reached/)).toBeInTheDocument();
  });

  it("rejects a news reply with a non-https source", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, sources: [{ url: "javascript:alert(1)", title: "x" }] }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/News couldn't be checked/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "x" })).toBeNull();
  });

  it("says when no news was found for a material", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await within(register("Iron and steel")).findByText("No current risk factors found in the news.")).toBeInTheDocument();
  });

  it("disables the event picker while the analysis re-runs", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze")).toHaveLength(2), { timeout: SLOW });
    let release: (v: { body: unknown }) => void = () => {};
    routes.analyze = () => new Promise((r) => (release = r));
    const picker = screen.getByRole("combobox", { name: "Closest past event" });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.selectOptions(picker, "financial-crisis-2008");
    expect(screen.getByRole("combobox", { name: "Closest past event" })).toBeDisabled();
    release({ body: analysis() });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Closest past event" })).toBeEnabled());
  });

  it("disables the run button while a request is in flight", async () => {
    let release: (v: { body: unknown }) => void = () => {};
    // Hold only the first analysis; the results also wait for the re-run that applies the news's past event.
    routes.analyze = () => {
      routes.analyze = () => ({ body: analysis() });
      return new Promise((r) => (release = r));
    };
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    expect(screen.getByRole("button", { name: "Running…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit the description" })).toBeDisabled();
    release({ body: analysis() });
    await screen.findByRole("article");
  });
});

describe("RiskCheck form problems", () => {
  it("lists problems found before sending, and sends nothing", async () => {
    routes.status = () => ({ body: { aiAvailable: false, demo: false } });
    const user = userEvent.setup();
    render(<RiskCheck />);
    await screen.findByText(/need a Gemini key/);
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Choose at least one material.");
    expect(alert).toHaveTextContent("Give every phase a need month.");
    expect(alert).toHaveTextContent("Enter your carrying cost as a percent a month.");
    expect(calls.some((c) => c.path === "analyze")).toBe(false);
  });

  it("shows the backend's reasons for a rejected project", async () => {
    routes.analyze = () => ({ status: 400, body: { error: "Bad request", issues: ["Need dates can't be in the past"] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Need dates can't be in the past");
  });

  it("rejects shares on only some phases", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: "Phase 1 share, percent" }), "40");
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give every phase a share as a number, or leave all shares blank.");
  });
});

describe("RiskRegister states", () => {
  async function show(result: ReturnType<typeof steel>) {
    routes.analyze = () => ({ body: analysis([result]) });
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    return register("Iron and steel");
  }

  it("too few similar periods: no percentages or strategies", async () => {
    const reg = await show(steel({ status: "tooFew", similar: ["2001-01", "2010-01"], outlook: steel().outlook.map((o) => ({ ...o, similar: null, low: null, high: null })), strategies: null, breakEven: null }));
    expect(within(reg).getByText(/Too few similar periods to draw a pattern \(2 found, 8 needed\)/)).toBeInTheDocument();
    expect(within(reg).queryByText(/Break-even/)).toBeNull();
    expect(within(reg).queryByRole("table")).toBeNull();
  });

  it("recent conditions can't be measured", async () => {
    const reg = await show(steel({ status: "unmeasurable", recent: null, strategies: null, breakEven: null, outlook: null }));
    expect(within(reg).getByText(/Recent conditions can't be measured/)).toBeInTheDocument();
    expect(within(reg).queryByRole("heading", { name: "Where prices went next" })).toBeNull();
    expect(within(reg).queryByRole("heading", { name: "Your budget" })).toBeNull();
  });

  it("data out of date", async () => {
    const reg = await show(steel({ status: "stale", recent: null, strategies: null, breakEven: null, outlook: null }));
    expect(within(reg).getByText(/more than 24 months before today/)).toBeInTheDocument();
    expect(within(reg).queryByRole("heading", { name: "Where prices went next" })).toBeNull();
    expect(within(reg).queryByRole("heading", { name: "Your budget" })).toBeNull();
  });

  it("no timing decision", async () => {
    // As the backend sends it: no future need date, so no outlook, and only buying as needed.
    const reg = await show(steel({ noTimingDecision: true, breakEven: null, outlook: [], strategies: [steel().strategies[0]] }));
    expect(within(reg).getByText(/no timing decision to compare/)).toBeInTheDocument();
    expect(within(reg).queryByRole("heading", { name: "Where prices went next" })).toBeNull();
    expect(within(reg).queryByRole("heading", { name: "Your budget" })).toBeNull();
  });

  it("buying early never paid off", async () => {
    const reg = await show(steel({ breakEven: { median: 0, ahead: 0, n: 20, neverPaid: true, rates: Array.from({ length: 20 }, () => 0) } }));
    expect(within(reg).getByText(/In most similar periods, buying early didn't pay off at any carrying cost/)).toBeInTheDocument();
  });

  it("a past event, with not enough data yet for some horizons", async () => {
    const reg = await show(
      steel({
        event: {
          id: "steel-232-2018",
          name: "2018 Section 232 steel tariffs",
          month: "2018-03",
          description: "A 25% tariff took effect.",
          next: "Canada and Mexico were exempted in May 2019.",
          source: "https://www.govinfo.gov/a",
          nextSource: "https://www.govinfo.gov/b",
          moves: [0.066, null],
          costs: { asNeeded: null, allNow: 0.2 },
          higherThan: null,
        },
      }),
    );
    expect(within(reg).getByText(/moved \+6\.6% within 4 months and n\/a \(not enough data yet\) within 10 months/)).toBeInTheDocument();
    expect(within(reg).getByText(/Buying each phase as needed: not enough data yet/)).toBeInTheDocument();
    expect(within(reg).getByText(/not necessarily because of it/)).toBeInTheDocument();
    for (const link of within(reg).getAllByRole("link", { name: "Source" })) expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("RiskCheck renders model text as plain text", () => {
  it("never turns a summary into markup", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, summary: "<img src=x onerror=alert(1)> steel news" }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await within(newsBlock()).findByText("<img src=x onerror=alert(1)> steel news", { selector: "p" }, { timeout: SLOW })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Plan a purchase steps", () => {
  it("folds each finished step to a summary, and Edit opens it with the values kept", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    expect(screen.queryByRole("textbox", { name: "Describe the project" })).toBeNull();
    expect(screen.getByText("“Steel”")).toBeInTheDocument();

    await run(user);
    expect(screen.queryByRole("form", { name: "Check the details the AI read" })).toBeNull();
    expect(screen.getByText("Iron and steel $200,000. Needed Mar 2027, Sep 2027. Carrying cost 2% a month, history since 1970.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your answer" })).toHaveFocus());

    await editDetails(user);
    expect(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" })).toHaveValue("200,000");
    expect(screen.getByRole("textbox", { name: /Carrying cost/ })).toHaveValue("2");
    await user.click(screen.getByRole("button", { name: "Edit the description" }));
    expect(screen.getByRole("textbox", { name: "Describe the project" })).toHaveValue("Steel");
  });

  it("checks the news again for a newly read project, even with the same materials and dates", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "analyze")).toHaveLength(2), { timeout: SLOW });
    await user.click(screen.getByRole("button", { name: "Edit the description" }));
    await user.click(screen.getByRole("button", { name: "Read the description" }));
    await screen.findByRole("form", { name: "Check the details the AI read" }, { timeout: SLOW });
    await focusSettles();
    await run(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "news")).toHaveLength(2), { timeout: SLOW });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Closest past event" })).toHaveValue("steel-232-2018"), { timeout: SLOW });
  });

  it("shortens a long description at a word, or at 200 characters when it has no spaces", async () => {
    routes.extract = () => ({ body: EXTRACTED });
    const user = userEvent.setup();
    render(<RiskCheck />);
    const box = await screen.findByRole("textbox", { name: "Describe the project" });
    await user.click(box);
    await user.paste("x".repeat(250));
    await user.click(screen.getByRole("button", { name: "Read the description" }));
    expect(await screen.findByText(`“${"x".repeat(200)}…”`, {}, { timeout: SLOW })).toBeInTheDocument();
  });

  it("clears the old answer when a new description is read", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await user.click(screen.getByRole("button", { name: "Edit the description" }));
    await user.click(screen.getByRole("button", { name: "Read the description" }));
    await screen.findByRole("form", { name: "Check the details the AI read" }, { timeout: SLOW });
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("opens the form and drops the old answer when a new description can't be read", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    routes.extract = () => ({ status: 502, body: { error: "Something went wrong" } });
    await user.click(screen.getByRole("button", { name: "Edit the description" }));
    await user.click(screen.getByRole("button", { name: "Read the description" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read the description. Please fill in the form.");
    expect(screen.getByRole("form", { name: "Project details" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" })).toHaveValue("200,000");
    expect(screen.queryByRole("article")).toBeNull();
    await focusSettles();
  });

  it("formats a typed budget with thousands separators, and leaves text it can't read", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    const budget = screen.getByRole("textbox", { name: "Iron and steel budget in dollars" });
    await user.clear(budget);
    await user.type(budget, "1500000.5");
    await user.tab();
    expect(budget).toHaveValue("1,500,000.5");
    await user.clear(budget);
    await user.type(budget, "1.5M");
    await user.tab();
    expect(budget).toHaveValue("1.5M");
  });

  it("marks the current tab in the header", () => {
    render(<SiteHeader current="/plan" />);
    expect(screen.getByRole("link", { name: "Plan a purchase" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Prices" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Prices" })).toHaveAttribute("href", "/");
  });
});

describe("BreakEvenStrip", () => {
  const rates = [0.03, 0.025, 0.021, 0.02, -0.001, 0.005];
  const similar = ["1971-01", "1975-06", "1980-02", "1990-01", "2001-01", "2010-01"];

  it("draws one dot per period, filled only where the break-even rate is above the user's", () => {
    const { container } = render(<BreakEvenStrip material="steel" name="Iron and steel" rates={rates} similar={similar} rate={0.02} ahead={3} />);
    const dots = container.querySelectorAll(".strip svg[role=img] circle");
    expect(dots).toHaveLength(6);
    // 3%, 2.5% and 2.1% are above 2%; exactly 2% is not ahead.
    expect([...dots].filter((d) => !d.classList.contains("strip-open"))).toHaveLength(3);
    expect(screen.getByRole("img", { name: /6 similar past periods\. Buying early came out ahead in 3, those above your 2\.00% a month/ })).toBeInTheDocument();
    expect(screen.getByText("Your 2.00%")).toBeInTheDocument();
  });

  it("names the right period on hover when the dots are drawn in a different order", async () => {
    const user = userEvent.setup();
    // Given out of order: the dots are drawn left to right (1975, 1990, 1971), so a mix-up of indexes shows the wrong period.
    const { container } = render(
      <BreakEvenStrip material="steel" name="Iron and steel" rates={[0.03, -0.001, 0.005]} similar={["1971-01", "1975-06", "1990-01"]} rate={0.02} ahead={1} />,
    );
    const drawn = container.querySelectorAll(".strip svg[role=img] circle");
    await user.hover(drawn[2] as Element);
    expect(screen.getByText("Similar period from Jan 1971")).toBeInTheDocument();
    expect(screen.getByText(/Break-even 3\.00% a month\. Buying early came out ahead at your rate/)).toBeInTheDocument();
    await user.hover(drawn[0] as Element);
    expect(screen.getByText("Similar period from Jun 1975")).toBeInTheDocument();
    expect(screen.getByText(/Break-even −0\.10% a month\. Buying early didn't come out ahead/)).toBeInTheDocument();
  });

  it("rounds the user's rate like the backend, so a tie is not filled", () => {
    // 0.7% a month arrives as 0.7 / 100 = 0.006999999999999999; a break-even of exactly 0.007 is a tie, not ahead.
    const { container } = render(<BreakEvenStrip material="steel" name="Iron and steel" rates={[0.007]} similar={["1971-01"]} rate={0.7 / 100} ahead={0} />);
    expect(container.querySelector(".strip svg[role=img] circle")).toHaveClass("strip-open");
  });

  it("says when periods are beyond the scale", () => {
    // −2.1% is past the −2% floor but inside the drawn margin, so it is placed exactly and not counted.
    render(<BreakEvenStrip material="steel" name="Iron and steel" rates={[-0.0363, -0.021, 0.001, 0.05]} similar={["1971-01", "1975-06", "1990-01", "2001-01"]} rate={0.01} ahead={1} />);
    expect(screen.getByText("2 periods are beyond the scale and drawn at its edge.")).toBeInTheDocument();
  });

  it("keeps the user's line on the scale when their rate is above every period", () => {
    const { container } = render(<BreakEvenStrip material="steel" name="Iron and steel" rates={[0.01, 0.03]} similar={["1971-01", "1975-06"]} rate={0.1} ahead={0} />);
    const you = Number(container.querySelector(".strip-you")?.getAttribute("x1"));
    const dots = [...container.querySelectorAll(".strip svg[role=img] circle")].map((c) => Number(c.getAttribute("cx")));
    // Without the fix the 10% line sits at the 4% cap, right beside the 3% dot.
    expect(you - Math.max(...dots)).toBeGreaterThan(300);
    expect(screen.queryByText(/beyond the scale/)).toBeNull();
  });
});

describe("Current risk factors by topic", () => {
  it("groups developments under their topic, in a fixed order", async () => {
    routes.news = () => ({
      body: {
        newsId: NEWS_ID,
        areas: AREAS_OK,
        developments: [
          { ...DEV, devId: 1, topic: "production" },
          { ...DEV, devId: 2, summary: "New duties on imported steel.", topic: "trade" },
          { ...DEV, devId: 3, summary: "A hurricane shut a Gulf Coast mill.", topic: "weather" },
        ],
      },
    });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await within(newsBlock()).findByText("New duties on imported steel.", { selector: "p" }, { timeout: SLOW });
    const headings = within(newsBlock()).getAllByRole("heading", { level: 5 }).map((h) => h.textContent);
    expect(headings).toEqual(["Tariffs and trade", "Weather and disasters", "Production and capacity"]);
    const trade = within(newsBlock()).getByRole("region", { name: "Tariffs and trade" });
    expect(within(trade).getByText("New duties on imported steel.", { selector: "p" })).toBeInTheDocument();
    expect(within(trade).queryByText("Mills report longer steel lead times.", { selector: "p" })).toBeNull();
  });

  it("rejects a development with an unknown topic", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, topic: "astrology" }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/News couldn't be checked/)).toBeInTheDocument();
  });
});

describe("Energy and freight costs", () => {
  const block = () => screen.getByRole("region", { name: "Energy and freight costs" });

  it("loads once with the first answer and shows figures from the backend", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const gas = await within(block()).findByRole("row", { name: /Natural gas/ }, { timeout: SLOW });
    expect(gas).toHaveTextContent("$2.99");
    expect(gas).toHaveTextContent("Oct 2026");
    expect(gas).toHaveTextContent("+5.0%");
    expect(gas).toHaveTextContent("−12.0%");
    expect(gas).toHaveTextContent("Higher than 86 of 345 past 12-month changes");
    const freight = within(block()).getByRole("row", { name: /Ocean freight/ });
    // An index, not dollars, and preliminary; a missing 3-month change reads n/a.
    expect(freight).toHaveTextContent("534.8 p");
    expect(freight).not.toHaveTextContent("$534");
    expect(freight).toHaveTextContent("n/a");
    // A count, never a rounded percent: 446 of 447 must not read as 100%.
    expect(freight).toHaveTextContent("Higher than 446 of 447 past 12-month changes");
    await run(user, "1.5");
    expect(calls.filter((c) => c.path === "drivers")).toHaveLength(1);
  });

  it("names series that couldn't be loaded, and says when none could", async () => {
    routes.drivers = () => ({ body: { drivers: [DRIVERS[0], { ...DRIVERS[1], available: false, figures: null }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await within(block()).findByText("Couldn't be loaded from FRED: Ocean freight, deep-sea freight PPI.", {}, { timeout: SLOW })).toBeInTheDocument();
    expect(within(block()).queryByRole("row", { name: /Ocean freight/ })).toBeNull();
  });

  it("shows a series whose latest value is missing without inventing figures", async () => {
    routes.drivers = () => ({ body: { drivers: [{ ...DRIVERS[0], figures: null }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const gas = await within(block()).findByRole("row", { name: /Natural gas/ }, { timeout: SLOW });
    expect(gas).toHaveTextContent("The latest value is missing, so no figures are shown.");
    // The unit label ("$ per million BTU") stays; no value or change is shown.
    expect(gas).not.toHaveTextContent("$2.99");
    expect(gas).not.toHaveTextContent("%");
  });

  it("says when the costs couldn't be loaded at all", async () => {
    routes.drivers = () => ({ status: 500, body: { error: "Something went wrong" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await within(block()).findByText("Energy and freight costs couldn't be loaded from FRED.", {}, { timeout: SLOW })).toBeInTheDocument();
  });
});

describe("Results appear all at once", () => {
  it("shows a loading panel until the history, the news and the costs are all done, then the results together", async () => {
    let releaseNews: (v: { body: unknown }) => void = () => {};
    routes.news = () => new Promise((r) => (releaseNews = r));
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));

    // The analysis and the costs finish first, but nothing is shown while the news is still running.
    await waitFor(() => expect(screen.getByText(/Comparing today with similar past periods/).closest("li")).toHaveClass("is-done"));
    await waitFor(() => expect(screen.getByText(/Loading energy and freight costs/).closest("li")).toHaveClass("is-done"));
    expect(screen.getByText(/Checking current supply-chain news/).closest("li")).not.toHaveClass("is-done");
    expect(screen.getByText("Running the check. The results appear when every part is ready.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("region", { name: "Energy and freight costs" })).toBeNull();

    releaseNews({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV] } });
    expect(await screen.findByRole("article", { name: /Iron and steel/ }, { timeout: SLOW })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Energy and freight costs" })).toBeInTheDocument();
    expect(screen.queryByText(/Running the check\./)).toBeNull();
    // By the time anything shows, the news's past event has already been applied.
    expect(calls.filter((c) => c.path === "analyze")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "Closest past event" })).toHaveValue("steel-232-2018");
  });

  it("waits for the re-run that applies the news's past event before showing anything", async () => {
    let releaseRerun: (v: { body: unknown }) => void = () => {};
    let count = 0;
    routes.analyze = () => (++count === 1 ? { body: analysis() } : new Promise((r) => (releaseRerun = r)));
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(count).toBe(2), { timeout: SLOW });
    // News and costs are done, but the comparison is running again, so it is not ticked and nothing is shown.
    expect(screen.getByText(/Checking current supply-chain news/).closest("li")).toHaveClass("is-done");
    expect(screen.getByText(/Comparing today with similar past periods/).closest("li")).not.toHaveClass("is-done");
    expect(screen.queryByRole("article")).toBeNull();
    releaseRerun({ body: analysis() });
    expect(await screen.findByRole("article", {}, { timeout: SLOW })).toBeInTheDocument();
  });

  it("holds an analysis error until the news is done, never ticking the failed part", async () => {
    let releaseNews: (v: { body: unknown }) => void = () => {};
    routes.news = () => new Promise((r) => (releaseNews = r));
    routes.analyze = () => ({ status: 500, body: { error: "Something went wrong" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(calls.some((c) => c.path === "analyze")).toBe(true));
    await waitFor(() => expect(screen.getByText(/Loading energy and freight costs/).closest("li")).toHaveClass("is-done"));
    expect(screen.getByText(/Comparing today with similar past periods/).closest("li")).not.toHaveClass("is-done");
    expect(screen.queryByText("The analysis couldn't run. Please try again.")).toBeNull();
    releaseNews({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV] } });
    expect(await screen.findByText("The analysis couldn't run. Please try again.", {}, { timeout: SLOW })).toBeInTheDocument();
    expect(screen.queryByText(/Running the check\./)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByText("The check couldn't run.")).toBeInTheDocument();
  });

  it("lists only the parts that run: no news line without a key", async () => {
    routes.status = () => ({ body: { aiAvailable: false, demo: false } });
    let release: (v: { body: unknown }) => void = () => {};
    routes.analyze = () => new Promise((r) => (release = r));
    const user = userEvent.setup();
    render(<RiskCheck />);
    await user.click(await screen.findByRole("checkbox", { name: /Iron and steel/ }));
    await user.type(screen.getByRole("textbox", { name: "Iron and steel budget in dollars" }), "200000");
    await user.type(screen.getByLabelText("Phase 1 need month"), "2027-03");
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    expect(screen.getByText(/Comparing today with similar past periods/)).toBeInTheDocument();
    expect(screen.queryByText(/Checking current supply-chain news/)).toBeNull();
    release({ body: analysis() });
    expect(await screen.findByRole("article", {}, { timeout: SLOW })).toBeInTheDocument();
  });

  it("loads the costs again on the next check if they failed", async () => {
    routes.drivers = () => ({ status: 500, body: { error: "Something went wrong" } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    routes.drivers = () => ({ body: { drivers: DRIVERS } });
    await run(user, "1.5");
    expect(await screen.findByRole("row", { name: /Natural gas/ }, { timeout: SLOW })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "drivers")).toHaveLength(2);
  });
});

describe("Should you buy now?", () => {
  const block = () => screen.getByRole("region", { name: "Should you buy now?" });
  const item = () => within(block()).getByRole("listitem");

  it("answers first: the AI action, its evidence, the history and the cited news", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const first = screen.getByRole("article", { name: /Iron and steel/ });
    // The advice comes before the per-material detail.
    expect(block().compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(item()).toHaveTextContent("Iron and steel$200,000");
    // The history lean's headline takes in the AI's supply warning, so buying as needed and booking supply read as one plan; the rating never changes.
    expect(item()).toHaveTextContent(
      "Consider buying as each phase needs it, but booking supply nowBooking means reserving supply or fixing prices with your supplier, not storing materials early.",
    );
    expect(item()).toHaveTextContent(ADVICE.reason);
    expect(item()).toHaveTextContent("AI reading of 1 news item: Steel Daily");
    expect(item()).toHaveTextContent("Moderate evidence");
    expect(item()).not.toHaveTextContent(/against history|Weak evidence/);
    expect(item()).toHaveTextContent("Buying as needed was cheapest in 14 of 20 past periods like today");
    expect(item().querySelectorAll(".tick")).toHaveLength(20);
    expect(item().querySelectorAll(".tick-steel")).toHaveLength(14);
    expect(within(item()).getByRole("link", { name: "Steel Daily" })).toHaveAttribute("href", "https://news.example.com/steel");
    // Advice runs last, on the project as finally analyzed (the news's past event applied), with the news id.
    const advise = calls.filter((c) => c.path === "advise");
    expect(advise).toHaveLength(1);
    expect(advise[0]?.body).toEqual({
      project: expect.objectContaining({ materials: [{ material: "steel", budget: 200000, eventId: "steel-232-2018" }], carryingCost: 2 }),
      newsId: NEWS_ID,
      exclude: [],
    });
    expect(calls.findIndex((c) => c.path === "advise")).toBeGreaterThan(calls.map((c) => c.path).lastIndexOf("analyze"));
  });

  it("shows advice that follows history with its own evidence label", async () => {
    routes.advise = () => ({ body: { advice: [{ ...ADVICE, action: "as-needed", devIds: [], reason: "History favours waiting." }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(item()).toHaveTextContent("Consider buying as each phase needs it");
    expect(item()).toHaveTextContent("Moderate evidence");
    // The AI cited no item, so the answer shows the news it was given for this material.
    expect(item()).toHaveTextContent("History favours waiting.AI reading of 1 news item: Steel Daily");
    expect(within(item()).getByRole("link", { name: "Steel Daily" })).toHaveAttribute("href", "https://news.example.com/steel");
    expect(item()).not.toHaveTextContent(/booking supply|supply risk/);
  });

  it("shows only undismissed news when the AI cites none, and says when a material has no news", async () => {
    routes.analyze = () => ({ body: analysis([steel(), steel({ material: "lumber", name: "Lumber and wood", seriesId: "WPU08" })]) });
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV, { ...DEV, devId: 2, summary: "Scrap prices eased.", sources: [{ url: "https://other.example.com/a", title: "Other" }] }] } });
    routes.advise = () => ({
      body: {
        advice: [
          { ...ADVICE, action: "as-needed", devIds: [], reason: "History still holds." },
          { ...ADVICE, material: "lumber", action: "as-needed", devIds: [], reason: "Nothing new." },
        ],
      },
    });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const rows = within(screen.getByRole("region", { name: "Should you buy now?" })).getAllByRole("listitem");
    const steelRow = rows.find((r) => r.textContent?.includes("Iron and steel")) as HTMLElement;
    const lumberRow = rows.find((r) => r.textContent?.includes("Lumber and wood")) as HTMLElement;
    expect(steelRow).toHaveTextContent("AI reading of 2 news items: Steel Daily, Other");
    expect(lumberRow).toHaveTextContent("Nothing new.AI reading: no current news for this material.");
    await user.click(within(newsBlock()).getAllByRole("button", { name: /Dismiss/ })[1] as HTMLElement);
    expect(steelRow).toHaveTextContent("AI reading of 1 news item: Steel Daily");
  });

  it("frames a supply warning to fit whatever history suggests", async () => {
    const cases: [string, Record<string, unknown> | null, string, string][] = [
      ["buy early", { strategy: "allNow" }, "Consider buying early", "The news shows a supply risk too, and buying early also covers it."],
      ["first half", { strategy: "firstHalf" }, "Consider buying the first half now, and booking supply for the rest", "Booking means reserving supply or fixing prices with your supplier for the later phases."],
      ["no history", null, "Not enough history to compare", "The news shows a supply risk: consider reserving supply or fixing prices with your supplier for later deliveries."],
    ];
    for (const [name, lean, head, line] of cases) {
      routes.analyze = () => ({ body: analysis([steel({ lean: lean && { ...steel().lean, ...lean } })]) });
      const user = userEvent.setup();
      await describeAndRead(user);
      await run(user);
      await waitFor(() => expect(item(), name).toHaveTextContent(head), { timeout: SLOW });
      expect(item(), name).toHaveTextContent(line);
      expect(item(), name).not.toHaveTextContent(/as each phase needs it/);
      cleanup();
    }
  });

  it("shows the history lean alone, and says why, whenever AI advice can't be given", async () => {
    const cases: [string, () => void, RegExp][] = [
      ["advice failed", () => (routes.advise = () => ({ status: 502, body: { error: "The advice couldn't be written." } })), /The AI advice couldn't be written/],
      ["limit", () => (routes.advise = () => ({ status: 429, body: { error: "Too many requests" } })), /AI request limit was reached/],
      ["expired", () => (routes.advise = () => ({ status: 409, body: { error: "x" } })), /news check expired/],
      ["news failed", () => (routes.news = () => ({ status: 502, body: { error: "News couldn't be checked.", step: "classify" } })), /because the news couldn't be checked/],
      ["no news", () => (routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [] } })), /no current news to weigh/],
    ];
    for (const [name, setup, message] of cases) {
      calls = [];
      setup();
      const user = userEvent.setup();
      await describeAndRead(user);
      await run(user);
      expect(within(block()).getByText(message), name).toBeInTheDocument();
      expect(item(), name).toHaveTextContent("Consider buying as each phase needs it");
      expect(item(), name).toHaveTextContent("Moderate evidence");
      expect(item(), name).not.toHaveTextContent(/AI reading|supply risk|booking supply/);
      cleanup();
      routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV] } });
      routes.advise = () => ({ body: { advice: [ADVICE] } });
    }
  });

  it("makes no advice call when there's no news, and without a key", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(calls.some((c) => c.path === "advise")).toBe(false);
  });

  it("says when there's no lean to show", async () => {
    routes.analyze = () => ({ body: analysis([steel({ status: "tooFew", outlook: null, strategies: null, breakEven: null, lean: null })]) });
    routes.advise = () => ({ body: { advice: [] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(item()).toHaveTextContent("Not enough history to compare");
    expect(item()).toHaveTextContent("Too few comparable past periods to compare ways of buying.");
    expect(item()).toHaveTextContent("No history comparison");
    expect(item()).not.toHaveTextContent("evidence");
  });

  it("marks the advice stale after a dismissal, and Refresh re-runs it without that news", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV, { ...DEV, devId: 2, summary: "Scrap prices eased." }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(within(block()).queryByText(/written before you dismissed news/)).toBeNull();
    await user.click(within(newsBlock()).getAllByRole("button", { name: /Dismiss/ })[0] as HTMLElement);
    expect(within(block()).getByText(/written before you dismissed news/)).toBeInTheDocument();
    routes.advise = () => ({ body: { advice: [] } });
    await user.click(within(block()).getByRole("button", { name: "Refresh advice" }));
    await waitFor(() => expect(within(block()).queryByText(/written before you dismissed news/)).toBeNull(), { timeout: SLOW });
    expect(calls.filter((c) => c.path === "advise").at(-1)?.body).toMatchObject({ exclude: [1] });
    // No advice came back for steel, so its history lean shows with a note saying why.
    expect(item()).not.toHaveTextContent(/AI reading of/);
    expect(item()).toHaveTextContent("No AI reading for this material");
  });

  it("refreshing after dismissing every news item falls back to history, with no call", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await user.click(within(newsBlock()).getByRole("button", { name: /Dismiss/ }));
    await user.click(within(block()).getByRole("button", { name: "Refresh advice" }));
    expect(await within(block()).findByText(/no current news to weigh/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "advise")).toHaveLength(1);
  });

  it("marks the advice stale when the past event changes", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "Closest past event" }), "financial-crisis-2008");
    expect(await within(block()).findByText(/written before you dismissed news/, {}, { timeout: SLOW })).toBeInTheDocument();
  });

  it("writes the advice again when the carrying cost changes", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    await run(user, "0.5");
    const advise = calls.filter((c) => c.path === "advise");
    expect(advise).toHaveLength(2);
    expect(advise[1]?.body).toMatchObject({ project: { carryingCost: 0.5 } });
  });

  it("renders the AI's reason as plain text", async () => {
    routes.advise = () => ({ body: { advice: [{ ...ADVICE, reason: "<b>Buy</b> <img src=x onerror=alert(1)>" }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(item()).toHaveTextContent("<b>Buy</b> <img src=x onerror=alert(1)>");
    expect(block().querySelector("b, img")).toBeNull();
  });

  it("rejects an advice reply with an unknown action", async () => {
    routes.advise = () => ({ body: { advice: [{ ...ADVICE, action: "sell" }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(within(block()).getByText(/The AI advice couldn't be written/)).toBeInTheDocument();
  });

  it("waits for the advice before showing anything", async () => {
    let release: (v: { body: unknown }) => void = () => {};
    routes.advise = () => new Promise((r) => (release = r));
    const user = userEvent.setup();
    await describeAndRead(user);
    await user.type(screen.getByRole("textbox", { name: /Carrying cost/ }), "2");
    await user.click(screen.getByRole("button", { name: "Run the check" }));
    await waitFor(() => expect(calls.some((c) => c.path === "advise")).toBe(true), { timeout: SLOW });
    expect(screen.getByText(/Writing the advice with Gemini/).closest("li")).not.toHaveClass("is-done");
    expect(screen.queryByRole("region", { name: "Should you buy now?" })).toBeNull();
    release({ body: { advice: [ADVICE] } });
    expect(await screen.findByRole("region", { name: "Should you buy now?" }, { timeout: SLOW })).toBeInTheDocument();
  });
});

describe("Why is the evidence rated as it is?", () => {
  const lean = (strategy: "asNeeded" | "allNow", cheapest: number, n: number, strength: "strong" | "moderate" | "weak") => ({ strategy, cheapest, n, strength });

  it("explains each rating from the same numbers that set it", () => {
    expect(evidenceReason(lean("asNeeded", 18, 20, "strong"))).toBe("That's 90% of past periods like today. Strong means at least 85%.");
    expect(evidenceReason(lean("asNeeded", 14, 20, "moderate"))).toBe("That's 70% of past periods like today. Moderate means 60% to 84%; strong needs 85%.");
    expect(evidenceReason(lean("allNow", 11, 20, "weak"))).toBe(
      "That's 55%, under the 60% needed for moderate: the cheapest way to buy varied in past periods like today.",
    );
    expect(evidenceReason(lean("asNeeded", 12, 12, "weak"))).toBe("Only 12 comparable past periods were found; at least 15 are needed for a rating above weak.");
  });

  it("rounds the share down, so it never reads as reaching a cut-off it missed", () => {
    // 22 of 26 is 84.6%: rounded it would read 85% beside a moderate rating.
    expect(evidenceReason(lean("asNeeded", 22, 26, "moderate"))).toMatch(/^That's 84%/);
  });

  async function open() {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    // A finished check moves focus to the results heading on the next frame; wait so it can't take focus later.
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Your answer" })).toHaveFocus());
    const block = screen.getByRole("region", { name: "Should you buy now?" });
    return { user, block, why: within(block).getByRole("button", { name: "Why moderate?" }) };
  }
  const pop = (why: HTMLElement) => document.getElementById(why.getAttribute("aria-controls") as string) as HTMLElement;

  it("shows on hover, stays while the pointer moves into it, and Escape closes it without focus", async () => {
    const { user, why } = await open();
    expect(pop(why)).not.toBeVisible();
    await user.hover(why);
    expect(pop(why)).toBeVisible();
    expect(pop(why)).toHaveTextContent("That's 70% of past periods like today. Moderate means 60% to 84%; strong needs 85%.");
    await user.hover(pop(why));
    expect(pop(why)).toBeVisible();
    expect(why).not.toHaveFocus();
    await user.keyboard("{Escape}");
    expect(pop(why)).not.toBeVisible();
    expect(why).toHaveAttribute("aria-expanded", "false");
  });

  it("a click keeps it open, clicking its text keeps it, and a second click closes it even with the mouse still over it", async () => {
    const { user, why } = await open();
    await user.click(why);
    await user.unhover(why);
    expect(pop(why)).toBeVisible();
    await user.click(pop(why));
    await user.unhover(pop(why));
    expect(pop(why)).toBeVisible();
    await user.click(why);
    expect(pop(why)).not.toBeVisible();
    expect(why).toHaveAttribute("aria-expanded", "false");
  });

  it("on touch, a tap opens it, a second tap closes it, and a tap outside closes it", async () => {
    const { user, why } = await open();
    // A touch tap brings pointer events with pointerType "touch", which must not count as hovering.
    await user.pointer({ keys: "[TouchA]", target: why });
    expect(pop(why)).toBeVisible();
    await user.pointer({ keys: "[TouchA]", target: why });
    expect(pop(why)).not.toBeVisible();
    await user.pointer({ keys: "[TouchA]", target: why });
    await user.pointer({ keys: "[TouchA]", target: screen.getByRole("heading", { name: "Should you buy now?" }) });
    expect(pop(why)).not.toBeVisible();
  });

  it("works from the keyboard: Enter opens it, and tabbing away closes it", async () => {
    const { user, why } = await open();
    why.focus();
    await user.keyboard("{Enter}");
    expect(why).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(why).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Jumping to a part of the results", () => {
  it("links to the answer, each material's details, and the page-level sections, and each target exists", async () => {
    routes.analyze = () => ({ body: analysis([steel(), steel({ material: "lumber", name: "Lumber and wood", seriesId: "WPU08" })]) });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const nav = screen.getByRole("navigation", { name: "Jump to a part of the results" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Answer", "#advice"],
      ["Iron and steel", "#details-steel"],
      ["Lumber and wood", "#details-lumber"],
      ["Energy and freight", "#risk-drivers"],
    ]);
    for (const l of links) expect(document.getElementById((l.getAttribute("href") as string).slice(1))).not.toBeNull();
    // Which link is current depends on layout, which jsdom doesn't do; the next test mocks the positions.
    // Each material in the answer links down to its own details.
    const answer = screen.getByRole("region", { name: "Should you buy now?" });
    expect(within(answer).getByRole("link", { name: "See the details for lumber and wood" })).toHaveAttribute("href", "#details-lumber");
    expect(document.getElementById("details-lumber")).toBe(screen.getByRole("article", { name: /Lumber and wood/ }));
  });

  it("marks the section that has scrolled under the bar as current, and the last one at the bottom of the page", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const nav = screen.getByRole("navigation", { name: "Jump to a part of the results" });
    const tops: Record<string, number> = { advice: -900, "details-steel": 40, "risk-drivers": 1200 };
    for (const [id, top] of Object.entries(tops)) {
      vi.spyOn(document.getElementById(id) as HTMLElement, "getBoundingClientRect").mockReturnValue({ top } as DOMRect);
    }
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(within(nav).getByRole("link", { name: "Iron and steel" })).toHaveAttribute("aria-current", "location"));
    expect(within(nav).getByRole("link", { name: "Answer" })).not.toHaveAttribute("aria-current");
    // Scrolled to the very bottom: the short last section is current even though its top never reaches the bar.
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(3000);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(3000 - window.innerHeight);
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(within(nav).getByRole("link", { name: "Energy and freight" })).toHaveAttribute("aria-current", "location"));
  });

  it("isn't shown before there are results", async () => {
    render(<RiskCheck />);
    await screen.findByRole("textbox", { name: "Describe the project" });
    expect(screen.queryByRole("navigation", { name: "Jump to a part of the results" })).toBeNull();
  });
});

describe("News and advice limits from the backend contract", () => {
  it("shows one advice link per site, even when two cited items come from it", async () => {
    routes.news = () => ({
      body: {
        newsId: NEWS_ID,
        areas: AREAS_OK,
        developments: [DEV, { ...DEV, devId: 2, summary: "Rebar allocation tightened.", sources: [{ url: "https://news.example.com/rebar", title: "Another title" }] }],
      },
    });
    routes.advise = () => ({ body: { advice: [{ ...ADVICE, devIds: [1, 2] }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const item = within(screen.getByRole("region", { name: "Should you buy now?" })).getByRole("listitem");
    expect(within(item).getAllByRole("link", { name: /Steel Daily|Another title/ })).toHaveLength(1);
  });

  it("accepts a summary of 300 characters counted as the backend counts them, even with emoji", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, summary: "🚢".repeat(300) }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await within(newsBlock()).findByText("🚢".repeat(300), { selector: "p", exact: false }, { timeout: SLOW })).toBeInTheDocument();
  });

  it("rejects a news reply with more than 5 sources on one item", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ url: `https://s${i}.example.com/`, title: `S${i}` }));
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, sources: six }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/^News couldn't be checked\./, {}, { timeout: SLOW })).toBeInTheDocument();
  });
});

describe("Start over", () => {
  const nav = () => screen.getByRole("navigation", { name: "Jump to a part of the results" });

  it("isn't offered until there are results", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    expect(screen.queryByRole("button", { name: "Start over" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start a new plan" })).toBeNull();
  });

  it("sits at the right of the jump bar and at the end of the results", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(within(nav()).getByRole("button", { name: "Start over" })).toBeInTheDocument();
    const end = screen.getByRole("button", { name: "Start a new plan" });
    // After everything else in the answer.
    expect(screen.getByRole("region", { name: "Energy and freight costs" }).compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(["Start over", "Start a new plan"])("%s clears the description, the details and the answer, and returns focus to the top", async (name) => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const before = calls.length;
    await user.click(screen.getByRole("button", { name }));
    const box = await screen.findByRole("textbox", { name: "Describe the project" });
    expect(box).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Should you buy now?" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Check the details the AI read" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start over" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Plan a purchase" })).toHaveFocus();
    // Starting over makes no AI or analysis call; only the page's own status and events load again.
    expect(calls.slice(before).map((c) => c.path).filter((p) => !["status", "events"].includes(p))).toEqual([]);
  });

  it("can't be pressed while the answer is being updated", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    let release: (v: { body: unknown }) => void = () => {};
    routes.analyze = () => new Promise((r) => (release = r));
    await user.selectOptions(screen.getByRole("combobox", { name: "Closest past event" }), "financial-crisis-2008");
    expect(within(nav()).getByRole("button", { name: "Start over" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start a new plan" })).toBeDisabled();
    release({ body: analysis() });
    await waitFor(() => expect(within(nav()).getByRole("button", { name: "Start over" })).toBeEnabled(), { timeout: SLOW });
  });
});

describe("Shares read from the description", () => {
  const read = async (shares: (number | null)[]) => {
    routes.extract = () => ({ body: { ...EXTRACTED, phases: shares.map((share, i) => ({ needMonth: `2027-0${i + 3}`, share })) } });
    const user = userEvent.setup();
    await describeAndRead(user);
    return shares.map((_, i) => screen.getByRole("textbox", { name: `Phase ${i + 1} share, percent` }));
  };

  it("leaves an even split blank, which means even", async () => {
    const fields = await read([33.333333, 33.333333, 33.333334]);
    for (const f of fields) {
      expect(f).toHaveValue("");
      expect(f).toHaveAttribute("placeholder", "Even");
    }
  });

  it("rounds any other share to one decimal", async () => {
    const fields = await read([40.1234, 59.8766]);
    expect(fields.map((f) => (f as HTMLInputElement).value)).toEqual(["40.1", "59.9"]);
  });

  it("keeps an uneven split even if one share happens to match an even one", async () => {
    const fields = await read([33.3, 46.7, 20]);
    expect(fields.map((f) => (f as HTMLInputElement).value)).toEqual(["33.3", "46.7", "20"]);
  });
});

describe("The project form", () => {
  it("can be filled in by hand instead of from a description", async () => {
    const user = userEvent.setup();
    render(<RiskCheck />);
    await user.click(await screen.findByRole("button", { name: "Fill in the form yourself" }));
    expect(screen.getByRole("form", { name: "Project details" })).toBeInTheDocument();
  });

  it("adds and removes phases", async () => {
    const user = userEvent.setup();
    await describeAndRead(user);
    const phases = () => screen.getAllByLabelText(/^Phase \d+ need month$/);
    expect(phases()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Add a phase" }));
    expect(phases()).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Remove phase 1" }));
    expect(phases().map((p) => (p as HTMLInputElement).value)).toEqual(["2027-09", ""]);
  });

  it("rejects a news source whose link isn't a URL at all", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [{ ...DEV, sources: [{ url: "not a url", title: "x" }] }] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/^News couldn't be checked\./, {}, { timeout: SLOW })).toBeInTheDocument();
  });
});

describe("What the news search checked", () => {
  it("lists the areas checked with nothing found for each material, so nothing is silently missing", async () => {
    // The fixture's only news is a steel production item.
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(within(newsBlock()).getByText("Also checked, nothing current found: tariffs and trade, shipping and freight, weather and disasters, conflicts and geopolitics, energy.")).toBeInTheDocument();
  });

  it("names any area whose search couldn't run", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: { ...AREAS_OK, weather: "failed" }, developments: [DEV] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(within(newsBlock()).getByText(/^Couldn't be checked this time: weather and disasters\. Run the check again to retry\.$/)).toBeInTheDocument();
    expect(within(newsBlock()).getByText(/^Also checked, nothing current found:/)).not.toHaveTextContent("weather");
  });

  it("searches the news again on the next run when an area couldn't be checked, as the note promises", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: { ...AREAS_OK, weather: "failed" }, developments: [DEV] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    routes.news = () => ({ body: { newsId: NEWS_ID, areas: AREAS_OK, developments: [DEV] } });
    await run(user, "1.5");
    expect(calls.filter((c) => c.path === "news")).toHaveLength(2);
    expect(within(newsBlock()).queryByText(/Couldn't be checked/)).toBeNull();
    // With every area checked, the same project isn't searched again.
    await run(user, "1");
    expect(calls.filter((c) => c.path === "news")).toHaveLength(2);
  });

  it("still says what was checked when a material has no news at all", async () => {
    routes.analyze = () => ({ body: analysis([steel(), steel({ material: "lumber", name: "Lumber and wood", seriesId: "WPU08" })]) });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    const lumber = register("Lumber and wood");
    expect(within(lumber).getByText("No current risk factors found in the news.")).toBeInTheDocument();
    expect(within(lumber).getByText(/^Checked, nothing current found: tariffs and trade, shipping and freight, weather and disasters, conflicts and geopolitics, energy, production and capacity\.$/)).toBeInTheDocument();
  });

  it("rejects a news reply without the areas it checked", async () => {
    routes.news = () => ({ body: { newsId: NEWS_ID, developments: [DEV] } });
    const user = userEvent.setup();
    await describeAndRead(user);
    await run(user);
    expect(await screen.findByText(/^News couldn't be checked\./, {}, { timeout: SLOW })).toBeInTheDocument();
  });
});

describe("Demo mode", () => {
  it("says the AI answers are samples, and fills in the sample project ready to read", async () => {
    routes.status = () => ({ body: { aiAvailable: true, demo: true } });
    render(<RiskCheck />);
    expect(await screen.findByText(/The AI steps and the energy and freight costs use fixed sample data/)).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "Describe the project" });
    expect((box as HTMLTextAreaElement).value).toMatch(/^A 3-building apartment complex/);
    expect(screen.getByRole("button", { name: "Read the description" })).toBeEnabled();
  });

  it("says nothing about a demo with a real key", async () => {
    render(<RiskCheck />);
    await screen.findByRole("textbox", { name: "Describe the project" });
    expect(screen.queryByText(/Demo mode/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Describe the project" })).toHaveValue("");
  });
});
