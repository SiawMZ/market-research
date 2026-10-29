import { z } from "zod";
import { assets, fundamentals, pricesDaily } from "@/lib/db/schema";
import { MACRO_TICKERS, MY_STOCKS, US_STOCKS } from "@/config/universe";
import { batch, fetchJson, isoDate, sleep, today, type Collector } from "./core";

/*
 * Yahoo Finance, called directly. The chart and fundamentals-timeseries endpoints work without the
 * cookie/crumb handshake, which is what gets rate-limited (HTTP 429) when using the yahoo-finance2 library.
 */

const BROWSER = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

type Def = { id: string; symbol: string; market: "us" | "my"; kind: "stock" | "etf" | "index"; sector?: string; name?: string };

const defs: Def[] = [
  ...US_STOCKS.map((s) => ({ ...s, id: `us:${s.symbol}`, market: "us" as const })),
  ...MY_STOCKS.map((s) => ({ ...s, id: `my:${s.symbol}`, market: "my" as const })),
  ...MACRO_TICKERS.map((m) => ({ id: `us:${m.symbol}`, symbol: m.symbol, market: "us" as const, kind: "index" as const, name: m.name })),
];

const nums = z.array(z.number().nullable());

const Chart = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string().nullable().optional(),
            longName: z.string().optional(),
            shortName: z.string().optional(),
            fullExchangeName: z.string().optional(),
            instrumentType: z.string().optional(),
            regularMarketPrice: z.number().optional(),
            fiftyTwoWeekHigh: z.number().optional(),
            fiftyTwoWeekLow: z.number().optional(),
          }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({ quote: z.array(z.object({ open: nums, high: nums, low: nums, close: nums, volume: nums }).partial()) }),
        }),
      )
      .nullable(),
  }),
});

const VALUATION_TYPES = ["trailingPeRatio", "forwardPeRatio", "trailingPbRatio", "trailingPsRatio", "trailingMarketCap"] as const;

const Timeseries = z.object({
  timeseries: z.object({
    result: z
      .array(z.object({ meta: z.object({ type: z.array(z.string()) }) }).catchall(z.unknown()))
      .nullable(),
  }),
});

const Point = z.array(
  z.object({ asOfDate: z.string().optional(), currencyCode: z.string().optional(), reportedValue: z.object({ raw: z.number() }).optional() }).nullable(),
);

/** Annual statement lines used for quality and growth. Two years are fetched so growth can be computed. */
const ANNUAL_TYPES = [
  "annualTotalRevenue",
  "annualNetIncome",
  "annualFreeCashFlow",
  "annualStockholdersEquity",
  "annualTotalDebt",
  "annualCashDividendsPaid",
] as const;
const EXTRA_RATIOS = ["trailingPegRatio", "trailingEnterprisesValueEBITDARatio"] as const;

type FieldType = (typeof VALUATION_TYPES)[number] | (typeof ANNUAL_TYPES)[number] | (typeof EXTRA_RATIOS)[number];
type Field = { last: number; prev: number | null; currency: string | null };

