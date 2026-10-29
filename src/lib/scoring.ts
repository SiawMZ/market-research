import type { MarketRow } from "@/lib/data";
import { fmt } from "@/lib/format";

/*
 * Transparent factor scores, 0-100. Each factor is a percentile rank within the asset's own market
 * (US stocks vs US stocks, Bursa vs Bursa, crypto vs crypto), so "cheap" means cheap relative to peers.
 * Missing data leaves a factor out rather than counting as zero.
 */

export type FactorKey = "value" | "quality" | "growth" | "momentum" | "size" | "discount" | "leverage";
export type Scored = MarketRow & {
  factors: Partial<Record<FactorKey, number>>;
  potential: number | null; // overall score
  undervalued: number | null; // value-led score, stocks only
  reasons: string[]; // the strongest supporting facts
  flags: string[]; // risks worth knowing
  extraNums: Record<string, number | null>;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Percentile rank of v among values (0-100). higher=false means smaller is better. */
function rank(values: number[], v: number | null, higher = true): number | null {
  if (v == null || values.length < 3) return null;
  const below = values.filter((x) => (higher ? x < v : x > v)).length;
  const equal = values.filter((x) => x === v).length;
  return ((below + equal / 2) / values.length) * 100;
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Weighted mean over the factors that exist, re-normalising the weights. */
function blend(f: Partial<Record<FactorKey, number>>, weights: Partial<Record<FactorKey, number>>) {
  let s = 0;
  let w = 0;
  for (const [k, wt] of Object.entries(weights) as [FactorKey, number][]) {
    if (f[k] != null) {
      s += f[k]! * wt;
      w += wt;
    }
  }
  return w >= 0.5 ? s / w : null; // need at least half the weight present
}

function scoreStocks(rows: MarketRow[]): Scored[] {
  const stocks = rows.filter((r) => r.kind === "stock");
  const x = (r: MarketRow) => {
    const e = r.extra ?? {};
    const financial = r.sector === "Financials";
    return {
      pe: r.peTrailing != null && r.peTrailing > 0 ? r.peTrailing : null, // negative P/E means losses: not "cheap"
      pb: r.priceToBook != null && r.priceToBook > 0 ? r.priceToBook : null,
      fcfYield: financial ? null : num(e.fcfYield), // bank cash flow isn't comparable
      divYield: num(e.dividendYield),
      roe: num(e.roe),
      margin: num(e.netMargin),
      debtEq: financial ? null : num(e.debtToEquity),
      revG: num(e.revenueGrowth),
      epsG: num(e.earningsGrowth),
      peg: num(e.peg),
    };
  };
  const all = stocks.map(x);
  const col = <K extends keyof ReturnType<typeof x>>(k: K) => all.map((a) => a[k]).filter((v): v is number => v != null);
  const cols = {
    pe: col("pe"), pb: col("pb"), fcfYield: col("fcfYield"), divYield: col("divYield"), roe: col("roe"),
    margin: col("margin"), debtEq: col("debtEq"), revG: col("revG"), epsG: col("epsG"),
  };
  const mom1y = stocks.map((r) => r.chg1y).filter((v): v is number => v != null);
  const mom30 = stocks.map((r) => r.chg30d).filter((v): v is number => v != null);
  const disc = stocks.map((r) => r.fromHigh).filter((v): v is number => v != null);

  return stocks.map((r) => {
    const a = x(r);
    const factors: Partial<Record<FactorKey, number>> = {};
    const value = avg([rank(cols.pe, a.pe, false), rank(cols.pb, a.pb, false), rank(cols.fcfYield, a.fcfYield), rank(cols.divYield, a.divYield)]);
    const quality = avg([rank(cols.roe, a.roe), rank(cols.margin, a.margin), rank(cols.debtEq, a.debtEq, false)]);
    const growth = avg([rank(cols.revG, a.revG), rank(cols.epsG, a.epsG)]);
    const trendPts = r.trend === "Uptrend" ? 100 : r.trend === "Mixed" ? 50 : r.trend === "Downtrend" ? 0 : null;
    const momentum = avg([rank(mom1y, r.chg1y), rank(mom30, r.chg30d), trendPts]);
    const discount = rank(disc, r.fromHigh, false);
    if (value != null) factors.value = value;
    if (quality != null) factors.quality = quality;
    if (growth != null) factors.growth = growth;
    if (momentum != null) factors.momentum = momentum;
    if (discount != null) factors.discount = discount;

    const reasons: string[] = [];
    const flags: string[] = [];
    if (a.pe != null && rank(cols.pe, a.pe, false)! >= 70) reasons.push(`P/E ${a.pe.toFixed(1)}, cheaper than most peers`);
    if (a.fcfYield != null && a.fcfYield > 0.05) reasons.push(`Free-cash-flow yield ${fmt(a.fcfYield, "pct").replace("+", "")}`);
    if (a.divYield != null && a.divYield > 0.04) reasons.push(`Dividend yield ${fmt(a.divYield, "pct").replace("+", "")}`);
    if (a.roe != null && a.roe > 0.2) reasons.push(`High return on equity (${Math.round(a.roe * 100)}%)`);
    if (a.revG != null && a.revG > 0.15) reasons.push(`Revenue growing ${Math.round(a.revG * 100)}% a year`);
    if (a.peg != null && a.peg > 0 && a.peg < 1) reasons.push(`PEG ${a.peg.toFixed(2)}: growth looks underpriced`);
    if (r.trend === "Uptrend") reasons.push("In an uptrend");
    if (r.peTrailing != null && r.peTrailing < 0) flags.push("Loss-making");
    if (a.epsG != null && a.epsG < -0.2) flags.push(`Earnings fell ${Math.round(-a.epsG * 100)}% last year`);
    if (a.debtEq != null && a.debtEq > 2) flags.push(`High debt (${a.debtEq.toFixed(1)}× equity)`);
    if (r.trend === "Downtrend") flags.push("In a downtrend: cheap can get cheaper");
    if (r.rsi14 != null && r.rsi14 > 75) flags.push("Overbought right now");

    // Data sanity: a P/E under 3 or a dividend yield over 15% almost always means the price and the
    // statements disagree (share split, bonus issue, stale annual figures). Don't rank it; say so.
    const suspicious = (a.pe != null && a.pe < 3) || (a.divYield != null && a.divYield > 0.15);
    if (suspicious) flags.unshift("Figures look inconsistent (possible share split, bonus issue or stale data): verify before trusting");

    // Value trap guard: cheap only counts if the business is at least middling quality and still profitable.
    const trapPenalty = (quality != null && quality < 30) || (r.peTrailing != null && r.peTrailing < 0) ? 0.7 : 1;
    return {
      ...r,
      factors,
      potential: suspicious ? null : blend(factors, { value: 0.3, quality: 0.25, growth: 0.2, momentum: 0.25 }),
      undervalued: (() => {
        const b = suspicious ? null : blend(factors, { value: 0.55, quality: 0.3, discount: 0.15 });
        return b == null ? null : b * trapPenalty;
      })(),
      reasons,
      flags,
      extraNums: { ...a },
    };
  });
}

function scoreCrypto(rows: MarketRow[], funding: Map<string, number>): Scored[] {
  const vs = (r: MarketRow) => r.chg30d;
  const mom30 = rows.map(vs).filter((v): v is number => v != null);
  const mom1y = rows.map((r) => r.chg1y).filter((v): v is number => v != null);
  const caps = rows.map((r) => r.marketCap).filter((v): v is number => v != null);
  const dd = rows.map((r) => num(r.extra?.drawdownFromAth)).filter((v): v is number => v != null);
  const btc = rows.find((r) => r.symbol === "BTC");

  return rows.map((r) => {
    const f = funding.get(r.symbol) ?? null;
    const ath = num(r.extra?.drawdownFromAth);
    const trendPts = r.trend === "Uptrend" ? 100 : r.trend === "Mixed" ? 50 : r.trend === "Downtrend" ? 0 : null;
    const factors: Partial<Record<FactorKey, number>> = {};
    const momentum = avg([rank(mom30, r.chg30d), rank(mom1y, r.chg1y), trendPts]);
    const size = rank(caps, r.marketCap);
    const discount = rank(dd, ath, false);
    // Funding near the neutral 0.01%/8h is healthy; crowded longs (high positive) or shorts score lower.
    const leverage = f == null ? null : Math.max(0, 100 - Math.abs(f - 0.0001) * 200_000);
    if (momentum != null) factors.momentum = momentum;
    if (size != null) factors.size = size;
    if (discount != null) factors.discount = discount;
    if (leverage != null) factors.leverage = leverage;

    const reasons: string[] = [];
    const flags: string[] = [];
    if (btc && r.symbol !== "BTC" && r.chg30d != null && btc.chg30d != null && r.chg30d > btc.chg30d) reasons.push("Beating BTC over 30 days");
    if (r.trend === "Uptrend") reasons.push("In an uptrend");
    if (size != null && size >= 80) reasons.push("One of the largest, most liquid coins");
    if (ath != null && ath < -0.7) flags.push(`${Math.round(-ath * 100)}% below its all-time high`);
    if (f != null && f > 0.0003) flags.push("Crowded longs (high funding)");
    if (r.trend === "Downtrend") flags.push("In a downtrend");
    if (size != null && size < 30) flags.push("Small and volatile");

    return {
      ...r,
      factors,
      potential: blend(factors, { momentum: 0.4, size: 0.3, discount: 0.15, leverage: 0.15 }),
      undervalued: null,
      reasons,
      flags,
      extraNums: { funding: f, drawdownFromAth: ath },
    };
  });
}

export function scoreAll(crypto: MarketRow[], us: MarketRow[], my: MarketRow[], funding: Map<string, number>) {
  return {
    crypto: scoreCrypto(crypto, funding),
    us: scoreStocks(us),
    my: scoreStocks(my),
  };
}

export const FACTOR_LABELS: Record<FactorKey, string> = {
  value: "Value",
  quality: "Quality",
  growth: "Growth",
  momentum: "Momentum",
  size: "Size & liquidity",
  discount: "Discount from high",
  leverage: "Leverage health",
};
