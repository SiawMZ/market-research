import { Planner } from "@/components/Planner";
import { PageHeader } from "@/components/ui";
import { PORTFOLIOS } from "@/config/portfolios";
import { getScoredUniverse, lean } from "@/lib/ideas";

export const revalidate = 3600;

export default async function PlannerPage() {
  const u = await getScoredUniverse();
  return (
    <>
      <PageHeader
        title="What would I buy with…"
        intro="Enter an amount and a style. The planner applies the same written rules as the paper portfolios: target mix, position limits, Bursa board lots and fees. It then fills each part with today's best-scoring assets."
      />
      <Planner
        universe={{ crypto: lean(u.crypto), us: lean(u.us), my: lean(u.my), etfs: lean(u.etfs), usdMyr: u.usdMyr }}
        profiles={PORTFOLIOS.map(({ id, name, rules }) => ({ id, name, rules }))}
      />
    </>
  );
}
