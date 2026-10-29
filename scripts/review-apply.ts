/**
 * Saves the AI review: one journal entry per portfolio, plus any rule changes that pass the guardrails.
 * Rejected changes are reported and recorded in the journal entry, never applied.
 *
 *   npm run review:apply -- path/to/review.json
 *   npm run review:apply -- path/to/review.json --dry
 *
 * review.json: { "entries": [{ "portfolioId": "balanced", "summary": "...", "ruleChanges": [{ "rule": "stopLoss", "to": 0.1, "why": "..." }] }] }
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { Rules } from "@/config/portfolios";
import { getDb, schema } from "@/lib/db/client";
import { today } from "@/collectors/core";
import { ReviewInput, applyChange, checkChange } from "@/lib/guardrails";

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const dry = process.argv.includes("--dry");
  if (!file) throw new Error("Usage: npm run review:apply -- review.json [--dry]");
  const input = ReviewInput.parse(JSON.parse(readFileSync(file, "utf8")));
  const db = getDb();
  const date = today();

  for (const e of input.entries) {
    const [port] = await db.select().from(schema.portfolios).where(eq(schema.portfolios.id, e.portfolioId));
    if (!port) throw new Error(`No portfolio ${e.portfolioId}`);
    const existing = await db.select().from(schema.journal).where(eq(schema.journal.portfolioId, e.portfolioId));
    if (existing.some((j) => j.author === "review" && j.date === date)) {
      console.log(`${e.portfolioId}: a review for ${date} already exists, skipping.`);
      continue;
    }
    const lastChanged = new Map<string, string>();
    for (const j of existing) for (const c of j.ruleChanges ?? []) if ((lastChanged.get(c.rule) ?? "") < j.date) lastChanged.set(c.rule, j.date);

    let rules = port.rules as Rules;
    const applied: { rule: string; from: unknown; to: unknown; why: string }[] = [];
    const rejected: string[] = [];
    for (const c of e.ruleChanges) {
      const problem = checkChange(c, rules, e.portfolioId, lastChanged, date);
      if (problem) {
        rejected.push(`${c.rule}: ${problem}`);
        continue;
      }
      applied.push({ rule: c.rule, from: rules[c.rule], to: c.to, why: c.why });
      rules = applyChange(rules, c);
      lastChanged.set(c.rule, date);
    }

    const summary = rejected.length ? `${e.summary}\n\nRule changes rejected by the guardrails: ${rejected.join(" ")}` : e.summary;
    console.log(`${e.portfolioId}: ${applied.length} rule change(s) applied, ${rejected.length} rejected.`);
    for (const r of rejected) console.log(`  rejected ${r}`);
    if (!dry) {
      if (applied.length) await db.update(schema.portfolios).set({ rules }).where(eq(schema.portfolios.id, e.portfolioId));
      await db.insert(schema.journal).values({ portfolioId: e.portfolioId, date, author: "review", summary, ruleChanges: applied.length ? applied : null });
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
