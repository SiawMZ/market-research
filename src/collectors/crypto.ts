import { z } from "zod";
import { assets, fundamentals, metrics, pricesDaily, derivatives, etfFlows } from "@/lib/db/schema";
import { CRYPTO_SKIP, CRYPTO_TOP_N } from "@/config/universe";
import { batch, fetchJson, isoDate, sleep, today, FatalHttpError, type Collector } from "./core";

const num = z.number().nullable();

const CoinGeckoMarkets = z.array(
  z.object({
    id: z.string(),
    symbol: z.string(),
    name: z.string(),
    current_price: num,
    market_cap: num,
    total_volume: num,
    high_24h: num,
    low_24h: num,
    ath: num,
    atl: num,
    price_change_percentage_7d_in_currency: num.optional(),
    price_change_percentage_30d_in_currency: num.optional(),
  }),
);

const CoinGeckoGlobal = z.object({
  data: z.object({
    total_market_cap: z.record(z.number()),
    total_volume: z.record(z.number()),
    market_cap_percentage: z.record(z.number()),
  }),
});

// [openTime, open, high, low, close, baseVolume, closeTime, quoteVolume, ...]
const BinanceKlines = z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string(), z.number(), z.string()]).rest(z.unknown()));

/** Top coins by market cap, their daily candles, and market-wide numbers. */
export const cryptoMarket: Collector = {
  name: "crypto-market",
  description: "CoinGecko top coins + global stats, Binance daily candles",
  async run() {
    const date = today();
    const markets = await fetchJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${CRYPTO_TOP_N + 30}&page=1&price_change_percentage=7d,30d`,
      CoinGeckoMarkets,
    );
    const coins = markets
      .filter((c) => {
        const s = c.symbol.toUpperCase();
        // Skip stablecoins, wrapped tokens and tokenised funds/loans (e.g. "FIGR_HELOC", "EURSAFO").
        return !CRYPTO_SKIP.has(s) && !s.includes("USD") && !s.startsWith("EUR") && /^[A-Z0-9]+$/.test(s);
      })
      .slice(0, CRYPTO_TOP_N);

    const global = await fetchJson("https://api.coingecko.com/api/v3/global", CoinGeckoGlobal);
    const g = global.data;

    // Candles from Binance's public market-data mirror (works from US-hosted CI, unlike api.binance.com).
    const candles: (typeof pricesDaily.$inferInsert)[] = [];
    const missing: string[] = [];
    for (const c of coins) {
      const sym = c.symbol.toUpperCase();
      try {
        const k = await fetchJson(
          `https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=730`,
          BinanceKlines,
        );
        for (const [t, o, h, l, cl, , , qv] of k) {
          candles.push({ assetId: `crypto:${sym}`, date: isoDate(t), open: +o, high: +h, low: +l, close: +cl, volume: +qv });
        }
      } catch (err) {
        if (!(err instanceof FatalHttpError)) throw err;
        missing.push(sym); // not listed on Binance; fundamentals still recorded
      }
      await sleep(120);
    }
    if (missing.length) console.log(`  no Binance USDT pair for: ${missing.join(", ")}`);

    return [
      batch("assets", assets, ["id"], coins.map((c, i) => ({
        id: `crypto:${c.symbol.toUpperCase()}`,
        market: "crypto",
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        currency: "USD",
        kind: "coin",
        meta: { coingeckoId: c.id, rank: i + 1, ath: c.ath, hasCandles: !missing.includes(c.symbol.toUpperCase()) },
        updatedAt: new Date(),
      }))),
      batch("fundamentals", fundamentals, ["assetId", "date"], coins.map((c) => ({
        assetId: `crypto:${c.symbol.toUpperCase()}`,
        date,
        marketCap: c.market_cap,
        extra: {
          price: c.current_price,
          volume24h: c.total_volume,
          change7d: c.price_change_percentage_7d_in_currency ?? null,
          change30d: c.price_change_percentage_30d_in_currency ?? null,
          ath: c.ath,
          drawdownFromAth: c.ath && c.current_price ? c.current_price / c.ath - 1 : null,
        },
      }))),
      batch("prices_daily", pricesDaily, ["assetId", "date"], candles),
      batch("metrics", metrics, ["key", "date"], [
        { key: "crypto_total_mcap_usd", date, value: g.total_market_cap.usd },
        { key: "crypto_total_volume_usd", date, value: g.total_volume.usd },
        { key: "btc_dominance", date, value: g.market_cap_percentage.btc },
        { key: "eth_dominance", date, value: g.market_cap_percentage.eth },
      ]),
    ];
  },
};

const FearGreed = z.object({
  data: z.array(z.object({ value: z.string(), value_classification: z.string(), timestamp: z.string() })),
});

export const cryptoFearGreed: Collector = {
  name: "crypto-fear-greed",
  description: "Crypto Fear & Greed index (alternative.me)",
  async run() {
    const res = await fetchJson("https://api.alternative.me/fng/?limit=730", FearGreed);
    return [
      batch("metrics", metrics, ["key", "date"], res.data.map((d) => ({
        key: "crypto_fear_greed",
        date: isoDate(+d.timestamp * 1000),
        value: +d.value,
        label: d.value_classification,
      }))),
    ];
  },
};

const StablecoinChart = z.array(
  z.object({ date: z.union([z.string(), z.number()]), totalCirculatingUSD: z.object({ peggedUSD: z.number() }).partial() }),
);

export const stablecoins: Collector = {
  name: "stablecoins",
  description: "Total stablecoin supply (DefiLlama)",
  async run() {
    const res = await fetchJson("https://stablecoins.llama.fi/stablecoincharts/all", StablecoinChart);
    return [
      batch("metrics", metrics, ["key", "date"], res.slice(-730).flatMap((d) =>
        d.totalCirculatingUSD.peggedUSD == null
          ? []
          : [{ key: "stablecoin_supply_usd", date: isoDate(+d.date * 1000), value: d.totalCirculatingUSD.peggedUSD }],
      )),
    ];
  },
};

const HyperliquidCtx = z.tuple([
  z.object({ universe: z.array(z.object({ name: z.string(), isDelisted: z.boolean().optional() })) }),
  z.array(z.object({ funding: z.string(), openInterest: z.string(), markPx: z.string() })),
]);

/** Leverage in the market: funding rate and open interest per coin (Hyperliquid perps, open API). */
export const cryptoDerivatives: Collector = {
  name: "crypto-derivatives",
  description: "Funding rates and open interest (Hyperliquid)",
  async run() {
    const [meta, ctxs] = await fetchJson("https://api.hyperliquid.xyz/info", HyperliquidCtx, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    });
    const date = today();
    const rows = meta.universe.flatMap((u, i) => {
      const c = ctxs[i];
      if (!c || u.isDelisted) return [];
      const mark = +c.markPx;
      const oiUsd = +c.openInterest * mark;
      if (oiUsd < 5_000_000) return []; // ignore tiny markets
      // Hyperliquid funding is per hour; store as an 8-hour rate to match how CEXes quote it.
      return [{ symbol: u.name, date, venue: "hyperliquid", fundingRate: +c.funding * 8, openInterestUsd: oiUsd, markPrice: mark }];
    });
    return [batch("derivatives", derivatives, ["symbol", "date", "venue"], rows)];
  },
};

const TftcEtf = z.object({
  updatedThrough: z.string(),
  days: z.array(z.object({ date: z.string(), netFlowUsd: z.number().nullable(), perEtfUsd: z.record(z.number().nullable()).nullable() })),
});

/** US spot Bitcoin ETF net flows. Source: The Commoner Bitcoin ETF Tracker by TFTC (CC BY 4.0). */
export const btcEtfFlows: Collector = {
  name: "btc-etf-flows",
  description: "US spot BTC ETF flows (TFTC tracker, CC BY 4.0)",
  async run() {
    const res = await fetchJson("https://www.tftc.io/bitcoin-etf-flows/data.json", TftcEtf);
    console.log(`  TFTC data through ${res.updatedThrough}`);
    return [
      batch("etf_flows", etfFlows, ["asset", "date"], res.days.flatMap((d) =>
        d.netFlowUsd == null
          ? []
          : [{
              asset: "BTC" as const,
              date: d.date,
              totalUsdM: d.netFlowUsd / 1e6,
              byIssuer: Object.fromEntries(Object.entries(d.perEtfUsd ?? {}).map(([k, v]) => [k, (v ?? 0) / 1e6])),
            }],
      )),
    ];
  },
};
