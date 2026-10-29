"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Scored } from "@/lib/scoring";
import { fmt, fmtPrice } from "@/lib/format";
import { Delta, TrendBadge } from "./ui";

type Market = "crypto" | "us" | "my";
type Filters = {
  markets: Market[];
  maxPe: number | null;
  minRoe: number | null; // fraction
  minDiv: number | null; // fraction
  minRevG: number | null; // fraction
  rsiMin: number | null;
  rsiMax: number | null;
  trend: "any" | "Uptrend" | "not-down" | "Downtrend";
  minVolRatio: number | null;
  maxFromHigh: number | null; // e.g. -0.3 = at least 30% below the 1Y high
  sort: "potential" | "undervalued" | "chg30d" | "rsi14" | "volumeRatio";
};

const BASE: Filters = {
  markets: ["crypto", "us", "my"],
  maxPe: null,
  minRoe: null,
  minDiv: null,
  minRevG: null,
  rsiMin: null,
  rsiMax: null,
  trend: "any",
  minVolRatio: null,
  maxFromHigh: null,
  sort: "potential",
};

const PRESETS: { id: string; label: string; hint: string; f: Partial<Filters> }[] = [
  { id: "all", label: "Everything", hint: "All tracked assets, best overall score first.", f: {} },
  { id: "value", label: "Undervalued", hint: "Stocks cheaper than peers on earnings, with decent profitability. Ranked by the undervalued score.", f: { markets: ["us", "my"], maxPe: 20, minRoe: 0.08, sort: "undervalued" } },
  { id: "quality", label: "Quality growth", hint: "High return on equity and growing revenue, not in a downtrend.", f: { markets: ["us", "my"], minRoe: 0.15, minRevG: 0.08, trend: "not-down" } },
  { id: "momentum", label: "Momentum", hint: "Established uptrends, strongest 30-day moves first.", f: { trend: "Uptrend", sort: "chg30d" } },
  { id: "dip", label: "Dip in uptrend", hint: "Short-term oversold (RSI under 40) while the long-term trend is up or mixed.", f: { rsiMax: 40, trend: "not-down", sort: "rsi14" } },
  { id: "volume", label: "Unusual volume", hint: "Trading at 2× or more its normal volume: something is happening.", f: { minVolRatio: 2, sort: "volumeRatio" } },
  { id: "income", label: "Dividends", hint: "Dividend yield of 4% or more.", f: { markets: ["us", "my"], minDiv: 0.04, sort: "undervalued" } },
  { id: "discount", label: "Deep discount", hint: "30% or more below the 1-year high, not in a downtrend. Turnarounds, or falling knives.", f: { maxFromHigh: -0.3, trend: "not-down" } },
];

const MARKET_LABEL: Record<Market, string> = { crypto: "Crypto", us: "US", my: "Bursa" };

function NumInput({ label, value, onChange, suffix, step = 1 }: { label: string; value: number | null; onChange: (v: number | null) => void; suffix?: string; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-20 rounded border border-line bg-page px-2 py-1 text-sm text-ink tabular outline-none focus:border-ink-2"
        />
        {suffix && <span>{suffix}</span>}
      </span>
    </label>
  );
}

