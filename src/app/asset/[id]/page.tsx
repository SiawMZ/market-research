import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceChart } from "@/components/charts/PriceChart";
import { Card, Delta, PageHeader, Section, Stat, TrendBadge } from "@/components/ui";
import { getAsset, getCandles, getFundMoves, getInsiderTrades, getMarketRows, getNews, getSocial } from "@/lib/data";
import { NewsList, ToneBadge } from "@/components/NewsList";
import { fmt, fmtPrice } from "@/lib/format";
import { readSignals } from "@/lib/signals";
import { getClimates } from "@/lib/climate";
import { SIGNALS, assetTiming } from "@/lib/timing";
import { SignalBadge } from "@/components/Timing";

export const revalidate = 3600;

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const asset = await getAsset(id);
  if (!asset) notFound();
  const market = asset.market as "crypto" | "us" | "my";
  const [candles, rows, insiders, climates, newsBy, social, funds] = await Promise.all([
    getCandles(id),
    getMarketRows(market),
    asset.market === "us" ? getInsiderTrades(500) : Promise.resolve([]),
    getClimates(),
    getNews(),
    getSocial(),
    getFundMoves(),
  ]);
  const headlines = newsBy.get(id) ?? [];
  const reddit = asset.market === "us" ? social.reddit.find((r) => r.ticker === asset.symbol) : undefined;
  const trending = asset.market === "crypto" ? social.trending.find((r) => r.ticker === asset.symbol) : undefined;
  const fund = asset.market === "us" ? funds.tickers.find((t) => t.ticker.replace(".", "-") === asset.symbol) : undefined;
  const row = rows.find((r) => r.id === id);
  const climate = climates[market];
  // Indices and ETFs are timed the same way; the climate still applies.
  const timing = row ? assetTiming(row, climate.level) : null;
  const signals = row ? readSignals(row) : [];
  const mine = insiders.filter((t) => t.ticker === asset.symbol);
  const back = asset.market === "crypto" ? "/crypto" : asset.market === "my" ? "/stocks?m=my" : "/stocks";

  return (
    <>
      <Link href={back} className="text-sm text-ink-2 hover:text-ink">
        ← Back
      </Link>
      <PageHeader
        title={`${asset.symbol.replace(".KL", "")} · ${asset.name}`}
        intro={[asset.market === "crypto" ? "Crypto" : asset.market === "my" ? "Bursa Malaysia" : "US", asset.sector, asset.kind.toUpperCase()].filter(Boolean).join(" · ")}
      >
        {row && <TrendBadge trend={row.trend} />}
      </PageHeader>

      {row && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Price" value={fmtPrice(row.price, row.currency)} sub={<Delta v={row.chg1d} />} note={`as of ${row.asOf}`} />
          <Stat label="30 days" value={<Delta v={row.chg30d} />} />
          <Stat label="1 year" value={<Delta v={row.chg1y} />} note={`Worst fall in the year ${fmt(row.drawdown1y, "pct")}`} />
          <Stat label="Volatility" value={fmt(row.volatility, "pct").replace("+", "")} note="Annualised, last 90 days" />
          <Stat label="RSI (14)" value={fmt(row.rsi14, "num")} note="Over 70 hot, under 30 cold" />
          {asset.market === "crypto" ? (
            <Stat label="Market cap" value={fmt(row.marketCap, "usd")} />
          ) : (
            <Stat label="P/E · P/B" value={`${fmt(row.peTrailing, "num")} · ${fmt(row.priceToBook, "num")}`} note={row.peForward ? `Forward P/E ${row.peForward.toFixed(1)}` : undefined} />
          )}
        </div>
      )}

      {timing && (
        <Card className="mb-8 flex flex-wrap items-start gap-x-6 gap-y-2">
          <div>
            <div className="text-xs text-muted">Timing now</div>
            <div className="mt-1">
              <SignalBadge signal={timing.signal} />
            </div>
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p>{timing.reason}</p>
            <p className="mt-1 text-xs text-ink-2">
              {SIGNALS[timing.signal].meaning} Market climate for {climate.market}: <span className="font-medium">{climate.level}</span>.{" "}
              <Link href="/#timing" className="underline">
                See why
              </Link>
            </p>
          </div>
        </Card>
      )}

      <Section title="Chart and indicators">
        {candles.length ? <PriceChart candles={candles} currency={asset.currency} /> : <p className="text-sm text-ink-2">No price history yet.</p>}
      </Section>

      {signals.length > 0 && (
        <Section title="What the indicators say" why="Plain-language reading of the numbers above. Indicators describe the past; they don't promise the next move.">
          <Card>
            <ul className="space-y-2 text-sm">
              {signals.map((s) => (
                <li key={s.text} className="flex gap-2">
                  <span aria-hidden className={s.tone === "positive" ? "text-up" : s.tone === "negative" ? "text-down" : "text-muted"}>
                    {s.tone === "positive" ? "▲" : s.tone === "negative" ? "▼" : "●"}
                  </span>
                  <span>
                    <span className="sr-only">{s.tone}: </span>
                    {s.text}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {(headlines.length > 0 || reddit || trending || fund) && (
        <Section title="Sentiment and big money" why="What the news, the crowd and large investors are doing with this asset.">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">News, last 3 days</span>
                {headlines.length > 0 && <ToneBadge score={headlines.reduce((a, n) => a + n.score, 0) / headlines.length} count={headlines.length} />}
              </div>
              {headlines.length ? <NewsList items={headlines} /> : <p className="text-sm text-ink-2">No recent headlines collected for this asset.</p>}
            </Card>
            <div className="space-y-3">
              {reddit && (
                <Stat
                  label="Reddit buzz"
                  value={`#${reddit.rank}`}
                  sub={<span className="text-ink-2">{fmt(reddit.mentions, "num")} mentions in 24h</span>}
                  note={reddit.mentions_24h_ago ? `A day ago: ${reddit.mentions_24h_ago} mentions.` : undefined}
                />
              )}
              {trending && <Stat label="CoinGecko trending" value={`#${trending.rank}`} note="Among the most-searched coins today." />}
              {fund && (
                <Stat
                  label={`Superinvestors (${fund.periods.join(", ")})`}
                  value={
                    <span className="text-lg">
                      <span className="text-up">▲ {fund.buyers.length} buying</span> <span className="text-down">▼ {fund.sellers.length} selling</span>
                    </span>
                  }
                  note={[...fund.buyers, ...fund.sellers].slice(0, 4).join(", ")}
                />
              )}
            </div>
          </div>
        </Section>
      )}

      {mine.length > 0 && (
        <Section title="Insider trades" why="Recent Form 4 filings by this company's executives and directors.">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-4 py-1.5 text-left font-normal">Date</th>
                  <th className="px-4 py-1.5 text-left font-normal">Insider</th>
                  <th className="px-4 py-1.5 text-left font-normal">Type</th>
                  <th className="px-4 py-1.5 text-right font-normal">Price</th>
                  <th className="px-4 py-1.5 text-right font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-1.5 tabular">{t.tradeDate}</td>
                    <td className="px-4 py-1.5">
                      {t.insider} <span className="text-ink-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-1.5">{t.type}</td>
                    <td className="px-4 py-1.5 text-right tabular">{fmt(t.price, "price")}</td>
                    <td className="px-4 py-1.5 text-right">
                      <Delta v={t.valueUsd} kind="usd" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      )}
    </>
  );
}
