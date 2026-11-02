/**
 * Runs the data collectors.
 *
 *   npm run collect                  # all collectors, writes to DATABASE_URL
 *   npm run collect -- --dry         # fetch and validate only, print what would be written
 *   npm run collect -- stocks insiders   # only collectors whose name contains these words
 *   npm run collect -- --refresh     # light hourly refresh of whatever is trading now (--at=<ISO time> to test the clock)
 */
import "dotenv/config";
import { getDb, schema } from "@/lib/db/client";
import { upsert, type Collector, type RunOpts } from "@/collectors/core";
import { btcEtfFlows, cryptoDerivatives, cryptoFearGreed, cryptoMarket, stablecoins } from "@/collectors/crypto";
import { stockMarket } from "@/collectors/stocks";
import { insiders, macroCalendar } from "@/collectors/macro";
import { cexFlows, newsHeadlines, social, superinvestors } from "@/collectors/sentiment";

// Order matters: news picks its assets from the social ranking and the portfolios' holdings.
const ALL: Collector[] = [
  cryptoMarket, cryptoFearGreed, stablecoins, cryptoDerivatives, btcEtfFlows, stockMarket, macroCalendar, insiders,
  social, cexFlows, superinvestors, newsHeadlines,
];

/** What the hourly refresh collects at a given time. Stocks only during their sessions, on weekdays (UTC hours). */
function refreshPlan(now: Date): { collectors: Collector[]; opts: RunOpts } {
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const weekday = day >= 1 && day <= 5;
  const markets: ("us" | "my")[] = [];
  if (weekday && hour >= 1 && hour <= 9) markets.push("my"); // Bursa 09:00-17:00 Malaysia time
  if (weekday && hour >= 13 && hour <= 21) markets.push("us"); // covers the US session in summer and winter time
  const collectors = [cryptoMarket, cryptoDerivatives, cexFlows];
  if (markets.length) collectors.push(stockMarket);
  if (hour % 6 === 0) collectors.push(social, newsHeadlines);
  return { collectors, opts: { light: true, markets } };
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const at = args.find((a) => a.startsWith("--at="))?.slice(5);
  const plan = refresh ? refreshPlan(at ? new Date(at) : new Date()) : null;
  const dry = args.includes("--dry") || !process.env.DATABASE_URL;
  const filters = args.filter((a) => !a.startsWith("--"));
  const selected = plan ? plan.collectors : filters.length ? ALL.filter((c) => filters.some((f) => c.name.includes(f))) : ALL;
  if (dry) console.log(process.env.DATABASE_URL ? "Dry run: nothing is written." : "No DATABASE_URL: dry run, nothing is written.");

  const db = dry ? null : getDb();
  let failures = 0;

  for (const c of selected) {
    const startedAt = new Date();
    console.log(`\n▶ ${c.name}: ${c.description}`);
    try {
      const batches = await c.run(plan?.opts);
      let rows = 0;
      for (const b of batches) {
        rows += b.rows.length;
        console.log(`  ${b.label}: ${b.rows.length} rows`);
        if (dry) {
          if (b.rows[0]) console.log(`    e.g. ${JSON.stringify(b.rows.at(-1)).slice(0, 220)}`);
        } else {
          await upsert(db!, b);
        }
      }
      if (db) await db.insert(schema.collectorRuns).values({ name: c.name, startedAt, ok: true, rows });
      console.log(`  ✓ ${rows} rows in ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`);
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${msg}`);
      if (db) await db.insert(schema.collectorRuns).values({ name: c.name, startedAt, ok: false, rows: 0, error: msg.slice(0, 2000) });
    }
  }

  console.log(`\nDone: ${selected.length - failures}/${selected.length} collectors succeeded.`);
  // A refresh that partly fails just tries again next hour; the failure is in collector_runs. Only flag a total failure.
  process.exit(failures && (!refresh || failures === selected.length) ? 1 : 0);
}

main();
