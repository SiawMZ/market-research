/**
 * Runs the data collectors.
 *
 *   npm run collect                  # all collectors, writes to DATABASE_URL
 *   npm run collect -- --dry         # fetch and validate only, print what would be written
 *   npm run collect -- stocks insiders   # only collectors whose name contains these words
 */
import "dotenv/config";
import { getDb, schema } from "@/lib/db/client";
import { upsert, type Collector } from "@/collectors/core";
import { btcEtfFlows, cryptoDerivatives, cryptoFearGreed, cryptoMarket, stablecoins } from "@/collectors/crypto";
import { stockMarket } from "@/collectors/stocks";
import { insiders, macroCalendar } from "@/collectors/macro";
import { cexFlows, newsHeadlines, social, superinvestors } from "@/collectors/sentiment";

// Order matters: news picks its assets from the social ranking and the portfolios' holdings.
const ALL: Collector[] = [
  cryptoMarket, cryptoFearGreed, stablecoins, cryptoDerivatives, btcEtfFlows, stockMarket, macroCalendar, insiders,
  social, cexFlows, superinvestors, newsHeadlines,
];

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry") || !process.env.DATABASE_URL;
  const filters = args.filter((a) => !a.startsWith("--"));
  const selected = filters.length ? ALL.filter((c) => filters.some((f) => c.name.includes(f))) : ALL;
  if (dry) console.log(process.env.DATABASE_URL ? "Dry run: nothing is written." : "No DATABASE_URL: dry run, nothing is written.");

  const db = dry ? null : getDb();
  let failures = 0;

  for (const c of selected) {
    const startedAt = new Date();
    console.log(`\n▶ ${c.name}: ${c.description}`);
    try {
      const batches = await c.run();
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
  process.exit(failures ? 1 : 0);
}

main();
