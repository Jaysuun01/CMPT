# CLAUDE.md — Construction Material Price Tracker (CMPT)

These rules apply to every Claude Code session in this repo and take priority over default habits.

- If a rule blocks real progress, stop and ask the user.
- Small, low-impact decisions (naming, file placement, copy wording) may go ahead without asking, as long as they're mentioned in the report to the user.

## 1. Project context

**What:** a web app that tracks three FRED Producer Price Index series and adds one LLM-powered feature.
- `backend/data/WPU08.csv`: lumber and wood products
- `backend/data/WPU101.csv`: iron and steel
- `backend/data/WPU133.csv`: concrete products

**Layout:** an npm workspaces monorepo.
- `backend/` (Express API) loads and cleans the data, computes the stats, and later calls Gemini.
- `frontend/` (Next.js) handles presentation and proxies `/api/*` to the backend, so the browser stays same-origin.
- `e2e/` holds the Playwright tests that drive both.

**Required views, for each material:**
- index line chart
- month-over-month % change
- year-over-year % change
- rolling volatility

**Date range:** one date range picker drives **all** charts.

**Deliverable:** a repo only. There is no deployment. Reviewers clone it and run it locally with their own Gemini key.

**Data facts.** Respect them in code and in UI copy:
- Each file is monthly from 1926-01 to 2026-09, with columns `observation_date,<SERIES_ID>`.
- Values are **index levels (1982 = 100), not dollar prices.** Never label them as `$`.
- The data is **not seasonally adjusted**, so month-over-month changes include seasonality. Say so in the UI.
- Flag the **last 4 observations** of each series as preliminary, since BLS may revise them.
- FRED marks missing values as `.`. The parser must handle this, even though the current files have none.

**Metric definitions.** Use these exactly:
- **MoM %** = `(v[t] / v[t-1] - 1) * 100`. Undefined for the first month.
- **YoY %** = `(v[t] / v[t-12] - 1) * 100`. Undefined for the first 12 months.
- **Volatility** = sample standard deviation (n−1) of the last 12 MoM % values. It is not annualized. It needs 13 months of levels, so it's undefined for the first 12 months.
- Any missing value inside a calculation window makes that result undefined. Never interpolate.

**The AI feature design is still undecided.** Do not build any LLM feature until the user confirms the design.

**Priority when time is short:**
1. data + stats
2. charts + date picker
3. tests
4. AI feature
5. README
6. polish

## 2. Stack, dependencies, commands

**Stack.** Exact versions and the reasons for them are in `docs/implementation-plan.md` (D1).
- **Backend:** Express 5 + helmet + express-rate-limit + zod, running TypeScript natively on Node 26 (no build step). Tests use Vitest + supertest.
- **Frontend:** Next.js 16 App Router + TypeScript strict, with a nonce CSP in `src/proxy.ts`. Tests use Vitest + RTL.
- **End-to-end:** Playwright, run from the root against production builds of both apps.
- **Gemini:** called only from the backend, with the official `@google/genai` SDK.

**Pre-approved dependencies:**
- **Backend:** `express`, `helmet`, `express-rate-limit`, `zod`, `supertest`, `@google/genai`
- **Frontend:** `next`, `react`, `react-dom`, `server-only`, `zod`, `@testing-library/*`, `@vitejs/plugin-react`, `jsdom`
- **Shared tooling:** `typescript`, `@types/*`, `eslint`, `eslint-config-next`, `typescript-eslint`, `@eslint/js`, `globals`, `vitest`, `vite`, `@playwright/test`, `concurrently`
- **No chart library:** charts are hand-built SVG, matching the approved design.

**Anything else needs user approval.** Ask with:
- what it does
- why the existing deps can't do it
- its size and maintenance status

**Reproducibility:**
- `.nvmrc` + `engines` pin the Node version (current Active LTS).
- `.npmrc` has `save-exact=true`.
- `package-lock.json` is committed.

