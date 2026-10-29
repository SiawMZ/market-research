import { Screener } from "@/components/Screener";
import { PageHeader } from "@/components/ui";
import { getScoredUniverse, lean } from "@/lib/ideas";

export const revalidate = 3600;

export default async function ScreenerPage() {
  const u = await getScoredUniverse();
  return (
    <>
      <PageHeader
        title="Screener"
        intro="Filter every tracked crypto, US and Bursa asset. Start from a preset, then adjust. Scores are 0–100 and compare each asset only with its own market."
      />
      <Screener rows={lean([...u.us, ...u.my, ...u.crypto])} />
    </>
  );
}
