/** Creates the two paper portfolios with their starting rulebooks. Safe to re-run: existing portfolios are left alone. */
import "dotenv/config";
import { getDb, schema } from "@/lib/db/client";
import { PORTFOLIOS } from "@/config/portfolios";
import { today } from "@/collectors/core";

async function main() {
  const db = getDb();
  for (const p of PORTFOLIOS) {
    await db
      .insert(schema.portfolios)
      .values({ id: p.id, name: p.name, startCashUsd: p.startCashUsd, startedAt: today(), rules: p.rules })
      .onConflictDoNothing();
    console.log(`portfolio ${p.id} ready`);
  }
}

main();
