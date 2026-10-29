import Link from "next/link";
import { MarketTable } from "@/components/MarketTable";
import { MacroTable } from "@/components/MacroTable";
import { Card, Delta, PageHeader, Section, Stat } from "@/components/ui";
import { getInsiderTrades, getMacroEvents, getMarketRows } from "@/lib/data";
import { fmt } from "@/lib/format";
import { moodIndex, moodLabel } from "@/lib/signals";

export const revalidate = 3600;


export default async function StocksPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const market = (await searchParams).m === "my" ? "my" : "us";
  const [rows, macro, insiders, events] = await Promise.all([
    getMarketRows(market, ["stock", "etf"]),
    getMarketRows("us", ["index"]),
    getInsiderTrades(150),
    getMacroEvents(),
  ]);
  const usStocks = market === "us" ? rows.filter((r) => r.kind === "stock") : (await getMarketRows("us", ["stock"]));
  const m = (s: string) => macro.find((x) => x.symbol === s);
  const mood = moodIndex(m("^GSPC"), m("^VIX"), usStocks);

  const buys = insiders.filter((t) => t.type.startsWith("P"));
  const sells = insiders.filter((t) => t.type.startsWith("S"));
  // Cluster buys: two or more different insiders buying the same stock recently — a stronger signal than one buyer.
  const byTicker = new Map<string, typeof buys>();
  for (const b of buys) byTicker.set(b.ticker, [...(byTicker.get(b.ticker) ?? []), b]);
  const clusters = [...byTicker.entries()]
    .map(([ticker, list]) => ({ ticker, company: list[0].company, insiders: new Set(list.map((l) => l.insider)).size, value: list.reduce((a, l) => a + (l.valueUsd ?? 0), 0) }))
    .filter((c) => c.insiders >= 2)
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader title="Stocks" intro="US and Bursa Malaysia. Prices are end of day; Bursa prices are in ringgit.">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm" role="tablist">
          {[
            { k: "us", label: "United States" },
            { k: "my", label: "Bursa Malaysia" },
          ].map((t) => (
            <Link
              key={t.k}
              href={t.k === "us" ? "/stocks" : "/stocks?m=my"}
              role="tab"
              aria-selected={market === t.k}
              className={`rounded-md px-3 py-1 ${market === t.k ? "bg-surface-2 font-medium" : "text-ink-2 hover:text-ink"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          ["^GSPC", "S&P 500", "num"],
          ["^IXIC", "Nasdaq", "num"],
          ["^VIX", "VIX", "num"],
          ["^KLSE", "FBM KLCI", "num"],
          ["MYR=X", "USD/MYR", "num"],
          ["GC=F", "Gold", "price"],
          ["CL=F", "WTI oil", "price"],
        ].map(([sym, label, kind]) => {
          const r = m(sym);
          return <Stat key={sym} label={label} value={r ? (kind === "price" ? fmt(r.price, "price") : r.price.toLocaleString("en-US", { maximumFractionDigits: 2 })) : "—"} sub={<Delta v={r?.chg7d} />} />;
        })}
      </div>

      <Section
        n="01"
        title="US market mood"
        why="Our own fear-and-greed style gauge from four parts we can measure. Experimental: treat it as context, not a signal on its own."
      >
        <div className="grid gap-3 md:grid-cols-5">
          <Stat label="Mood (0–100)" value={mood.score == null ? "—" : Math.round(mood.score)} sub={<span className="text-ink-2">{mood.score == null ? "" : moodLabel(mood.score)}</span>} />
          {mood.parts.map((p) => (
            <Card key={p.label}>
              <div className="text-xs text-muted">{p.label}</div>
              <div className="mt-1 text-lg font-semibold tabular">{Math.round(p.score)}</div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="h-1.5 rounded-full bg-ink-2" style={{ width: `${p.score}%` }} />
              </div>
              <div className="mt-2 text-xs text-ink-2">{p.detail}</div>
            </Card>
          ))}
        </div>
      </Section>

      <Section n="02" title="This week's macro calendar" why="CPI, jobs and Fed events move both markets; Bursa follows Wall Street and the ringgit.">
        <MacroTable events={events} />
      </Section>

      <Section n="03" title={market === "us" ? "US stocks and ETFs" : "Bursa Malaysia (FBM KLCI and liquid mid caps)"} why="Click a name for its chart and indicators. Bursa trades in lots of 100 shares.">
        <MarketTable rows={rows} preset="stocks" />
      </Section>

      {market === "us" && (
        <Section
          n="04"
          title="Insider buying (US)"
          why="Executives and directors buying their own stock with their own money (SEC Form 4). Insiders sell for many reasons, but they usually buy for one: they expect the price to rise."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-0">
              <div className="border-b border-line px-4 py-2 text-sm font-medium">Cluster buys (2+ insiders)</div>
              {clusters.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-2">None in the latest filings.</p>
              ) : (
                <ul className="text-sm">
                  {clusters.slice(0, 10).map((c) => (
                    <li key={c.ticker} className="flex justify-between gap-3 border-t border-line px-4 py-1.5 first:border-t-0">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{c.ticker}</span> <span className="text-ink-2">{c.company}</span>
                      </span>
                      <span className="tabular whitespace-nowrap">
                        {c.insiders} · {fmt(c.value, "usd")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <InsiderList title="Largest recent buys" rows={[...buys].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)).slice(0, 10)} />
            <InsiderList title="Largest recent sells" rows={[...sells].sort((a, b) => (a.valueUsd ?? 0) - (b.valueUsd ?? 0)).slice(0, 10)} />
          </div>
          <p className="mt-2 text-xs text-muted">Source: OpenInsider (SEC Form 4). Buys ≥ $25k, sells ≥ $100k. Fund holdings (13F) arrive in Phase 3.</p>
        </Section>
      )}
    </>
  );
}

function InsiderList({ title, rows }: { title: string; rows: Awaited<ReturnType<typeof getInsiderTrades>> }) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-2 text-sm font-medium">{title}</div>
      <ul className="text-sm">
        {rows.map((t) => (
          <li key={t.id} className="flex justify-between gap-3 border-t border-line px-4 py-1.5 first:border-t-0">
            <span className="min-w-0 truncate">
              <span className="font-medium">{t.ticker}</span> <span className="text-ink-2">{t.title}</span>
            </span>
            <span className="tabular whitespace-nowrap">
              <Delta v={t.valueUsd} kind="usd" />
              <span className="ml-2 text-xs text-muted">{t.tradeDate.slice(5)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
