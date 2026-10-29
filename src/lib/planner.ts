import type { Rules } from "@/config/portfolios";
import type { Scored } from "@/lib/scoring";

/*
 * "What would I buy with $X?" Turns a profile's rulebook plus the current scores into concrete orders.
 * Pure function: the planner page uses it, and the Phase 5 daily review will reuse it for the paper portfolios.
 */

export type Sleeve = "crypto" | "us" | "my";

export type PlanInput = {
  amountUsd: number;
  rules: Rules;
  markets: Record<Sleeve, boolean>;
  fractionalUs: boolean;
  style: "balanced" | "aggressive";
};

export type Universe = { crypto: Scored[]; us: Scored[]; my: Scored[]; etfs: Scored[]; usdMyr: number | null };

export type PlanLine = {
  asset: Scored;
  sleeve: Sleeve;
  role: "core" | "pick";
  qty: number;
  costUsd: number; // price × qty, in USD
  feeUsd: number;
  why: string[];
};

export type Plan = { lines: PlanLine[]; cashUsd: number; feesUsd: number; notes: string[]; sleeveTargets: Record<Sleeve | "cash", number> };

const MIN_TICKET_USD = 25;
const SMALL_AMOUNT_USD = 300;

const notDown = (r: Scored) => r.trend !== "Downtrend" && r.trend !== "—";
const byPotential = (a: Scored, b: Scored) => (b.potential ?? -1) - (a.potential ?? -1);
const byMomentumLed = (a: Scored, b: Scored) =>
  (b.factors.momentum ?? 0) * 0.6 + (b.potential ?? 0) * 0.4 - ((a.factors.momentum ?? 0) * 0.6 + (a.potential ?? 0) * 0.4);

