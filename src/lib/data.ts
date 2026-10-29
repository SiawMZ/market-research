import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { isoDate } from "@/collectors/core";
import { change, last, macd, maxDrawdown, rsi, sma, trendLabel, volatility } from "@/lib/indicators";

/** Did the MACD histogram change sign in the last n bars? Positive after negative = bullish cross. */
function recentCross(hist: (number | null)[], n = 5): "bullish" | "bearish" | null {
  const h = hist.slice(-(n + 1));
  for (let i = h.length - 1; i > 0; i--) {
    const [a, b] = [h[i - 1], h[i]];
    if (a == null || b == null) continue;
    if (a <= 0 && b > 0) return "bullish";
    if (a >= 0 && b < 0) return "bearish";
  }
  return null;
}

const { assets, pricesDaily, fundamentals, metrics, etfFlows, derivatives, macroEvents, insiderTrades, portfolios, trades, snapshots, journal, collectorRuns } = schema;

export type Market = "crypto" | "us" | "my";
export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

const daysAgo = (n: number) => isoDate(Date.now() - n * 86_400_000);

/** One row per asset with the numbers the market tables and screener need. */
export type MarketRow = {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  kind: string;
  sector: string | null;
  currency: string;
  price: number;
  asOf: string;
  chg1d: number | null;
  chg7d: number | null;
  chg30d: number | null;
  chg1y: number | null;
  rsi14: number | null;
  ma50: number | null;
  ma200: number | null;
  trend: ReturnType<typeof trendLabel>;
  volatility: number | null;
  volumeRatio: number | null; // today's volume vs 20-day average
  fromHigh: number | null; // distance below the 1-year high
  drawdown1y: number;
  marketCap: number | null;
  peTrailing: number | null;
  peForward: number | null;
  priceToBook: number | null;
  spark: number[];
  extra: Record<string, unknown> | null;
  /** MACD line crossed its signal line within the last 5 bars. */
  macdCross: "bullish" | "bearish" | null;
  /** Price vs its 50-day average (0.1 = 10% above). */
  fromMa50: number | null;
};

export const getMarketRows = cache(async (market: Market, kinds?: string[]): Promise<MarketRow[]> => {
  const db = getDb();
  const list = await db
    .select()
    .from(assets)
    .where(kinds ? and(eq(assets.market, market), inArray(assets.kind, kinds as never[])) : eq(assets.market, market));
  if (list.length === 0) return [];
  const ids = list.map((a) => a.id);

  const [candles, funds] = await Promise.all([
    db
      .select()
      .from(pricesDaily)
      .where(and(inArray(pricesDaily.assetId, ids), gte(pricesDaily.date, daysAgo(400))))
      .orderBy(asc(pricesDaily.date)),
    db.execute<{ asset_id: string; market_cap: number | null; pe_trailing: number | null; pe_forward: number | null; price_to_book: number | null; extra: Record<string, unknown> | null }>(
      sql`select distinct on (asset_id) asset_id, market_cap, pe_trailing, pe_forward, price_to_book, extra
          from ${fundamentals} where asset_id in ${ids} order by asset_id, date desc`,
    ),
  ]);

  const byAsset = new Map<string, Candle[]>();
  for (const c of candles) {
    const arr = byAsset.get(c.assetId) ?? [];
    arr.push(c);
    byAsset.set(c.assetId, arr);
  }
  const fundBy = new Map(funds.rows.map((f) => [f.asset_id, f]));
  const isCrypto = market === "crypto";
  const week = isCrypto ? 7 : 5;
  const month = isCrypto ? 30 : 21;
  const year = isCrypto ? 365 : 252;

  const rows: MarketRow[] = [];
  for (const a of list) {
    const cs = byAsset.get(a.id);
    const f = fundBy.get(a.id);
    const marketCap = f?.market_cap ?? null;
    if (!cs?.length) continue;
    const closes = cs.map((c) => c.close);
    const price = closes.at(-1)!;
    const ma50 = last(sma(closes, 50));
    const ma200 = last(sma(closes, 200));
    // Crypto's latest candle is the still-open UTC day, so judge volume on the last complete day.
    const volIdx = isCrypto && cs.at(-1)!.date >= isoDate(Date.now()) ? cs.length - 2 : cs.length - 1;
    const vols = cs.slice(Math.max(0, volIdx - 20), volIdx).map((c) => c.volume);
    const avgVol = vols.length ? vols.reduce((x, y) => x + y, 0) / vols.length : 0;
    const yearCloses = closes.slice(-year);
    rows.push({
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      market: a.market as Market,
      kind: a.kind,
      sector: a.sector,
      currency: a.currency,
      price,
      asOf: cs.at(-1)!.date,
      chg1d: change(closes, 1),
      chg7d: change(closes, week),
      chg30d: change(closes, month),
      chg1y: change(closes, year),
      rsi14: last(rsi(closes)),
      ma50,
      ma200,
      trend: trendLabel(price, ma50, ma200),
      volatility: volatility(closes, year),
      volumeRatio: avgVol > 0 && volIdx >= 0 ? cs[volIdx].volume / avgVol : null,
      fromHigh: price / Math.max(...yearCloses) - 1,
      drawdown1y: maxDrawdown(yearCloses),
      marketCap,
      peTrailing: f?.pe_trailing ?? null,
      peForward: f?.pe_forward ?? null,
      priceToBook: f?.price_to_book ?? null,
      spark: closes.slice(-60),
      extra: f?.extra ?? null,
      macdCross: recentCross(macd(closes).hist),
      fromMa50: ma50 ? price / ma50 - 1 : null,
    });
  }
  // Largest first, so tables open on the names that matter most.
  return rows.sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0));
});

