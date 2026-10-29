/**
 * Prints the daily briefing the AI review reads: market climate, both portfolios vs their benchmarks,
 * holdings with timing signals, recent trades and journal, and the best ideas not yet held.
 *
 *   npm run review:context
 */
import "dotenv/config";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { Rules } from "@/config/portfolios";
import { getDb, schema } from "@/lib/db/client";
import { getClimates } from "@/lib/climate";
import { getScoredUniverse } from "@/lib/ideas";
import { replay } from "@/lib/ledger";
import { fmt } from "@/lib/format";
import { COOLDOWN_DAYS, NUMERIC_LIMITS } from "@/lib/guardrails";
import { assetTiming, SIGNALS } from "@/lib/timing";

const { portfolios, trades, journal, snapshots, pricesDaily } = schema;

async function benchReturn(assetId: string, since: string) {
  const db = getDb();
  const rows = await db
    .select({ close: pricesDaily.close, date: pricesDaily.date })
    .from(pricesDaily)
    .where(and(eq(pricesDaily.assetId, assetId), gte(pricesDaily.date, since)))
    .orderBy(asc(pricesDaily.date));
  return rows.length >= 2 ? rows.at(-1)!.close / rows[0].close - 1 : null;
}

async function main() {
  const db = getDb();
  const [u, climates] = await Promise.all([getScoredUniverse(), getClimates()]);
  const fx = u.usdMyr ?? 4.2;
  const all = [...u.crypto, ...u.us, ...u.my, ...u.etfs];
  const byId = new Map(all.map((r) => [r.id, r]));
  const out: string[] = [];
  const p = (s = "") => out.push(s);

  p(`# Daily review briefing, ${new Date().toISOString().slice(0, 10)}`);
  p("\n## Market climate");
  for (const c of Object.values(climates)) p(`- **${c.market}: ${c.level}**. ${c.points.map((x) => x.text).join("; ")}.`);

  const heldAnywhere = new Set<string>();
  for (const port of await db.select().from(portfolios).orderBy(asc(portfolios.id))) {
    const rules = port.rules as Rules;
    const tradeRows = await db.select().from(trades).where(eq(trades.portfolioId, port.id)).orderBy(desc(trades.at));
    const { holdings, cash } = replay(tradeRows, port.startCashUsd);
    for (const h of holdings) heldAnywhere.add(h.assetId);
    const [snap] = await db.select().from(snapshots).where(eq(snapshots.portfolioId, port.id)).orderBy(desc(snapshots.date)).limit(1);
    const equity = snap?.equityUsd ?? port.startCashUsd;
    const [btc, voo] = await Promise.all([benchReturn("crypto:BTC", port.startedAt), benchReturn("us:VOO", port.startedAt)]);

    p(`\n## Portfolio: ${port.name} (${port.id})`);
    p(`Value ${fmt(equity, "price")} (${fmt(equity / port.startCashUsd - 1, "pct")} since ${port.startedAt}); cash ${fmt(cash, "price")}.`);
    p(`Benchmarks since start: hold BTC ${fmt(btc, "pct")}, hold VOO ${fmt(voo, "pct")}, 50/50 ${btc != null && voo != null ? fmt((btc + voo) / 2, "pct") : "—"}.`);
    p(`Rules: ${JSON.stringify({ ...rules, fees: "(fixed)" })}`);

    p("\n| Holding | Weight | P/L vs entry | Timing | Why | Score | Risk flags |");
    p("|---|---|---|---|---|---|---|");
    for (const h of holdings) {
      const r = byId.get(h.assetId);
      const priceUsd = r ? (r.currency === "MYR" ? r.price / fx : r.price) : h.avgUsd;
      const t = r ? assetTiming(r, climates[r.market].level) : null;
      p(
        `| ${h.assetId} | ${fmt((h.qty * priceUsd) / equity, "pct").replace("+", "")} | ${fmt(priceUsd / h.avgUsd - 1, "pct")} | ${t ? SIGNALS[t.signal].label : "?"} | ${t?.reason ?? "no data"} | ${r?.potential != null ? Math.round(r.potential) : "—"} | ${r?.flags.join("; ") || "—"} |`,
      );
    }
    if (holdings.length === 0) p("| (all cash) | | | | | | |");

    p("\nRecent trades:");
    for (const t of tradeRows.slice(0, 12)) p(`- ${t.at.toISOString().slice(0, 10)} ${t.side} ${t.assetId} ${fmt(t.qty * t.priceUsd, "price")}: ${t.reason}`);
    if (!tradeRows.length) p("- none");

    const js = await db.select().from(journal).where(eq(journal.portfolioId, port.id)).orderBy(desc(journal.date), desc(journal.id)).limit(6);
    p("\nRecent journal:");
    for (const j of js) {
      p(`- ${j.date} [${j.author}] ${j.summary.replace(/\n/g, " / ")}`);
      for (const c of j.ruleChanges ?? []) p(`  - rule change ${c.rule}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)} (${c.why})`);
    }
  }

  p("\n## Best ideas not held by either portfolio (top 4 per market by overall score)");
  for (const [label, rows] of [["Crypto", u.crypto], ["US", u.us], ["Bursa", u.my]] as const) {
    const top = [...rows].filter((r) => r.potential != null && !heldAnywhere.has(r.id)).sort((a, b) => b.potential! - a.potential!).slice(0, 4);
    p(`- ${label}: ${top.map((r) => `${r.symbol} (${Math.round(r.potential!)}, ${SIGNALS[assetTiming(r, climates[r.market].level).signal].label})`).join(", ")}`);
  }

  p("\n## What you may change");
  p(`Up to 2 rule changes per portfolio per review; each rule at most once every ${COOLDOWN_DAYS} days.`);
  p(`Numeric limits: ${Object.entries(NUMERIC_LIMITS).map(([k, [lo, hi]]) => `${k} ${lo}–${hi}`).join(", ")}; trailingStop null or 0.08–0.3.`);
  p("targetMix: weights sum to 1, cash ≥ 0.03, each weight moves ≤ 0.10 per change, crypto ≤ 0.4 (balanced) / 0.7 (aggressive).");
  console.log(out.join("\n"));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
