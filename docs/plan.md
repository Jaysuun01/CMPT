# Build plan: everything except the LLM feature

**Design:** this plan ports the approved HTML prototype to Next.js.

**Rules:** CLAUDE.md applies throughout: minimal code, tests at every level, subagent verification.

**Plan review:** an independent review's must-fixes (1–4) and should-fixes (5–9) are folded in below.

## Architecture

> **Update: split into `backend/` and `frontend/`.** Express 5 serves the cleaned data and stats.
>
> - **Moved to the backend:** parse, load and stats, plus the data files (`backend/data/`).
> - **Moved to the frontend:** months, chart and share helpers, and the UI.
> - **Data flow:** `page.tsx` fetches the series and stats from the backend on the server. The browser only ever talks to the frontend origin, because `/api/*` is proxied to the backend.
>
> The file map below shows the original single-app layout. Paths change, but the responsibilities stay the same.

```
data/WPU08.csv, WPU101.csv, WPU133.csv     source data, committed
src/lib/data/parse.ts      parseFredCsv(text, id): validates the header, handles ".", rejects malformed rows
src/lib/data/load.ts       server-only: reads the 3 CSVs and checks they cover the same months
src/lib/months.ts          integer month index <-> "YYYY-MM", fixed month-name labels, presets, range validation
src/lib/stats.ts           mom, yoy, volatility, change between two months, rebase, 10-yr volatility norm
src/lib/share.ts           summary sentence, CSV text for the selected range
src/lib/chart.ts           nice ticks, x/y scales, SVG path builder, aria-label text (pure)
src/app/page.tsx           server component: loads data, reads + zod-validates searchParams, renders <Tracker>
src/app/layout.tsx         self-hosted font (next/font/local), metadata
src/components/Tracker.tsx client: {from, to} state seeded from props, synced to the URL
  LatestMonth, RangePicker, ResultsTable, ShareBar, HeroChart, MetricGrid, SmallChart, SourceNotes
next.config.ts             security headers + CSP (CLAUDE.md §5), poweredByHeader false
```

**Decisions**
- **No chart library.** The approved design uses small SVG and HTML helpers, about 150 lines. Pure scale and path functions are unit-testable. This saves a dependency (§3) and keeps the charts matching the design exactly. Each series is one `<path>`, with no per-point nodes. Stats are memoized with `useMemo`, and `SmallChart` is memoized so the hero hover doesn't re-render the grid.
- **Stats are computed once on the full series, then sliced to the range.** This means YoY and volatility are defined from the very first month of any range that starts after 1927. *(Verifier must-fix 1)*
- **Months are integer indexes from 0 (Jan 1926) with a fixed month-name array.** No `Date` objects and no `Intl`, so there's no timezone shift and no hydration mismatch. The latest month comes from the data, never from `new Date()`. *(should-fix 5)*
- **URL sync without `useSearchParams`.**
  - `page.tsx` reads the async `searchParams` prop and validates `from`/`to` (YYYY-MM) with zod. Anything invalid or missing falls back to the last 5 years.
  - The page passes the initial range to `Tracker` as props.
  - `Tracker` updates the URL with `history.pushState` and listens for `popstate`, so the back button works.

  *(must-fix 2)*
- **Data is read on the server and sent to the client.** That's 3 × 1,209 numbers, about 30 KB. Changing the range needs no network call.
- **No API routes yet.** The first one arrives with the LLM feature.
- **Fonts are self-hosted** (Public Sans woff2 via `next/font/local`). The build then needs no network access, and the CSP can stay `font-src 'self'`.

## What is shown (the required views, made explicit)

| View | Lumber (WPU08) | Iron and steel (WPU101) | Concrete (WPU133) |
|---|---|---|---|
| Index level line | ✓ | ✓ | ✓ |
| Month-over-month % (bars) | ✓ | ✓ | ✓ |
| Year-over-year % (line) | ✓ | ✓ | ✓ |
| Volatility, rolling 12-mo (line) | ✓ | ✓ | ✓ |

That's 12 charts in `MetricGrid`, plus the rebased comparison chart. **The one range picker drives all 13 charts, the results table, the summary sentence, and the CSV.**

