import Link from "next/link";
import { Card, Delta, PageHeader, Section, TrendBadge } from "@/components/ui";
import { getScoredUniverse } from "@/lib/ideas";
import { fmtPrice } from "@/lib/format";
import { FACTOR_LABELS, type FactorKey, type Scored } from "@/lib/scoring";

export const revalidate = 3600;

const top = (rows: Scored[], key: "undervalued" | "potential", n = 6) =>
  rows.filter((r) => r[key] != null).sort((a, b) => b[key]! - a[key]!).slice(0, n);

export default async function IdeasPage() {
  const u = await getScoredUniverse();
  return (
    <>
      <PageHeader
        title="Undervalued and potential"
        intro="Ranked by transparent scores, each a 0–100 rank against the same market. Every pick shows why it scored well and what could go wrong. Research starting points, not recommendations."
      />

      <Section n="01" title="Undervalued: US" why="Cheap on earnings, book value, cash flow and dividends compared with other US stocks, weighted toward profitable businesses so value traps rank lower.">
        <IdeaGrid rows={top(u.us, "undervalued")} scoreKey="undervalued" />
      </Section>

      <Section n="02" title="Undervalued: Bursa Malaysia" why="The same test, ranked only against other Bursa stocks. Prices in ringgit.">
        <IdeaGrid rows={top(u.my, "undervalued")} scoreKey="undervalued" />
      </Section>

      <Section n="03" title="Highest potential: stocks" why="Balanced blend: value 30%, quality 25%, growth 20%, momentum 25%. US and Bursa ranked separately, best of both shown.">
        <IdeaGrid rows={[...top(u.us, "potential", 4), ...top(u.my, "potential", 2)]} scoreKey="potential" />
      </Section>

      <Section n="04" title="Highest potential: crypto" why="No earnings to value, so: momentum 40%, size and liquidity 30%, discount from all-time high 15%, leverage health 15%.">
        <IdeaGrid rows={top(u.crypto, "potential")} scoreKey="potential" />
      </Section>

      <p className="text-xs text-muted">
        Method: each factor is a percentile rank within its market (50 = middle of the pack). Missing data leaves a factor out rather than counting as zero. Financial
        companies skip cash-flow and debt measures, which don&apos;t compare across banks. Fundamentals are the latest annual figures from Yahoo Finance.
      </p>
    </>
  );
}

function IdeaGrid({ rows, scoreKey }: { rows: Scored[]; scoreKey: "undervalued" | "potential" }) {
  if (rows.length === 0) return <p className="text-sm text-ink-2">Not enough data to score yet.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <IdeaCard key={r.id} r={r} score={r[scoreKey]!} />
      ))}
    </div>
  );
}

function IdeaCard({ r, score }: { r: Scored; score: number }) {
  const factors = Object.entries(r.factors) as [FactorKey, number][];
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/asset/${encodeURIComponent(r.id)}`} className="group min-w-0">
          <div className="font-medium group-hover:underline">{r.symbol.replace(".KL", "")}</div>
          <div className="truncate text-sm text-ink-2">{r.name}</div>
        </Link>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular leading-none">{Math.round(score)}</div>
          <div className="text-xs text-muted">score</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className="tabular">{fmtPrice(r.price, r.currency)}</span>
        <span className="text-xs text-muted">1Y</span>
        <Delta v={r.chg1y} />
        <span className="ml-auto">
          <TrendBadge trend={r.trend} />
        </span>
      </div>

      <dl className="mt-4 space-y-1.5">
        {factors.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-xs">
            <dt className="text-ink-2">{FACTOR_LABELS[k]}</dt>
            <dd className="h-1.5 rounded-full bg-surface-2" aria-hidden>
              <div className="h-1.5 rounded-full" style={{ width: `${v}%`, background: "var(--series-1)" }} />
            </dd>
            <dd className="text-right tabular">{Math.round(v)}</dd>
          </div>
        ))}
      </dl>

      {r.reasons.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {r.reasons.slice(0, 3).map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden className="text-up">+</span>
              {s}
            </li>
          ))}
        </ul>
      )}
      {r.flags.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {r.flags.slice(0, 2).map((s) => (
            <li key={s} className="flex gap-2 text-ink-2">
              <span aria-hidden className="text-down">!</span>
              <span>
                <span className="sr-only">Risk: </span>
                {s}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
