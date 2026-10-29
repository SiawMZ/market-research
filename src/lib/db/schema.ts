import {
  pgTable,
  text,
  date,
  doublePrecision,
  jsonb,
  timestamp,
  integer,
  serial,
  boolean,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// ---------- Market data ----------

/** Every tradable thing we track. id = "<market>:<symbol>", e.g. "crypto:BTC", "us:AAPL", "my:1155.KL". */
export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  market: text("market", { enum: ["crypto", "us", "my"] }).notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  kind: text("kind", { enum: ["coin", "stock", "etf", "index"] }).notNull(),
  sector: text("sector"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Daily OHLCV candles. */
export const pricesDaily = pgTable(
  "prices_daily",
  {
    assetId: text("asset_id").notNull().references(() => assets.id),
    date: date("date").notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.date] })],
);

/** Daily snapshot of valuation and size numbers, used by the screener. */
export const fundamentals = pgTable(
  "fundamentals",
  {
    assetId: text("asset_id").notNull().references(() => assets.id),
    date: date("date").notNull(),
    marketCap: doublePrecision("market_cap"),
    peTrailing: doublePrecision("pe_trailing"),
    peForward: doublePrecision("pe_forward"),
    priceToBook: doublePrecision("price_to_book"),
    dividendYield: doublePrecision("dividend_yield"),
    high52w: doublePrecision("high_52w"),
    low52w: doublePrecision("low_52w"),
    avgVolume3m: doublePrecision("avg_volume_3m"),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.date] })],
);

/** Perpetual-futures leverage data: funding rate and open interest. */
export const derivatives = pgTable(
  "derivatives",
  {
    symbol: text("symbol").notNull(),
    date: date("date").notNull(),
    venue: text("venue").notNull(),
    fundingRate: doublePrecision("funding_rate"),
    openInterestUsd: doublePrecision("open_interest_usd"),
    markPrice: doublePrecision("mark_price"),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date, t.venue] })],
);

/** Spot ETF net flows in USD millions, per day. */
export const etfFlows = pgTable(
  "etf_flows",
  {
    asset: text("asset", { enum: ["BTC", "ETH", "SOL"] }).notNull(),
    date: date("date").notNull(),
    totalUsdM: doublePrecision("total_usd_m").notNull(),
    byIssuer: jsonb("by_issuer").$type<Record<string, number>>(),
  },
  (t) => [primaryKey({ columns: [t.asset, t.date] })],
);

/**
 * Generic daily series: fear & greed, stablecoin supply, BTC dominance, yields...
 * key examples: "crypto_fear_greed", "stock_fear_greed", "stablecoin_supply_usd", "btc_dominance".
 */
export const metrics = pgTable(
  "metrics",
  {
    key: text("key").notNull(),
    date: date("date").notNull(),
    value: doublePrecision("value").notNull(),
    label: text("label"),
  },
  (t) => [primaryKey({ columns: [t.key, t.date] })],
);

/** Macro calendar: CPI, FOMC, payrolls... */
export const macroEvents = pgTable(
  "macro_events",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    country: text("country").notNull(),
    title: text("title").notNull(),
    impact: text("impact"),
    forecast: text("forecast"),
    previous: text("previous"),
    actual: text("actual"),
  },
  (t) => [index("macro_events_at_idx").on(t.at)],
);

/** Insider buys and sells (US Form 4), our stock-side "whale" signal. */
export const insiderTrades = pgTable(
  "insider_trades",
  {
    id: text("id").primaryKey(),
    filedAt: timestamp("filed_at", { withTimezone: true }).notNull(),
    tradeDate: date("trade_date").notNull(),
    ticker: text("ticker").notNull(),
    company: text("company"),
    insider: text("insider").notNull(),
    title: text("title"),
    type: text("type").notNull(),
    price: doublePrecision("price"),
    qty: doublePrecision("qty"),
    valueUsd: doublePrecision("value_usd"),
  },
  (t) => [index("insider_trades_ticker_idx").on(t.ticker)],
);

// ---------- Sentiment and whales ----------

