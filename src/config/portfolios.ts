/**
 * Starting rulebooks for the two paper portfolios. The daily review may amend these;
 * every change is recorded in the journal table with the reason.
 */

export type Rules = {
  targetMix: { crypto: number; us: number; my: number; cash: number };
  maxPosition: number; // fraction of equity in any one asset
  maxSmallAlt: number; // fraction for any coin outside BTC/ETH
  stopLoss: number; // fraction below entry that forces a sell
  trailingStop: number | null; // fraction below the high since entry
  rebalance: "drift" | "weekly-momentum";
  driftBand: number; // rebalance when a sleeve is this far from target
  leverage: 1;
  fees: { usStockUsd: number; myStockPct: number; myStockMinMyr: number; cryptoPct: number; slippagePct: number };
  myBoardLot: number; // Bursa trades in lots of 100 shares
};

/** Fee model approximating Moomoo MY public pricing; checked again before the first trade. */
const fees: Rules["fees"] = { usStockUsd: 0.99, myStockPct: 0.0003, myStockMinMyr: 3, cryptoPct: 0.001, slippagePct: 0.001 };

export const PORTFOLIOS: { id: "balanced" | "aggressive"; name: string; startCashUsd: number; rules: Rules }[] = [
  {
    id: "balanced",
    name: "Balanced",
    startCashUsd: 1000,
    rules: {
      targetMix: { crypto: 0.3, us: 0.45, my: 0.15, cash: 0.1 },
      maxPosition: 0.2,
      maxSmallAlt: 0.05,
      stopLoss: 0.12,
      trailingStop: null,
      rebalance: "drift",
      driftBand: 0.05,
      leverage: 1,
      fees,
      myBoardLot: 100,
    },
  },
  {
    id: "aggressive",
    name: "Aggressive",
    startCashUsd: 1000,
    rules: {
      targetMix: { crypto: 0.6, us: 0.35, my: 0, cash: 0.05 },
      maxPosition: 0.3,
      maxSmallAlt: 0.1,
      stopLoss: 0.22,
      trailingStop: 0.15,
      rebalance: "weekly-momentum",
      driftBand: 0.1,
      leverage: 1,
      fees,
      myBoardLot: 100,
    },
  },
];

/** Benchmarks every portfolio is compared against. */
export const BENCHMARKS = [
  { id: "btc", name: "Hold BTC", weights: { "crypto:BTC": 1 } },
  { id: "voo", name: "Hold VOO", weights: { "us:VOO": 1 } },
  { id: "mix", name: "50/50 BTC + VOO", weights: { "crypto:BTC": 0.5, "us:VOO": 0.5 } },
] as const;
