# Implementation plan

**How it relates to the other docs:** [plan.md](plan.md) holds the architecture and reasons. This file is the ordered task list. CLAUDE.md rules apply to every task.

## Every task is done when
- the code and its tests are written, the tests pass, and `npm run verify` is green
- a subagent has verified it, and every finding is resolved (CLAUDE.md §6)
- the diff has been re-read and anything unneeded deleted (§3)

**Milestone checkpoint:** run `npm run verify:full`, then ask the user before committing.

## Blocking decisions

| # | Decision | Status | Needed by |
|---|---|---|---|
| D1 | Exact versions | **Decided** (verified; see below) | Task 1.1 |
| D2 | LLM feature design | **Decided**: Material Risk Check, [ai-feature.md](ai-feature.md) | Phase 6 |

### D1: pinned versions
A verifier checked these against nodejs.org, nextjs.org, GitHub advisories and the npm registry.

| Package | Version | Why this one |
|---|---|---|
| Node (`.nvmrc`, `engines`) | 26.13.0 | Active LTS since 2026-10-28. v23 is end-of-life, and vitest 5 and jsdom both refuse to run on it. |
| next, eslint-config-next | 16.4.6 | Latest 16.x with no open advisories. 16.4.5 is the security floor. |
| react, react-dom | 19.3.1 | Includes the RSC remote-code-execution fix |
| typescript | 6.0.3 | TS 7 is outside typescript-eslint's peer range (<6.1), and its Next support is experimental |
| zod | 4.6.7 | Must be ≥4.6.6 because of a memory-exhaustion advisory |
| @google/genai | 3.0.0 | The official SDK. `@google/generative-ai` is deprecated. |
| server-only | 0.0.1 | |
| @types/react, @types/react-dom | 19.3.0 | |
| @types/node | 26.6.6 | |
| vitest | 5.1.0 | |
| vite | 8.3.7 | Explicit peer of vitest 5. Must be ≥8.3.3 because of advisories. |
| @vitejs/plugin-react | 6.3.0 | |
| jsdom | 30.1.3 | 31.0 is 4 days old and rewrites its CSS engine, so we take the conservative pick |
| @testing-library/react | 16.3.3 | |
| @testing-library/dom | 10.4.2 | Required peer of jest-dom 7 |
| @testing-library/jest-dom | 7.0.1 | |
| @testing-library/user-event | 14.6.8 | 14.6.9 was published hours ago |
| @playwright/test | 1.65.0 | |
| eslint | 9.39.5 | ESLint 10 needs `--legacy-peer-deps` because the plugins haven't caught up. Reviewers' `npm ci` must just work. npm prints a deprecation warning for ESLint 9 on install; the user accepted this (dev-only tool, nothing that ships is affected). |

Notes:
- `next lint` was removed in Next 16, so the lint script runs `eslint .` directly.
- Vitest can't render async Server Components, so `page.tsx` is covered by Playwright.
- Vitest 5 sets `clearMocks: true` by default.

## Phase 1: Scaffold

| Task | What | Files |
|---|---|---|
| 1.1 | Generate a Next.js App Router + TypeScript + ESLint project in a temp folder (`--src-dir`, no Tailwind, `@/*` alias), then copy it into the repo. The repo already has `data/`, `docs/` and `CLAUDE.md`. Delete the boilerplate pages, images and CSS. | `package.json`, `src/app/*`, `tsconfig.json`, `eslint.config.mjs` |
| 1.2 | Pin every dependency to an exact version. Add `.npmrc` (`save-exact=true`), `.nvmrc` and `engines`. Commit `package-lock.json`. | `.npmrc`, `.nvmrc`, `package.json` |
| 1.3 | Set TypeScript to `strict` plus `noUncheckedIndexedAccess`. | `tsconfig.json` |
| 1.4 | Vitest: jsdom environment, the `@/` alias, `server-only` aliased to an empty module, and `@testing-library/jest-dom` setup. | `vitest.config.ts`, `vitest.setup.ts`, `test/server-only.ts` |
| 1.5 | Playwright: `webServer` runs `next build && next start -p 3100` with `GEMINI_MOCK=1`. Projects: Chromium desktop and a 390 px Chromium phone. | `playwright.config.ts` |
| 1.6 | Security headers and CSP, as in CLAUDE.md §5. Add `'unsafe-eval'` only in development. Set `poweredByHeader: false`. | `next.config.ts` |
| 1.7 | Self-host Public Sans (woff2, OFL licence) with `next/font/local`. | `src/app/fonts/*`, `src/app/layout.tsx` |
| 1.8 | npm scripts: `dev`, `lint`, `typecheck`, `test`, `test:e2e`, `verify`, `verify:full`. Add `.env.example` with an empty `GEMINI_API_KEY=`. Start a README skeleton. | `package.json`, `.env.example`, `README.md` |
| 1.9 | Smoke e2e test: the page loads with no console or CSP errors, on a production build. | `e2e/smoke.spec.ts` |

