# Construction Material Price Tracker

A web app for people who buy construction materials. It has two pages:

- **Prices** (`/`): tracks three U.S. producer price indexes from FRED, monthly since 1926:
  - lumber and wood products (WPU08)
  - iron and steel (WPU101)
  - concrete products (WPU133)

  One date range drives every chart: a comparison chart, and for each material its index level, month-over-month change, year-over-year change and volatility. You can compare any two months, click a month for details, drag to zoom, undo and redo range changes, and share a link to the exact view.
- **Plan a purchase** (`/plan`): the AI feature. Describe a project in plain English and get an answer to the buyer's real question: *should I buy now, or wait?* The answer comes from what prices did in similar past periods, weighed against current supply-chain news. [More below](#ai-feature-plan-a-purchase).

## Run it

You need **Node 24.15 or later** (24 LTS), or Node 26. Node 26.13 is recommended and is the version in `.nvmrc`; with nvm, run `nvm install && nvm use`. The full test suite passes on both 24.22 and 26.13.

```bash
npm ci
cp backend/.env.example backend/.env   # then add your GEMINI_API_KEY (see below)
npm run dev                            # API on http://127.0.0.1:4000, web on http://127.0.0.1:3000
```

Open http://127.0.0.1:3000.

**A Gemini API key powers the AI feature.** What runs depends on the key:

| Key | What works |
|---|---|
| **Billed key** (recommended) | Everything: the AI reads your project description, then runs six news searches, one per area: tariffs and trade, shipping and freight, energy and fuel costs, weather and natural disasters, plant closures and lead times, and conflicts. The first 5,000 searches a month are free, about 800 checks. |
| **Free-tier key** | The AI reads your description. The news search doesn't run, because Google doesn't offer search grounding on the free tier for current Flash models. |
| **No key** | The price page and the Plan a purchase analysis still work; you fill in the project form yourself. |

> **Note:** I built and tested this with a billed Gemini key, so every feature, including the news search, has run against the real model.

**No billed key? See the whole AI flow with sample data:**

```bash
npm run demo
```

This runs the app with the AI steps answering from fixed samples: the description always reads as a sample three-building project, and the news is a sample set covering tariffs, mill lead times and energy costs. The page says it's in demo mode. The price analysis still runs on the real data.

The key is read only by the backend (`backend/.env`, which git ignores). Both servers listen on 127.0.0.1 only.

## Test it

```bash
npm run verify                   # lint + typecheck + unit, component and API tests
npx playwright install chromium  # first time only
npm run verify:full              # also end-to-end tests on production builds, and npm audit
npm run coverage                 # line and branch coverage for both workspaces
```

| | Tests | Line coverage | Branch coverage |
|---|---|---|---|
| Backend (Vitest + supertest) | 318 | 99.1% | 93.9% |
| Frontend (Vitest + React Testing Library) | 182 | 98.0% | 90.5% |
| End-to-end (Playwright, desktop and phone) | 42 passed, 2 skipped | | |

- **End-to-end tests run against production builds** on ports 3100 and 4100, built into `frontend/.next/e2e`, so they never disturb a running `npm run dev`.
- **They make no network calls.** The backend runs with `GEMINI_MOCK=1`, which answers every AI call from fixed fixtures through the same parsing and validation code.
- **The 2 skipped tests** are mouse-drag and keyboard-focus tests that only make sense on desktop, so the phone run skips them.
- **Coverage gaps:** what isn't covered is mainly the server start-up file and the Next.js page shells, which the end-to-end tests run against real builds.

**Two checks run the real model.** They need a key and make billed calls, so they're separate from `npm test`:

```bash
node --env-file=backend/.env backend/eval/accuracy.ts      # hand-labelled cases for reading and classifying
node --env-file=backend/.env backend/eval/consistency.ts   # same input 5 times; fails if any answer differs
```

## Metrics and data

**The values are index levels (1982 = 100), not dollar prices,** and the UI never labels them with `$`.

