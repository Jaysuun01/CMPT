import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Plot } from "@/components/Plot";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tracker } from "@/components/Tracker";
import { makeDataset } from "./fixture";

// Fixture: Jan 2020 .. Dec 2025 (72 months), last 4 preliminary. Default view: Dec 2020 .. Dec 2025.
const initial = { from: 11, to: 71 };

function setup() {
  const user = userEvent.setup();
  render(<Tracker dataset={makeDataset()} initial={initial} />);
  return user;
}

const charts = () => screen.getAllByRole("img");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tracker", () => {
  it("shows the four required views for every material, plus the comparison chart", () => {
    setup();
    expect(charts()).toHaveLength(13);
    for (const name of ["Iron and steel", "Lumber and wood", "Concrete products"]) {
      for (const view of ["index level", "month-over-month", "year-over-year", "volatility"]) {
        expect(screen.getByRole("img", { name: new RegExp(`^${name}, ${view}, Dec 2020 to Dec 2025`) })).toBeInTheDocument();
      }
    }
  });

  it("updates every chart, the table and the URL from one range change", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));

    const labels = charts().map((c) => c.getAttribute("aria-label") ?? "");
    const grid = labels.filter((l) => !l.startsWith("Line chart"));
    expect(grid).toHaveLength(12);
    expect(grid.every((l) => l.includes("Dec 2024 to Dec 2025"))).toBe(true);
    expect(labels.find((l) => l.startsWith("Line chart"))).toContain("set to 100 in Dec 2024");
    expect(screen.getByRole("columnheader", { name: "Index, Dec 2024" })).toBeInTheDocument();
    expect(window.location.search).toBe("?from=2024-12&to=2025-12");
    expect(screen.getByRole("button", { name: "1 year" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies custom months from the dropdowns", async () => {
    const user = setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "From year" }), "2022");
    await user.selectOptions(screen.getByRole("combobox", { name: "From month" }), "March");
    expect(window.location.search).toBe("?from=2022-03&to=2025-12");
    expect(screen.getByRole("img", { name: /^Iron and steel, index level, Mar 2022 to Dec 2025/ })).toBeInTheDocument();
  });

  it("explains an impossible range and keeps showing the last valid one", async () => {
    const user = setup();
    // From is Dec 2020; moving its year to 2025 makes From == To (Dec 2025), which is not a range.
    await user.selectOptions(screen.getByRole("combobox", { name: "From year" }), "2025");
    expect(screen.getByRole("alert")).toHaveTextContent("The start month needs to be earlier than the end month.");
    expect(screen.getByRole("img", { name: /^Iron and steel, index level, Dec 2020 to Dec 2025/ })).toBeInTheDocument();
    expect(window.location.search).toBe("");

    // A valid choice clears the message.
    await user.click(screen.getByRole("button", { name: "5 years" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the change and factor for the selected months, with preliminary values flagged", () => {
    setup();
    const steel = screen.getByRole("row", { name: /Iron and steel/ });
    // 111 (Dec 2020) -> 171 (Dec 2025)
    expect(within(steel).getByText("+54.1%")).toBeInTheDocument();
    expect(within(steel).getByText("1.541")).toBeInTheDocument();
    expect(within(steel).getAllByTitle("Preliminary, may be revised")).toHaveLength(1);
  });

  it("flags exactly the last 4 months as preliminary (fixture months 68–71)", () => {
    const { unmount } = render(<Tracker dataset={makeDataset()} initial={{ from: 0, to: 67 }} />);
    expect(screen.queryAllByTitle("Preliminary, may be revised")).toHaveLength(0);
    unmount();
    render(<Tracker dataset={makeDataset()} initial={{ from: 0, to: 68 }} />);
    expect(screen.getAllByTitle("Preliminary, may be revised").length).toBeGreaterThan(0);
  });

  it("draws each grid chart from the selected months only", async () => {
    const user = setup();
    const bars = () => screen.getByRole("img", { name: /^Iron and steel, month-over-month/ }).querySelectorAll(".bar").length;
    expect(bars()).toBe(61); // Dec 2020 .. Dec 2025
    await user.click(screen.getByRole("button", { name: "1 year" }));
    expect(bars()).toBe(13);
    const line = () => screen.getByRole("img", { name: /^Concrete products, index level/ }).querySelector("path")?.getAttribute("d");
    const before = line();
    await user.click(screen.getByRole("button", { name: "5 years" }));
    expect(line()).not.toBe(before);
  });

  it("does not add a history entry when the same range is chosen again", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    const push = vi.spyOn(window.history, "pushState");
    await user.click(screen.getByRole("button", { name: "1 year" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("labels the data honestly: indexes, not dollars, and not seasonally adjusted", () => {
    setup();
    expect(screen.getByText("Not seasonally adjusted")).toBeInTheDocument();
    expect(screen.getByText(/1982 = 100/, { selector: ".note" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("$");
  });

  it("restores the range when the user goes back in history", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    act(() => {
      window.history.replaceState(null, "", "?from=2021-06&to=2023-06");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("img", { name: /^Lumber and wood, year-over-year, Jun 2021 to Jun 2023/ })).toBeInTheDocument();
  });
});

describe("HeroChart", () => {
  it("reads months out loud from the keyboard", () => {
    setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByText(/^November 2025, preliminary: Steel \d/)).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByText(/^December 2020: Steel 100\.0, Lumber 100\.0, Concrete 100\.0$/)).toBeInTheDocument();
  });
});

describe("drill-down", () => {
  // Plot boxes are 1000px wide starting at x=0, so clientX/1000 is the fraction across the chart.
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 100, right: 1000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  });

  const dialog = () => screen.getByRole("dialog");
  const markers = () => document.querySelectorAll(".marker").length;

  it("clicking a grid chart enlarges it and shows that month for every material", async () => {
    const user = setup(); // Dec 2020 .. Dec 2025 = 61 points
    fireEvent.click(screen.getByRole("img", { name: /^Lumber and wood, year-over-year/ }), { clientX: 500 }); // middle: Jun 2023
    const d = dialog();
    expect(within(d).getByRole("heading", { name: "Lumber and wood: Year-over-year" })).toBeInTheDocument();
    expect(within(d).getByRole("img", { name: /enlarged/ })).toBeInTheDocument();
    expect(within(d).getByRole("heading", { name: "June 2023" })).toBeInTheDocument();
    for (const name of ["Iron and steel", "Lumber and wood", "Concrete products"]) {
      expect(within(d).getByRole("rowheader", { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(markers()).toBe(1); // only inside the enlarged chart; the page is untouched
    await user.click(within(d).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(markers()).toBe(0);
  });

  it("closing after exploring leaves the page exactly as it was, and reopening starts from the clicked month", async () => {
    const user = setup();
    // A month already picked on the comparison chart before opening:
    const hero = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(hero, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(hero, { clientX: 200, pointerId: 1 }); // Dec 2021
    await user.click(within(dialog()).getByRole("button", { name: "Close" }));
    const markerLeft = () => [...document.querySelectorAll(".marker")].map((m) => (m as HTMLElement).style.left);
    const before = markerLeft();
    const search = window.location.search;

    fireEvent.click(screen.getByRole("img", { name: /^Iron and steel, index level/ }), { clientX: 500 }); // Jun 2023
    const wrap = within(dialog()).getByRole("group", { name: /^Chart\./ });
    fireEvent.click(wrap, { clientX: 0 });
    fireEvent.click(wrap, { clientX: 1000 });
    await user.click(within(dialog()).getByRole("button", { name: "Close" }));

    expect(markerLeft()).toEqual(before);
    expect(window.location.search).toBe(search);
    fireEvent.click(screen.getByRole("img", { name: /^Iron and steel, index level/ }), { clientX: 500 });
    expect(within(dialog()).getByRole("heading", { name: "June 2023" })).toBeInTheDocument();
  });

  it("summarises the range: latest, highest, lowest and average", () => {
    setup();
    // Fixture steel index rises 1 a month: 111 (Dec 2020) .. 171 (Dec 2025), average 141.
    fireEvent.click(screen.getByRole("img", { name: /^Iron and steel, index level/ }), { clientX: 500 });
    const stats = within(dialog()).getAllByRole("definition").map((d) => d.textContent);
    expect(stats).toEqual(["171.0Dec 2025", "171.0Dec 2025", "111.0Dec 2020", "141.0Dec 2020 to Dec 2025"]);
  });

  it("clicking another month in the enlarged chart updates the details below it", () => {
    setup();
    fireEvent.click(screen.getByRole("img", { name: /^Iron and steel, index level/ }), { clientX: 500 });
    const wrap = within(dialog()).getByRole("group", { name: /^Chart\./ });
    fireEvent.click(wrap, { clientX: 0 });
    expect(within(dialog()).getByRole("heading", { name: "December 2020" })).toBeInTheDocument();
  });

  it("reads the month under the pointer, and clears it when the pointer leaves", () => {
    setup();
    fireEvent.click(screen.getByRole("img", { name: /^Iron and steel, index level/ }), { clientX: 500 });
    const wrap = within(dialog()).getByRole("group", { name: /^Chart\./ });
    fireEvent.pointerMove(wrap, { clientX: 0 });
    expect(within(dialog()).getByText(/^December 2020: 111\.0$/)).toBeInTheDocument();
    fireEvent.pointerLeave(wrap);
    expect(within(dialog()).queryByText(/^December 2020: 111\.0$/)).toBeNull();
  });

  it("can be read with the keyboard once open", () => {
    setup();
    fireEvent.click(screen.getByRole("img", { name: /^Concrete products, volatility/ }), { clientX: 1000 });
    const d = dialog();
    expect(within(d).getByRole("heading", { name: "Concrete products: Volatility" })).toBeInTheDocument();
    const wrap = within(d).getByRole("group", { name: /^Chart\./ });
    fireEvent.keyDown(wrap, { key: "Home" });
    fireEvent.keyDown(wrap, { key: "Enter" });
    expect(within(d).getByRole("heading", { name: "December 2020" })).toBeInTheDocument();
  });

  it("flags a preliminary month in the panel", () => {
    setup();
    fireEvent.click(screen.getByRole("img", { name: /^Iron and steel, index level/ }), { clientX: 1000 });
    expect(within(dialog()).getByRole("heading", { name: "December 2025, preliminary and may be revised" })).toBeInTheDocument();
  });

  it("Enter on the comparison chart opens the month being read", () => {
    setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.keyDown(chart, { key: "Home" });
    fireEvent.keyDown(chart, { key: "Enter" });
    expect(within(dialog()).getByRole("heading", { name: "December 2020" })).toBeInTheDocument();
  });

  it("dragging across the comparison chart zooms every chart to that period", () => {
    setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(chart, { button: 0, clientX: 0, pointerId: 1 }); // Dec 2020
    fireEvent.pointerMove(chart, { clientX: 200, pointerId: 1 }); // Dec 2021
    fireEvent.pointerUp(chart, { clientX: 200, pointerId: 1 });
    expect(window.location.search).toBe("?from=2020-12&to=2021-12");
    expect(screen.getAllByRole("img").filter((c) => c.getAttribute("aria-label")?.includes("Dec 2020 to Dec 2021"))).toHaveLength(12);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("treats a small wobble during a click as a click, not a zoom", () => {
    setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(chart, { button: 0, clientX: 196, pointerId: 1 });
    fireEvent.pointerMove(chart, { clientX: 199, pointerId: 1 });
    fireEvent.pointerUp(chart, { clientX: 199, pointerId: 1 });
    expect(window.location.search).toBe("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("zooms to where the pointer is released, even without a final move event", () => {
    setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(chart, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(chart, { clientX: 200, pointerId: 1 });
    expect(window.location.search).toBe("?from=2020-12&to=2021-12");
  });

  it("a click without dragging opens the month instead of zooming", () => {
    setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(chart, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(chart, { clientX: 200, pointerId: 1 });
    expect(window.location.search).toBe("");
    expect(within(dialog()).getByRole("heading", { name: "December 2021" })).toBeInTheDocument();
  });
});

describe("undo and redo", () => {
  const undoBtn = () => screen.getByRole("button", { name: "Undo range change" });
  const redoBtn = () => screen.getByRole("button", { name: "Redo range change" });
  const gridHas = (span: string) => screen.getAllByRole("img").filter((c) => c.getAttribute("aria-label")?.includes(span)).length;

  it("starts with both buttons disabled", () => {
    setup();
    expect(undoBtn()).toBeDisabled();
    expect(redoBtn()).toBeDisabled();
  });

  it("undoes and redoes range changes one step at a time", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(undoBtn()).toBeEnabled();
    expect(redoBtn()).toBeDisabled();

    await user.click(undoBtn());
    await waitFor(() => expect(gridHas("Dec 2024 to Dec 2025")).toBe(12));
    expect(redoBtn()).toBeEnabled();
    await user.click(undoBtn());
    await waitFor(() => expect(gridHas("Dec 2020 to Dec 2025")).toBe(12));
    expect(undoBtn()).toBeDisabled();

    await user.click(redoBtn());
    await waitFor(() => expect(gridHas("Dec 2024 to Dec 2025")).toBe(12));
    await user.click(redoBtn());
    await waitFor(() => expect(gridHas("Jan 2020 to Dec 2025")).toBe(12));
    expect(redoBtn()).toBeDisabled();
  });

  it("a new change after undoing clears Redo", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    await user.click(undoBtn());
    await waitFor(() => expect(redoBtn()).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(redoBtn()).toBeDisabled();
  });

  it("undoes a drag-to-zoom", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 100, right: 1000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const user = setup();
    const chart = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(chart, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(chart, { clientX: 200, pointerId: 1 });
    expect(gridHas("Dec 2020 to Dec 2021")).toBe(12);
    await user.click(undoBtn());
    await waitFor(() => expect(gridHas("Dec 2020 to Dec 2025")).toBe(12));
  });

  it("supports Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, but not while typing in a field", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(gridHas("Dec 2020 to Dec 2025")).toBe(12));
    await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
    await waitFor(() => expect(gridHas("Dec 2024 to Dec 2025")).toBe(12));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const back = vi.spyOn(window.history, "back");
    await user.keyboard("{Control>}z{/Control}");
    expect(back).not.toHaveBeenCalled();
    input.remove();
  });

  it("announces the range for screen readers", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing Dec 2024 to Dec 2025.");
  });

  it("never navigates away from the app: nothing to undo on a freshly opened link", () => {
    window.history.replaceState(null, "", "/?from=2021-06&to=2023-06");
    const back = vi.spyOn(window.history, "back");
    render(<Tracker dataset={makeDataset()} initial={{ from: 17, to: 41 }} />);
    expect(undoBtn()).toBeDisabled();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(back).not.toHaveBeenCalled();
  });
});

describe("sticky range bar", () => {
  let fire: (visible: boolean) => void = () => {};
  beforeEach(() => {
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        fire = (visible) =>
          act(() => cb([{ isIntersecting: visible, boundingClientRect: { top: visible ? 100 : -200 } } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  const bar = () => screen.queryByRole("region", { name: "Date range" });

  it("appears only once the full controls have scrolled out of view", () => {
    setup();
    expect(bar()).not.toBeInTheDocument();
    fire(false);
    expect(within(bar()!).getByRole("button", { name: /Dec 2020 – Dec 2025/ })).toBeInTheDocument();
    fire(true);
    expect(bar()).not.toBeInTheDocument();
  });

  it("changes the range from the bar, updating every chart", async () => {
    const user = setup();
    fire(false);
    await user.click(within(bar()!).getByRole("button", { name: "1 year" }));
    expect(screen.getAllByRole("img").filter((c) => c.getAttribute("aria-label")?.includes("Dec 2024 to Dec 2025"))).toHaveLength(12);
    expect(within(bar()!).getByRole("button", { name: /Dec 2024 – Dec 2025/ })).toBeInTheDocument();
  });

  it("opens the month pickers in a popover that Escape closes, returning focus", async () => {
    const user = setup();
    fire(false);
    const toggle = within(bar()!).getByRole("button", { name: /Dec 2020 – Dec 2025/ });
    await user.click(toggle);
    const panel = within(bar()!).getByRole("dialog", { name: "Choose months" });
    await user.selectOptions(within(panel).getByRole("combobox", { name: "From year" }), "2023");
    expect(window.location.search).toBe("?from=2023-12&to=2025-12");
    await user.keyboard("{Escape}");
    expect(within(bar()!).queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(bar()!).getByRole("button", { name: /Dec 2023 – Dec 2025/ })).toHaveFocus();
  });
});

describe("reset", () => {
  const resetBtn = () => screen.getAllByRole("button", { name: "Reset" })[0]!;
  const gridHas = (span: string) => screen.getAllByRole("img").filter((c) => c.getAttribute("aria-label")?.includes(span)).length;

  it("is disabled while the page is as it opened", () => {
    setup();
    expect(resetBtn()).toBeDisabled();
  });

  it("goes back to the last 5 years and clears the picked month; Undo reverses it", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 100, right: 1000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "1 year" }));
    const hero = screen.getByRole("group", { name: /^Comparison chart\./ });
    fireEvent.pointerDown(hero, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(hero, { clientX: 500, pointerId: 1 });
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(document.querySelectorAll(".marker").length).toBe(13);

    await user.click(resetBtn());
    // The fixture's latest month is Dec 2025, so "last 5 years" = Dec 2020 .. Dec 2025.
    expect(gridHas("Dec 2020 to Dec 2025")).toBe(12);
    expect(document.querySelectorAll(".marker").length).toBe(0);
    expect(resetBtn()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Undo range change" }));
    await waitFor(() => expect(gridHas("Dec 2024 to Dec 2025")).toBe(12));
  });

  it("clears an error message too", async () => {
    const user = setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "From year" }), "2025");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(resetBtn()).toBeEnabled();
    await user.click(resetBtn());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Undo and redo", () => {
  it("are one labelled pair, each named for what it does", () => {
    setup();
    const group = screen.getByRole("group", { name: "Range history" });
    expect(group).toHaveTextContent("UndoRedo");
    expect(within(group).getByRole("button", { name: "Undo range change" })).toBeDisabled();
    expect(within(group).getByRole("button", { name: "Redo range change" })).toHaveAttribute("title", "Redo range change (Ctrl+Shift+Z)");
  });
});

describe("Plot axis", () => {
  it("renders repeated month labels (a range over a year) without duplicate keys", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const geometry = {
      paths: [],
      bars: [],
      yTicks: [],
      xTicks: [
        { pos: 10, label: "May" },
        { pos: 60, label: "May" },
      ],
      prelimPos: null,
      x: () => 0,
      y: () => 0,
      indexAt: () => 0,
    };
    render(<Plot geometry={geometry} keys={[]} label="test chart" tickLabel={String} />);
    expect(screen.getAllByText("May")).toHaveLength(2);
    expect(errors.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
    errors.mockRestore();
  });
});