**Done when:** `verify:full` is green on a placeholder page.
**Verifier:** config and security review (headers, CSP, scripts, pinning).

## Phase 2: Data and stats
Each module is pure TypeScript, written test-first.

| Task | Module | What gets tested |
|---|---|---|
| 2.1 | `src/lib/months.ts`: index ↔ `YYYY-MM`, `label(i, long?)`, presets, `validateRange`, `parseRangeParams` (zod) | Round trip; Jan 1926 = 0; Sep 2026 = 1208; presets; start ≥ end; out of range; single month; malformed params fall back to the default |
| 2.2 | `src/lib/data/parse.ts`: `parseFredCsv(text, seriesId)` | Header mismatch; `.` → null; blank lines; CRLF; bad date; non-numeric value; duplicate month; unsorted rows; header-only CSV gives an empty series |
| 2.3 | `src/lib/data/load.ts` (server-only): read the 3 CSVs and line up their months | Real files load with 1,209 points each; mismatched months throw a clear error |
| 2.4 | `src/lib/stats.ts`: `mom`, `yoy`, `volatility`, `change(from, to)`, `rebase`, `volatilityNorm` | Hand-worked expected values from the CSVs (MoM, YoY, volatility at known months); null for the first month and first 12 months; null when a window has a gap; YoY defined at the first month of a 5-year range |
| 2.5 | `src/lib/chart.ts`: `niceTicks`, `scale`, `linePath` (gaps at nulls), `barRects`, `chartLabel` | Tick endpoints; path gaps; single-point path; aria-label text |
| 2.6 | `src/lib/share.ts`: `summarySentence`, `toCsv` | Wording for rises and falls; preliminary note; CSV header and rows; the month range in the CSV |

**Verifiers (two, independent):**
- **A** recomputes a sample of stats straight from the CSVs, without reading our code.
- **B** reviews the code and tests for correctness, and asks whether the tests would catch a mutation.

## Phase 3: UI core

| Task | What |
|---|---|
| 3.1 | `globals.css`: light and dark tokens and series colours from the approved prototype |
| 3.2 | `page.tsx` reads the async `searchParams`, validates them, loads the data, and renders `Tracker`. `Tracker` holds `{from, to}`, updates the URL with `history.pushState`, and handles `popstate`. |
| 3.3 | `LatestMonth`: latest month, YoY large, MoM below, for each material |
| 3.4 | `RangePicker`: 4 labelled `<select>`s and quick-range buttons; an invalid range shows an inline error and keeps the last valid view |
| 3.5 | `ResultsTable`: change, factor, both index values (with "p" on preliminary months), volatility |
| 3.6 | `SmallChart` (memoized, `role="img"` with an aria-label) and `MetricGrid` (4 measures × 3 materials) |
| 3.7 | `SourceNotes`: full BLS titles and codes, the date the data was pulled, and caveats |

**Component tests**
- each chart can be found by role and name
- changing the range changes all 12 chart labels
- the invalid-range state
- the table values and the "p" flags
- the "Not seasonally adjusted" note is present
- no `$` anywhere on the page

