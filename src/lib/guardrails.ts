import { z } from "zod";
import type { Rules } from "@/config/portfolios";

/*
 * What the daily AI review may change, and by how much. Anything outside these limits is rejected,
 * so a bad day of reasoning can't wreck a portfolio. Fees, board lots and leverage are never editable.
 */

export const COOLDOWN_DAYS = 7; // a rule can change at most once a week
export const MAX_CHANGES_PER_REVIEW = 2;
const MAX_MIX_STEP = 0.1; // each market's weight moves at most 10 points per change

type NumRule = "maxPosition" | "maxSmallAlt" | "stopLoss" | "driftBand";
export const NUMERIC_LIMITS: Record<NumRule, [number, number]> = {
  maxPosition: [0.1, 0.35],
  maxSmallAlt: [0.02, 0.15],
  stopLoss: [0.05, 0.3],
  driftBand: [0.03, 0.15],
};
const CRYPTO_CAP = { balanced: 0.4, aggressive: 0.7 } as const;

const Mix = z.object({ crypto: z.number(), us: z.number(), my: z.number(), cash: z.number() });

export const RuleChange = z.discriminatedUnion("rule", [
  z.object({ rule: z.enum(["maxPosition", "maxSmallAlt", "stopLoss", "driftBand"]), to: z.number(), why: z.string().min(20) }),
  z.object({ rule: z.literal("trailingStop"), to: z.number().nullable(), why: z.string().min(20) }),
  z.object({ rule: z.literal("targetMix"), to: Mix, why: z.string().min(20) }),
]);
export type RuleChange = z.infer<typeof RuleChange>;

export const ReviewInput = z.object({
  entries: z
    .array(
      z.object({
        portfolioId: z.enum(["balanced", "aggressive"]),
        summary: z.string().min(80).max(4000),
        ruleChanges: z.array(RuleChange).max(MAX_CHANGES_PER_REVIEW).default([]),
      }),
    )
    .min(1)
    .max(2),
});

/** Returns the reason a change is not allowed, or null if it's fine. */
export function checkChange(c: RuleChange, rules: Rules, portfolio: "balanced" | "aggressive", lastChanged: Map<string, string>, date: string): string | null {
  const last = lastChanged.get(c.rule);
  if (last && (Date.parse(date) - Date.parse(last)) / 86_400_000 < COOLDOWN_DAYS) {
    return `${c.rule} was changed on ${last}; rules can change at most once every ${COOLDOWN_DAYS} days.`;
  }
  if (c.rule === "targetMix") {
    const m = c.to;
    const sum = m.crypto + m.us + m.my + m.cash;
    if (Math.abs(sum - 1) > 0.001) return `targetMix must add up to 1 (got ${sum.toFixed(3)}).`;
    if (Object.values(m).some((v) => v < 0 || v > 0.8)) return "Each targetMix weight must be between 0 and 0.8.";
    if (m.cash < 0.03) return "Keep at least 3% cash.";
    if (m.crypto > CRYPTO_CAP[portfolio]) return `${portfolio} crypto weight is capped at ${CRYPTO_CAP[portfolio]}.`;
    for (const k of ["crypto", "us", "my", "cash"] as const) {
      if (Math.abs(m[k] - rules.targetMix[k]) > MAX_MIX_STEP + 1e-9) return `targetMix.${k} can move at most ${MAX_MIX_STEP * 100} points per change.`;
    }
    return null;
  }
  if (c.rule === "trailingStop") {
    if (c.to == null) return null;
    return c.to >= 0.08 && c.to <= 0.3 ? null : "trailingStop must be null or between 0.08 and 0.3.";
  }
  const [lo, hi] = NUMERIC_LIMITS[c.rule];
  return c.to >= lo && c.to <= hi ? null : `${c.rule} must be between ${lo} and ${hi}.`;
}

export function applyChange(rules: Rules, c: RuleChange): Rules {
  return { ...rules, [c.rule]: c.to } as Rules;
}
