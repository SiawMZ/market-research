import "server-only";
import { cache } from "react";
import { getEtfFlows, getMarketRows, getMetric, type Market } from "@/lib/data";
import { fmt } from "@/lib/format";
import { moodIndex } from "@/lib/signals";
import { marketClimate, type Climate } from "@/lib/timing";

/** Market climate for crypto, US and Bursa. Shared by the Summary timing section and asset pages. */
export const getClimates = cache(async (): Promise<Record<Market, Climate>> => {
  const [crypto, us, my, macro, fng, flows, cex] = await Promise.all([
    getMarketRows("crypto"),
    getMarketRows("us", ["stock", "etf"]),
    getMarketRows("my", ["stock"]),
    getMarketRows("us", ["index"]),
    getMetric("crypto_fear_greed", 30),
    getEtfFlows(40),
    getMetric("cex_netflow_1w_usd", 10),
  ]);
  // Exchange flows: a week of net outflows over $1B means coins leaving exchanges to be held; inflows that size can precede selling.
  const cex1w = cex.at(-1)?.value;
  const cexPoint =
    cex1w == null
      ? null
      : { text: `Exchange net flows over 7 days: ${fmt(cex1w, "usd")}${cex1w < 0 ? " (coins leaving exchanges)" : " (coins arriving on exchanges)"}`, v: (cex1w < -1e9 ? 1 : cex1w > 1e9 ? -1 : 0) as -1 | 0 | 1 };
  const m = (s: string) => macro.find((x) => x.symbol === s);
  const usStocks = us.filter((r) => r.kind === "stock");
  const mood = moodIndex(m("^GSPC"), m("^VIX"), usStocks);
  const flow20 = flows.slice(-20).reduce((a, f) => a + f.totalUsdM, 0);
  const vix = m("^VIX");

  return {
    crypto: marketClimate("Crypto", {
      bench: crypto.find((r) => r.symbol === "BTC"),
      benchName: "Bitcoin",
      rows: crypto,
      sentiment: { label: "Fear & Greed", value: fng.at(-1)?.value },
      extra: [flows.length ? { text: `BTC ETF net flows over 20 days: ${fmt(flow20, "usdM")}`, v: flow20 > 0 ? 1 : flow20 < -500 ? -1 : 0 } : null, cexPoint],
    }),
    us: marketClimate("US stocks", {
      bench: m("^GSPC"),
      benchName: "The S&P 500",
      rows: usStocks,
      sentiment: { label: "Our US mood gauge", value: mood.score },
      extra: [vix ? { text: `VIX at ${vix.price.toFixed(1)}${vix.price > 25 ? ": stressed market" : vix.price < 15 ? ": calm, possibly complacent" : ""}`, v: vix.price > 25 ? -1 : 0 } : null],
    }),
    my: marketClimate("Bursa Malaysia", { bench: m("^KLSE"), benchName: "The FBM KLCI", rows: my }),
  };
});