## Accessibility *(must-fix 3)*
- Every chart is `role="img"` with an aria-label built from the data. It names the material, the measure, the range, and the latest value, e.g. "Iron and steel, year-over-year, Sep 2021 to Sep 2026. Latest +20.7%."
- The hero chart can be focused (`tabIndex=0`). Left and right arrow keys move the readout month by month, so the hover has a keyboard path. The readout is also an `aria-live="polite"` text line.
- Controls are native `<select>` and `<button>` elements with labels. Focus is visible. Contrast was checked in the design phase.

## Metric definitions (CLAUDE.md §1)
- MoM % = (v[t]/v[t−1] − 1) × 100
- YoY % = (v[t]/v[t−12] − 1) × 100
- Volatility = sample standard deviation (n−1) of the last 12 MoM values
- A missing value inside a window makes that result `null`. Values are never interpolated.

## Priority and cut line *(should-fix 6)*
1. **Core (must ship):** data and stats, the 12 charts, the picker, URL sync, the results table, and tests for all of these.
2. **Approved-design extras:** the rebased hero chart with hover, the 10-year volatility norm, copy sentence, copy link, and CSV download. These are built after the core. If time runs short, they are cut, in reverse order.
3. **LLM feature.** Its design must be decided before it is built.
4. **README.** A skeleton is started in milestone 1 and filled in as we go.

## Milestones (each one: `npm run verify`, then subagent verification)
1. **Scaffold.**
   - Next.js, TS strict, ESLint, Vitest, RTL, Playwright
   - `.nvmrc`, `engines`, `.npmrc` save-exact, `.env.example`
   - security headers and CSP
   - a placeholder page and a README skeleton
   - **A Playwright smoke test against `next build && next start` that fails on any console or CSP error.** *(should-fix 7)*
2. **Data and stats.** `parse`, `load`, `months`, `stats`, `share`, `chart`, with unit tests. **Two verifiers.**
3. **UI core.** LatestMonth, RangePicker, ResultsTable, MetricGrid with SmallChart, SourceNotes, and component tests. Screenshot review at 1440 and 390 px, light and dark.
4. **Design extras.** HeroChart with keyboard hover, ShareBar, the volatility norm, and tests.
5. **End-to-end tests and hardening.** `verify:full` and `npm audit`.
6. **README** non-AI sections, including a **"Data cleaning"** section that lists each parse rule and its test.

## Test plan *(must-fix 4, should-fixes 8–9)*

**Unit**
- parse:
  - header mismatch
  - `.` values
  - blank lines, CRLF
  - bad dates, non-numeric values
  - duplicate or unsorted months
  - **a header-only CSV gives an empty series**
- load (with `server-only` mocked): the 3 files load and their months line up. A mismatch throws a clear error.
- stats, with **hand-worked expected values from the CSVs**:
  - MoM: WPU101 Sep 2026 = 383.330 / 377.806 − 1 = **+1.462%**
  - YoY at a known month
  - volatility at a known month (12 MoM values written into the test, n−1 standard deviation computed by hand)
- stats edge cases:
  - the first month gives a null MoM
  - the first 12 months give null YoY and volatility
  - a `.` inside a window gives null
  - **YoY is defined at the first month of a 5-year range** (proves stats are computed before slicing)
- months:
  - index ↔ YYYY-MM round trip
  - presets
  - start after end, single-month range, range outside the data
  - malformed URL params fall back to the default
- chart:
  - nice ticks and scale endpoints
  - path gaps at nulls
  - **a single-point path**
  - aria-label text
- share:
  - the sentence for rises and falls
  - CSV header and rows
  - the preliminary flag

**Component (RTL)**
- every chart renders from given data and is found by `getByRole('img', {name})`
- the picker changes the range and **all 12 labels change**
- an invalid range shows the error and keeps the last valid view
- the table shows the expected values, with "p" on the last 4 months
- the "Not seasonally adjusted" note is present on MoM
- no `$` appears anywhere
- copy shows "Copied", **including when `navigator.clipboard` is undefined** (the fallback path)

**End-to-end (Playwright, against a production build)**
- smoke: no console or CSP errors
- a preset updates all 13 chart aria-labels and the table
- custom months work
- **a `?from=…&to=…` URL restores the view, and the back button restores the previous range**
- the CSV download fires
- copy works (Chromium only, with clipboard permissions granted)
- no horizontal scroll at 390 px

