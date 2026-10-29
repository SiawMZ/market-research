/**
 * Runs the paper-trading engine for both portfolios.
 *
 *   npm run daily            # trade, snapshot and journal for today (once per day; re-runs are skipped)
 *   npm run daily -- --dry   # show what it would do, write nothing
 */
import "dotenv/config";
import { runEngine } from "@/lib/engine";
import { fmt } from "@/lib/format";

async function main() {
  const dry = process.argv.includes("--dry");
  const results = await runEngine({ dry });
  for (const r of results) {
    console.log(`\n▶ ${r.portfolioId}${dry ? " (dry run)" : ""}`);
    if (r.skipped) {
      console.log(`  skipped: ${r.skipped}`);
      continue;
    }
    console.log(`  value ${fmt(r.equityBefore, "price")} → ${fmt(r.equityAfter, "price")}, cash ${fmt(r.cashAfter, "price")}`);
    console.log(r.summary.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