| Metric | Definition |
|---|---|
| Month-over-month % | `(v[t] / v[t−1] − 1) × 100`. Undefined for the first month. |
| Year-over-year % | `(v[t] / v[t−12] − 1) × 100`. Undefined for the first 12 months. |
| Volatility | Sample standard deviation (n − 1) of the last 12 month-over-month changes. Not annualized; undefined for the first 12 months. |

A result is undefined whenever any value it needs is missing; nothing is ever interpolated. Stats are computed on the full series and then sliced to the chosen range, so a range gets year-over-year and volatility from its first month.

**Data caveats, shown in the UI:**
- **Not seasonally adjusted:** month-over-month changes include seasonal swings.
- **The latest 4 months are preliminary.** BLS may revise them, and they're shaded and marked.
- **National indexes:** local prices differ.

**Cleaning rules** (`backend/src/data/parse.ts`, each one tested):
- **The header must name the expected series,** so the wrong file can't load silently.
- **FRED's `.` and empty cells become missing values.**
- **Rows may come in any order** and are sorted by month.
- **Months missing from a file become missing values,** never interpolated.
- **Ignored:** a byte-order mark, CRLF line endings, extra whitespace and blank lines.
- **Rejected with the line number:** a bad date, a non-numeric or non-positive value, a duplicate month, or the wrong number of columns.
- **The data loads once at startup,** and a bad file stops the server instead of serving wrong numbers.

## AI feature: Plan a purchase

### How it works

This feature is a risk check for buying materials. It combines two sources: over a century of price data from FRED, and the LLM's own research into what's happening now: tariffs, shipping, energy costs, weather and natural disasters, plant closures and conflicts. The result is a suggestion for each material, buy now or as each phase needs it, with how strong the evidence is and the news behind it.

### Why I chose this

My main goal was to make AI part of a real workflow, not a chat box. The user is a project manager or buyer deciding whether to buy materials now or as each phase needs them. Charts and numbers alone don't tell the full story: they can't say that a new tariff or a wildfire is happening right now. So the AI reads current news and finds the past event it most resembles, and the data shows what prices did after it. As a result, the user gets a clear picture of what's happening with material prices, grounded in what happened before, and can make a better-informed decision.

### What you get

Describe your project in plain English, check the details the AI read, and the answer comes first under "Should you buy now?". For each material it shows:
- a suggestion, worded as an option: for example, *"Consider buying as each phase needs it"*
- how strong the evidence is: strong, moderate or weak, with a "Why?" explanation
- a supply warning when the news shows a supply problem
- the AI's one-sentence reading of the news, with its sources

The details follow: where prices went in similar past periods, the news grouped by topic, the closest past event, and the cost of each way of buying in dollars.

### Who does what

- **AI:**
  - reads your description
  - searches current news with a separate search for each area, so a busy area like tariffs can't crowd out the others:
    - tariffs and trade
    - shipping and freight
    - energy and fuel costs
    - weather and natural disasters
    - plant closures and lead times
    - conflicts
  - classifies each news item:
    - the material affected
    - whether it's a price risk, a supply risk or both
    - its topic: trade, shipping, weather, conflict, energy, labor, production or other
  - lists, for each material, the areas it checked and found nothing, so nothing is silently missing
  - matches it to a past event
  - adds a supply warning when the news calls for one
- **Code:** every number and the suggestion itself, from 100 years of index data, tested against values worked out by hand from the CSVs.

### Keeping the AI honest

- **It can't change the suggestion or write a number.** Code rejects any reply that tries.
- **Every reply is checked** against strict rules. A bad reply drops only the AI's sentence; the history-based answer still shows.
- **News is treated as untrusted data,** never as instructions.

### Measured with the real model

From the checks in `backend/eval/`:

- **Accuracy:**
  - **Descriptions:** across five runs, read correctly 5–7 times out of 7; the last three scored 7/7.
  - **News:** classified with full marks in three runs. In the latest two, the AI left out one borderline item, a drop in housing demand, as not a supply-chain risk.
- **Consistency:** the same input gave the same suggestion in every run where the AI's reply passed its checks. One of 15 replies was rejected and fell back to history.
- **Why code makes the decision:** an early version that let the AI choose changed its answer in 4 of 5 runs.

