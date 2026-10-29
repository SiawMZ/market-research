import { z } from "zod";
import { desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assets, exchangeFlows, fundMoves, metrics, news, snapshots, socialMentions } from "@/lib/db/schema";
import { batch, fetchJson, fetchText, sleep, today, type Collector } from "./core";

const BROWSER = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

// ---------- Social attention ----------

const ApeWisdom = z.object({
  results: z.array(
    z.object({
      rank: z.number(),
      ticker: z.string(),
      name: z.string(),
      mentions: z.coerce.number().nullable(),
      upvotes: z.coerce.number().nullable(),
      mentions_24h_ago: z.coerce.number().nullable(),
    }),
  ),
});

const Trending = z.object({
  coins: z.array(z.object({ item: z.object({ symbol: z.string(), name: z.string(), score: z.number() }) })),
});

/** Reddit mention counts for US stocks (ApeWisdom, top 200) and CoinGecko's trending coins. */
export const social: Collector = {
  name: "social",
  description: "Reddit stock mentions (ApeWisdom) + CoinGecko trending coins",
  async run() {
    const date = today();
    const pages = await Promise.all([1, 2].map((p) => fetchJson(`https://apewisdom.io/api/v1.0/filter/all-stocks/page/${p}`, ApeWisdom, { headers: BROWSER })));
    const trending = await fetchJson("https://api.coingecko.com/api/v3/search/trending", Trending);
    const seen = new Set<string>();
    const stockRows = pages
      .flatMap((p) => p.results)
      .filter((r) => !seen.has(r.ticker) && seen.add(r.ticker))
      .map((r) => ({
        source: "apewisdom",
        ticker: r.ticker,
        date,
        name: r.name,
        rank: r.rank,
        mentions: r.mentions,
        mentions24hAgo: r.mentions_24h_ago,
        upvotes: r.upvotes,
      }));
    const coinRows = trending.coins.map((c) => ({ source: "coingecko-trending", ticker: c.item.symbol.toUpperCase(), date, name: c.item.name, rank: c.item.score + 1 }));
    return [batch("social_mentions", socialMentions, ["source", "ticker", "date"], [...stockRows, ...coinRows])];
  },
};

// ---------- News ----------

/*
 * Crude but transparent headline scoring: count finance words that usually mean good or bad news.
 * Score = (positive - negative) / (positive + negative), so -1..1, and 0 when no word matches.
 * The daily AI review also reads the headlines themselves, which is the better judge.
 */
const POSITIVE = [
  "beat", "beats", "surge", "surges", "soar", "soars", "jump", "jumps", "rally", "rallies", "record", "upgrade", "upgraded",
  "outperform", "bullish", "raises", "raised", "gain", "gains", "strong", "growth", "profit", "wins", "approval", "approved",
  "buyback", "dividend", "partnership", "expands", "boost", "rebound", "rises", "climbs", "higher", "inflow", "inflows",
];
const NEGATIVE = [
  "miss", "misses", "plunge", "plunges", "fall", "falls", "drop", "drops", "slump", "slumps", "downgrade", "downgraded",
  "underperform", "bearish", "cut", "cuts", "loss", "losses", "weak", "lawsuit", "probe", "investigation", "fraud", "recall",
  "layoffs", "warning", "warns", "sell-off", "selloff", "lower", "decline", "declines", "outflow", "outflows", "hack", "hacked", "crash",
];
const POS = new Set(POSITIVE);
const NEG = new Set(NEGATIVE);

