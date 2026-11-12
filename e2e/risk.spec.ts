// End-to-end tests for Plan a purchase, against production builds with GEMINI_MOCK=1 (no network, fixed fixtures).
import { expect, test } from "@playwright/test";

// The backend runs with GEMINI_MOCK=1 (playwright.config.ts): today is fixed at 2026-11, extract returns
// lumber, concrete and steel needed 2027-03, 2027-09 and 2028-03, and the description "MOCK_FAIL" is blocked.
// Mock advice locks supply for a material with availability-risk news, follows the history lean otherwise
// (with no figures, like the real model),
// and fails for a steel-only project.

test("the header tab and the price page both lead to Plan a purchase", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plan a purchase" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("heading", { level: 1, name: "Plan a purchase" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("region", { name: "Planning a purchase?" }).getByRole("link", { name: "Plan a purchase" }).click();
  await expect(page).toHaveURL(/\/plan$/);
});

test("AI happy path: describe, confirm, see the answer and the news", async ({ page }) => {
  await page.goto("/plan");
  await page.getByRole("textbox", { name: "Describe the project" }).fill("Three buildings from March 2027: lumber $2M, concrete $800K, steel $200K.");
  await page.getByRole("button", { name: "Read the description" }).click();

  const form = page.getByRole("form", { name: "Check the details the AI read" });
  await expect(form.getByRole("textbox", { name: "Iron and steel budget in dollars" })).toHaveValue("200,000");
  await form.getByRole("textbox", { name: /Carrying cost/ }).fill("2");
  await form.getByRole("button", { name: "Run the check" }).click();

  // The answer comes first: AI advice beside code's history lean.
  const advice = page.getByRole("region", { name: "Should you buy now?" });
  const steelAdvice = advice.getByRole("listitem").filter({ hasText: "Iron and steel" });
  // History's suggestion stays the headline and takes in the steel news's supply warning as one plan.
  await expect(steelAdvice).toContainText("Consider buying as each phase needs it, but booking supply now");
  await expect(steelAdvice).toContainText("Booking means reserving supply or fixing prices with your supplier, not storing materials early.");
  await expect(steelAdvice).toContainText("booking supply with the supplier would protect the later phases");
  await expect(steelAdvice).toContainText("Strong evidence");
  await expect(steelAdvice).toContainText("Buying as needed was cheapest in 18 of 20 past periods like today");
  await expect(steelAdvice).toContainText("Mills report longer lead times");
  await expect(steelAdvice).toContainText("AI reading of 1 news item: www.example.org");
  await expect(advice.getByRole("listitem").filter({ hasText: "Lumber and wood" })).toContainText("The current news doesn't change what history shows for this material.");

  const steel = page.getByRole("article", { name: /Iron and steel/ });
  // Steel since 1970 at 2%/month: recomputed from WPU101.csv by two independent scripts.
  await expect(steel.getByText(/came out ahead in 0 of 20 similar past periods/)).toBeVisible();
  await expect(steel.getByText(/below a median of 0\.55% a month/)).toBeVisible();
  // Where steel went by each need date (4, 10 and 16 months), from the same independent script.
  await expect(steel.getByRole("row", { name: /Mar 2027/ })).toContainText("Rose in 5, within ±5% in 14, fell in 1 of 20 similar periods");
  await expect(steel.getByRole("row", { name: /Sep 2027/ })).toContainText("Rose in 9, within ±5% in 7, fell in 4 of 20 similar periods");
  await expect(steel.getByRole("row", { name: /Sep 2027/ })).toContainText("−41.9% to +38.5%");
  await expect(steel.getByRole("row", { name: /Mar 2028/ })).toContainText("Rose in 10, within ±5% in 4, fell in 6 of 20 similar periods");
  await expect(steel.getByRole("table", { name: /Extra cost of each buying strategy/ })).toBeVisible();
  await expect(steel.getByRole("combobox", { name: "Closest past event" })).toHaveValue("steel-232-2018");
  await steel.getByText("More on iron and steel").click();
  await expect(steel.getByRole("img", { name: /break-even carrying cost in each of 20 similar past periods/ })).toBeVisible();

  const news = steel.getByRole("region", { name: "Current risk factors for Iron and steel" });
  await expect(news.getByText(/^AI summary of the news: Several steel mills reported longer lead times/)).toBeVisible();
  await expect(news.getByRole("link", { name: "www.example.org" })).toHaveAttribute("href", "https://www.example.org/steel-lead-times");
  await expect(news.getByRole("heading", { name: "Production and capacity" })).toBeVisible();

  // Mock FRED series: 100 rising by 1 a month from Oct 2023, so Sep 2026 is 135 and its 12-month change is 135 / 123 − 1 = +9.8%.
  const costs = page.getByRole("region", { name: "Energy and freight costs" });
  await expect(costs.getByRole("row", { name: /Natural gas/ })).toContainText("$135.00");
  await expect(costs.getByRole("row", { name: /Natural gas/ })).toContainText("+9.8%");
  await expect(costs.getByRole("row", { name: /Trucking/ })).toContainText("135.0 p");

  // The fixture's span with only an http source is dropped by code.
  await expect(page.getByText("A claim with only an insecure source.")).toHaveCount(0);
  await expect(page.getByText(/most like May 2026, the latest final data\. Today is Nov 2026, 6 months later/)).toBeVisible();

  // The confirmed details fold to a summary; Edit opens them again with the values kept.
  await page.getByRole("button", { name: "Edit the details" }).click();
  await expect(page.getByRole("textbox", { name: /Carrying cost/ })).toHaveValue("2");
});

test("AI error: a generic message, and the manual form still runs", async ({ page }) => {
  await page.goto("/plan");
  await page.getByRole("textbox", { name: "Describe the project" }).fill("MOCK_FAIL");
  await page.getByRole("button", { name: "Read the description" }).click();
  // Scoped to main: Next.js adds its own route announcer with the alert role.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Couldn't read the description. Please fill in the form.");

  const form = page.getByRole("form", { name: "Project details" });
  await form.getByRole("checkbox", { name: /Iron and steel/ }).check();
  await form.getByRole("textbox", { name: "Iron and steel budget in dollars" }).fill("200000");
  const months = form.getByLabel(/need month$/);
  await months.first().fill("2027-03");
  for (const m of ["2027-09", "2028-03"]) {
    await form.getByRole("button", { name: "Add a phase" }).click();
    await months.last().fill(m);
  }
  await form.getByRole("textbox", { name: /Carrying cost/ }).fill("2");
  await form.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByRole("article", { name: /Iron and steel/ }).getByText(/came out ahead in 0 of 20/)).toBeVisible();
  // The mock advice fails for a steel-only project, so the history lean shows alone.
  const advice = page.getByRole("region", { name: "Should you buy now?" });
  await expect(advice.getByText(/The AI advice couldn't be written, so these come from price history only/)).toBeVisible();
  // Steel since 1970 at 2%, needed 2027-03, 2027-09 and 2028-03: recomputed from WPU101.csv by an independent script.
  await expect(advice.getByRole("listitem")).toContainText("Consider buying as each phase needs it");
  await expect(advice.getByRole("listitem")).toContainText("Buying as needed was cheapest in 18 of 20 past periods like today");
});