/** Latest (and previous) value of each valuation ratio and annual line. Missing for ETFs and some stocks; that's expected. */
async function fundamentalsOf(symbol: string): Promise<Partial<Record<FieldType, Field>>> {
  const now = Math.floor(Date.now() / 1000);
  const types = [...VALUATION_TYPES, ...ANNUAL_TYPES, ...EXTRA_RATIOS];
  const res = await fetchJson(
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types.join(",")}&period1=${now - 800 * 86_400}&period2=${now}`,
    Timeseries,
    { headers: BROWSER },
  );
  const out: Partial<Record<FieldType, Field>> = {};
  for (const r of res.timeseries.result ?? []) {
    const type = r.meta.type[0] as FieldType;
    const pts = Point.safeParse(r[type]);
    const vals = pts.success ? pts.data.filter((p) => p?.reportedValue != null) : [];
    const last = vals.at(-1);
    if (last?.reportedValue) {
      out[type] = { last: last.reportedValue.raw, prev: vals.at(-2)?.reportedValue?.raw ?? null, currency: last.currencyCode ?? null };
    }
  }
  return out;
}

/**
 * Quality and growth ratios from the annual lines. Ratios that mix statement and market-cap values are only
 * computed when both are in the same currency (ADRs like TSM report in TWD while their market cap is in USD).
 */
function derive(f: Partial<Record<FieldType, Field>>) {
  const mc = f.trailingMarketCap;
  const sameCcy = (x?: Field) => x && mc && (!x.currency || !mc.currency || x.currency === mc.currency);
  const growth = (x?: Field) => (x && x.prev && x.prev > 0 ? x.last / x.prev - 1 : null);
  const ni = f.annualNetIncome;
  const eq = f.annualStockholdersEquity;
  const fcf = f.annualFreeCashFlow;
  const div = f.annualCashDividendsPaid;
  return {
    roe: ni && eq && eq.last > 0 ? ni.last / eq.last : null,
    fcfYield: fcf && sameCcy(fcf) ? fcf.last / mc!.last : null,
    dividendYield: div && sameCcy(div) ? Math.abs(div.last) / mc!.last : null,
    revenueGrowth: growth(f.annualTotalRevenue),
    earningsGrowth: growth(ni),
    debtToEquity: f.annualTotalDebt && eq && eq.last > 0 ? f.annualTotalDebt.last / eq.last : null,
    netMargin: ni && f.annualTotalRevenue?.last ? ni.last / f.annualTotalRevenue.last : null,
    peg: f.trailingPegRatio?.last ?? null,
    evEbitda: f.trailingEnterprisesValueEBITDARatio?.last ?? null,
  };
}

/** Daily candles (2 years) plus a valuation snapshot for every US and Bursa stock we track. */
export const stockMarket: Collector = {
  name: "stock-market",
  description: "Yahoo Finance candles + valuation, US and Bursa Malaysia",
  async run() {
    const date = today();
    const failed: string[] = [];
    const assetRows: (typeof assets.$inferInsert)[] = [];
    const candles: (typeof pricesDaily.$inferInsert)[] = [];
    const fundRows: (typeof fundamentals.$inferInsert)[] = [];

    for (const d of defs) {
      try {
        const res = await fetchJson(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(d.symbol)}?range=2y&interval=1d`,
          Chart,
          { headers: BROWSER },
        );
        const r = res.chart.result?.[0];
        if (!r?.timestamp?.length) throw new Error("no candles");
        const q = r.indicators.quote[0];
        const volumes: number[] = [];
        r.timestamp.forEach((t, i) => {
          const [o, h, l, c, v] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i]];
          if (o == null || h == null || l == null || c == null) return;
          candles.push({ assetId: d.id, date: isoDate(t * 1000), open: o, high: h, low: l, close: c, volume: v ?? 0 });
          volumes.push(v ?? 0);
        });

        assetRows.push({
          id: d.id,
          market: d.market,
          symbol: d.symbol,
          name: d.name ?? r.meta.longName ?? r.meta.shortName ?? d.symbol,
          currency: r.meta.currency ?? (d.market === "my" ? "MYR" : "USD"),
          kind: d.kind,
          sector: d.sector ?? null,
          meta: { exchange: r.meta.fullExchangeName ?? null, instrumentType: r.meta.instrumentType ?? null },
          updatedAt: new Date(),
        });

        if (d.kind !== "index") {
          const v = d.kind === "stock" ? await fundamentalsOf(d.symbol) : {};
          const q = derive(v);
          const last63 = volumes.slice(-63);
          fundRows.push({
            assetId: d.id,
            date,
            marketCap: v.trailingMarketCap?.last ?? null,
            peTrailing: v.trailingPeRatio?.last ?? null,
            peForward: v.forwardPeRatio?.last ?? null,
            priceToBook: v.trailingPbRatio?.last ?? null,
            dividendYield: q.dividendYield,
            high52w: r.meta.fiftyTwoWeekHigh ?? null,
            low52w: r.meta.fiftyTwoWeekLow ?? null,
            avgVolume3m: last63.length ? last63.reduce((a, b) => a + b, 0) / last63.length : null,
            extra: { price: r.meta.regularMarketPrice ?? null, priceToSales: v.trailingPsRatio?.last ?? null, ...q },
          });
        }
      } catch (err) {
        failed.push(`${d.symbol} (${err instanceof Error ? err.message.slice(0, 60) : err})`);
      }
      await sleep(300);
    }
    if (failed.length) console.log(`  failed: ${failed.join(", ")}`);
    if (assetRows.length === 0) throw new Error("Yahoo returned no data for any symbol");

    return [
      batch("assets", assets, ["id"], assetRows),
      batch("prices_daily", pricesDaily, ["assetId", "date"], candles),
      batch("fundamentals", fundamentals, ["assetId", "date"], fundRows),
    ];
  },
};
