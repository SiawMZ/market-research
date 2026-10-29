import "server-only";
import { cache } from "react";
import { getDerivatives, getMarketRows } from "@/lib/data";
import { scoreAll, type Scored } from "@/lib/scoring";

/** Every tracked asset with its factor scores, plus the USD/MYR rate for converting Bursa prices. */
export const getScoredUniverse = cache(async () => {
  const [crypto, us, my, derivs, macro] = await Promise.all([
    getMarketRows("crypto"),
    getMarketRows("us", ["stock", "etf"]),
    getMarketRows("my", ["stock"]),
    getDerivatives(),
    getMarketRows("us", ["index"]),
  ]);
  const funding = new Map(derivs.filter((d) => d.funding_rate != null).map((d) => [d.symbol, d.funding_rate!]));
  const scored = scoreAll(crypto, us, my, funding);
  // ETFs aren't scored (no fundamentals) but the planner uses them as core holdings.
  const etfs: Scored[] = us
    .filter((r) => r.kind === "etf")
    .map((r) => ({ ...r, factors: {}, potential: null, undervalued: null, reasons: [], flags: [], extraNums: {} }));
  const usdMyr = macro.find((m) => m.symbol === "MYR=X")?.price ?? null;
  return { ...scored, etfs, usdMyr };
});

/** Strips the sparkline to keep client payloads small where it isn't drawn. */
export const lean = (rows: Scored[]) => rows.map((r) => ({ ...r, spark: [] as number[] }));