**Scripts** (run from the repo root). Keep these working at all times:
- `npm run dev`: both apps (API on :4000, web on :3000)
- `npm run lint`, `npm run typecheck`
- `npm test`: unit + component + API tests in both workspaces
- `npm run test:e2e`: Playwright against production builds (API on :4100, web on :3100). Its `webServer` sets `GEMINI_MOCK=1` on the backend.
- `npm run verify` = lint + typecheck + test. **Run after every change.**
- `npm run verify:full` = verify + test:e2e + `npm audit --omit=dev --audit-level=high`. **Run at each milestone.**

**Without a key:** the app must run fully without a Gemini key. The AI feature then shows a clear "add a key" state.

**`GEMINI_MOCK=1`:** the AI route returns fixed fixture output, and no network call is made.

## 3. Scope discipline (avoid over-coding)

Write the **least code that fully meets the requirement**, then stop.

- Build only what the task or the assignment asks for. No speculative features, options, config flags or "future-proofing".
- No abstraction until there is a **second real use**. No generic wrappers, factories or base classes for a single caller.
- Don't reformat, rename or refactor code outside the task. Keep diffs small and focused on one purpose.
- **Before finishing, re-read the diff and delete anything that isn't needed.** That includes:
  - dead code
  - commented-out code
  - unused exports
  - placeholder TODOs
  - comments that just repeat the code

  Comments explain only the *why*.
- If the diff is bigger than the task seems to need, explain why or shrink it.

## 4. Testing (nothing ships untested)

Every change comes with tests at the right level. A task is not done while tests are failing, skipped, or missing.

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Parsing and cleaning, MoM / YoY / volatility, date-range filtering, helpers, zod schemas, LLM output validation |
| Component | Vitest + RTL | Charts render with given data, date picker updates state, empty / error / no-key states |
| API | Vitest | Server routes: valid input, invalid input (rejected), oversized body, Gemini failure, timeout, rate limit, missing key. The Gemini SDK module is mocked with `vi.mock`. |
| End-to-end | Playwright | Page loads; changing the date range updates **every** chart; AI feature happy path and error state (via `GEMINI_MOCK=1`) |

**Rules:**
- For stats and data logic, write tests first or alongside the code. **Work out expected values by hand from the CSVs.** Never take them from the code's own output.
- **Required edge cases:**
  - the first month (no MoM)
  - the first 12 months (no YoY or volatility)
  - missing values (`.`)
  - a single-month range
  - a start date after the end date
  - a range outside the data
  - an empty series
- Test behavior, not implementation details. Snapshot tests are never the only check.
- **Never weaken, skip or delete a test to make it pass.** If a test is wrong, explain why before changing it.
- Tests are deterministic: no real time, no randomness, no network. In the Vitest config, mock `server-only` with `vi.mock` or an alias, or server modules will throw.
- Report results honestly with the actual command output. Never claim "tests pass" without running them in this session.

## 5. Security

The app isn't deployed, but these rules still apply in full.

**Secrets**
- No keys, tokens or credentials in code, tests, fixtures, logs, commits or chat output.
- The key lives only in `backend/.env`, which is gitignored. `backend/.env.example` lists variable names with empty values.
- Only the backend reads the Gemini key. The frontend never sees it. Never use a `NEXT_PUBLIC_` variable for secrets. Frontend modules that call the backend from the server start with `import "server-only"`.
- **Before every commit, run this and confirm the output is empty:**

  `git diff --cached | grep -nE 'AIza[0-9A-Za-z_-]{35}|GEMINI_API_KEY=.+'`

**Input**
- In the backend, `express.json({ limit })` rejects oversized bodies (413). Then validate with a **strict** zod schema: typed ranges, max string lengths, unknown fields rejected. Treat backend responses as untrusted in the frontend and validate them with zod too.
- Never trust the client. Recompute anything correctness-relevant on the server.

**LLM**
- **Treat model output as untrusted.** Validate it with zod before using it, and render it as plain text only.
- Never use `dangerouslySetInnerHTML`, and never render model HTML or markdown without sanitizing it.
- Wrap user free text in clear delimiters and limit its length. The system prompt states it is data, not instructions.
- **The model may only cite numbers passed to it in the prompt.** Values in charts, tiles and tables come from code. User-approved exception: AI news summaries may quote figures from the article, always shown beside their source link and labelled as from the news.
- On the AI route, set:
  - an explicit timeout
  - a max-output-token limit
  - in-memory, per-process rate limiting (no external store)
