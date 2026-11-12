# AI Feature Proposal: Material Risk Check

## The assignment
"One AI feature that uses an LLM. Think about who might use a tool like this and what an LLM could do for them that a chart can't. Go beyond a basic summary if you can, and tell us why you chose it."

The app tracks construction material prices (lumber, steel, concrete) using Producer Price Index data from FRED. This document covers the single AI feature.

## Who it's for
A project manager or buyer at a builder with a multi-phase project under contract, for example a 3-building apartment complex where one building starts every 6 months.

## The problem
Materials for a phased project are bought over many months. When the supply chain is disrupted by tariffs, shipping problems, energy costs, conflicts or plant closures, the buyer has to decide: buy materials now, before prices move, or buy each phase as needed? Buying early protects against price jumps, but it costs money in storage, damage, theft and cash tied up. Today that decision is made by reading the news and guessing.

## The feature, in one sentence
The user describes their project, and the tool compares recent price conditions with similar periods in history, checks current supply-chain news for risk factors, and shows how often each buying strategy came out ahead in comparable past situations.

## How it works
The feature follows the standard risk assessment steps: identify, assess, respond, monitor.

1. **Describe the project.** The user writes it in plain English, for example: *"A 3-building apartment complex, one building starting every 6 months from March 2027. Lumber about $2M, concrete $800K, steel $200K, split evenly across the buildings and needed when each one starts."*
2. **Step 1, extract (LLM, no search):** the LLM receives today's date and returns materials, budgets, the number of phases and each phase's need month as a calendar month (e.g., 2027-03). The user confirms or edits the details.
3. **Assess recent conditions (code):** for each material, code measures price conditions at the latest final month in the data (recent 3-, 6- and 12-month changes and volatility) and finds the past months that looked most similar.
4. **What followed (code):** for those similar periods, code shows how often prices rose more than 5%, stayed within ±5%, or fell more than 5% by each of the project's need dates, measured from the point that matches today, alongside the same figures across all periods, and the biggest rise and fall.
5. **Step 2, search (LLM with search):** the LLM searches current news for supply-chain developments affecting the project's materials. Source links come only from the search metadata.
6. **Step 3, classify (LLM, no search):** the LLM classifies each development:
   - the material affected
   - price risk, availability risk (lead times, allocation), or both
   - its topic: trade, shipping, conflict, energy, labor, production or other
   - the closest event from a curated list

   The page groups the news by topic.
7. **The user reviews the developments** and can dismiss any they think are irrelevant, or change the matched past event.
8. **Respond (code):** code compares buying strategies across the similar periods:
   - Buy each phase as needed
   - Buy all future phases now
   - Buy the first half of phases now, the rest as needed

   Only strategies that differ are shown. For each one, code shows the typical extra cost and the range as a percentage of the material budget. The headline is the **break-even carrying cost**: the monthly carrying cost below which buying early would have paid off. Locking prices or supply with the supplier is one of the advice actions (see "Advice").
9. **Monitor:** each material shows when to re-check: before the next phase's need date (there's no lead-time input), and when new FRED data arrives.
10. **Advise (code, then LLM, no search):** see "Advice" below. Code computes a history lean for each material; the LLM weighs it against the news and picks an action from a fixed list; code checks the reply before it's shown.

**Where it lives:** its own page, "Plan a purchase" (`/plan`), reached from a header tab and from a pointer on the price page. The page runs as three numbered steps: describe the project, check the details, and "Your answer". The results open with **"Should you buy now?"**: one line of advice per material, worded as an option to consider, with an evidence label set by code. The details follow under "The details behind it". Each material's detail answers the buyer's questions in this order:
1. **Where prices went next:** at each need date, split bars show how often prices rose more than 5%, stayed within ±5% or fell more than 5% in the similar periods, beside the all-history base rate, with the biggest fall and rise.
2. **What's different now:** that material's news, grouped by topic, then the closest past event and what followed it.
3. **Your budget:** each strategy's extra cost in dollars, and the break-even sentence.
4. **More** (collapsed): the break-even dot chart, recent conditions and the method notes.

A news status ("needs a key", "couldn't be checked") appears once for the whole page. A bar pinned above the results jumps to the answer, each material and the energy and freight costs. When to run the check again (before the next need date, and when new FRED data arrives) sits under the answer; the energy and freight costs come after the materials.

