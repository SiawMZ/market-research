import Link from "next/link";
import { TimeChart, type TimeSeries } from "@/components/charts/TimeChart";
import { Card, Delta, Empty, PageHeader, Section } from "@/components/ui";
import { BENCHMARKS, type Rules } from "@/config/portfolios";
import { getCandles, getPortfolios } from "@/lib/data";
import { fmt } from "@/lib/format";
import { maxDrawdown, volatility } from "@/lib/indicators";

export const revalidate = 3600;

type Portfolio = Awaited<ReturnType<typeof getPortfolios>>[number];
type View = "balanced" | "aggressive" | "compare";

const VIEWS: { k: View; label: string }[] = [
  { k: "balanced", label: "Balanced" },
  { k: "aggressive", label: "Aggressive" },
  { k: "compare", label: "Compare" },
];

const MIX = [
  { key: "crypto", label: "Crypto", color: "var(--series-1)" },
  { key: "us", label: "US stocks", color: "var(--series-2)" },
  { key: "my", label: "Bursa", color: "var(--series-3)" },
  { key: "cash", label: "Cash", color: "var(--axis)" },
] as const;

function stats(p: Portfolio) {
  const eq = p.snapshots.map((s) => s.equityUsd);
  const current = eq.at(-1) ?? p.startCashUsd;
  const daily = eq.slice(1).map((v, i) => v / eq[i] - 1);
  const mean = daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length : 0;
  const sd = daily.length > 1 ? Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / (daily.length - 1)) : 0;
  return {
    current,
    ret: current / p.startCashUsd - 1,
    maxDd: eq.length ? maxDrawdown(eq) : null,
    vol: eq.length > 20 ? volatility(eq, 365, eq.length) : null,
    sharpe: sd > 0 && daily.length > 20 ? (mean / sd) * Math.sqrt(365) : null,
    trades: p.trades.length,
  };
}

