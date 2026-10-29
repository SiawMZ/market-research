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
  fees: Fees;
  myBoardLot: number; // Bursa trades in lots of 100 shares
};

export type Fees = {
  usCommissionPct: number;
  usPlatformUsd: number; // per order
  usSettlementPerShareUsd: number; // capped at usSettlementCapPct of the trade
  usSettlementCapPct: number;
  myCommissionPct: number;
  myPlatformMyr: number; // per order
  myClearingPct: number;
  myStampPerThousandMyr: number; // RM1 per RM1,000 (or part of it)
  cryptoPct: number;
  slippagePct: number; // assumed price slippage on every fill
};

/**
 * Moomoo Malaysia fees after the 180-day new-user zero-commission promo (checked 30 Oct 2026 against
 * moomoo.com/my/pricing and 2026 third-party guides; the official page doesn't list platform/clearing fees).
 * Moomoo MY doesn't sell crypto, so crypto assumes a typical 0.1% exchange fee.
 */
const fees: Fees = {
  usCommissionPct: 0.0003,
  usPlatformUsd: 0.99,
  usSettlementPerShareUsd: 0.003,
  usSettlementCapPct: 0.01,
  myCommissionPct: 0.0003,
  myPlatformMyr: 3,
  myClearingPct: 0.0003,
  myStampPerThousandMyr: 1,
  cryptoPct: 0.001,
  slippagePct: 0.001,
};

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