Example of one risk register entry (in words; real figures come from the analysis once it's built):
> **Steel ($200K, needed in 2027-03, 2027-09 and 2028-03)**
> - **Recent conditions** (as of May 2026, the latest final data): steel was up X% over 6 months, with volatility above its usual level. Scenarios start 6 months after each similar period, to match today.
> - **What followed similar periods** (20 most similar past periods since 1970): over the next 6 months, steel rose more than 5% in A of 20, stayed within ±5% in B, and fell more than 5% in C. Across all periods: A′%, B′% and C′%.
> - **Current risk factors:**
>   - *AI summary:* new tariff on imported steel announced. [source link] Price risk.
>   - *AI summary:* reports of longer mill lead times. [source link] Availability risk.
> - **Closest past event:** 2018 steel tariffs. Over the next 6 months, steel rose Y%, at the high end of the similar-period range. What happened next: retaliatory tariffs from trading partners and some country exemptions.
> - **Break-even:** across the similar periods, buying all future phases now would have paid off at carrying costs below a median of R% a month. At your carrying cost of r%, it came out ahead in k of 20 periods.
> - **Buying strategies across the 20 similar periods** (extra cost as % of the steel budget):
>   - Buy as needed: typical M%, ranging from L% to H%
>   - Buy all future phases now: K% (carrying cost only)
>   - Buy first half now: typical N%, ranging from P% to Q%
>   - On your $200K, buying as needed ranged from $a to $b.
> - **Other responses:** lock prices with the supplier for later phases · add an escalation clause · line up a backup supplier for the lead-time risk.
> - **Re-check:** before the second building's need date, and when new FRED data arrives.
> - *Shows what happened in similar past periods. Not a forecast.*

Materials with no relevant news still get the similar-period analysis and say: "No current risk factors found in the news."

## Advice
The buyer's question is "should I buy now or wait?", so the results answer it first. Code and the LLM each do the part they're good at.

**History lean (code).** For each material, the lean is the shown buying strategy with the lowest median extra cost across the similar periods (ties go to the earlier strategy in display order). Its evidence is how often that strategy cost no more than every other shown strategy, period by period:
- **strong:** at least 85% of periods, with at least 15 periods
- **moderate:** at least 60%, with at least 15 periods
- **weak:** anything else

The lean uses the price paths at the need dates (the outlook is folded into them), not the past event. There's no lean without a timing decision or with too few similar periods. The 85/60 cut-offs are a judgement call, stated on the page.

**Advice (LLM, `POST /api/risk/advise`).**
- `/news` keeps each validated development's ID, material, summary and risk on the server for 30 minutes (at most 100 results, oldest dropped) and returns a `newsId`. The client sends the project, the `newsId` and the IDs of dismissed developments; it never sends news text back. An unknown or expired `newsId` gets 409.
- The server recomputes the analysis from the project, the same way `/analyze` does.
- **Code sets the suggestion; the model can only add a supply warning.** The headline is always the history lean's ("Consider buying as each phase needs it", and so on), with the lean's own evidence rating. The model either confirms it or chooses lock-supply. Lock-supply never changes which way to buy or the rating, but code folds it into the headline so the two read as one plan ("Consider buying as each phase needs it, but booking supply now"), with one line saying booking means reserving supply or fixing prices, not storing materials early. The prompt tells the model not to suggest buying or stocking earlier than the lean does. Lock-supply is allowed only when the news has an availability or both risk for that material. A material with no lean is sent only if it has a supply risk, and the model may leave it out; a material with nothing to choose isn't sent.
- The model gets, per material, the lean, the allowed actions, the facts as context and that material's news, each news item fenced as data. Facts are code-formatted: carrying cost, the lean's count, break-even, each strategy's typical and range as % of budget, need dates, outlook counts, and the past event's name and moves. **Budgets and dollars are never sent.**
- The reason is one sentence of at most 25 words, saying what the news adds or that it doesn't change the picture. It holds **no figures at all**: no digits, no `%`, no numbers in words (including plurals and ordinals like "hundreds" or "third") and no fact IDs, because the figures are shown beside it. Month names are allowed. It's capped at 160 characters, with at most 5 cited news items. Code adds a capital letter and a closing full stop if they're missing.
- Code checks each material's entry on its own; a failed entry drops only that material's advice, which then shows the lean alone:
  1. one entry per material, with an allowed action
  2. cited news items exist, belong to that material and weren't dismissed
  3. lock-supply must cite at least one availability or both-risk item. That's a sanity check, not proof: the risk label comes from the classify step, so a mislabelled or injected item can unlock the warning. The warning is visible, cites its source links, and never changes which way to buy or the rating.
  4. nothing in the sentence is a figure
- **Measured consistency.** On one project, with the same news and numbers, the first version of this step gave a different headline in 4 of 5 runs and overrode strong history almost every time. That's why code now sets the suggestion. After the change, 5 runs on the same input gave identical results.
- Under each AI sentence, the answer links the news items it cites. If it cites none, the answer links every undismissed item it was given for that material, since those are what it read; a material with no news says so.
- No call is made when there's no news left after dismissals. A material with every phase needed now isn't sent, since there's nothing to time. A material with no AI advice in an otherwise good reply says so in one line.
- Dismissing news or changing a past event marks the advice as written from earlier news, with a "Refresh advice" button. A new check (for example a new carrying cost) writes it again.
- Without a key, or when the news or the advice fails, hits the limit or expires, the lean shows alone with one line saying why.

## Who checks what
**Code checks what code can check, and every analysis number comes from code.** The only figures the LLM writes are ones quoted from a news article, shown in that development's summary next to its source and labelled as from the news (a user-approved exception to CLAUDE.md §5). The LLM handles only what requires reading language or researching.

| Task | Done by |
|---|---|
| Extract project details, with need dates as calendar months | LLM (step 1) |
| Find current supply-chain developments | LLM with search (step 2) |
| Source links | Search metadata only, never the model's text |
| Classify each development (material, risk, topic) and match it to the curated list | LLM (step 3) |
| Energy and freight costs: latest value, 3- and 12-month change, rank against past 12-month changes | Code, from FRED |
| Convert calendar months to months from today | Code |
| Missing or out-of-range project details (see Input limits) | Code |
| Check that matched event IDs exist in the curated list | Code |
| Recent conditions, similar periods and what followed | Code |
| Strategy comparison, break-even carrying costs and dollar ranges | Code |

The Gemini output schemas accept what the user wrote, even if values are missing or out of range. A backend validator (zod) checks ranges and required details the same way every time, and it's the same validator used for the manual form.

## Works without an AI key or search
- **No Gemini key:** the user enters the project in a form and can pick past events for each material from the curated list. The similar-period analysis and strategy comparison run exactly the same, since they use only the CSV.
- **Search unavailable or rate-limited:** the tool runs the analysis without news risk factors and says so. Search needs a paid-tier key (the first 5,000 searches a month are free); the README says so. The error a free key gets for search isn't documented, so the UI gives one message for both causes: "News couldn't be checked. Searching the news needs a Gemini key on a paid tier, or the search limit was reached."

**The AI finds and reads the news, but the numbers never depend on it.**

## Routes, validation and failures
**Routes.** Each request body has its own strict zod schema: unknown fields are rejected, and every string has a maximum length.
- `GET /api/risk/status` returns only `{ aiAvailable: boolean }`: true when a key is set or `GEMINI_MOCK=1`. The frontend uses it to show the form plus an "add a key" message, and never sees the key.
- `GET /api/risk/events` lists the curated events (ID, name, month, materials) for the past-event picker. It works without a key.
- `POST /api/risk/extract` takes `{ description }`. The model reply is checked with a typed, permissive zod schema, separate from the limits validator. It is `.strict()`, every field is optional or nullable so missing details survive to the confirm form, materials are free strings (at most 3) for the form to map or flag, there are at most 12 phases, and every string is length-capped. The result goes to the user to confirm, not yet checked against the input limits.
- `POST /api/risk/news` accepts only `{ materials, needMonths }` (`.strict()`, so a budget is rejected at the boundary). It checks the materials enum, 1–12 need months and the 0–36 month window. It returns developments with their sources. The client calls it once per confirmed project. Changing the carrying cost, history window or past event only re-calls `/analyze`. Submit buttons are disabled while a request is in flight.
- `GET /api/risk/drivers` returns energy and freight costs. It works without a key. The figures come from five monthly FRED series:
  - natural gas, Henry Hub spot (MHHNGSP)
  - diesel (GASDESM)
  - WTI crude oil (MCOILWTICO)
  - the deep-sea freight PPI (PCU483111483111)
  - the long-distance truckload PPI (PCU484121484121)

  For each series, code reports the latest value, its 3- and 12-month change, and how many earlier 12-month changes are strictly lower, shown as a count ("higher than 446 of 447") so rounding can't overstate it. A missing value in a window makes that figure undefined.

  How the series are fetched:
  - fixed URLs only, with redirects refused
  - a 6 s timeout and a 2 MB cap counted while the body streams in
  - successes cached in memory for 12 hours; failures never cached
  - one shared fetch per series when requests overlap

  The series aren't seasonally adjusted, and the page says so. Failures aren't cached, so during a FRED outage each page load retries the five series; for a local app the global limiter bounds this. A series that can't be loaded is marked unavailable, and the rest still show. With `GEMINI_MOCK=1` the series come from fixtures, with no network call. FRED's terms point automated use at its keyed API; the 12-hour cache keeps these downloads to a few a day, and the README notes this.
- `POST /api/risk/analyze` takes the confirmed project plus, optionally, one past-event ID per material (a zod enum of the curated IDs, or "none"). The event must cover that material, or the request is rejected. It never accepts development text, summaries or URLs from the client. Everything numeric, including the past event's case, is recomputed from the CSV.
- "Today" (T₀) always comes from the server clock. A client-sent date is rejected as an unknown field. Tests inject the clock. With `GEMINI_MOCK=1`, T₀ is fixed at 2026-11 and the mock fixtures' need months are set relative to it, so E2E never depends on the real date.
- A project's phases, need dates and shares are shared by all its materials; only the budget is per material. So D is the same for every material.
- An AI route with no key returns 503 with the generic body.

**Review steps.** Dismissing a development changes no number; it only takes that development out of the advice the next time it's written. Changing the matched past event changes the event ID sent to `/analyze`, and the server checks it again.

**Developments and sources.**
- Code numbers each development from the grounding metadata's text spans, in order. The same sentence grounded to several sources becomes one development with all its sources (at most 5). When one copy stops a clause earlier (at least 40 characters, ending at a word boundary), the shorter text is kept, since every merged source grounds it. The trade-off: a clause only the longer copy had is dropped, so a supply detail in it can't trigger a supply warning. That errs toward fewer warnings, never invented ones. Code keeps the first 5 per material and cuts each to 300 characters with an ellipsis, so a long span or a 6th development never wipes out the news. Classify returns only `{ devId, material, risk, eventId }` and never rewrites the text.
- The validator rejects unknown or duplicate `devId`s. A development classified as a material that isn't in the project is dropped.
- Sources are joined to developments by ID in code. A development with no grounding source is dropped and never shown.
- Source links are parsed with `new URL()` and accepted only if `protocol === "https:"`; anything that fails to parse is dropped. The frontend's response schema applies the same check. Titles are plain text, capped at 200 characters. Links open with `rel="noopener noreferrer"`.

**Step output limits (zod, `.strict()`).**
- `material` is one of the three.
- `risk` is price, availability or both.
- `eventId` is a curated ID or "none".
- `topic` is trade, shipping, conflict, energy, labor, production or other.
- At most 15 classify entries in total. More, or any other schema failure, fails the step.

**Limits per AI call.**
- Timeout: 12 seconds per Gemini call, and 25 seconds for the whole `/news` request (search plus classify). This keeps every route under the Next.js rewrite proxy's 30-second default. A timeout aborts the SDK request (`abortSignal`), not just the wait.
- Output tokens: about twice the largest valid output, plus the thinking budget, which is set explicitly with `thinkingConfig` so thinking can't use up the cap. The exact numbers are set when the calls are built.
- Rate limit: `/extract`, `/news` and `/advise`, the routes that call Gemini, share one in-memory, per-process limiter of 5 requests a minute and 30 an hour, separate from the global one. Every request arrives from 127.0.0.1, so clients can't be told apart. One `/news` request is 2 Gemini calls. With `GEMINI_MOCK=1` the limiter is raised so E2E can't flake; API tests cover the real limit.
- No automatic retry on 429, so a reviewer's quota isn't burned. The app's own 429 gets the same client result as Gemini's for that route (see below).
- Logging: AI routes catch every error themselves and log only route, step, HTTP status, `finishReason`, error code and duration. Raw SDK and zod errors never reach the global error handler, which logs whole errors.

**Failures.** Every case gets a generic client message and a detailed server log (no key, prompts, descriptions or budgets in the log):

| What happens | Result |
|---|---|
| Extract fails, times out, returns 429 (Gemini's or the app's) or is blocked for safety | Falls back to the manual form, with "Couldn't read the description. Please fill in the form." |
| Search fails, times out, returns 429 (Gemini's or the app's) or is unavailable on the key's tier | The analysis runs without news and says so. |
| Classify fails after search succeeded | News is hidden; it isn't shown unclassified. The analysis runs and says "News couldn't be checked." |
| Malformed JSON, a reply cut off at the token cap (`finishReason` MAX_TOKENS), no candidates, a SAFETY finish, unknown fields, too many classify entries, overlong fields | Counted as a failure of that step and never partly parsed. |

## What the LLM does that a chart can't
A chart shows how steel prices moved. It can't read this week's news, work out that a new tariff affects the steel in this specific project, and recognize that the closest past case is the 2018 tariffs. The LLM adds current risk factors to a picture code builds from history. Together, they tell the user what typically happened in situations like this one, and what's different this time.

## Why I chose it
- **It's a real decision with real money.** Buy now or wait is a choice project managers face every time supply-chain news breaks, and it's usually made by guesswork.
- **It handles a real tradeoff.** Buying early isn't free. The break-even carrying cost shows exactly when it would have been worth it.
- **It's based on patterns, not one example.** Results come from many similar past periods, with the number of cases always shown.
- **It uses the LLM for what only an LLM can do:** reading current, messy, real-world information and connecting it to a specific project.
- **It's trustworthy by design.** The LLM never produces an analysis number; any figure in a news summary is quoted from the article and shown beside its source. Past events come from a verified list, source links come from search metadata, and every figure comes from FRED data through code.
- **It doesn't predict prices.** It shows what happened in comparable past situations, labeled as such.

## Scope
- Four Gemini steps: extract, search, classify, advise, each with a permissive schema
- Backend validation (zod), shared by the AI path and the manual form
- Confirmation and review panels (project details, developments, matched events)
- Similar-period analysis and outcome ranges for each material
- Curated past-event list (6–8 events) with "what happened next"
- Strategy comparison with break-even carrying costs
- Risk register output; availability risk described in words with sources

## Input limits
Enforced by the backend validator.

| Input | Allowed range |
|---|---|
| Project description (AI path) | 1–2,000 characters, wrapped in a random per-request delimiter; the system prompt says the content is data, not instructions |
| Materials | lumber, steel, concrete (at least one, no duplicates) |
| Budget per material | above 0, up to $1 billion |
| Number of phases | 1–12, with exactly one need date per phase |
| Need dates | calendar months from the current month through 36 months ahead |
| Phase shares (optional) | above 0; must sum to 100% within ±0.5 points, then rescaled to exactly 100%. By default, code splits the budget evenly across phases. |
| Carrying cost | 0–10% per month. Required, no default. The field shows the benchmark of 20–30% a year (about 1.7–2.5% a month) as guidance. |
| History window | since 1970 (default), since 1990, or full history |

## Two clocks
The data and the project run on different dates, so the model uses one rule:
- **Recent conditions** are measured at the **latest final month** in the data (for example, May 2026), because the 4 most recent months are preliminary.
- **The project clock is today** (the current calendar month). Need dates are counted from today, and the news is current.
- **The gap** is the number of months between the two (for example, 6). Each scenario starts its price path at the similar month plus the gap, so it matches where today falls relative to the conditions measured.
- The UI shows both dates and the gap.

## Similar-period analysis
- **Recent conditions** use four measures at the latest final month: the 3-, 6- and 12-month price change, and volatility (using the app's existing volatility definition, which must be calculable for any past month).
- **Similar periods** are the past months closest to the latest final month on those four measures. To avoid counting the same episode many times, a chosen month excludes any other month within 6 months of it. Up to 20 periods are used.
- **Minimum cases:** if fewer than 8 similar periods are found, the tool shows "too few similar periods to draw a pattern" instead of percentages, strategy comparison, break-even and "k of n". The closest past event is still shown as a single case.
- **What followed** is grouped as: rose more than 5%, stayed within ±5%, or fell more than 5%, by each distinct future need date, measured from the similar month plus the gap. The biggest rise and fall across the similar periods are shown too. (The user changed this from fixed 3, 6 and 12 months, so the outlook lines up with the dates they buy.)
- **All-periods comparison:** the same groups across every candidate month (the same set the similar periods are chosen from). Because candidates need data through the longest need date, a longer project trims recent months from both the candidates and this comparison. That is stated in the UI.
- The similar-period shares are shown beside the all-period shares. There's no automatic "stands out" label: with about 20 cases, sampling noise (one standard error is about 11 points; a 95% band is about ±22) is larger than any threshold that would be useful.

## Curated past events
A short, hand-verified list, chosen using these criteria: well documented, a clear start month, a real effect on these materials, a mix of shock types including one where prices fell, and enough final data afterward. Each entry has a name, month, materials affected, type of shock, a one-line description, a short "what happened next" note and a source link. The LLM was used to research candidates. Each date and note was then verified by hand.

Candidates:
- 2002 U.S. steel safeguard tariffs (tariff; steel)
- 2008 financial crisis (demand collapse; prices fell)
- 2017 U.S. duties on Canadian softwood lumber (tariff; lumber)
- 2018 Section 232 steel tariffs (tariff; steel)
- 2020–21 pandemic demand surge (demand; lumber)
- 2021 container shipping crisis (shipping; lumber and steel)
- 2022 energy price spike after Russia's invasion of Ukraine (energy; all three)

As built, six events are used. The 2021 container shipping crisis was dropped because no source gives it a clear start month. The 2022 energy spike covers steel and concrete only, since its source doesn't support an effect on lumber. Each event's month and notes were checked against an official source by an independent verifier.

The LLM may only return IDs from this list. If nothing fits, it returns "no close past event," and the risk register says so. Past events are shown one at a time as individual cases, never turned into percentages, because there are too few of them. Concrete has few direct events, so it relies mostly on the similar-period analysis.

## Cost Model
The exact formulas are in the appendix.

- **Each similar period is one scenario:** "If prices had moved the way they did after the matching point in this past period, what would each strategy have cost?"
- **Strategies** are defined by which future phases (need date after the current month) are bought now. A phase needed this month costs the same under every strategy. Strategies that buy the same set of phases early are the same strategy, and only one is shown.
- **Bought as needed:** a phase's materials cost whatever the index moved by the month they're needed.
- **Bought now:** a phase's materials are bought at today's prices, with carrying costs until they're needed.
- **Carrying cost:** a monthly rate on the value of materials held, entered by the user.
- **Break-even carrying cost:** for each scenario, the monthly rate at which buying all future phases now and buying as needed cost the same. The headline shows the median across similar periods, and how often buying early came out ahead at the user's rate.
- **Results:** for each strategy, the median, lowest and highest extra cost across the similar periods, as a percentage of the material budget, followed by dollar ranges.
- **The closest past event** is shown as one more case, using the same formulas from its start month (see the appendix), and says how many of the similar periods it was above.

## Data rules
- Only final index values are used. The 4 most recent months are preliminary and excluded.
- Missing values are never filled in. A month without complete data for its measures or what followed is skipped.
- All date ranges are calculated from the data and the current date, never hardcoded. If a recent past event doesn't yet have enough final data after it, the tool shows "not enough data yet."

## Assumptions
| Item | Type | How it's handled |
|---|---|---|
| Material costs move one-for-one with the national index (e.g., WPU08, lumber and wood products, not seasonally adjusted) | Assumption | Stated in the UI. Local supplier prices can differ. |
| What followed similar past periods is a useful guide to the range of outcomes | Assumption | Labeled "what happened in similar past periods, not a forecast." Case counts always shown. |
| "Similar" is judged by four price measures only | Simplification | Stated in the UI. News risk factors are shown separately. |
| Recent conditions are measured several months before today | Data limitation | Both dates and the gap are shown. Scenarios are offset by the gap. |
| Changes after a past event weren't caused only by that event | Note | Labeled "after, not caused by." |
| Carrying cost is a simple monthly rate on the value held | Simplification | Entered by the user. The break-even rate shows when buying early pays off, whatever the user's rate. |
| Each phase's materials are bought in one purchase | Simplification | Stated in the UI. |
| Similar periods are at least 6 months apart, but price paths run up to 36 months, so neighbouring periods share part of their future and aren't independent | Simplification | Stated in the UI next to the case counts. Kept at 6 months so there are enough cases. |
| One ±5% grouping threshold for all materials and horizons | Simplification | Stated in the UI: concrete rarely moves 5% over short horizons, so it mostly lands in "within ±5%". |
| The 3-, 6- and 12-month changes are correlated, so similarity weighs the recent price trend more than volatility | Simplification | Stated in the doc. |
| Availability risks (lead times, allocation) aren't measured | Scope choice | Described in words with sources. FRED price data doesn't measure availability. |
| Design constants: 5% grouping threshold, up to 20 similar periods, 6-month spacing, minimum of 8 cases, 0.5-point share tolerance | Design constants | Stated in the doc, set in one place in the code, and covered by tests. |

## Security
- Each AI route has an explicit timeout, a max-output-token limit and in-memory rate limiting. Client errors are generic; server logs never include the key or full prompts.
- **Search results are untrusted input.** A web page can contain text meant to instruct the model. Damage is limited by design: strict output schemas, event IDs checked against the curated list, links taken only from search metadata, all model text rendered as plain text, and no model output ever used to take actions or run code.
- The classify step treats development text as data to be classified, not as instructions, and wraps each development in a random per-request delimiter. The system prompt says the content is data, not instructions. Injection from a web page can still reach the classify step through the search step's text. The damage is limited to the labels and the matched event, which must be valid enum values. It can never touch the numbers.
- The advise step sees news text too, so injected text could push the **action** for a material. Mitigations: actions come from a fixed list; going against the history lean needs a cited news item and is labelled weak; the history lean always shows beside the advice; the reason can't state figures; and it's rendered as plain text.
- Search results are untrusted: injected text could still be shown in a summary as plain text ("order from …"). Summaries are length-capped and always shown next to their source.

## Testing
- **API tests (`npm test`):** the `@google/genai` module is mocked with `vi.mock`, so the real request settings (timeout, token cap, tools) and response parsing are exercised. For each of the four steps they cover:
  - a valid reply
  - malformed JSON, a MAX_TOKENS cut-off, no candidates and a SAFETY finish
  - a timeout and a 429
  - unknown, duplicate or out-of-range `devId`s, event IDs and enums, which are rejected
  - `javascript:`, `http:`, `HTTPS:` with leading whitespace, and malformed source URIs: only a parsed `https:` URL is kept
  - a development with no source, which is dropped

  The routes also get tests for the missing key (`/status` false; AI routes refuse with a generic message), invalid and oversized bodies, a client-sent date (rejected), the AI rate limit (429), a check that no budget or user text reaches the search and classify prompts, forged `/news` and `/analyze` bodies carrying budgets, development text or URLs (rejected), an event that doesn't cover its material (rejected), a timeout that aborts the SDK call, and logs that contain no description, budget or prompt.
- **Component tests:** the no-key, error, search-unavailable and review panel states. The frontend checks backend responses with zod.
- **End-to-end (`GEMINI_MOCK=1`):** the mock replaces the SDK client at the response layer, including `groundingMetadata` and `finishReason`, so the validators and source-joining code really run. Scenarios are selected by what each route receives: a fixed sentinel description makes `/extract` fail. For `/news`, a concrete-only project means search is unavailable and a lumber-only project means classify fails. Any other input is the happy path. E2E covers the happy path and the error state.
- **Unit tests (`npm test`):** no network calls. These cover:
  - the two clocks: the gap calculation, and price paths starting at the similar month plus the gap. "Today" is passed in, never read from the system clock.
  - calendar months converted to months from today, including need dates in the past (rejected) and more than 36 months ahead (rejected)
  - recent-condition measures and similar-period selection on a small hand-worked series, including the 6-month spacing rule and tie-breaking
  - the "too few similar periods" case
  - grouping at exactly ±5%
  - each strategy's extra cost, the break-even carrying cost and the "came out ahead" count, using hand-worked examples
  - duplicate strategies hidden (one phase; a phase needed this month)
  - a project where everything is needed this month (no timing decision, flagged)
  - phase shares within and just outside the 0.5-point tolerance
  - the 4 preliminary months, missing values and date ranges calculated from the data
  - the validator at and just past each limit, including out-of-range values in a mocked Gemini reply
  - matched event IDs that aren't in the curated list (rejected)
  - search unavailable: analysis runs without news and says so
  - no-key mode giving the same results as confirmed AI-extracted input
- **LLM accuracy check (separate script `backend/eval/accuracy.ts`, outside the Vitest `*.test.ts` pattern, needs an API key):** runs steps 1 and 3 on saved inputs, so results are reproducible. Saved project descriptions are hand-labeled with the correct details. Saved development texts are hand-labeled with the correct material, risk type and closest past event. Includes irrelevant articles (should be ignored) and one article with injected instructions (should be classified normally, with the instructions not followed). Reports accuracy for each. Results are reported in the README.
- **LLM consistency check (separate script `backend/eval/consistency.ts`, needs an API key):** runs step 1 and the advice step several times (default 5) on one fixed input: a saved description, and saved news with the same numbers every run, so differences come from the model, not the news search. It fails (exit code 1) unless every run succeeds, the description is read the same way every time, and each material gets the same advice action every time. The pass rules live in `backend/eval/consistency-score.ts` and are unit-tested in `npm test`. Run it with `node --env-file=backend/.env backend/eval/consistency.ts [runs]`. Last run: 5 of 5 identical for both steps.
- **Math check:** a few similar-period results and strategy costs verified against FRED data in a spreadsheet.

## Before building: checked
Checked against Google's docs and the npm registry, and confirmed by a verifier:
- **Model:** `gemini-3.6-flash`, labelled Stable. `@google/genai` stays pinned at 3.0.0; 3.1.0 is hours old.
- **Search:** on current Flash models, search grounding isn't available on the free tier. The paid tier includes 5,000 free searches a month, then $14 per 1,000, billed per search query the model runs. Extract and classify work on the free tier.
- **Structured output plus search** in one call is a preview feature. The design doesn't need it: step 2 (search) returns plain text with grounding metadata, and only steps 1 and 3 (no tools) use a JSON schema.
- **Source metadata (generateContent):** `groundingMetadata.groundingChunks[].web.{uri,title}` and `groundingSupports[].{segment, groundingChunkIndices}`. Segment indices are in bytes, so text is sliced on UTF-8 bytes. Development IDs come from these supports.
- **Source URLs** may be Google redirect links (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`), and titles may be just a domain. That isn't officially documented either way. Sources are shown by their title, with the link as given (https only).
- **Still to confirm when building:** how thinking tokens count against the output cap on `gemini-3.6-flash`, so `thinkingConfig` and the caps are set together.
- **Free-tier rate limits** aren't published, so the app doesn't assume any. The no-retry rule and the app's own limiter apply.

## Data handling
- Step 1 sees the project description as typed, which may include budgets. The search, classify and advise steps never see budgets: advice gets costs only as a share of the budget.
- All calculations stay in the app.
- Price data is real FRED data. The demo uses sample project descriptions, not real company projects.
- A production version would use a paid API tier with no-training terms, or let users enter budgets in the form instead of the description.

## Disclaimer
This tool's advice rests on what happened in similar past periods and after similar past supply-chain events, weighed against current news. It is not a price forecast. Purchasing decisions should consider the company's own costs, contracts and supplier terms.

## Open decision
**Where this doc lives:** in the repo (e.g., `docs/ai-feature.md`, with the README summarizing it) or as private notes. Remove this section once decided.

---

## Appendix: Formulas
For implementation and tests. All rates are fractions, except volatility, which keeps the app's percentage-point units (standardization makes the units irrelevant).

**Clocks:**
- L = the latest final month: 4 months before the last month in the CSV. The parser fills calendar gaps with missing values, so rows and months always match, and a trailing "." still counts as one of the 4 preliminary months. If any of the four measures at L is undefined (for example, a missing value), that material shows "recent conditions can't be measured" and is skipped.
- T₀ = the current calendar month, from the server clock, passed into every function as a parameter (tests inject it). The validator's 0–36 month check takes T₀ too.
- G = number of months from L to T₀. G must be at least 0. If G is above 24, the data is treated as out of date: the analysis is skipped with a message.

**Need months:** for phase j with need date (a calendar month), dⱼ = months from T₀ to the need date. Allowed range: 0 ≤ dⱼ ≤ 36. D = max(dⱼ).

**Recent-condition measures at month m:**
- cₖ(m) = I(m) / I(m − k) − 1, for k = 3, 6 and 12
- v(m) = the app's existing volatility measure at month m
- Recent conditions are the measures at month L.

**Candidate months:** every month s from the start of the history window (s ≥ the window's first month; the lookbacks of up to 12 months may reach before it) with all four measures defined, and with every month from s through s + G + D final and non-missing (so that month is at most L). Requiring every month in between, not just the ones the formulas use, is intended: it keeps the rule simple.

**Similarity:** standardize each measure across all candidate months (subtract the mean, divide by the sample standard deviation; population vs sample doesn't change the ranking). L is standardized with the candidates' mean and standard deviation; L isn't in the pool. A measure with zero standard deviation is left out of the distance; if every measure has zero spread, all distances are 0 and ties go to the earlier month. Fewer than 2 candidates counts as "too few similar periods." The distance between s and L is the Euclidean distance between their standardized measures. Distances are rounded to 9 decimal places before sorting, so equal distances tie exactly.

**Selecting similar periods:** sort candidates by distance (ties go to the earlier month). Go down the list, keeping a month only if it's more than 6 months from every month already kept. Stop at 20. If fewer than 8 are kept, report "too few similar periods."

**What followed:** for a selected month s and horizon h (each distinct dⱼ > 0), the move is (I(s + G + h) − I(s + G)) / I(s + G), rounded to 9 decimal places (`Math.round(x * 1e9) / 1e9`) before comparing, so an exact ±5% move isn't misclassified by floating-point error (in JavaScript, 105/100 − 1 is 0.050000000000000044). It counts as "rose" if above +0.05, "fell" if below −0.05, and "within ±5%" otherwise (including exactly ±0.05). The biggest fall and rise are the minimum and maximum of the rounded moves across the similar periods.

**Closest past event (one case):** start month e is the event's month, with no gap, because the event plays the part of today's news. Moves are (I(e + h) − I(e)) / I(e), and strategy costs use gⱼ = I(e + dⱼ) / I(e) − 1. A horizon or strategy whose months go past L shows "not enough data yet." The UI says how many similar periods the event's buy-as-needed extra cost was strictly above, after the same rounding ("higher than k of n").

**Price path in scenario s:** gⱼ(s) = I(s + G + dⱼ) / I(s + G) − 1. If dⱼ = 0, gⱼ(s) = 0.

**Strategies for one material:** budget B (at today's prices), phases j = 1…n with need month dⱼ and share fⱼ (Σ fⱼ = 1), carrying cost r per month. Phases are ordered by need date, then by the order entered. A strategy is a set E of future phases (dⱼ > 0) bought now.
- Buy as needed: E = none
- Buy all future phases now: E = every phase with dⱼ > 0
- Buy first half now: E = phases with dⱼ > 0 among the first ⌈n/2⌉ phases (rounded up, so 2 of 3; the UI says so)

Extra cost in scenario s: B × r × Σ(j in E) fⱼ × dⱼ + B × Σ(j not in E) fⱼ × gⱼ(s)

Strategies with the same set E are duplicates, and only the first in the order listed above is shown (so with one future phase, "buy first half now" is hidden in favour of "buy all future phases now"). If no phase has dⱼ > 0, there's no timing decision, and the tool flags it.

**Break-even carrying cost in scenario s:** r*(s) = Σ(dⱼ > 0) fⱼ × gⱼ(s) / Σ fⱼ × dⱼ. The denominator is zero only when no phase is in the future, which is already flagged as "no timing decision". If r*(s) ≤ 0, buying early never paid off in that scenario. The headline is the median of r*(s) across similar periods. If r*(s) ≤ 0 in more than half the similar periods, the headline says "In most similar periods, buying early didn't pay off at any carrying cost."

**"Came out ahead":** buying all future phases now came out ahead in scenario s if r < r*(s), with r*(s) rounded to 9 decimal places first (the worked example's r* is 0.024999999999999984 in floating point). r = r*(s) is a tie and doesn't count. Reported as "k of n periods."

**Summary per strategy:** median (the average of the two middle values when n is even), minimum and maximum across the selected periods.

**Worked example (one scenario):** B = $1,000,000, two phases with dⱼ = 0 and 6, 50% each, r = 0.02, g = 0 at month 0 and 0.15 at month 6.
- Buy as needed: $1M × 0.5 × 0.15 = $75,000
- Buy all future phases now: $1M × 0.02 × 0.5 × 6 = $60,000
- Buy first half now: E = none (the first phase is needed this month), so it's a duplicate of buy as needed and isn't shown.
- Break-even: r* = 0.075 / 3 = 0.025. At r = 0.02, buying early came out ahead.

**Carrying cost benchmark source:** common supply-chain references put carrying cost at 20–30% of inventory value per year (e.g., Fishbowl, citing the Institute for Supply Management: https://www.fishbowlinventory.com/blog/what-is-carrying-cost).