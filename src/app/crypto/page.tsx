import { MarketTable } from "@/components/MarketTable";
import { TimeChart } from "@/components/charts/TimeChart";
import { Card, Delta, PageHeader, Section, Stat, sentimentBand } from "@/components/ui";
import { getDerivatives, getEtfFlows, getMacroEvents, getMarketRows, getMetric } from "@/lib/data";
import { fmt } from "@/lib/format";
import { MacroTable } from "@/components/MacroTable";

export const revalidate = 3600;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default async function CryptoPage() {
  const [coins, fng, stables, mcap, btcDom, flows, derivs, events, macro] = await Promise.all([
    getMarketRows("crypto"),
    getMetric("crypto_fear_greed", 365),
    getMetric("stablecoin_supply_usd", 365),
    getMetric("crypto_total_mcap_usd", 30),
    getMetric("btc_dominance", 30),
    getEtfFlows(180),
    getDerivatives(),
    getMacroEvents(),
    getMarketRows("us", ["index"]),
  ]);

  const btc = coins.find((c) => c.symbol === "BTC");
  const eth = coins.find((c) => c.symbol === "ETH");
  const fngNow = fng.at(-1);
  const stableNow = stables.at(-1)?.value ?? null;
  const stable30 = stables.at(-31)?.value ?? null;
  const flowVals = flows.map((f) => f.totalUsdM);
  const dxy = macro.find((m) => m.symbol === "DX-Y.NYB");
  const tnx = macro.find((m) => m.symbol === "^TNX");
  const spx = macro.find((m) => m.symbol === "^GSPC");

  // Altcoin season proxy: share of the top coins beating BTC over 30 days (his "Total3 vs BTC" question, quantified).
  const alts = coins.filter((c) => c.symbol !== "BTC" && c.chg30d != null);
  const beatBtc = btc?.chg30d != null ? alts.filter((c) => c.chg30d! > btc.chg30d!).length : null;
  const altShare = beatBtc != null && alts.length ? beatBtc / alts.length : null;

  const majors = derivs.filter((d) => ["BTC", "ETH", "SOL", "XRP", "HYPE", "BNB", "DOGE"].includes(d.symbol));
  const hotFunding = derivs.filter((d) => Math.abs(d.funding_rate ?? 0) >= 0.0003).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Crypto"
        intro="Laid out like 腦哥's weekly 幣圈週報: macro first, then institutional money, sentiment, liquidity and leverage, then the coins themselves."
      />

      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Bitcoin" value={fmt(btc?.price, "price")} sub={<Delta v={btc?.chg7d} />} note="7-day change" />
        <Stat label="Ethereum" value={fmt(eth?.price, "price")} sub={<Delta v={eth?.chg7d} />} note="7-day change" />
        <Stat label="Total market cap" value={fmt(mcap.at(-1)?.value, "usd")} sub={<span className="text-ink-2">BTC dominance {fmt(btcDom.at(-1)?.value, "pctPoints")}</span>} />
        <Stat
          label="Fear & Greed"
          value={fngNow ? `${fngNow.value}` : "—"}
          sub={<span className="text-ink-2">{fngNow ? sentimentBand(fngNow.value) : ""}</span>}
          note="0 = extreme fear, 100 = extreme greed"
        />
        <Stat
          label="Altcoin season gauge"
          value={altShare == null ? "—" : `${Math.round(altShare * 100)}%`}
          sub={<span className="text-ink-2">of top {alts.length} alts beat BTC (30D)</span>}
          note="Above 75% is usually called altcoin season"
        />
      </div>

      <Section n="01" title="Macro and the Fed" why="Rates, the dollar and US stocks set the tide for crypto. Big US data releases often move BTC on the day.">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="US 10Y yield" value={fmt(tnx?.price, "pctPoints")} sub={<Delta v={tnx?.chg30d} />} note="30-day change. Rising yields usually weigh on crypto." />
          <Stat label="US Dollar Index" value={fmt(dxy?.price, "num")} sub={<Delta v={dxy?.chg30d} />} note="30-day change. A weaker dollar usually helps crypto." />
          <Stat label="S&P 500" value={fmt(spx?.price, "num")} sub={<Delta v={spx?.chg30d} />} note="30-day change" />
        </div>
        <MacroTable events={events} />
      </Section>

      <Section
        n="02"
        title="Bitcoin ETF flows"
        why="Daily net money into or out of US spot Bitcoin ETFs: the clearest view of institutional demand."
        aside={
          <span className="text-sm text-ink-2 tabular">
            Last 5 days <span className="text-ink">{fmt(sum(flowVals.slice(-5)), "usdM")}</span> · last 20 days{" "}
            <span className="text-ink">{fmt(sum(flowVals.slice(-20)), "usdM")}</span>
          </span>
        }
      >
        <Card>
          <TimeChart format="usdM" series={[{ name: "Net flow", color: "updown", type: "histogram", data: flows.map((f) => ({ date: f.date, value: f.totalUsdM })) }]} />
        </Card>
        <p className="mt-2 text-xs text-muted">ETH ETF flows: no free source found yet. Source: The Commoner Bitcoin ETF Tracker by TFTC (CC BY 4.0).</p>
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section n="03" title="Fear & Greed" why="Crowd mood. Extremes are often contrarian: extreme fear has marked good entries, extreme greed risky tops.">
          <Card>
            <TimeChart
              format="num"
              guides={[{ value: 25, label: "fear" }, { value: 75, label: "greed" }]}
              series={[{ name: "Index", color: 1, type: "line", data: fng.map((d) => ({ date: d.date, value: d.value })) }]}
            />
          </Card>
        </Section>
        <Section
          n="04"
          title="Stablecoin supply"
          why="Dollars parked on-chain, ready to buy. Growing supply means fresh liquidity entering crypto."
          aside={<span className="text-sm text-ink-2">30D <Delta v={stableNow && stable30 ? stableNow / stable30 - 1 : null} /></span>}
        >
          <Card>
            <TimeChart format="usd" series={[{ name: "Total supply", color: 1, type: "area", data: stables.map((d) => ({ date: d.date, value: d.value })) }]} />
          </Card>
        </Section>
      </div>

      <Section
        n="05"
        title="Leverage: funding and open interest"
        why="Perpetual futures. Positive funding means longs pay shorts (crowded longs); very high funding and open interest often come before sharp flushes."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <DerivTable title="Majors" rows={majors} />
          <DerivTable title="Most extreme funding (≥ 0.03% per 8h)" rows={hotFunding} empty="No market has extreme funding right now." />
        </div>
        <p className="mt-2 text-xs text-muted">Source: Hyperliquid perpetuals. Funding shown per 8 hours; 0.01% is the usual neutral level.</p>
      </Section>

      <Section n="06" title="Whale tracking" why="Large wallet moves to and from exchanges. Coins sent to exchanges are often about to be sold.">
        <Card className="text-sm text-ink-2">
          On-chain whale flows aren&apos;t connected yet. They come with the sentiment and whale sources in Phase 4. Until then, ETF flows and open interest above are the
          best signs of big money.
        </Card>
      </Section>

      <Section n="07" title="Top coins" why="Top 50 by market cap, excluding stablecoins and wrapped tokens. Click a coin for its chart and indicators.">
        <MarketTable rows={coins} preset="crypto" />
      </Section>
    </>
  );
}

function DerivTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { symbol: string; funding_rate: number | null; open_interest_usd: number | null }[];
  empty?: string;
}) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-2 text-sm font-medium">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-2">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="px-4 py-1.5 text-left font-normal">Coin</th>
              <th className="px-4 py-1.5 text-right font-normal">Funding / 8h</th>
              <th className="px-4 py-1.5 text-right font-normal">Open interest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.symbol} className="border-t border-line">
                <td className="px-4 py-1.5 font-medium">{d.symbol}</td>
                <td className="px-4 py-1.5 text-right tabular">
                  <Delta v={d.funding_rate} kind="rate" />
                </td>
                <td className="px-4 py-1.5 text-right tabular">{fmt(d.open_interest_usd, "usd")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