/** Value of $start invested in each benchmark on the portfolio's start date. */
async function benchmarkSeries(start: string, startCash: number): Promise<TimeSeries[]> {
  const [btc, voo] = await Promise.all([getCandles("crypto:BTC", 800), getCandles("us:VOO", 800)]);
  const since = (cs: typeof btc) => cs.filter((c) => c.date >= start);
  const b = since(btc);
  const v = since(voo);
  const grow = (cs: typeof btc) => cs.map((c) => ({ date: c.date, value: (startCash * c.close) / cs[0].close }));
  const vooByDate = new Map(v.map((c) => [c.date, c.close]));
  let lastVoo = v[0]?.close;
  const mix = b.map((c) => {
    lastVoo = vooByDate.get(c.date) ?? lastVoo; // stocks don't trade on weekends: carry the last close
    return { date: c.date, value: startCash * 0.5 * (c.close / b[0].close) + startCash * 0.5 * ((lastVoo ?? 0) / (v[0]?.close ?? 1)) };
  });
  return [
    { name: BENCHMARKS[0].name, color: 2, type: "line", data: b.length ? grow(b) : [] },
    { name: BENCHMARKS[1].name, color: 3, type: "line", data: v.length ? grow(v) : [] },
    { name: BENCHMARKS[2].name, color: 4, type: "line", data: v.length ? mix : [] },
  ];
}

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const raw = (await searchParams).view;
  const view: View = raw === "aggressive" || raw === "compare" ? raw : "balanced";
  const portfolios = await getPortfolios();
  const start = portfolios.map((p) => p.startedAt).sort()[0];
  const startCash = portfolios[0]?.startCashUsd ?? 1000;
  const benches = start ? await benchmarkSeries(start, startCash) : [];
  const shown = view === "compare" ? portfolios : portfolios.filter((p) => p.id === view);
  const chartSeries: TimeSeries[] = [
    ...shown.map((p, i) => ({ name: p.name, color: (i + 1) as 1 | 2, type: "line" as const, data: p.snapshots.map((s) => ({ date: s.date, value: s.equityUsd })) })),
    ...(view === "compare" ? [] : benches),
  ];
  const hasHistory = shown.some((p) => p.snapshots.length >= 2);

  return (
    <>
      <PageHeader title="Paper portfolios" intro="Two simulated $1,000 portfolios, run by written rules and reviewed daily. Not real money and not financial advice.">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm" role="tablist">
          {VIEWS.map((v) => (
            <Link
              key={v.k}
              href={`/portfolio?view=${v.k}`}
              role="tab"
              aria-selected={view === v.k}
              className={`rounded-md px-3 py-1 ${view === v.k ? "bg-surface-2 font-medium" : "text-ink-2 hover:text-ink"}`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <Section n="01" title="Performance" why={view === "compare" ? "Both strategies on one chart, same start and same fees." : "Portfolio value against simply holding BTC, VOO, or a 50/50 mix from the same day."}>
        {hasHistory ? (
          <Card>
            <TimeChart format="price" height={300} series={chartSeries} />
          </Card>
        ) : (
          <Empty title="No history yet">
            Both portfolios start with $1,000 in cash on {start}. The value curve appears after the daily review (Phase 5) makes its first trades and records daily snapshots.
          </Empty>
        )}
      </Section>

      <Section n="02" title={view === "compare" ? "Scorecard" : "Numbers"} why="Max drawdown is the worst fall from a peak. Sharpe is return per unit of risk; above 1 is good.">
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">Portfolio</th>
                <th className="px-4 py-2 text-right font-normal">Value</th>
                <th className="px-4 py-2 text-right font-normal">Return</th>
                <th className="px-4 py-2 text-right font-normal">Max drawdown</th>
                <th className="px-4 py-2 text-right font-normal">Volatility</th>
                <th className="px-4 py-2 text-right font-normal">Sharpe</th>
                <th className="px-4 py-2 text-right font-normal">Trades</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const s = stats(p);
                return (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-right tabular">{fmt(s.current, "price")}</td>
                    <td className="px-4 py-2 text-right"><Delta v={s.ret} /></td>
                    <td className="px-4 py-2 text-right tabular">{fmt(s.maxDd, "pct")}</td>
                    <td className="px-4 py-2 text-right tabular">{fmt(s.vol, "pct").replace("+", "")}</td>
                    <td className="px-4 py-2 text-right tabular">{s.sharpe == null ? "—" : s.sharpe.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular">{s.trades}</td>
                  </tr>
                );
              })}
              {benches.map((b) => {
                const d = b.data;
                const ret = d.length ? d.at(-1)!.value / d[0].value - 1 : null;
                return (
                  <tr key={b.name} className="border-t border-line text-ink-2">
                    <td className="px-4 py-2">{b.name} <span className="text-xs text-muted">benchmark</span></td>
                    <td className="px-4 py-2 text-right tabular">{fmt(d.at(-1)?.value, "price")}</td>
                    <td className="px-4 py-2 text-right"><Delta v={ret} /></td>
                    <td className="px-4 py-2 text-right tabular">{d.length ? fmt(maxDrawdown(d.map((x) => x.value)), "pct") : "—"}</td>
                    <td className="px-4 py-2 text-right">—</td>
                    <td className="px-4 py-2 text-right">—</td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section n="03" title="Rulebook" why="The written rules each portfolio follows. Any change the daily review makes is logged in the journal with its reason.">
        <div className={`grid gap-4 ${shown.length > 1 ? "md:grid-cols-2" : ""}`}>
          {shown.map((p) => (
            <RuleCard key={p.id} name={p.name} rules={p.rules as Rules} />
          ))}
        </div>
      </Section>

      <div className={`grid gap-x-6 ${shown.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {shown.map((p) => (
          <Section key={p.id} n="04" title={`${shown.length > 1 ? `${p.name}: ` : ""}Holdings, trades and journal`}>
            {p.trades.length === 0 && p.journal.length === 0 ? (
              <Empty title="Holding $1,000 cash">No trades or journal entries yet.</Empty>
            ) : (
              <Card className="text-sm">
                {p.journal.slice(0, 10).map((j) => (
                  <div key={j.id} className="border-t border-line py-2 first:border-t-0">
                    <div className="text-xs text-muted">{j.date}</div>
                    <p>{j.summary}</p>
                  </div>
                ))}
              </Card>
            )}
          </Section>
        ))}
      </div>
    </>
  );
}

const pc = (x: number) => +(x * 100).toFixed(3);

function RuleCard({ name, rules }: { name: string; rules: Rules }) {
  const items: [string, string][] = [
    ["Max per position", `${pc(rules.maxPosition)}% of the portfolio`],
    ["Max per small altcoin", `${pc(rules.maxSmallAlt)}%`],
    ["Stop-loss", `sell at −${pc(rules.stopLoss)}% from entry`],
    ["Trailing stop", rules.trailingStop ? `sell at −${pc(rules.trailingStop)}% from the high since entry` : "none"],
    ["How it trades", rules.rebalance === "drift" ? `rebalance when a part drifts ${pc(rules.driftBand)}% from target` : "weekly rotation into the strongest momentum"],
    ["Leverage", "none"],
    ["Fees modelled", `US $${rules.fees.usStockUsd}/order · Bursa ${pc(rules.fees.myStockPct)}% (min RM${rules.fees.myStockMinMyr}) · crypto ${pc(rules.fees.cryptoPct)}% · slippage ${pc(rules.fees.slippagePct)}%`],
  ];
  return (
    <Card>
      <div className="mb-3 font-medium">{name}</div>
      <div className="mb-1 text-xs text-muted">Target mix</div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded" role="img" aria-label={MIX.map((m) => `${m.label} ${rules.targetMix[m.key] * 100}%`).join(", ")}>
        {MIX.filter((m) => rules.targetMix[m.key] > 0).map((m) => (
          <div key={m.key} style={{ width: `${rules.targetMix[m.key] * 100}%`, background: m.color }} />
        ))}
      </div>
      <div className="mt-2 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {MIX.map((m) => (
          <span key={m.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: m.color }} />
            {m.label} <span className="text-ink tabular">{Math.round(rules.targetMix[m.key] * 100)}%</span>
          </span>
        ))}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
