"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Rules } from "@/config/portfolios";
import { buildPlan, type Sleeve, type Universe } from "@/lib/planner";
import { fmt, fmtPrice } from "@/lib/format";
import { Card, Stat } from "./ui";

const SLEEVES: { key: Sleeve | "cash"; label: string; color: string }[] = [
  { key: "crypto", label: "Crypto", color: "var(--series-1)" },
  { key: "us", label: "US stocks", color: "var(--series-2)" },
  { key: "my", label: "Bursa", color: "var(--series-3)" },
  { key: "cash", label: "Cash", color: "var(--axis)" },
];

export function Planner({ universe, profiles }: { universe: Universe; profiles: { id: "balanced" | "aggressive"; name: string; rules: Rules }[] }) {
  const [amount, setAmount] = useState(1000);
  const [ccy, setCcy] = useState<"USD" | "MYR">("USD");
  const [profileId, setProfileId] = useState<"balanced" | "aggressive">("balanced");
  const [markets, setMarkets] = useState<Record<Sleeve, boolean>>({ crypto: true, us: true, my: true });
  const [fractional, setFractional] = useState(true);

  const fx = universe.usdMyr ?? 4.2;
  const amountUsd = ccy === "USD" ? amount : amount / fx;
  const profile = profiles.find((p) => p.id === profileId)!;
  const plan = useMemo(
    () => buildPlan({ amountUsd: Math.max(0, amountUsd || 0), rules: profile.rules, markets, fractionalUs: fractional, style: profileId }, universe),
    [amountUsd, profile, markets, fractional, profileId, universe],
  );
  const show = (usd: number) => (ccy === "USD" ? fmt(usd, "price") : fmtPrice(usd * fx, "MYR"));
  const invested = plan.lines.reduce((a, l) => a + l.costUsd, 0);
  const bySleeve = (s: Sleeve | "cash") => (s === "cash" ? plan.cashUsd : plan.lines.filter((l) => l.sleeve === s).reduce((a, l) => a + l.costUsd + l.feeUsd, 0));
  const total = invested + plan.feesUsd + plan.cashUsd || 1;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Amount
          <span className="flex">
            <select
              value={ccy}
              onChange={(e) => setCcy(e.target.value as "USD" | "MYR")}
              aria-label="Currency"
              className="rounded-l border border-line bg-page px-2 py-1.5 text-sm text-ink"
            >
              <option value="USD">USD</option>
              <option value="MYR">MYR</option>
            </select>
            <input
              type="number"
              min={0}
              step={50}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-32 rounded-r border border-l-0 border-line bg-page px-2 py-1.5 text-lg font-semibold text-ink tabular outline-none focus:border-ink-2"
            />
          </span>
        </label>
        <fieldset className="flex flex-col gap-1 text-xs text-muted">
          <legend className="mb-1">Style</legend>
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfileId(p.id)}
                aria-pressed={profileId === p.id}
                className={`rounded-md px-3 py-1 text-sm ${profileId === p.id ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1 text-xs text-muted">
          <legend className="mb-1">Markets</legend>
          <div className="flex gap-1">
            {(["crypto", "us", "my"] as Sleeve[]).map((s) => (
              <button
                key={s}
                onClick={() => setMarkets({ ...markets, [s]: !markets[s] })}
                aria-pressed={markets[s]}
                className={`rounded border px-2 py-1 text-sm ${markets[s] ? "border-ink-2 text-ink" : "border-line text-muted"}`}
              >
                {markets[s] ? "✓ " : ""}
                {SLEEVES.find((x) => x.key === s)!.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={fractional} onChange={(e) => setFractional(e.target.checked)} />
          Fractional US shares
        </label>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invested" value={show(invested)} sub={<span className="text-ink-2">{plan.lines.length} positions</span>} />
        <Stat label="Kept as cash" value={show(plan.cashUsd)} note="Target cash plus anything that couldn't be placed" />
        <Stat label="Estimated fees" value={show(plan.feesUsd)} sub={<span className="text-ink-2">{fmt(plan.feesUsd / total, "pct").replace("+", "")} of the total</span>} />
        <Stat label="USD/MYR used" value={fx.toFixed(3)} />
      </div>

      <div>
        <div className="flex h-4 gap-0.5 overflow-hidden rounded" role="img" aria-label={SLEEVES.map((s) => `${s.label} ${Math.round((bySleeve(s.key) / total) * 100)}%`).join(", ")}>
          {SLEEVES.filter((s) => bySleeve(s.key) > 0.005).map((s) => (
            <div key={s.key} style={{ width: `${(bySleeve(s.key) / total) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {SLEEVES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.label} <span className="text-ink tabular">{show(bySleeve(s.key))}</span>
              <span className="tabular">({Math.round((bySleeve(s.key) / total) * 100)}%)</span>
            </span>
          ))}
        </div>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="px-4 py-2 text-left font-normal">Buy</th>
              <th className="px-4 py-2 text-left font-normal">Role</th>
              <th className="px-4 py-2 text-right font-normal">Quantity</th>
              <th className="px-4 py-2 text-right font-normal">Price</th>
              <th className="px-4 py-2 text-right font-normal">Cost</th>
              <th className="px-4 py-2 text-right font-normal">Fee</th>
              <th className="px-4 py-2 text-left font-normal">Why</th>
            </tr>
          </thead>
          <tbody>
            {plan.lines.map((l) => (
              <tr key={l.asset.id} className="border-t border-line align-top">
                <td className="px-4 py-2">
                  <Link href={`/asset/${encodeURIComponent(l.asset.id)}`} className="group">
                    <span className="mr-2 text-xs text-muted">{SLEEVES.find((s) => s.key === l.sleeve)!.label}</span>
                    <span className="font-medium group-hover:underline">{l.asset.symbol.replace(".KL", "")}</span>
                    <div className="text-xs text-ink-2">{l.asset.name}</div>
                  </Link>
                </td>
                <td className="px-4 py-2 text-ink-2">{l.role === "core" ? "Core" : "Pick"}</td>
                <td className="px-4 py-2 text-right tabular whitespace-nowrap">
                  {l.sleeve === "my" ? `${l.qty} (${l.qty / 100} lot${l.qty > 100 ? "s" : ""})` : l.qty < 1 ? l.qty.toPrecision(3) : +l.qty.toFixed(4)}
                </td>
                <td className="px-4 py-2 text-right tabular whitespace-nowrap">{fmtPrice(l.asset.price, l.asset.currency)}</td>
                <td className="px-4 py-2 text-right tabular whitespace-nowrap font-medium">{show(l.costUsd)}</td>
                <td className="px-4 py-2 text-right tabular whitespace-nowrap text-ink-2">{show(l.feeUsd)}</td>
                <td className="px-4 py-2">
                  <ul className="space-y-0.5 text-xs text-ink-2">
                    {l.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {l.asset.flags.slice(0, 1).map((w) => (
                      <li key={w} className="text-down">
                        <span className="sr-only">Risk: </span>! {w}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.lines.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-2">Amount too small to place any order (minimum $25 per position).</p>}
      </Card>

      {plan.notes.length > 0 && (
        <ul className="space-y-1 text-sm text-ink-2">
          {plan.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        A rules-based model allocation from today&apos;s scores, for learning and paper trading. Not personal financial advice. Fees approximate Moomoo Malaysia&apos;s
        published pricing and are not yet verified. Check fractional-share support and prices in the app before placing a real order.
      </p>
    </div>
  );
}