**Screenshot review:** 1440 px and 390 px, light and dark, compared with the approved prototype.
**Verifier:** UI code and a11y review, including the screenshots.

## Phase 4: Design extras (cut in reverse order if short of time)

| Task | What |
|---|---|
| 4.1 | `HeroChart`: rebased comparison chart, mouse hover readout, arrow-key readout, `aria-live` text |
| 4.2 | Volatility norm column in the results table |
| 4.3 | `ShareBar`: copy sentence (with a fallback when the clipboard API is missing), copy link, CSV download (`Blob`) |

**Component tests:** the hover and keyboard readouts; "Copied" appears both with and without `navigator.clipboard`; the CSV content.
**Verifier:** a standard single review.

## Phase 5: End-to-end tests and hardening

**e2e tests** (`e2e/*.spec.ts`)
- a preset updates all 13 chart labels and the table
- custom months work
- a `?from=&to=` URL restores the view
- the back button restores the previous range
- the CSV download fires
- copy works (Chromium only)
- no horizontal scroll at 390 px

**Hardening:** `npm audit --omit=dev --audit-level=high` passes; the secrets grep passes; the CSP is clean on a production build.

**Verifier:** a security and test-coverage review against CLAUDE.md §4–5.

## Phase 6: LLM feature, Material Risk Check

The design and every rule are in [ai-feature.md](ai-feature.md); this section is only the build order. Code lives in `backend/src/risk/` and `frontend/src/components/risk/`.

**6.0 Setup.** Pin `@google/genai` 3.0.0 in `backend/package.json` and put `GEMINI_API_KEY=` back in `.env.example`. `createApp` takes the env and a clock. `backend/eval` is covered by the backend tsconfig and lint. Research how thinking tokens count against `maxOutputTokens` on `gemini-3.6-flash`; a research verifier checks it.

**6.1 Curated events.** `backend/src/risk/events.ts`: 6–8 events with id, month, materials, shock type, description, what happened next and an official source. Each month and note is researched, then checked by an independent verifier against its source.

**6.2 Analysis (pure code, no LLM).** `backend/src/risk/analysis.ts` covers:
- the two clocks (L from `preliminaryMonths`, T₀ as a parameter, G with the 24-month stale cap)
- candidate months, standardized distance, and similar-period selection with 6-month spacing
- what followed
- strategies, with duplicate sets hidden
- the break-even carrying cost and "came out ahead"
- the past-event case, with the event month as a parameter

It works from raw values through `stats.ts`, never the rounded dataset arrays. Unit tests use small hand-worked series plus a few values worked by hand from the CSVs. A spreadsheet math check (per the doc) is done by the user or reported as open. **Verifiers: two (stats).**

**6.3 Project validator.** `backend/src/risk/project.ts` holds strict zod schemas for the `/analyze` and `/news` bodies, with these rules:
- every input limit from the doc
- calendar months converted to months from T₀
- shares checked within ±0.5 points, then rescaled
- event IDs must be curated, and the event must cover its material
- `/news` rejects budgets and any unknown field

Unit tests cover each limit, at and just past it. **Verifiers: two (security), batched with 6.5.**

**6.4 Gemini steps.** `backend/src/risk/gemini.ts` runs three calls:
- **extract:** JSON schema, no tools. Its permissive `.strict()` reply schema is separate from the limits validator.
- **search:** the Google Search tool, returning plain text and grounding metadata.
- **classify:** JSON schema, no tools.

Rules for every call:
- a 12 s timeout through `abortSignal`, `maxOutputTokens`, `thinkingConfig` and a `finishReason` check
- no retry on 429
- user text and developments go in a random per-request delimiter, and the system prompt says the content is data, not instructions

Rules for developments and sources:
- developments come from grounding supports as UTF-8 byte slices, cut to 300 characters
- at most 15 go to classify, and at most 5 are kept per material
- unknown or duplicate `devId`s fail the step
- developments for materials not in the project are dropped
- sources come from grounding chunks, https only, and a development without one is dropped

