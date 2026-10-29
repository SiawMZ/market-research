import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Rules } from "@/config/portfolios";
import { getDb, schema } from "@/lib/db/client";
import { today } from "@/collectors/core";
import { replay, venueOf, type Holding } from "@/lib/ledger";
import { getClimates } from "@/lib/climate";
import { getScoredUniverse } from "@/lib/ideas";
import { orderFeeUsd, type Venue } from "@/lib/fees";
import { fmt } from "@/lib/format";
import { buildPlan } from "@/lib/planner";
import type { Scored } from "@/lib/scoring";
import { assetTiming, type Signal } from "@/lib/timing";

/*
 * The daily trading engine. Runs once per day after the data job, for each paper portfolio:
 *   1. rebuild holdings and cash from the trade history,
 *   2. exits: stop-loss, trailing stop, and picks whose timing turned to "Avoid",
 *   3. rebalance (Balanced: when a market drifts past its band) or rotate (Aggressive: weekly) toward
 *      the planner's target, with a bonus for what's already held so it doesn't churn,
 *   4. record trades, a snapshot and a factual journal entry.
 * Fills are at the latest daily close plus slippage, with modelled fees. Stocks only trade on weekdays.
 */

const { portfolios, trades, snapshots, journal, pricesDaily, assets } = schema;
const CORE = new Set(["crypto:BTC", "crypto:ETH", "us:VOO", "us:QQQ"]);
const MIN_ORDER_USD = 15;

type Order = { assetId: string; venue: Venue; side: "buy" | "sell"; qty: number; fillUsd: number; feeUsd: number; reason: string };
type PriceInfo = { priceUsd: number; row: Scored | null; currency: string; asOf: string };

const name = (id: string) => id.split(":")[1].replace(".KL", "");

export type EngineResult = { portfolioId: string; skipped?: string; orders: Order[]; equityBefore: number; equityAfter: number; cashAfter: number; summary: string };