export function buildPlan(input: PlanInput, u: Universe): Plan {
  const { amountUsd, rules, markets, style } = input;
  const notes: string[] = [];
  const fx = u.usdMyr ?? 4.2;
  const slip = rules.fees.slippagePct;

  // 1. Sleeve targets: drop disabled markets and share their weight across the enabled ones.
  const mix = { ...rules.targetMix };
  const enabled = (["crypto", "us", "my"] as Sleeve[]).filter((s) => markets[s]);
  if (!markets.my && mix.my > 0 && style === "balanced") notes.push("Bursa is off, so its share goes to the other markets.");
  const dropped = (["crypto", "us", "my"] as Sleeve[]).filter((s) => !markets[s]).reduce((a, s) => a + mix[s], 0);
  const keptTotal = enabled.reduce((a, s) => a + mix[s], 0);
  for (const s of ["crypto", "us", "my"] as Sleeve[]) {
    mix[s] = markets[s] ? (keptTotal > 0 ? mix[s] + (dropped * mix[s]) / keptTotal : 0) : 0;
  }
  if (keptTotal === 0) mix.cash = 1;
  const target = { crypto: amountUsd * mix.crypto, us: amountUsd * mix.us, my: amountUsd * mix.my, cash: amountUsd * mix.cash };
  // Small amounts: spreading thin would put every position under the minimum ticket or lose it to fees,
  // so keep to core holdings only and let one position exceed the usual size limit.
  const small = amountUsd < SMALL_AMOUNT_USD;
  if (small) notes.push(`Under $${SMALL_AMOUNT_USD}, the plan keeps to core holdings only so fees don't eat the returns. Position limits are relaxed.`);
  const cap = small ? amountUsd : rules.maxPosition * amountUsd;
  const lines: PlanLine[] = [];
  let leftover = target.cash;

  /**
   * Places one order from a budget. On success, anything not spent (position cap, rounding) goes to cash.
   * On failure nothing is recorded and the caller decides where the budget goes (retry or cash).
   */
  const add = (asset: Scored, sleeve: Sleeve, role: PlanLine["role"], budgetUsd: number, why: string[]) => {
    const budget = Math.min(budgetUsd, role === "pick" && sleeve === "crypto" ? rules.maxSmallAlt * amountUsd : cap);
    if (budget < MIN_TICKET_USD) return false;
    const priceUsd = asset.currency === "MYR" ? asset.price / fx : asset.price;
    let qty: number;
    let fee: number;
    if (sleeve === "my") {
      const lotUsd = priceUsd * rules.myBoardLot;
      const lots = Math.floor(budget / (lotUsd * (1 + slip) + rules.fees.myStockMinMyr / fx));
      if (lots < 1) return false;
      qty = lots * rules.myBoardLot;
      fee = Math.max(qty * priceUsd * rules.fees.myStockPct, rules.fees.myStockMinMyr / fx);
    } else if (sleeve === "us") {
      fee = rules.fees.usStockUsd;
      const raw = (budget - fee) / (priceUsd * (1 + slip));
      qty = input.fractionalUs ? Math.floor(raw * 10_000) / 10_000 : Math.floor(raw);
      if (qty <= 0) return false;
    } else {
      qty = budget / (priceUsd * (1 + slip) * (1 + rules.fees.cryptoPct));
      fee = qty * priceUsd * rules.fees.cryptoPct;
    }
    const cost = qty * priceUsd * (1 + slip);
    leftover += budgetUsd - cost - fee;
    lines.push({ asset, sleeve, role, qty, costUsd: cost, feeUsd: fee, why });
    return true;
  };

  // 2. Crypto: BTC/ETH core, then the best-scoring altcoins that aren't in a downtrend.
  if (target.crypto > 0) {
    const btc = u.crypto.find((r) => r.symbol === "BTC");
    const eth = u.crypto.find((r) => r.symbol === "ETH");
    const alts = u.crypto.filter((r) => r.symbol !== "BTC" && r.symbol !== "ETH" && notDown(r) && r.potential != null).sort(byPotential);
    const altCount = small ? 0 : style === "aggressive" ? 2 : 1;
    const weights = small ? { btc: 1, eth: 0 } : style === "aggressive" ? { btc: 0.4, eth: 0.25 } : { btc: 0.6, eth: 0.25 };
    const altBudget = altCount ? (target.crypto * (1 - weights.btc - weights.eth)) / altCount : 0;
    if (!btc || !add(btc, "crypto", "core", target.crypto * weights.btc, ["Core holding: the largest, most liquid crypto asset"])) leftover += target.crypto * weights.btc;
    if (weights.eth > 0 && (!eth || !add(eth, "crypto", "core", target.crypto * weights.eth, ["Core holding: second-largest network"]))) {
      leftover += target.crypto * weights.eth;
    }
    let placed = 0;
    for (const a of alts) {
      if (placed >= altCount) break;
      if (add(a, "crypto", "pick", altBudget, [`Top crypto score (${Math.round(a.potential!)})`, ...a.reasons.slice(0, 2)])) placed++;
    }
    leftover += Math.max(0, altCount - placed) * altBudget;
  }

  // 3. US: an index ETF core, then the best stocks (balanced: all-round score; aggressive: momentum-led).
  if (target.us > 0) {
    const coreSym = style === "aggressive" ? "QQQ" : "VOO";
    const core = u.etfs.find((r) => r.symbol === coreSym);
    const coreShare = small ? 1 : style === "aggressive" ? 0.3 : 0.5;
    if (core && !add(core, "us", "core", target.us * coreShare, [style === "aggressive" ? "Core: Nasdaq-100 growth index" : "Core: the S&P 500 in one fund"])) {
      leftover += target.us * coreShare;
    }
    const rest = target.us * (core ? 1 - coreShare : 1);
    const pool = u.us.filter((r) => notDown(r) && r.potential != null && !r.flags.includes("Loss-making")).sort(style === "aggressive" ? byMomentumLed : byPotential);
    const n = Math.max(1, Math.min(style === "aggressive" ? 4 : 3, Math.floor(rest / (MIN_TICKET_USD * 2))));
    let placed = 0;
    for (const s of pool) {
      if (placed >= n) break;
      if (add(s, "us", "pick", rest / n, [`Score ${Math.round(s.potential!)}`, ...s.reasons.slice(0, 2)])) placed++;
    }
    leftover += Math.max(0, n - placed) * (rest / n);
  }

  // 4. Bursa: whole lots of 100 shares only, so walk down the ranking until lots fit the budget.
  if (target.my > 0) {
    const pool = u.my.filter((r) => notDown(r) && r.potential != null).sort(byPotential);
    const n = Math.max(1, Math.min(3, Math.floor(target.my / 150)));
    let placed = 0;
    for (const s of pool) {
      if (placed >= n) break;
      if (add(s, "my", "pick", target.my / n, [`Score ${Math.round(s.potential!)}`, ...s.reasons.slice(0, 2)])) placed++;
    }
    leftover += Math.max(0, n - placed) * (target.my / n);
    if (placed < n) notes.push("Some Bursa picks didn't fit: one lot (100 shares) cost more than the budget, so that money stays in cash.");
  }

  const feesUsd = lines.reduce((a, l) => a + l.feeUsd, 0);
  if (lines.some((l) => l.feeUsd / (l.costUsd || 1) > 0.02)) notes.push("Some orders lose over 2% to fees. With small amounts, fewer and larger positions are cheaper.");
  if (!input.fractionalUs) notes.push("Whole US shares only: expensive stocks may not fit, leaving more cash.");
  return { lines, cashUsd: Math.max(0, leftover), feesUsd, notes, sleeveTargets: target };
}