export function Screener({ rows }: { rows: Scored[] }) {
  const [preset, setPreset] = useState("all");
  const [f, setF] = useState<Filters>(BASE);
  const set = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setPreset("custom");
  };
  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setF({ ...BASE, ...p.f });
  };

  const out = useMemo(() => {
    return rows
      .filter((r) => f.markets.includes(r.market))
      .filter((r) => f.maxPe == null || (r.peTrailing != null && r.peTrailing > 0 && r.peTrailing <= f.maxPe))
      .filter((r) => f.minRoe == null || (r.extraNums.roe ?? -1) >= f.minRoe)
      .filter((r) => f.minDiv == null || (r.extraNums.divYield ?? 0) >= f.minDiv)
      .filter((r) => f.minRevG == null || (r.extraNums.revG ?? -1) >= f.minRevG)
      .filter((r) => f.rsiMin == null || (r.rsi14 ?? -1) >= f.rsiMin)
      .filter((r) => f.rsiMax == null || (r.rsi14 ?? 999) <= f.rsiMax)
      .filter((r) => (f.trend === "any" ? true : f.trend === "not-down" ? r.trend !== "Downtrend" && r.trend !== "—" : r.trend === f.trend))
      .filter((r) => f.minVolRatio == null || (r.volumeRatio ?? 0) >= f.minVolRatio)
      .filter((r) => f.maxFromHigh == null || (r.fromHigh ?? 0) <= f.maxFromHigh)
      .sort((a, b) => {
        const key = f.sort;
        const get = (r: Scored) => (key === "rsi14" ? -(r.rsi14 ?? 999) : key === "potential" ? r.potential : key === "undervalued" ? r.undervalued : r[key]);
        return (get(b) ?? -Infinity) - (get(a) ?? -Infinity);
      });
  }, [rows, f]);

  const hint = PRESETS.find((p) => p.id === preset)?.hint ?? "Custom filters.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            aria-pressed={preset === p.id}
            className={`rounded-full border px-3 py-1 text-sm ${preset === p.id ? "border-ink bg-ink text-page" : "border-line bg-surface text-ink-2 hover:text-ink"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-2">{hint}</p>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-line bg-surface p-4">
        <fieldset className="flex flex-col gap-1 text-xs text-muted">
          <legend className="mb-1">Markets</legend>
          <div className="flex gap-1">
            {(Object.keys(MARKET_LABEL) as Market[]).map((m) => {
              const on = f.markets.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => set({ markets: on ? f.markets.filter((x) => x !== m) : [...f.markets, m] })}
                  aria-pressed={on}
                  className={`rounded border px-2 py-1 text-sm ${on ? "border-ink-2 text-ink" : "border-line text-muted"}`}
                >
                  {on ? "✓ " : ""}
                  {MARKET_LABEL[m]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <NumInput label="Max P/E" value={f.maxPe} onChange={(v) => set({ maxPe: v })} />
        <NumInput label="Min ROE" value={f.minRoe == null ? null : Math.round(f.minRoe * 100)} onChange={(v) => set({ minRoe: v == null ? null : v / 100 })} suffix="%" />
        <NumInput label="Min dividend" value={f.minDiv == null ? null : +(f.minDiv * 100).toFixed(1)} onChange={(v) => set({ minDiv: v == null ? null : v / 100 })} suffix="%" step={0.5} />
        <NumInput label="Min revenue growth" value={f.minRevG == null ? null : Math.round(f.minRevG * 100)} onChange={(v) => set({ minRevG: v == null ? null : v / 100 })} suffix="%" />
        <NumInput label="RSI from" value={f.rsiMin} onChange={(v) => set({ rsiMin: v })} />
        <NumInput label="RSI to" value={f.rsiMax} onChange={(v) => set({ rsiMax: v })} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Trend
          <select value={f.trend} onChange={(e) => set({ trend: e.target.value as Filters["trend"] })} className="rounded border border-line bg-page px-2 py-1 text-sm text-ink">
            <option value="any">Any</option>
            <option value="Uptrend">Uptrend</option>
            <option value="not-down">Not in a downtrend</option>
            <option value="Downtrend">Downtrend</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Sort by
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} className="rounded border border-line bg-page px-2 py-1 text-sm text-ink">
            <option value="potential">Overall score</option>
            <option value="undervalued">Undervalued score</option>
            <option value="chg30d">30-day change</option>
            <option value="rsi14">Most oversold</option>
            <option value="volumeRatio">Volume vs average</option>
          </select>
        </label>
        <button onClick={() => applyPreset("all")} className="ml-auto text-sm text-ink-2 hover:text-ink">
          Reset
        </button>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-2 text-xs text-muted">{out.length} matches</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-3 py-2 text-left font-normal">Name</th>
                <th className="px-3 py-2 text-right font-normal">Price</th>
                <th className="px-3 py-2 text-right font-normal">30D</th>
                <th className="px-3 py-2 text-right font-normal">1Y</th>
                <th className="px-3 py-2 text-right font-normal" title="Trailing price / earnings">P/E</th>
                <th className="px-3 py-2 text-right font-normal" title="Return on equity: profit per dollar of shareholder money">ROE</th>
                <th className="px-3 py-2 text-right font-normal">Dividend</th>
                <th className="px-3 py-2 text-right font-normal">Rev growth</th>
                <th className="px-3 py-2 text-right font-normal">RSI</th>
                <th className="px-3 py-2 text-left font-normal">Trend</th>
                <th className="px-3 py-2 text-right font-normal" title="0-100, relative to the same market">Score</th>
              </tr>
            </thead>
            <tbody>
              {out.slice(0, 150).map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-3 py-1.5 max-w-72">
                    <Link href={`/asset/${encodeURIComponent(r.id)}`} className="group flex min-w-0 items-baseline gap-2">
                      <span className="w-10 shrink-0 text-xs text-muted">{MARKET_LABEL[r.market]}</span>
                      <span className="font-medium group-hover:underline">{r.symbol.replace(".KL", "")}</span>
                      <span className="truncate text-ink-2">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular whitespace-nowrap">{fmtPrice(r.price, r.currency)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap"><Delta v={r.chg30d} /></td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap"><Delta v={r.chg1y} /></td>
                  <td className="px-3 py-1.5 text-right tabular">{fmt(r.peTrailing, "num")}</td>
                  <td className="px-3 py-1.5 text-right tabular">{r.extraNums.roe == null ? "—" : `${Math.round(r.extraNums.roe * 100)}%`}</td>
                  <td className="px-3 py-1.5 text-right tabular">{r.extraNums.divYield == null ? "—" : `${(r.extraNums.divYield * 100).toFixed(1)}%`}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap"><Delta v={r.extraNums.revG ?? null} /></td>
                  <td className="px-3 py-1.5 text-right tabular">{fmt(r.rsi14, "num")}</td>
                  <td className="px-3 py-1.5"><TrendBadge trend={r.trend} /></td>
                  <td className="px-3 py-1.5 text-right tabular font-medium">
                    {(() => {
                      const s = f.sort === "undervalued" ? r.undervalued : r.potential;
                      return s == null ? "—" : Math.round(s);
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {out.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-2">Nothing matches. Loosen a filter or pick another preset.</p>}
        </div>
      </div>
    </div>
  );
}