export async function runEngine(opts: { dry: boolean; date?: string }): Promise<EngineResult[]> {
  const db = getDb();
  const date = opts.date ?? today();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const stockDay = weekday >= 1 && weekday <= 5;
  const [universe, climates] = await Promise.all([getScoredUniverse(), getClimates()]);
  const fx = universe.usdMyr ?? 4.2;

  const rows = new Map<string, Scored>();
  for (const r of [...universe.crypto, ...universe.us, ...universe.my, ...universe.etfs]) rows.set(r.id, r);
  const toUsd = (price: number, currency: string) => (currency === "MYR" ? price / fx : price);

  /** Latest price for any asset, including ones that have dropped out of the scored universe. */
  async function priceOf(assetId: string): Promise<PriceInfo | null> {
    const r = rows.get(assetId);
    if (r) return { priceUsd: toUsd(r.price, r.currency), row: r, currency: r.currency, asOf: r.asOf };
    const res = await db.execute<{ close: number; date: string; currency: string }>(
      sql`select p.close, p.date::text, a.currency from ${pricesDaily} p join ${assets} a on a.id = p.asset_id where p.asset_id = ${assetId} order by p.date desc limit 1`,
    );
    const x = res.rows[0];
    return x ? { priceUsd: toUsd(x.close, x.currency), row: null, currency: x.currency, asOf: x.date } : null;
  }

  async function highSince(assetId: string, from: string, currency: string) {
    const res = await db
      .select({ hi: sql<number>`max(${pricesDaily.close})` })
      .from(pricesDaily)
      .where(and(eq(pricesDaily.assetId, assetId), gte(pricesDaily.date, from)));
    return res[0]?.hi != null ? toUsd(res[0].hi, currency) : null;
  }

  const results: EngineResult[] = [];
  for (const p of await db.select().from(portfolios).orderBy(asc(portfolios.id))) {
    const rules = p.rules as Rules;
    const style = p.id === "aggressive" ? "aggressive" : "balanced";
    const [done] = await db.select().from(snapshots).where(and(eq(snapshots.portfolioId, p.id), eq(snapshots.date, date)));
    if (done) {
      results.push({ portfolioId: p.id, skipped: `already ran for ${date}`, orders: [], equityBefore: done.equityUsd, equityAfter: done.equityUsd, cashAfter: done.cashUsd, summary: "" });
      continue;
    }
    const tradeRows = await db.select().from(trades).where(eq(trades.portfolioId, p.id));
    const first = tradeRows.length === 0;
    let { holdings, cash } = replay(tradeRows, p.startCashUsd);

    const prices = new Map<string, PriceInfo>();
    for (const h of holdings) {
      const pi = await priceOf(h.assetId);
      if (pi) prices.set(h.assetId, pi);
    }
    const value = (h: Holding) => h.qty * (prices.get(h.assetId)?.priceUsd ?? h.avgUsd);
    const equityBefore = cash + holdings.reduce((a, h) => a + value(h), 0);
    const tradable = (v: Venue) => v === "crypto" || stockDay;
    const timingOf = (r: Scored | null): Signal | null => (r ? assetTiming(r, climates[r.market].level).signal : null);

    const orders: Order[] = [];
    const notes: string[] = [];
    const sell = (h: Holding, qty: number, reason: string) => {
      const pi = prices.get(h.assetId)!;
      const fill = pi.priceUsd * (1 - rules.fees.slippagePct);
      const fee = orderFeeUsd(h.venue, qty, fill, rules.fees, fx);
      orders.push({ assetId: h.assetId, venue: h.venue, side: "sell", qty, fillUsd: fill, feeUsd: fee, reason });
      cash += qty * fill - fee;
      h.qty -= qty;
    };

    // ---- 2. Exits ----
    for (const h of holdings) {
      const pi = prices.get(h.assetId);
      if (!pi || !tradable(h.venue)) continue;
      const chg = pi.priceUsd / h.avgUsd - 1;
      if (chg <= -rules.stopLoss) {
        sell(h, h.qty, `Stop-loss: ${fmt(chg, "pct")} from the average entry price (limit −${Math.round(rules.stopLoss * 100)}%).`);
        continue;
      }
      if (rules.trailingStop) {
        const hi = await highSince(h.assetId, h.entryDate, pi.currency);
        if (hi && pi.priceUsd <= hi * (1 - rules.trailingStop) && hi > h.avgUsd) {
          sell(h, h.qty, `Trailing stop: ${fmt(pi.priceUsd / hi - 1, "pct")} from its high since entry (limit −${Math.round(rules.trailingStop * 100)}%).`);
          continue;
        }
      }
      if (!CORE.has(h.assetId) && timingOf(pi.row) === "avoid") sell(h, h.qty, "Timing turned to Avoid: the price fell below both its 50- and 200-day averages.");
    }
    holdings = holdings.filter((h) => h.qty > 1e-9);

    // ---- 3. Rebalance / rotate ----
    const equityNow = cash + holdings.reduce((a, h) => a + value(h), 0);
    const sleeveW = (s: Venue) => holdings.filter((h) => h.venue === s).reduce((a, h) => a + value(h), 0) / equityNow;
    let reason: string | null = null;
    if (first) reason = "Initial allocation";
    else if (rules.rebalance === "drift") {
      const drifts = (["crypto", "us", "my"] as Venue[])
        .map((s) => ({ s, d: sleeveW(s) - rules.targetMix[s] }))
        .filter((x) => Math.abs(x.d) > rules.driftBand);
      if (drifts.length) reason = `Rebalance: ${drifts.map((x) => `${x.s.toUpperCase()} ${fmt(x.d, "pct")} vs target`).join(", ")}`;
    } else {
      const lastBuy = tradeRows.filter((t) => t.side === "buy").reduce((a, t) => (t.at > a ? t.at : a), new Date(0));
      const days = (Date.parse(`${date}T00:00:00Z`) - lastBuy.getTime()) / 86_400_000;
      if (weekday === 1 || days >= 7) reason = "Weekly momentum rotation";
    }

    if (reason) {
      const skipSignals: Signal[] = style === "aggressive" ? ["avoid"] : ["avoid", "chase"];
      const skip = new Set([...rows.values()].filter((r) => skipSignals.includes(timingOf(r)!)).map((r) => r.id));
      const plan = buildPlan(
        { amountUsd: equityNow, rules, markets: { crypto: true, us: true, my: true }, fractionalUs: true, style, held: new Set(holdings.map((h) => h.assetId)), skip },
        universe,
      );
      const target = new Map(plan.lines.map((l) => [l.asset.id, { usd: l.costUsd, qty: l.qty, why: l.why }]));
      const MARKET: Record<Venue, string> = { crypto: "crypto", us: "US", my: "Bursa" };
      for (const s of ["crypto", "us", "my"] as Venue[]) {
        if (plan.sleeveTargets[s] >= MIN_ORDER_USD && !plan.lines.some((l) => l.sleeve === s)) {
          notes.push(
            `No ${MARKET[s]} buys: nothing passed the filters (downtrend, or timing says ${skipSignals.map((x) => `"${x === "avoid" ? "Avoid for now" : "Don't chase"}"`).join(" or ")}), so its ${fmt(plan.sleeveTargets[s], "price")} share stays in cash for now.`,
          );
        }
      }
      for (const id of target.keys()) if (!prices.has(id)) {
        const pi = await priceOf(id);
        if (pi) prices.set(id, pi);
      }

      // Sells first: anything no longer in the target, then trims of oversized positions.
      for (const h of holdings) {
        if (!tradable(h.venue)) continue;
        const t = target.get(h.assetId);
        const cur = value(h);
        if (!t) {
          if (!CORE.has(h.assetId) || style === "aggressive") sell(h, h.qty, `${reason}: no longer among the top-ranked picks.`);
          continue;
        }
        const over = cur - t.usd;
        if (over > Math.max(MIN_ORDER_USD, 0.1 * t.usd)) {
          let qty = over / prices.get(h.assetId)!.priceUsd;
          if (h.venue === "my") qty = Math.floor(qty / rules.myBoardLot) * rules.myBoardLot;
          if (qty > 0) sell(h, Math.min(qty, h.qty), `${reason}: trimmed back to its target weight.`);
        }
      }

      // Then buys, largest gaps first, limited by the cash available.
      const gaps = [...target.entries()]
        .map(([id, t]) => ({ id, t, cur: (() => { const h = holdings.find((x) => x.assetId === id); return h ? value(h) : 0; })() }))
        .map((g) => ({ ...g, gap: g.t.usd - g.cur }))
        .filter((g) => tradable(venueOf(g.id)) && g.gap > Math.max(MIN_ORDER_USD, 0.1 * g.t.usd))
        .sort((a, b) => b.gap - a.gap);
      for (const g of gaps) {
        const v = venueOf(g.id);
        const pi = prices.get(g.id);
        if (!pi) continue;
        const budget = Math.min(g.gap, cash);
        if (budget < MIN_ORDER_USD) {
          notes.push(`Not enough cash left to buy ${name(g.id)}.`);
          continue;
        }
        const fill = pi.priceUsd * (1 + rules.fees.slippagePct);
        const feeOf = (q: number) => orderFeeUsd(v, q, fill, rules.fees, fx);
        let qty: number;
        if (g.cur === 0 && g.t.qty * fill + feeOf(g.t.qty) <= cash) {
          // New position: buy exactly what the plan sized (whole Bursa lots), with fees on top.
          qty = g.t.qty;
        } else if (v === "my") {
          let lots = Math.floor(budget / (fill * rules.myBoardLot));
          while (lots > 0 && lots * rules.myBoardLot * fill + feeOf(lots * rules.myBoardLot) > budget) lots--;
          qty = lots * rules.myBoardLot;
        } else qty = Math.floor(((budget - feeOf(budget / fill)) / fill) * 1e6) / 1e6;
        if (qty <= 0) continue;
        const fee = feeOf(qty);
        orders.push({ assetId: g.id, venue: v, side: "buy", qty, fillUsd: fill, feeUsd: fee, reason: `${reason}: ${g.t.why.slice(0, 2).join("; ")}.` });
        cash -= qty * fill + fee;
        const h = holdings.find((x) => x.assetId === g.id);
        if (h) h.qty += qty;
        else holdings.push({ assetId: g.id, venue: v, qty, avgUsd: fill, entryDate: date });
      }
      if (!stockDay) notes.push("Weekend: stock orders wait for the next weekday; only crypto traded.");
    }

    // ---- 4. Record ----
    const equityAfter = cash + holdings.reduce((a, h) => a + value(h), 0);
    const fees = orders.reduce((a, o) => a + o.feeUsd, 0);
    const buys = orders.filter((o) => o.side === "buy");
    const sells = orders.filter((o) => o.side === "sell");
    const head = orders.length
      ? `${reason ?? "Risk exits"}. ${buys.length} buy${buys.length === 1 ? "" : "s"}, ${sells.length} sell${sells.length === 1 ? "" : "s"}, ${fmt(fees, "price")} in fees.`
      : rules.rebalance === "drift"
        ? `No trades: every market is within ${Math.round(rules.driftBand * 100)}% of its target and no stop was hit.`
        : "No trades: rotation happens weekly and no stop was hit.";
    const lines = [
      head,
      ...orders.map((o) => `${o.side === "buy" ? "Bought" : "Sold"} ${name(o.assetId)} for ${fmt(o.qty * o.fillUsd, "price")}. ${o.reason}`),
      ...notes,
      `Value ${fmt(equityAfter, "price")} (${fmt(equityAfter / p.startCashUsd - 1, "pct")} since start), cash ${fmt(cash, "price")}.`,
    ];
    const summary = lines.join("\n");

    if (!opts.dry) {
      const at = new Date();
      if (orders.length) {
        await db.insert(trades).values(
          orders.map((o) => ({ portfolioId: p.id, at, assetId: o.assetId, side: o.side, qty: o.qty, priceUsd: o.fillUsd, feeUsd: o.feeUsd, reason: o.reason })),
        );
      }
      await db.insert(snapshots).values({
        portfolioId: p.id,
        date,
        equityUsd: equityAfter,
        cashUsd: cash,
        holdings: holdings.map((h) => ({ assetId: h.assetId, qty: h.qty, valueUsd: value(h) })),
      });
      await db.insert(journal).values({ portfolioId: p.id, date, author: "engine", summary });
    }
    results.push({ portfolioId: p.id, orders, equityBefore, equityAfter, cashAfter: cash, summary });
  }
  return results;
}
