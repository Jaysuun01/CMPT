// End-to-end tests for the price page: the shared date range, links, keyboard use and layout.
import { expect, test } from "@playwright/test";

// Runs against the real data (Jan 1926 .. Sep 2026). The default view is the last 5 years.

const gridLabels = async (page: import("@playwright/test").Page) =>
  (await page.getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))).filter(
    (l) => !l.startsWith("Line chart"),
  );

test("one range change updates all 13 charts, the table and the URL", async ({ page }) => {
  await page.goto("/");
  expect(await gridLabels(page)).toHaveLength(12);
  expect((await gridLabels(page)).every((l) => l.includes("Sep 2021 to Sep 2026"))).toBe(true);

  await page.getByRole("button", { name: "10 years" }).click();
  await expect(page).toHaveURL(/\?from=2016-09&to=2026-09$/);
  expect((await gridLabels(page)).every((l) => l.includes("Sep 2016 to Sep 2026"))).toBe(true);
  await expect(page.getByRole("img", { name: /^Line chart.*set to 100 in Sep 2016/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Index, Sep 2016" })).toBeVisible();
});

test("the table shows the hand-checked change for steel over 5 years", async ({ page }) => {
  await page.goto("/");
  // 405.663 (Sep 2021) -> 383.330 (Sep 2026): factor 0.945, change −5.5%
  const steel = page.getByRole("row", { name: /Iron and steel/ });
  await expect(steel).toContainText("−5.5%");
  await expect(steel).toContainText("0.945");
});

test("custom months from the dropdowns, and an inline error for an impossible range", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "From year" }).selectOption("2020");
  await page.getByRole("combobox", { name: "From month" }).selectOption({ label: "March" });
  await expect(page).toHaveURL(/\?from=2020-03&to=2026-09$/);

  // March 2026 is still a valid start; December 2026 is past the data.
  await page.getByRole("combobox", { name: "From year" }).selectOption("2026");
  await expect(page).toHaveURL(/\?from=2026-03&to=2026-09$/);
  await page.getByRole("combobox", { name: "From month" }).selectOption({ label: "December" });
  // Next.js also renders an (empty) route-announcer alert, so match ours by its text.
  await expect(page.getByRole("alert").filter({ hasText: "latest data is for September 2026" })).toBeVisible();
  await expect(page).toHaveURL(/\?from=2026-03&to=2026-09$/);
});

test("a shared link restores the view, and the back button restores the previous one", async ({ page }) => {
  await page.goto("/?from=2000-01&to=2010-01");
  expect((await gridLabels(page)).every((l) => l.includes("Jan 2000 to Jan 2010"))).toBe(true);

  await page.getByRole("button", { name: "1 year" }).click();
  expect((await gridLabels(page)).every((l) => l.includes("Sep 2025 to Sep 2026"))).toBe(true);

  await page.goBack();
  await expect(page).toHaveURL(/\?from=2000-01&to=2010-01$/);
  expect((await gridLabels(page)).every((l) => l.includes("Jan 2000 to Jan 2010"))).toBe(true);
});

test("a malformed link falls back to the last 5 years instead of failing", async ({ page }) => {
  const res = await page.goto("/?from=<script>&to=2026-99");
  expect(res?.status()).toBe(200);
  expect((await gridLabels(page)).every((l) => l.includes("Sep 2021 to Sep 2026"))).toBe(true);
});

test("the comparison chart can be read with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.locator(".hero-wrap").focus();
  await page.keyboard.press("Home");
  await expect(page.getByText(/^September 2021: Steel 100\.0, Lumber 100\.0, Concrete 100\.0$/)).toBeAttached();
});

test("the page never scrolls sideways", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);
});

test("every quick-range button is fully visible, with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  const seg = await page.getByRole("group", { name: "Quick ranges ending in the latest month" }).boundingBox();
  for (const name of ["1 year", "5 years", "10 years", "20 years", "All"]) {
    const b = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(seg!.x - 0.5);
    expect(b!.x + b!.width).toBeLessThanOrEqual(seg!.x + seg!.width + 0.5);
  }
  // The group clips overflow, so the ring must be drawn inside the button to be seen.
  await page.getByRole("button", { name: "1 year" }).focus();
  await page.keyboard.press("Tab");
  const ring = await page.getByRole("button", { name: "5 years" }).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset) };
  });
  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);
  expect(ring.offset + ring.width).toBeLessThanOrEqual(0);
});

