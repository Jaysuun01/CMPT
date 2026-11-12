// Curated past supply-chain events (docs/ai-feature.md, "Curated past events"). Researched with an LLM,
// then each month and note checked against its source. The LLM may only return these ids.
export type Material = "lumber" | "steel" | "concrete";

/** One curated event: when it began, which materials it hit, what happened, and its sources. */
export interface PastEvent {
  id: string;
  name: string;
  /** "YYYY-MM": the month the event started. */
  month: string;
  materials: readonly Material[];
  shock: "tariff" | "demand" | "energy";
  description: string;
  next: string;
  /** Sources for the description and for the "what happened next" note (may be the same). */
  source: string;
  nextSource: string;
}

/** The curated list. The LLM may only name these ids (or "none"); code looks up everything else. */
export const EVENTS = [
  {
    id: "steel-safeguard-2002",
    name: "2002 U.S. steel safeguard tariffs",
    month: "2002-03",
    materials: ["steel"],
    shock: "tariff",
    description: "Section 201 safeguard tariffs on imports of many steel products were proclaimed in March 2002.",
    next: "The tariffs were ended early, in December 2003.",
    source: "https://www.govinfo.gov/content/pkg/FR-2003-12-08/pdf/03-30578.pdf",
    nextSource: "https://www.govinfo.gov/content/pkg/FR-2003-12-08/pdf/03-30578.pdf",
  },
  {
    id: "financial-crisis-2008",
    name: "2008 financial crisis",
    month: "2008-09",
    materials: ["lumber", "steel", "concrete"],
    shock: "demand",
    description: "Lehman Brothers filed for bankruptcy in September 2008, and the financial crisis deepened into the Great Recession.",
    next: "The recession ended in June 2009, but economic weakness persisted.",
    source: "https://www.federalreservehistory.org/essays/great-recession-and-its-aftermath",
    nextSource: "https://www.federalreservehistory.org/essays/great-recession-and-its-aftermath",
  },
  {
    id: "softwood-duties-2017",
    name: "2017 U.S. duties on Canadian softwood lumber",
    month: "2017-04",
    materials: ["lumber"],
    shock: "tariff",
    description: "The U.S. Commerce Department set preliminary countervailing duties on softwood lumber from Canada in April 2017.",
    next: "A final countervailing duty order was published in January 2018.",
    source: "https://www.govinfo.gov/content/pkg/FR-2017-04-28/html/2017-08673.htm",
    nextSource: "https://www.govinfo.gov/content/pkg/FR-2018-01-03/pdf/2017-28483.pdf",
  },
  {
    id: "steel-232-2018",
    name: "2018 Section 232 steel tariffs",
    month: "2018-03",
    materials: ["steel"],
    shock: "tariff",
    description: "A 25% Section 232 tariff on steel imports from most countries took effect in March 2018.",
    next: "Canada and Mexico, exempt at first, were exempted again in May 2019.",
    source: "https://www.govinfo.gov/content/pkg/FR-2018-03-15/html/2018-05478.htm",
    nextSource: "https://www.govinfo.gov/content/pkg/FR-2019-05-23/pdf/2019-11002.pdf",
  },
  {
    id: "pandemic-demand-2020",
    name: "2020–21 pandemic demand surge",
    month: "2020-05",
    materials: ["lumber"],
    shock: "demand",
    description: "Wood product prices rose sharply from May 2020 as home improvement and new housing pushed up demand, while sawmill supply was constrained.",
    next: "Wood product prices kept rising through April 2021.",
    source: "https://www.bls.gov/opub/btn/volume-10/how-did-the-covid-19-pandemic-affect-input-costs-for-us-producers.htm",
    nextSource: "https://www.bls.gov/opub/btn/volume-10/how-did-the-covid-19-pandemic-affect-input-costs-for-us-producers.htm",
  },
  {
    id: "energy-spike-2022",
    name: "2022 energy price spike after Russia's invasion of Ukraine",
    month: "2022-02",
    // Energy-heavy production (cement, steel); the source doesn't name materials, so this is a judgement.
    materials: ["steel", "concrete"],
    shock: "energy",
    description: "Russia's invasion of Ukraine in February 2022 contributed to a sharp rise in crude oil prices.",
    next: "In March 2022, the EIA expected crude oil to stay above $100 a barrel in the following months.",
    source: "https://www.eia.gov/todayinenergy/detail.php?id=51658",
    nextSource: "https://www.eia.gov/todayinenergy/detail.php?id=51658",
  },
] as const satisfies readonly PastEvent[];

type EventId = (typeof EVENTS)[number]["id"];
/** The ids, as a tuple for zod enums and the JSON schema. */
export const EVENT_IDS = EVENTS.map((e) => e.id) as [EventId, ...EventId[]];
/** The event with this id, or undefined. */
export const eventById = (id: string): PastEvent | undefined => EVENTS.find((e) => e.id === id);