export function headlineScore(title: string) {
  const words = title.toLowerCase().match(/[a-z-]+/g) ?? [];
  const p = words.filter((w) => POS.has(w)).length;
  const n = words.filter((w) => NEG.has(w)).length;
  return p + n === 0 ? 0 : (p - n) / (p + n);
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function parseRss(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap((m) => {
    const item = m[1];
    const rawTitle = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const pub = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const source = decode(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
    if (!rawTitle || !link || !pub) return [];
    // Google appends " - Source" to every title; drop it.
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    return [{ title, link, source: source || null, publishedAt: new Date(pub) }];
  });
}

/** Names headlines actually use when they differ from the listed company name. */
const ALIASES: Record<string, string[]> = {
  "my:1155.KL": ["maybank"],
  "my:5347.KL": ["tenaga", "tnb"],
  "my:1295.KL": ["public bank", "pbbank"],
  "my:1023.KL": ["cimb"],
  "my:5819.KL": ["hong leong bank", "hlbank"],
  "my:6947.KL": ["celcomdigi"],
  "my:5183.KL": ["petronas chemicals", "pchem"],
  "my:6033.KL": ["petronas gas", "petgas"],
  "my:5285.KL": ["sd guthrie", "sime darby plantation"],
  "us:GOOGL": ["google", "alphabet"],
  "us:META": ["meta", "facebook"],
  "us:BRK-B": ["berkshire"],
};
const NAME_NOISE = /\b(inc|corp|corporation|company|co|holdings?|group|berhad|bhd|ltd|limited|plc|class [a-z]|the|trust|etf)\b\.?/g;

/** Google News matches loosely; keep only headlines that name the asset (symbol, company name or a known alias). */
function mentions(a: typeof assets.$inferSelect, title: string) {
  const t = ` ${title.toLowerCase()} `;
  const sym = a.symbol.replace(".KL", "").toLowerCase();
  const nameWords = a.name.toLowerCase().replace(NAME_NOISE, " ").replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/);
  const keys = [
    ...(ALIASES[a.id] ?? []),
    /[a-z]/.test(sym) && sym.length >= 2 ? sym : null, // Bursa codes are numbers; headlines never use them
    nameWords.slice(0, 2).join(" "),
    nameWords[0]?.length >= 4 ? nameWords[0] : null,
  ].filter((k): k is string => !!k);
  return keys.some((k) => new RegExp(`[^a-z0-9]${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`).test(t));
}

/** The assets worth fetching news for: both portfolios' holdings, the majors, and the most-discussed tracked US stocks. */
async function newsUniverse() {
  const db = getDb();
  const KEY = ["crypto:BTC", "crypto:ETH", "crypto:SOL", "us:SPY", "us:NVDA", "us:AAPL", "us:MSFT", "my:1155.KL", "my:1295.KL", "my:5347.KL"];
  const snaps = await db.select().from(snapshots).orderBy(desc(snapshots.date)).limit(4);
  const held = snaps.flatMap((s) => s.holdings.map((h) => h.assetId));
  const buzz = await db.execute<{ id: string }>(
    sql`select a.id from ${socialMentions} m join ${assets} a on a.market = 'us' and a.symbol = m.ticker
        where m.source = 'apewisdom' and m.date = (select max(date) from ${socialMentions} where source = 'apewisdom')
        order by m.rank limit 8`,
  );
  const ids = [...new Set([...held, ...KEY, ...buzz.rows.map((r) => r.id)])];
  return ids.length ? db.select().from(assets).where(inArray(assets.id, ids)) : [];
}

export const newsHeadlines: Collector = {
  name: "news",
  description: "Recent headlines per key asset (Google News), keyword-scored",
  async run() {
    const list = await newsUniverse();
    const cutoff = Date.now() - 3 * 86_400_000;
    const rows: (typeof news.$inferInsert)[] = [];
    const failed: string[] = [];
    for (const a of list) {
      const q =
        a.market === "crypto"
          ? `${a.name} crypto`
          : a.market === "my"
            ? `${ALIASES[a.id]?.[0] ?? a.name.replace(/\s+(Berhad|Bhd\.?)$/i, "")} stock`
            : a.kind === "etf"
              ? `${a.symbol} ETF`
              : `${a.symbol} stock`;
      const region = a.market === "my" ? "hl=en-MY&gl=MY&ceid=MY:en" : "hl=en-US&gl=US&ceid=US:en";
      try {
        const xml = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${region}`, { headers: BROWSER });
        const items = parseRss(xml)
          .filter((i) => i.publishedAt.getTime() >= cutoff && mentions(a, i.title))
          .sort((x, y) => y.publishedAt.getTime() - x.publishedAt.getTime())
          .slice(0, 8);
        for (const i of items) rows.push({ id: i.link, assetId: a.id, title: i.title, source: i.source, publishedAt: i.publishedAt, score: headlineScore(i.title) });
      } catch {
        failed.push(a.symbol);
      }
      await sleep(400);
    }
    if (failed.length) console.log(`  no news fetched for: ${failed.join(", ")}`);
    // The same article can come back for two queries; keep the first.
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
    return [batch("news", news, ["id"], unique)];
  },
};

// ---------- Exchange flows ----------

const Cexs = z.object({
  cexs: z.array(
    z.object({
      name: z.string(),
      cleanAssetsTvl: z.number().nullable().optional(),
      inflows_24h: z.number().nullable().optional(),
      inflows_1w: z.number().nullable().optional(),
      inflows_1m: z.number().nullable().optional(),
    }),
  ),
});

/** Net flows into centralised exchanges (DefiLlama). Large outflows usually mean coins going to self-custody (holding); inflows can precede selling. */
export const cexFlows: Collector = {
  name: "exchange-flows",
  description: "Centralised exchange net flows (DefiLlama)",
  async run() {
    const date = today();
    const res = await fetchJson("https://api.llama.fi/cexs", Cexs);
    const rows = res.cexs
      .filter((c) => (c.cleanAssetsTvl ?? 0) > 500_000_000)
      .map((c) => ({ exchange: c.name, date, assetsUsd: c.cleanAssetsTvl ?? null, inflow24hUsd: c.inflows_24h ?? null, inflow1wUsd: c.inflows_1w ?? null, inflow1mUsd: c.inflows_1m ?? null }));
    const sum = (k: "inflow24hUsd" | "inflow1wUsd") => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
    return [
      batch("exchange_flows", exchangeFlows, ["exchange", "date"], rows),
      batch("metrics", metrics, ["key", "date"], [
        { key: "cex_netflow_24h_usd", date, value: sum("inflow24hUsd") },
        { key: "cex_netflow_1w_usd", date, value: sum("inflow1wUsd") },
      ]),
    ];
  },
};

// ---------- Superinvestor 13F moves ----------

/** Parses Dataroma's "all activity" grid: one row per manager, with up to ten buy/sell cells. */
function parseDataroma(html: string, collectedAt: string) {
  const body = html.slice(html.indexOf('<table id="grid">'), html.indexOf("</table>", html.indexOf('<table id="grid">')));
  if (!body) throw new Error("Dataroma grid not found; page layout may have changed");
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((tr) => {
    const row = tr[1];
    const manager = row.match(/<td class="firm"><a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
    const period = row.match(/<td class="period">([^<]+)<\/td>/)?.[1]?.trim();
    if (!manager || !period) return [];
    return [...row.matchAll(/<a class="(buy|sell)" href="[^"]*sym=([^&"]+)[^"]*">[^<]*<\/a>\s*<div>([^<]*)<br\/>([^<]*)<br\/>Change to portfolio:\s*([-\d.]+)%/g)].map((m) => ({
      period,
      manager: decode(manager),
      ticker: m[2],
      company: decode(m[3]),
      side: m[1] as "buy" | "sell",
      action: decode(m[4]),
      portfolioChangePct: Number(m[5]),
      collectedAt,
    }));
  });
}

export const superinvestors: Collector = {
  name: "superinvestors",
  description: "Superinvestor 13F buys and sells, latest quarter (Dataroma)",
  async run() {
    const date = today();
    const html = await fetchText("https://www.dataroma.com/m/allact.php?typ=a", { headers: BROWSER });
    const rows = parseDataroma(html, date);
    if (rows.length === 0) throw new Error("Parsed no rows from Dataroma");
    const periods = [...new Set(rows.map((r) => r.period))];
    console.log(`  periods: ${periods.join(", ")}`);
    return [batch("fund_moves", fundMoves, ["period", "manager", "ticker"], rows)];
  },
};