`GEMINI_MOCK=1` swaps in a fake SDK client with fixture responses, grounding metadata included, so the same parsing runs. The scenario is chosen by input: a sentinel description fails extract, a concrete-only project fails search, a lumber-only project fails classify. **Verifiers: two (LLM handling), batched with 6.5.**

**6.5 Routes.** These live in `backend/src/risk/routes.ts`, mounted in `app.ts`:
- `GET /api/risk/status`
- `POST /api/risk/extract`
- `POST /api/risk/news`, with a 25 s total budget
- `POST /api/risk/analyze`, where all numbers, dollars included, are computed server-side

A shared AI limiter on extract and news allows 5 requests a minute and 30 an hour, and is raised in mock mode. Each route catches its own errors and logs fields only, so nothing reaches the global `onError`. Client errors are generic. The clock is injected and fixed at 2026-11 in mock mode. API tests mock `@google/genai` with `vi.mock` and cover the doc's API test list. **Verifiers: the same two as 6.3 and 6.4 (LLM and security).**

**6.6 Frontend.** `frontend/src/lib/risk.ts` is client-safe: no `server-only`, relative `/api/risk/*` URLs, and zod schemas for every response, with https-only links. The Risk Check component has four steps:
- describe the project, or start from the form when there's no key
- confirm the project details, with the history window and the carrying-cost benchmark
- review the developments: dismissing one hides it, and changing an event re-calls only `/analyze`
- read the risk register for each material

The register shows:
- both dates and the gap
- what followed, beside the all-period shares
- the strategies and the break-even rate
- the event case, labeled "after, not caused by"
- other responses, the re-check line, the assumptions and the disclaimer

It also covers these states:
- no key
- an extract error
- search unavailable
- classify failed
- too few similar periods
- not enough data yet
- recent conditions can't be measured
- data out of date
- no timing decision

Buttons are disabled while a request is in flight. Everything renders as plain text, and links use `rel="noopener noreferrer"`. Component tests cover each state. A screenshot review is done at desktop and phone width, in light and dark mode. **Verifiers: two (LLM output rendering and security).**

**6.6a Plan a purchase page.** The user found the first layout hard to use: it sat under the price charts, and the results were a long stack of text and tables. Redesign:
- Its own page, `/plan`, reached from a "Prices / Plan a purchase" tab in the header and a pointer section on the price page.
- Three numbered steps: describe, check the details, your answer. A finished step folds to a one-line summary with an Edit button; reading a new description clears the old answer.
- Each material leads with its answer and a dot chart: one dot per similar period at its break-even carrying cost, filled where buying early came out ahead, with a line at the user's rate. `/analyze` adds each period's rounded break-even rate (`breakEven.rates`, in the order of `similar`) for it. The tables, recent prices, what followed and the past event sit in a collapsed Details section.
- One news list for all materials; other responses and the re-check line shown once.
- Budgets shown with thousands separators; each phase on one line; "Try an example" fills a sample description.

Component and E2E tests updated; screenshots reviewed at desktop and phone width, light and dark. **Verifier: one (UI and accessibility), plus the stats check of `rates`.**

**6.7 E2E and accuracy check.**
- `e2e/risk.spec.ts`: the happy path and the extract error, under `GEMINI_MOCK=1`.
- `backend/eval/accuracy.ts`: hand-labeled cases for steps 1 and 3, including irrelevant articles and one injected article. It needs a key, so the user runs it, and the results go in the README.

**Milestone:** `npm run verify:full`, then a report to the user.

## Phase 7: README and submission

- **README:**
  - what the app is and who it's for
  - setup (Node version, `npm ci`, `backend/.env`)
  - run, test, verify
  - metric definitions
  - data cleaning rules and their tests
  - design and research summary
  - the AI feature and why it was chosen
  - **How I used AI**: what AI did, where it was wrong and how that was caught, and how the work was checked
  - known limits
- **Fresh-clone test:** clone into a temporary folder, follow only the README, and run `verify:full`.
- **Final checks:** `verify:full`, the secrets grep, a review of the staged files, then the user approves the commit.
- **Verifier:** reproduce the setup from the README alone.