export const getAsset = cache(async (id: string) => {
  const db = getDb();
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  return a ?? null;
});

export const getCandles = cache(async (id: string, days = 730): Promise<Candle[]> => {
  const db = getDb();
  return db
    .select({ date: pricesDaily.date, open: pricesDaily.open, high: pricesDaily.high, low: pricesDaily.low, close: pricesDaily.close, volume: pricesDaily.volume })
    .from(pricesDaily)
    .where(and(eq(pricesDaily.assetId, id), gte(pricesDaily.date, daysAgo(days))))
    .orderBy(asc(pricesDaily.date));
});

export const getMetric = cache(async (key: string, days = 365) => {
  const db = getDb();
  return db
    .select({ date: metrics.date, value: metrics.value, label: metrics.label })
    .from(metrics)
    .where(and(eq(metrics.key, key), gte(metrics.date, daysAgo(days))))
    .orderBy(asc(metrics.date));
});

export const getEtfFlows = cache(async (days = 120) => {
  const db = getDb();
  return db
    .select()
    .from(etfFlows)
    .where(and(eq(etfFlows.asset, "BTC"), gte(etfFlows.date, daysAgo(days))))
    .orderBy(asc(etfFlows.date));
});

export const getDerivatives = cache(async () => {
  const db = getDb();
  const rows = await db.execute<{ symbol: string; date: string; funding_rate: number | null; open_interest_usd: number | null; mark_price: number | null }>(
    sql`select * from ${derivatives} where date = (select max(date) from ${derivatives}) order by open_interest_usd desc nulls last`,
  );
  return rows.rows;
});

export const getMacroEvents = cache(async () => {
  const db = getDb();
  return db
    .select()
    .from(macroEvents)
    .where(gte(macroEvents.at, new Date(Date.now() - 2 * 86_400_000)))
    .orderBy(asc(macroEvents.at));
});

export const getInsiderTrades = cache(async (limit = 60) => {
  const db = getDb();
  return db.select().from(insiderTrades).orderBy(desc(insiderTrades.filedAt)).limit(limit);
});

export const getPortfolios = cache(async () => {
  const db = getDb();
  const [ps, ss, ts, js] = await Promise.all([
    db.select().from(portfolios),
    db.select().from(snapshots).orderBy(asc(snapshots.date)),
    db.select().from(trades).orderBy(desc(trades.at)),
    db.select().from(journal).orderBy(desc(journal.date), desc(journal.id)),
  ]);
  return ps.map((p) => ({
    ...p,
    snapshots: ss.filter((s) => s.portfolioId === p.id),
    trades: ts.filter((t) => t.portfolioId === p.id),
    journal: js.filter((j) => j.portfolioId === p.id),
  }));
});

/** Most recent run of each collector, for the "data freshness" footer. */
export const getFreshness = cache(async () => {
  const db = getDb();
  const rows = await db.execute<{ name: string; started_at: string; ok: boolean }>(
    sql`select distinct on (name) name, started_at, ok from ${collectorRuns} order by name, started_at desc`,
  );
  return rows.rows;
});