test("drill-down: click a month for details, Escape closes", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByRole("img", { name: /^Iron and steel, index level/ });
  const box = (await chart.boundingBox())!;
  await chart.click({ position: { x: 1, y: box.height / 2 } }); // first month in view: Sep 2021
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "September 2021" })).toBeVisible();
  // Hand-checked: steel Sep 2021 index 405.663, YoY +97.7%
  await expect(dialog.getByRole("row", { name: /Iron and steel/ })).toContainText("405.7");
  await expect(dialog.getByRole("row", { name: /Iron and steel/ })).toContainText("+97.7%");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/); // looking at a month never changes the range
});

test("drill-down: drag across the comparison chart to zoom", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse dragging is a desktop gesture; phones use the month panel");
  await page.goto("/");
  const plot = page.getByRole("img", { name: /^Line chart/ });
  await plot.scrollIntoViewIfNeeded(); // page.mouse works in viewport coordinates and doesn't scroll
  const b = (await plot.boundingBox())!;
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.2, y, { steps: 5 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\?from=2021-09&to=2022-09$/);
  const labels = await page.getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.filter((l) => l.includes("Sep 2021 to Sep 2022"))).toHaveLength(12);
});

test("Undo and Redo step through range changes", async ({ page }) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Undo range change" });
  const redo = page.getByRole("button", { name: "Redo range change" });
  await expect(undo).toBeDisabled();

  await page.getByRole("button", { name: "10 years" }).click();
  await page.getByRole("combobox", { name: "From year" }).first().selectOption("2021");
  await expect(page).toHaveURL(/\?from=2021-09&to=2026-09$/);

  await undo.click();
  await expect(page).toHaveURL(/\?from=2016-09&to=2026-09$/);
  await undo.click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/);
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(page).toHaveURL(/\?from=2016-09&to=2026-09$/);
});

test("drill-down: focus returns to the chart after closing the month panel", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard focus flow");
  await page.goto("/");
  const chart = page.getByRole("group", { name: /^Comparison chart\./ });
  await chart.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(chart).toBeFocused();
});

test("a slim range bar stays available while scrolling through the charts", async ({ page, isMobile }) => {
  await page.goto("/");
  const bar = page.getByRole("region", { name: "Date range" });
  await expect(bar).toHaveCount(0);
  await page.getByRole("heading", { name: "Month by month" }).scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Sep 2021 – Sep 2026" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "1 year" })).toBeVisible({ visible: !isMobile });

  await bar.getByRole("button", { name: "Sep 2021 – Sep 2026" }).click();
  const panel = bar.getByRole("dialog", { name: "Choose months" });
  await expect(panel.getByRole("button", { name: "10 years" })).toBeVisible({ visible: !!isMobile }); // quick ranges live in the bar on desktop
  await panel.getByRole("combobox", { name: "From year" }).selectOption("2016");
  await expect(page).toHaveURL(/\?from=2016-09&to=2026-09$/);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bar.getByRole("button", { name: "Sep 2016 – Sep 2026" })).toBeFocused();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);
});

test("Reset returns to the last 5 years, from the page or the sticky bar", async ({ page }) => {
  await page.goto("/?from=2000-01&to=2010-01");
  const reset = page.getByRole("button", { name: "Reset" });
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page).toHaveURL(/\?from=2021-09&to=2026-09$/);
  await expect(reset).toBeDisabled();

  await page.getByRole("button", { name: "All" }).first().click();
  await page.getByRole("heading", { name: "Month by month" }).scrollIntoViewIfNeeded();
  const bar = page.getByRole("region", { name: "Date range" });
  await bar.getByRole("button", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\?from=2021-09&to=2026-09$/);
});

test("clicking a grid chart enlarges it with the month's details, readable by hovering", async ({ page }) => {
  await page.goto("/");
  const cell = page.getByRole("img", { name: /^Iron and steel, year-over-year/ });
  const box = (await cell.boundingBox())!;
  await cell.click({ position: { x: box.width - 1, y: box.height / 2 } }); // latest month: Sep 2026
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Iron and steel: Year-over-year" })).toBeVisible();
  // Hand-checked: steel YoY Sep 2026 = 383.330 / 317.520 − 1 = +20.7%
  await expect(dialog.getByRole("definition").first()).toHaveText("+20.7%Sep 2026");
  await expect(dialog.getByRole("heading", { name: /^September 2026/ })).toBeVisible();

  const big = dialog.getByRole("img", { name: /enlarged/ });
  const b = (await big.boundingBox())!;
  await big.hover({ position: { x: 2, y: b.height / 2 } });
  await expect(dialog.locator(".tip")).toContainText("September 2021");
  await big.click({ position: { x: 2, y: b.height / 2 } });
  await expect(dialog.getByRole("heading", { name: "September 2021" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
