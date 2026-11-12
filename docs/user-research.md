# User research: Construction Material Price Tracker

Desk research. Sources are trade publications, BLS guidance, practitioner and legal guides, and contractor surveys (listed at the end).

**Limits of this research**
- Forum threads (e.g. Reddit) were not reachable. A verifier subagent checked the claims below against their sources.
- Claims are tagged **[evidence]** (a source says it) or **[hypothesis]** (inferred, needs a real user to confirm).
- The biggest open question is whether estimators would use a PPI tracker in the way described here, or would just call suppliers. **A 15-minute conversation with a working estimator would settle that faster than more reading.**

## What the evidence says about how PPI is actually used

- **Estimators get fresh supplier quotes for real prices.** [evidence] Practitioners advise refreshing supplier quotes every 2–4 weeks, and say supplier quote windows can be as short as 7 days or even 24 hours. PPI is cited as a **broad baseline**, e.g. assume "baseline escalation of 4% to 6%" (ABC Carolinas, Contractor+).
- **Escalation clauses are built on named indexes with a base month.** [evidence] BLS tells both contracting parties to name the index by "the exact title and any identifying code" and to "give the effective month and year of the base selling price." It also notes there is "no single index titled 'The Producer Price Index'" (BLS guide).
- **Risk differs by material.** [evidence] Volatility is "highly category-specific." Contractors are advised to identify volatile materials as separate line items, or protect them with escalation clauses, rather than apply one blanket assumption (ABC Carolinas, Colonial Surety).
- **Early buying and price locks are a trade-off.** [evidence] They tie up cash and storage. The candidates are volatile **or** long-lead items (ABC Carolinas, Remarcable).
- **Recent values change.** [evidence] PPI values are revised monthly and are final 4 months after first publication. Seasonally adjusted indexes are "not appropriate in price adjustment agreements" (BLS).
- **Clients get explanations of price changes.** [evidence] Guides tell contractors to explain the reason before the price, in plain language, with backup documents (ShiftFlow, ABC Supply). Owners are advised to "look hard at the numbers" in escalation claims (Grant Thornton).

## Who uses this, and why they'd open it

### 1. The estimator (primary user)
- **Job [evidence]:** set a baseline escalation assumption for a bid, and decide which materials are volatile enough to break out as line items or cover with an escalation clause.
- **Job [hypothesis]:** check how far a material has moved since an older quote or database was priced, before fresh quotes come back.
- **What matters to them:**
  - speed [evidence: "faster bids" with "tighter margins"]
  - exact, citable numbers, because they end up in clauses and backup documents [evidence: BLS title and code rule]

### 2. The project manager or buyer
- **Job [evidence]:** decide whether to lock prices or buy early on volatile materials.
- **Job [hypothesis]:** a monthly check of what moved after each BLS release.
- **What matters to them:** knowing **which** material is volatile right now [evidence: "category-specific"].

### 3. The owner or developer (the contractor's client)
- **Job [evidence]:** check an escalation claim against the index and base month named in the contract (BLS rule for both parties; Grant Thornton's "look hard at the numbers").
- **What matters to them:** plain language, and numbers they can check themselves. [evidence: change-order guidance]
- **Device:** that they open a shared link on a phone is a **[hypothesis]**.

## Jobs the page has to do

| Job | Who | Basis | What success looks like |
|---|---|---|---|
| A. Measure change between two specific months | Estimator, owner | Evidence (clause math: base month to later month) | Pick exact months and read the change per material, ready to copy |
| B. Judge which material is risky | Estimator, PM | Evidence ("category-specific") | Compare volatility across materials on one scale |
| C. Check the latest month | PM, estimator | Hypothesis | See in under 30 seconds what moved on the month and on the year |
| D. Explain it to someone else | Estimator, owner | Evidence (plain-language change orders) | A plain sentence or link a non-expert can understand and check |
| E. Trust the number | Everyone | Evidence (BLS citation and revision rules) | See the exact series, data month, preliminary flag, and when the data was pulled |

## What this means for the design

The brief's required charts stay the main deliverable: index, MoM, YoY and volatility for each material, with one date range driving them. The points below shape how those charts are framed.

1. **Two precise months drive everything.** The date range picker doubles as the clause's "base month to later month," so it gets real month and year controls. Quick ranges are a shortcut. *(Job A, evidence)*
2. **A results row above the charts.** For each material: both index values, % change, and the factor. This is a design choice inferred from job A, not something a source asked for. The charts below explain how prices got there.
3. **Compare materials on one scale.** Each chart row shares one y-axis across the three materials. *(Job B, evidence)*
4. **Translate index points.** Lead with % change. Say plainly that these are indexes, not prices.
5. **Show the citation and its status next to the numbers.** Full title and code, the data month, a preliminary flag on the last 4 months, and the date the data was pulled from FRED. *(Job E, evidence)*
6. **Be honest about limits:**
   - These are **broad** indexes. A contract may name a narrower one (e.g. steel mill products, ready-mix concrete), so these numbers may not match it.
   - They look back to the latest month and are not forecasts.
   - They track producer prices, not anyone's delivered cost.
   - They are not seasonally adjusted, so YoY is the cleaner trend.
7. **A one-line latest-month strip** at the top. *(Job C, hypothesis; it's cheap)*

**Proposals, not research.** Built only where a later design decision called for them (CLAUDE.md §3):
- copy-summary sentence *(job D)*
- shareable link with the months in the URL *(job D)*
- CSV download *(spreadsheet users, hypothesis)*
- volatility compared with the material's own 10-year history *(designer's idea to make ±% readable)*
- a phone layout for the shared link *(hypothesis)*

## Sources
- BLS, Price Adjustment Guide for Contracting Parties: https://www.bls.gov/ppi/publications/price-adjustment-guide-for-contracting-parties.htm
- BLS, PPI publication and revision schedule: https://www.bls.gov/opub/hom/ppi/presentation.htm
- ABC Carolinas, construction material prices 2026: https://abccarolinas.org/construction-material-prices-2026-how-carolinas-contractors-can-protect-bids-and-margins/
- Contractor+, bidding with volatile prices: https://contractorplus.app/blog/proven-bidding-tactics-for-volatile-material-prices
- Colonial Surety, separating volatile line items: https://colonialsurety.com/volatile-material-prices-push-back/
- Estimating Edge, estimating pressures in 2026: https://www.newswire.com/news/estimating-edge-examines-what-is-shaping-construction-estimating-in-2026
- Remarcable, hold-for-release orders: https://www.remarcable.com/blog/what-is-hold-for-release-in-construction-procurement
- ShiftFlow, explaining a change order to a customer: https://www.shiftflow.app/playbook/how-to-explain-a-change-order-to-a-customer
- ABC Supply, contract strategies for price volatility: https://www.abcsupply.com/news-events/contract-strategies-protect-contractors-material-price-volatility/
- Grant Thornton, managing material escalation: https://www.grantthornton.com/insights/articles/real-estate/2022/managing-material-escalation-on-construction-projects
- AGC, input cost survey, Sep 2026: https://www.agc.org/index%2ephp/news/2026/09/10/construction-input-costs-climb-89-between-august-2025-and-august-2026-association-survey-finds-war