/** Social attention: Reddit mention counts (ApeWisdom) and CoinGecko's trending list. */
export const socialMentions = pgTable(
  "social_mentions",
  {
    source: text("source").notNull(), // "apewisdom" | "coingecko-trending"
    ticker: text("ticker").notNull(),
    date: date("date").notNull(),
    name: text("name"),
    rank: integer("rank").notNull(),
    mentions: integer("mentions"),
    mentions24hAgo: integer("mentions_24h_ago"),
    upvotes: integer("upvotes"),
  },
  (t) => [primaryKey({ columns: [t.source, t.ticker, t.date] })],
);

/** Recent headlines per tracked asset, with a simple keyword sentiment score from -1 to 1. */
export const news = pgTable(
  "news",
  {
    id: text("id").primaryKey(), // article link
    assetId: text("asset_id").notNull().references(() => assets.id),
    title: text("title").notNull(),
    source: text("source"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    score: doublePrecision("score").notNull(),
  },
  (t) => [index("news_asset_idx").on(t.assetId, t.publishedAt)],
);

/** Daily net flows into each centralised exchange (DefiLlama). Outflows usually mean coins moving to self-custody. */
export const exchangeFlows = pgTable(
  "exchange_flows",
  {
    exchange: text("exchange").notNull(),
    date: date("date").notNull(),
    assetsUsd: doublePrecision("assets_usd"),
    inflow24hUsd: doublePrecision("inflow_24h_usd"),
    inflow1wUsd: doublePrecision("inflow_1w_usd"),
    inflow1mUsd: doublePrecision("inflow_1m_usd"),
  },
  (t) => [primaryKey({ columns: [t.exchange, t.date] })],
);

/** Superinvestor 13F moves for the latest quarter (Dataroma): each manager's top buys and sells. */
export const fundMoves = pgTable(
  "fund_moves",
  {
    period: text("period").notNull(), // e.g. "Q2 2026"
    manager: text("manager").notNull(),
    ticker: text("ticker").notNull(),
    company: text("company"),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    action: text("action").notNull(), // "Buy", "Add 69.37%", "Reduce -83.61%", "Sell"
    portfolioChangePct: doublePrecision("portfolio_change_pct"),
    collectedAt: date("collected_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.period, t.manager, t.ticker] })],
);

// ---------- Paper portfolios ----------

export const portfolios = pgTable("portfolios", {
  id: text("id").primaryKey(), // "balanced" | "aggressive"
  name: text("name").notNull(),
  startCashUsd: doublePrecision("start_cash_usd").notNull(),
  startedAt: date("started_at").notNull(),
  rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
});

export const trades = pgTable(
  "trades",
  {
    id: serial("id").primaryKey(),
    portfolioId: text("portfolio_id").notNull().references(() => portfolios.id),
    at: timestamp("at", { withTimezone: true }).notNull(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    qty: doublePrecision("qty").notNull(),
    priceUsd: doublePrecision("price_usd").notNull(),
    feeUsd: doublePrecision("fee_usd").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [index("trades_portfolio_idx").on(t.portfolioId)],
);

export const snapshots = pgTable(
  "portfolio_snapshots",
  {
    portfolioId: text("portfolio_id").notNull().references(() => portfolios.id),
    date: date("date").notNull(),
    equityUsd: doublePrecision("equity_usd").notNull(),
    cashUsd: doublePrecision("cash_usd").notNull(),
    holdings: jsonb("holdings").$type<{ assetId: string; qty: number; valueUsd: number }[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.date] })],
);

/** The daily review: what changed, why, and any rule amendments. */
export const journal = pgTable("journal", {
  id: serial("id").primaryKey(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id),
  date: date("date").notNull(),
  author: text("author", { enum: ["engine", "review"] }).notNull().default("engine"),
  summary: text("summary").notNull(),
  ruleChanges: jsonb("rule_changes").$type<{ rule: string; from: unknown; to: unknown; why: string }[]>(),
});

// ---------- Ops ----------

export const collectorRuns = pgTable("collector_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  ok: boolean("ok").notNull(),
  rows: integer("rows").notNull(),
  error: text("error"),
});
