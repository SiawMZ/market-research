import Link from "next/link";
import { Card, Delta, PageHeader, Section, Stat, TrendBadge, sentimentBand } from "@/components/ui";
import { getEtfFlows, getMarketRows, getMetric, getPortfolios, type MarketRow } from "@/lib/data";
import { fmt, fmtPrice } from "@/lib/format";
import { median, moodIndex, moodLabel } from "@/lib/signals";

export const revalidate = 3600;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function marketStats(label: string, rows: MarketRow[], bench: MarketRow | undefined) {
  const pick = (k: "chg7d" | "chg30d" | "chg1y" | "volatility") => median(rows.map((r) => r[k]).filter((v): v is number => v != null));
  const withTrend = rows.filter((r) => r.trend !== "—");
  return {
    label,
    bench,
    chg7d: pick("chg7d"),
    chg30d: pick("chg30d"),
    chg1y: pick("chg1y"),
    vol: pick("volatility"),
    upShare: withTrend.length ? withTrend.filter((r) => r.trend === "Uptrend").length / withTrend.length : null,
  };
}

export default async function SummaryPage() {
  const [crypto, us, my, macro, fng, flows, portfolios] = await Promise.all([
    getMarketRows("crypto"),
    getMarketRows("us", ["stock", "etf"]),
    getMarketRows("my", ["stock"]),
    getMarketRows("us", ["index"]),
    getMetric("crypto_fear_greed", 30),
    getEtfFlows(40),
    getPortfolios(),
  ]);
  const m = (s: string) => macro.find((x) => x.symbol === s);
  const usStocks = us.filter((r) => r.kind === "stock");
  const mood = moodIndex(m("^GSPC"), m("^VIX"), usStocks);
  const fngNow = fng.at(-1);

  const markets = [
    marketStats("Crypto (top 50)", crypto, crypto.find((r) => r.symbol === "BTC")),
    marketStats("US stocks", usStocks, us.find((r) => r.symbol === "SPY")),
    marketStats("Bursa Malaysia", my, m("^KLSE")),
  ];

  const all = [...crypto, ...usStocks, ...my];
  // Dip candidates: oversold on RSI but still in a long-term uptrend (price above the 200-day average).
  const dips = all.filter((r) => r.rsi14 != null && r.rsi14 < 35 && r.ma200 != null && r.price > r.ma200).sort((a, b) => a.rsi14! - b.rsi14!).slice(0, 8);
  const stretched = all.filter((r) => r.rsi14 != null && r.rsi14 > 70).sort((a, b) => b.rsi14! - a.rsi14!).slice(0, 8);
  const leaders = [...all].filter((r) => r.chg30d != null).sort((a, b) => b.chg30d! - a.chg30d!).slice(0, 8);
  const unusual = all.filter((r) => r.volumeRatio != null && r.volumeRatio >= 2).sort((a, b) => b.volumeRatio! - a.volumeRatio!).slice(0, 8);

  return (
    <>
      <PageHeader title="Summary" intro="Both markets side by side: the mood, how each market is doing, what stands out, and where the two paper portfolios stand." />

      <Section n="01" title="Mood" why="Fear and greed in each market. Extremes in either direction are worth a second look.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Crypto Fear & Greed" value={fngNow?.value ?? "—"} sub={<span className="text-ink-2">{fngNow ? sentimentBand(fngNow.value) : ""}</span>} />
          <Stat label="US market mood" value={mood.score == null ? "—" : Math.round(mood.score)} sub={<span className="text-ink-2">{mood.score == null ? "" : moodLabel(mood.score)}</span>} note="Our own gauge; see Stocks" />
          <Stat
            label="BTC ETF flows, 20 days"
            value={fmt(sum(flows.slice(-20).map((f) => f.totalUsdM)), "usdM")}
            note="Institutional demand for Bitcoin"
          />
          <Stat label="VIX" value={fmt(m("^VIX")?.price, "num")} sub={<Delta v={m("^VIX")?.chg7d} />} note="Above 25 means stressed markets" />
        </div>
      </Section>

      <Section n="02" title="Compare the markets" why="Median of the assets we track in each market, plus its benchmark. Volatility is how violently prices swing (yearly basis).">
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">Market</th>
                <th className="px-4 py-2 text-left font-normal">Benchmark</th>
                <th className="px-4 py-2 text-right font-normal">Benchmark 30D</th>
                <th className="px-4 py-2 text-right font-normal">Median 7D</th>
                <th className="px-4 py-2 text-right font-normal">Median 30D</th>
                <th className="px-4 py-2 text-right font-normal">Median 1Y</th>
                <th className="px-4 py-2 text-right font-normal">Volatility</th>
                <th className="px-4 py-2 text-right font-normal">In uptrend</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((mk) => (
                <tr key={mk.label} className="border-t border-line">
                  <td className="px-4 py-2 font-medium">{mk.label}</td>
                  <td className="px-4 py-2 text-ink-2">{mk.bench ? `${mk.bench.symbol.replace("^KLSE", "KLCI")} ${fmtPrice(mk.bench.price, mk.bench.currency === "MYR" ? "" : "USD")}` : "—"}</td>
                  <td className="px-4 py-2 text-right"><Delta v={mk.bench?.chg30d} /></td>
                  <td className="px-4 py-2 text-right"><Delta v={mk.chg7d} /></td>
                  <td className="px-4 py-2 text-right"><Delta v={mk.chg30d} /></td>
                  <td className="px-4 py-2 text-right"><Delta v={mk.chg1y} /></td>
                  <td className="px-4 py-2 text-right tabular">{fmt(mk.vol, "pct").replace("+", "")}</td>
                  <td className="px-4 py-2 text-right tabular">{mk.upShare == null ? "—" : `${Math.round(mk.upShare * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section n="03" title="What stands out" why="Across crypto, US and Bursa. These are starting points for research, not buy or sell calls.">
        <div className="grid gap-4 md:grid-cols-2">
          <PickList title="Dip candidates" note="RSI under 35 but still above the 200-day average" rows={dips} metric={(r) => `RSI ${r.rsi14!.toFixed(0)}`} />
          <PickList title="Stretched" note="RSI over 70: strong, but often due a pause" rows={stretched} metric={(r) => `RSI ${r.rsi14!.toFixed(0)}`} />
          <PickList title="30-day leaders" note="Strongest momentum" rows={leaders} metric={(r) => <Delta v={r.chg30d} />} />
          <PickList title="Unusual volume" note="Latest volume 2× or more its 20-day average" rows={unusual} metric={(r) => fmt(r.volumeRatio, "ratio")} />
        </div>
      </Section>

      <Section
        n="04"
        title="Paper portfolios"
        why="Two $1,000 strategies, judged against simply holding BTC, VOO, or a 50/50 mix."
        aside={<Link href="/portfolio?view=compare" className="text-sm text-ink-2 hover:text-ink">Compare in detail →</Link>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {portfolios.map((p) => {
            const snap = p.snapshots.at(-1);
            const equity = snap?.equityUsd ?? p.startCashUsd;
            return (
              <Card key={p.id}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted">since {p.startedAt}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular">{fmt(equity, "price")}</div>
                <Delta v={equity / p.startCashUsd - 1} />
                <p className="mt-3 text-sm text-ink-2">
                  {p.journal[0]?.summary ?? "No trades yet. The daily review that makes and explains decisions starts in Phase 5."}
                </p>
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function PickList({ title, note, rows, metric }: { title: string; note: string; rows: MarketRow[]; metric: (r: MarketRow) => React.ReactNode }) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted">{note}</div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-2">Nothing right now.</p>
      ) : (
        <ul className="text-sm">
          {rows.map((r) => (
            <li key={r.id} className="border-t border-line first:border-t-0">
              <Link href={`/asset/${encodeURIComponent(r.id)}`} className="flex items-center justify-between gap-3 px-4 py-1.5 hover:bg-surface-2">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-xs text-muted uppercase">{r.market}</span>
                  <span className="font-medium">{r.symbol.replace(".KL", "")}</span> <span className="text-ink-2">{r.name}</span>
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap tabular">
                  <TrendBadge trend={r.trend} />
                  {metric(r)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
