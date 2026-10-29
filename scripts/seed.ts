/**
 * Creates the two paper portfolios with their starting rulebooks. Safe to re-run.
 * A portfolio that hasn't traded yet gets its rules refreshed from config; once it has traded,
 * rules only change through the daily review (which logs every change).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
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
    const traded = await db.select({ id: schema.trades.id }).from(schema.trades).where(eq(schema.trades.portfolioId, p.id)).limit(1);
    if (traded.length === 0) {
      await db.update(schema.portfolios).set({ rules: p.rules }).where(eq(schema.portfolios.id, p.id));
      console.log(`portfolio ${p.id} ready (rules refreshed, no trades yet)`);
    } else {
      console.log(`portfolio ${p.id} ready (has trades; rules left as they are)`);
    }
  }
}

main();