The full design, formulas and failure handling are in [`docs/ai-feature.md`](docs/ai-feature.md).

## Security

- **Secrets:**
  - The Gemini key lives only in `backend/.env`, which git ignores, and only the backend reads it.
  - It never reaches the browser or the logs.
  - `backend/.env.example` lists the variable names with empty values.
- **Input:**
  - Every request body is checked by a strict zod schema: unknown fields, out-of-range values and oversized bodies are rejected, and bodies are capped at 16 KB.
  - The browser validates every backend response with zod too.
- **Limits:**
  - A global rate limit, plus a shared limit on the AI routes (5 a minute, 30 an hour).
  - A separate limit of 10 news checks an hour. Each check is six billed searches, so this keeps search spend to 60 an hour.
  - Explicit timeouts and output-token caps on every Gemini call.
  - The FRED fetches use fixed URLs, refuse redirects, time out after 6 s, and cap the download at 2 MB.
- **Errors:** clients get generic messages. Logs carry only fields (step, status, code, duration), never prompts, descriptions, budgets or model text.
- **Headers:**
  - A per-request nonce Content-Security-Policy with `strict-dynamic`, and no `unsafe-inline` for scripts.
  - `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
  - `x-powered-by` is off, and helmet secures the API.
  - End-to-end tests check the policy is enforced on the production build.
- **Dependencies:**
  - `npm audit --omit=dev --audit-level=high` finds 0 vulnerabilities.
  - One moderate advisory remains, in lint tooling only (`minimatch` via `typescript-eslint`). It never ships in the app, and the only automated fix is a forced change to an older `typescript-eslint`.

## How it's built

```
backend/    Express 5 API (TypeScript on Node, no build step): data loading, stats, the risk analysis, Gemini calls
  data/     the three FRED CSVs and sources.json (read-only)
  eval/     the real-model accuracy and consistency checks
frontend/   Next.js 16 app: presentation only; proxies /api/* to the backend so the browser stays same-origin
e2e/        Playwright tests that run both apps as production builds
docs/       user research, plans, and the AI feature design
```

Every source file starts with a short comment on what it's for, and every exported function, component and type has a doc comment.

## How I used AI
I built this with Claude Code. It assisted me on:
- Helped me plan out the implementation
- Assisted in drafting up several designs before I started implementing
- Prevent excessive code and maintain code cleanliness 
- Check every logical change with an independent reviewer agent, and use two for statistics, security and LLM handling 

### What it did well
- The reviewer agents did a great job at catching multiple issues, such as:
  - statistical errors
  - tests that could be bypassed even if they failed
  - several security issues: rate limiting, and the frontend listening on every network interface
- Maintained clear documentation
- Pinpointed the exact issue and required my attention for review, keeping a human in the loop

### Where I have to step in:
- It made several UI changes that was unnecessary which I have to address it
- When building out the result from the AI feature, it used languages that implying that it’s telling the users what to do instead of an advice as it should let the users go through the analysis and make their own decision
- I have to re-adjust the instructions for the LLM when giving out the “advice” because it was repeated and caused confusion when I checked it.

### How I checked its work
- I used the app myself, and found bugs the tests hadn't caught:
  - Closing an enlarged chart left the main page changed.
  - Fixed terms that made sense for a dev but not for the users.
  - Buggy chart when draging to see a specific period of time
- I ran the real-model checks myself with my own key (`backend/eval/`). My first run showed that one "correct answer" the AI had written for the checks was itself wrong.
- I read the reviewers' findings. Each was ranked must-fix, should-fix or nit. Every one had to be fixed or rejected with evidence, and disagreements came to me.
- Tests run on every change(`npm run verify`): unit, component, API and end-to-end, with the stats checked against hand-worked numbers.

## What I'd do next if there is more time
- Implement location-aware pricing where have the AI focus on regional news, and adjust the national trend with a regional cost index or local supplier quotes. 
- Build out a multi-agent orchestration to expand on the automated evaluation
- Adding more materials.
- Optimize the LLM to sharpen its response and accuracy. 


