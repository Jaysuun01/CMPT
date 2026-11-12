// The Plan a purchase page (/plan): the AI feature. All of its logic lives in components/RiskCheck.tsx.
import type { Metadata } from "next";
import { RiskCheck } from "@/components/RiskCheck";
import { SiteHeader } from "@/components/SiteHeader";

/** Title and description for the Plan a purchase page. */
export const metadata: Metadata = {
  title: "Plan a purchase – Construction material prices",
  description: "Compare buying construction materials now with buying as each phase needs them, using similar past periods.",
};

/** The Plan a purchase page: the site header and the Material Risk Check. */
export default function PlanPage() {
  return (
    <>
      <SiteHeader current="/plan" />
      <main className="wrap">
        <RiskCheck />
      </main>
    </>
  );
}
