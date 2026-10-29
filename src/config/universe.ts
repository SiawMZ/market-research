/**
 * What we track. Crypto is taken live from CoinGecko's top coins by market cap;
 * stocks are a curated list (the screener in Phase 3 widens this).
 */

export const CRYPTO_TOP_N = 50;

/** Stablecoins and wrapped tokens add nothing to price analysis. */
export const CRYPTO_SKIP = new Set([
  "USDT", "USDC", "DAI", "FDUSD", "USDE", "TUSD", "PYUSD", "USDS", "USD1", "BUSD", "USDD", "RLUSD",
  "FRAX", "USDTB", "USDF", "USDG", "USD0", "BUIDL", "USYC", "SUSDE", "SUSDS", "BSC-USD",
  "WBTC", "WETH", "STETH", "WSTETH", "WEETH", "CBBTC", "RETH", "WBETH", "LBTC", "SOLVBTC", "JITOSOL",
  "BNSOL", "METH", "RSETH", "EZETH", "CLBTC", "XAUT", "PAXG",
]);

type StockDef = { symbol: string; kind: "stock" | "etf" | "index"; sector?: string };

export const US_STOCKS: StockDef[] = [
  // Index ETFs and benchmarks
  ...["SPY", "VOO", "QQQ", "IWM", "DIA", "SMH", "ARKK", "TLT", "GLD", "IBIT", "ETHA"].map((s) => ({ symbol: s, kind: "etf" as const })),
  // Mega caps and leaders
  ...[
    ["AAPL", "Tech"], ["MSFT", "Tech"], ["NVDA", "Semis"], ["GOOGL", "Comms"], ["AMZN", "Consumer"], ["META", "Comms"],
    ["TSLA", "Consumer"], ["AVGO", "Semis"], ["BRK-B", "Financials"], ["JPM", "Financials"], ["V", "Financials"],
    ["MA", "Financials"], ["LLY", "Health"], ["UNH", "Health"], ["XOM", "Energy"], ["COST", "Staples"], ["NFLX", "Comms"],
    // Growth and high beta (aggressive candidates)
    ["AMD", "Semis"], ["PLTR", "Tech"], ["ORCL", "Tech"], ["CRM", "Tech"], ["ADBE", "Tech"], ["MU", "Semis"], ["TSM", "Semis"],
    ["ASML", "Semis"], ["ARM", "Semis"], ["SMCI", "Tech"], ["COIN", "Financials"], ["MSTR", "Tech"], ["HOOD", "Financials"],
    ["SHOP", "Tech"], ["UBER", "Tech"], ["SOFI", "Financials"], ["NU", "Financials"], ["RKLB", "Industrials"], ["IONQ", "Tech"],
    ["CRWD", "Tech"], ["PANW", "Tech"], ["NET", "Tech"], ["DDOG", "Tech"], ["SNOW", "Tech"],
    // Value and defensives
    ["KO", "Staples"], ["PG", "Staples"], ["JNJ", "Health"], ["PFE", "Health"], ["BAC", "Financials"], ["CVX", "Energy"],
    ["DIS", "Comms"], ["NKE", "Consumer"], ["INTC", "Semis"], ["PYPL", "Financials"],
  ].map(([symbol, sector]) => ({ symbol, kind: "stock" as const, sector })),
];

/** Bursa Malaysia, Yahoo codes. Roughly the FBM KLCI plus a few liquid mid caps. */
export const MY_STOCKS: StockDef[] = [
  ["1155.KL", "Financials"], // Maybank
  ["1295.KL", "Financials"], // Public Bank
  ["1023.KL", "Financials"], // CIMB
  ["5819.KL", "Financials"], // Hong Leong Bank
  ["1066.KL", "Financials"], // RHB
  ["1015.KL", "Financials"], // AMMB
  ["5347.KL", "Utilities"], // Tenaga
  ["6742.KL", "Utilities"], // YTL Power
  ["4677.KL", "Utilities"], // YTL Corp
  ["5225.KL", "Health"], // IHH
  ["6947.KL", "Comms"], // CelcomDigi
  ["6012.KL", "Comms"], // Maxis
  ["4863.KL", "Comms"], // Telekom Malaysia
  ["5183.KL", "Materials"], // Petronas Chemicals
  ["6033.KL", "Utilities"], // Petronas Gas
  ["5681.KL", "Energy"], // Petronas Dagangan
  ["8869.KL", "Materials"], // Press Metal
  ["1961.KL", "Plantation"], // IOI Corp
  ["2445.KL", "Plantation"], // KLK
  ["5285.KL", "Plantation"], // SD Guthrie
  ["4197.KL", "Industrials"], // Sime Darby
  ["3816.KL", "Industrials"], // MISC
  ["4707.KL", "Staples"], // Nestle Malaysia
  ["7084.KL", "Staples"], // QL Resources
  ["4065.KL", "Staples"], // PPB
  ["3182.KL", "Consumer"], // Genting
  ["4715.KL", "Consumer"], // Genting Malaysia
  ["5398.KL", "Industrials"], // Gamuda
  ["5211.KL", "Property"], // Sunway
  ["5296.KL", "Consumer"], // MR DIY
  ["0166.KL", "Tech"], // Inari
  ["0097.KL", "Tech"], // ViTrox
  ["0138.KL", "Tech"], // MyEG
  ["7113.KL", "Health"], // Top Glove
].map(([symbol, sector]) => ({ symbol, kind: "stock" as const, sector }));

/** Macro context: indices, rates, dollar, commodities, MYR. Stored as market "us" kind "index". */
export const MACRO_TICKERS: { symbol: string; name: string }[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^VIX", name: "VIX volatility index" },
  { symbol: "^TNX", name: "US 10Y yield" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index" },
  { symbol: "GC=F", name: "Gold futures" },
  { symbol: "CL=F", name: "WTI crude futures" },
  { symbol: "^KLSE", name: "FBM KLCI" },
  { symbol: "MYR=X", name: "USD/MYR" },
];
