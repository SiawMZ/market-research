import Link from "next/link";
import { ToneBadge } from "@/components/NewsList";
import { Card, Delta, PageHeader, Section, Stat } from "@/components/ui";
import { getAsset, getExchangeFlows, getFundMoves, getMarketRows, getNews, getSocial } from "@/lib/data";
import { fmt } from "@/lib/format";

export const revalidate = 3600;

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

export default async function SentimentPage() {
  const [flows, funds, social, newsBy, usRows, cryptoRows] = await Promise.all([
    getExchangeFlows(),
    getFundMoves(),
    getSocial(),
    getNews(),
    getMarketRows("us", ["stock", "etf"]),
    getMarketRows("crypto"),
  ]);
  const usTracked = new Map(usRows.map((r) => [r.symbol, r.id]));
  const cryptoTracked = new Map(cryptoRows.map((r) => [r.symbol, r.id]));
  const net24 = sum(flows.map((f) => f.inflow_24h_usd));
  const net1w = sum(flows.map((f) => f.inflow_1w_usd));
  const net1m = sum(flows.map((f) => f.inflow_1m_usd));

  const mostBought = funds.tickers.filter((t) => t.buyers.length >= 2).sort((a, b) => b.buyers.length - a.buyers.length || a.sellers.length - b.sellers.length).slice(0, 12);
  const mostSold = funds.tickers.filter((t) => t.sellers.length >= 2).sort((a, b) => b.sellers.length - a.sellers.length || a.buyers.length - b.buyers.length).slice(0, 12);

  const newsRows = await Promise.all(
    [...newsBy.entries()].map(async ([id, items]) => ({ asset: await getAsset(id), items, avg: items.reduce((a, n) => a + n.score, 0) / items.length })),
  );
  newsRows.sort((a, b) => b.avg - a.avg);

  return (
    <>
      <PageHeader
        title="Sentiment and whales"
        intro="What the crowd is talking about and what big money is doing: exchange flows for crypto, superinvestor 13F filings and insider buying for stocks, Reddit buzz, and the tone of recent news."
      />

      <Section
        n="01"
        title="Crypto whales: exchange flows"
        why="Net money moving into or out of the largest centralised exchanges. Outflows usually mean coins going to private wallets to be held; large inflows can mean holders getting ready to sell."
        aside={<span className="text-xs text-muted">Source: DefiLlama, {flows.length} exchanges with over $500M in assets</span>}
      >
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Last 24 hours", net24],
            ["Last 7 days", net1w],
            ["Last 30 days", net1m],
          ].map(([label, v]) => (
            <Stat
              key={label as string}
              label={label as string}
              value={<Delta v={v as number} kind="usd" />}
              note={(v as number) < 0 ? "Net outflow: coins leaving exchanges" : "Net inflow: coins arriving on exchanges"}
            />
          ))}
        </div>
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">Exchange</th>
                <th className="px-4 py-2 text-right font-normal">Assets held</th>
                <th className="px-4 py-2 text-right font-normal">24h net flow</th>
                <th className="px-4 py-2 text-right font-normal">7d net flow</th>
                <th className="px-4 py-2 text-right font-normal">30d net flow</th>
              </tr>
            </thead>
            <tbody>
              {flows.slice(0, 10).map((f) => (
                <tr key={f.exchange} className="border-t border-line">
                  <td className="px-4 py-1.5 font-medium">{f.exchange}</td>
                  <td className="px-4 py-1.5 text-right tabular">{fmt(f.assets_usd, "usd")}</td>
                  <td className="px-4 py-1.5 text-right"><Delta v={f.inflow_24h_usd} kind="usd" /></td>
                  <td className="px-4 py-1.5 text-right"><Delta v={f.inflow_1w_usd} kind="usd" /></td>
                  <td className="px-4 py-1.5 text-right"><Delta v={f.inflow_1m_usd} kind="usd" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-muted">
          Flows include price changes of the coins held, so treat small numbers as noise. Bitcoin ETF flows (on the Crypto page) are the other big-money signal.
        </p>
      </Section>

      <Section
        n="02"
        title="Superinvestors (13F filings)"
        why={`What ${funds.managers} well-known fund managers bought and sold in their latest quarterly filing. Filings arrive up to 45 days after the quarter ends, so this is a slow signal: useful for ideas, not timing.`}
        aside={<span className="text-xs text-muted">Source: Dataroma · {funds.periodCounts.map(([p, n]) => `${p}: ${n} manager${n === 1 ? "" : "s"}`).join(" · ")}</span>}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FundList title="Most bought" rows={mostBought} side="buy" tracked={usTracked} />
          <FundList title="Most sold" rows={mostSold} side="sell" tracked={usTracked} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Insider buying, the faster stock-side signal, is on the <Link href="/stocks" className="underline">Stocks</Link> page.
        </p>
      </Section>

      <Section n="03" title="Crowd buzz" why="Attention, not quality. A sudden jump in mentions often comes with big moves both ways; extremes are a warning sign as often as a buy signal.">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="p-0 overflow-x-auto">
            <div className="border-b border-line px-4 py-2 text-sm font-medium">Most-mentioned US stocks on Reddit (24h)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-4 py-1.5 text-left font-normal">#</th>
                  <th className="px-4 py-1.5 text-left font-normal">Stock</th>
                  <th className="px-4 py-1.5 text-right font-normal">Mentions</th>
                  <th className="px-4 py-1.5 text-right font-normal">vs a day ago</th>
                  <th className="px-4 py-1.5 text-right font-normal">Upvotes</th>
                </tr>
              </thead>
              <tbody>
                {social.reddit.slice(0, 15).map((r) => {
                  const id = usTracked.get(r.ticker);
                  const chg = r.mentions != null && r.mentions_24h_ago ? r.mentions / r.mentions_24h_ago - 1 : null;
                  return (
                    <tr key={r.ticker} className="border-t border-line">
                      <td className="px-4 py-1.5 tabular text-muted">{r.rank}</td>
                      <td className="px-4 py-1.5">
                        {id ? (
                          <Link href={`/asset/${encodeURIComponent(id)}`} className="font-medium hover:underline">
                            {r.ticker}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.ticker}</span>
                        )}{" "}
                        <span className="text-ink-2">{r.name}</span>
                      </td>
                      <td className="px-4 py-1.5 text-right tabular">{fmt(r.mentions, "num")}</td>
                      <td className="px-4 py-1.5 text-right"><Delta v={chg} /></td>
                      <td className="px-4 py-1.5 text-right tabular">{fmt(r.upvotes, "compact")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">Source: ApeWisdom (wallstreetbets, stocks, investing and other stock subreddits).</p>
          </Card>
          <Card className="p-0">
            <div className="border-b border-line px-4 py-2 text-sm font-medium">Trending coins on CoinGecko</div>
            <ol className="text-sm">
              {social.trending.map((c) => {
                const id = cryptoTracked.get(c.ticker);
                return (
                  <li key={c.ticker} className="flex items-baseline gap-3 border-t border-line px-4 py-1.5 first:border-t-0">
                    <span className="w-5 tabular text-muted">{c.rank}</span>
                    {id ? (
                      <Link href={`/asset/${encodeURIComponent(id)}`} className="font-medium hover:underline">
                        {c.ticker}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.ticker}</span>
                    )}
                    <span className="truncate text-ink-2">{c.name}</span>
                  </li>
                );
              })}
            </ol>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">Ranked by searches on CoinGecko over 24 hours.</p>
          </Card>
        </div>
      </Section>

      <Section
        n="04"
        title="News tone"
        why="Headlines from the last 3 days for the portfolios' holdings, the majors and the most-discussed stocks, scored by counting good-news and bad-news words. A rough gauge: open the asset to read the headlines themselves."
      >
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">Asset</th>
                <th className="px-4 py-2 text-left font-normal">Tone</th>
                <th className="px-4 py-2 text-left font-normal">Latest headline</th>
              </tr>
            </thead>
            <tbody>
              {newsRows
                .filter((n) => n.asset)
                .map(({ asset, items, avg }) => (
                  <tr key={asset!.id} className="border-t border-line align-top">
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <Link href={`/asset/${encodeURIComponent(asset!.id)}`} className="hover:underline">
                        <span className="mr-2 text-xs uppercase text-muted">{asset!.market}</span>
                        <span className="font-medium">{asset!.symbol.replace(".KL", "")}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-1.5">
                      <ToneBadge score={avg} count={items.length} />
                    </td>
                    <td className="px-4 py-1.5 text-ink-2 min-w-72">
                      <a href={items[0].id} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {items[0].title}
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-muted">Source: Google News. StockTwits and Reddit&apos;s own API block automated access, so Reddit buzz comes from ApeWisdom instead.</p>
      </Section>
    </>
  );
}

function FundList({
  title,
  rows,
  side,
  tracked,
}: {
  title: string;
  rows: { ticker: string; company: string | null; buyers: string[]; sellers: string[]; newBuys: number }[];
  side: "buy" | "sell";
  tracked: Map<string, string>;
}) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-2 text-sm font-medium">{title}</div>
      <ul className="text-sm">
        {rows.map((r) => {
          const id = tracked.get(r.ticker) ?? tracked.get(r.ticker.replace(".", "-")); // 13F uses BRK.B, Yahoo BRK-B
          const who = side === "buy" ? r.buyers : r.sellers;
          return (
            <li key={r.ticker} className="border-t border-line px-4 py-2 first:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {id ? (
                    <Link href={`/asset/${encodeURIComponent(id)}`} className="font-medium hover:underline">
                      {r.ticker}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.ticker}</span>
                  )}{" "}
                  <span className="text-ink-2">{r.company}</span>
                </span>
                <span className="whitespace-nowrap text-xs tabular">
                  <span className={side === "buy" ? "text-up" : "text-down"}>
                    {side === "buy" ? "▲" : "▼"} {who.length} {side === "buy" ? "buying" : "selling"}
                  </span>
                  {side === "buy" && r.newBuys > 0 && <span className="ml-2 text-muted">{r.newBuys} new</span>}
                  {(side === "buy" ? r.sellers : r.buyers).length > 0 && (
                    <span className="ml-2 text-muted">
                      {(side === "buy" ? r.sellers : r.buyers).length} {side === "buy" ? "selling" : "buying"}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted">{who.slice(0, 3).join(", ")}{who.length > 3 ? ` and ${who.length - 3} more` : ""}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