- Client error messages are generic. Server logs carry the detail, but never secrets or full prompts.

**App**
- **Frontend CSP:** per-request nonce CSP in `frontend/src/proxy.ts`, following the Next.js CSP guide. `script-src` is `'self'` plus the nonce plus `'strict-dynamic'`, and `'unsafe-eval'` is added in dev only. `style-src-attr 'unsafe-inline'` is allowed for chart positioning; nothing else inline. Never add `'unsafe-inline'` to `script-src`.
- **Other frontend headers** go in `next.config.ts`: `poweredByHeader: false`, nosniff, Referrer-Policy, `X-Frame-Options: DENY`, and Permissions-Policy.
- **Backend:** `helmet()`, `x-powered-by` disabled, rate limiting, binds to 127.0.0.1, and a generic error body.
- Use current **patched** Next.js and React versions. `npm audit --audit-level=high` must pass.
- No `eval`, no dynamic code execution, no user-controlled file paths.

**Accessibility:** every chart has a text title and an `aria-label` or text summary. Controls are keyboard-usable and labeled.

## 6. Mandatory subagent verification

**Every logical change is checked by an independent subagent before it counts as done.** The author never approves its own work.

**What gets verified, and how:**

| Action | What the verifier checks |
|---|---|
| Research (APIs, versions, model names) | Each fact against official docs, the npm registry, or the source repo; flags anything stale |
| Planning / design | Requirement coverage, simpler alternatives, risks, scope creep |
| Implementing code | Correctness, matches the requirement, follows §3 to §5, tests are meaningful |
| Fixing a bug | Root cause (not just the symptom), a regression test exists, nothing else broke |
| Debugging | Reproduces the issue on its own and confirms or refutes the diagnosis |
| Tests | Whether tests would catch a regression (mentally mutate the code), and that hand-worked expected values are right |
| Stats | Recomputes a sample of results directly from the CSVs, separately from the app code |
| Docs and README | Accuracy against the actual code; setup steps are reproducible |

**Exempt:** pure copy, styling and config tweaks that change no logic.

**Rules:**
1. **One logical change = one verification.** Closely related edits may be batched.
2. **Fresh context.** Give the verifier the requirement, the relevant files or diff, and the claim to check. Do not include the author's reasoning, so the check is independent.
3. **The verifier reviews; it does not fix.** Findings come ranked must-fix / should-fix / nit, each with evidence: file and line, a failing input, or command output.
4. **The author resolves every finding.** Either fix it, or reject it with evidence. Unresolved disagreements go to the user.
5. **Re-verify only if a fix changed logic.**
6. **Use two independent verifiers** for stats formulas, security-sensitive code, and LLM input/output handling. Compare their findings.
7. **Tell the user briefly** what was checked, what was found, and what changed.

If the process puts the user's self-set timeline at risk, tell the user and ask before skipping any step.

## 7. Working process

1. Restate the task and how you'll know it's done. Ask if anything is ambiguous.
2. Plan the smallest change. Verify the plan if it's non-trivial.
3. Implement with tests.
4. Run `npm run verify`. At milestones, run `npm run verify:full`.
5. Get it verified by a subagent (§6). Resolve the findings.
6. Report what changed, the actual test output, the verification findings, and any open issues.

## 8. README

**The README must contain:**
- what the app does
- setup steps (Node version, `npm ci`, `backend/.env` with `GEMINI_API_KEY`)
- how to run the app and the tests
- metric definitions and data caveats
- the AI feature and why it was chosen
- a **"How I used AI"** section. It covers:
  - what AI generated or proposed
  - where it was **wrong or over-built**, and how that was caught: test, verifier, or user
  - decisions the user made or overrode
  - how the work was checked

  Keep it factual, with concrete examples and no marketing language.

## 9. Git

- Commit only when the user asks. Use small commits with clear messages, and run the secrets check (§5) first.
- Never commit any of these (`.gitignore` covers them):
  - `.env*`, except `.env.example`
  - `node_modules`
  - build output
  - `.DS_Store`
  - test reports
- Never force-push or rewrite history unless the user explicitly asks.
