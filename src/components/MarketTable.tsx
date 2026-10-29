"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketRow } from "@/lib/data";
import { fmt, fmtPrice } from "@/lib/format";
import { Delta, Sparkline, TrendBadge } from "./ui";

type Col = {
  key: string;
  label: string;
  title?: string;
  sort: (r: MarketRow) => number | string | null;
  cell: (r: MarketRow) => React.ReactNode;
  align?: "right";
};

const pctCol = (key: keyof MarketRow, label: string, title?: string): Col => ({
  key,
  label,
  title,
  align: "right",
  sort: (r) => r[key] as number | null,
  cell: (r) => <Delta v={r[key] as number | null} />,
});

const COMMON_HEAD: Col[] = [
  {
    key: "symbol",
    label: "Name",
    sort: (r) => r.symbol,
    cell: (r) => (
      <Link href={`/asset/${encodeURIComponent(r.id)}`} className="group block min-w-0">
        <span className="font-medium group-hover:underline">{r.symbol.replace(".KL", "")}</span>
        <span className="ml-2 text-ink-2 truncate">{r.name}</span>
      </Link>
    ),
  },
  { key: "price", label: "Price", align: "right", sort: (r) => r.price, cell: (r) => <span className="tabular">{fmtPrice(r.price, r.currency)}</span> },
  pctCol("chg1d", "1D"),
  pctCol("chg7d", "7D"),
  pctCol("chg30d", "30D"),
];

const COMMON_TAIL: Col[] = [
  {
    key: "rsi14",
    label: "RSI",
    title: "RSI(14): above 70 often overbought, below 30 often oversold",
    align: "right",
    sort: (r) => r.rsi14,
    cell: (r) => (
      <span className={`tabular ${r.rsi14 != null && (r.rsi14 > 70 || r.rsi14 < 30) ? "font-semibold" : ""}`}>
        {fmt(r.rsi14, "num")}
        {r.rsi14 != null && r.rsi14 > 70 && <span className="ml-1 text-xs text-muted">hot</span>}
        {r.rsi14 != null && r.rsi14 < 30 && <span className="ml-1 text-xs text-muted">cold</span>}
      </span>
    ),
  },
  { key: "trend", label: "Trend", title: "Price vs 50- and 200-day moving averages", sort: (r) => r.trend, cell: (r) => <TrendBadge trend={r.trend} /> },
  {
    key: "volumeRatio",
    label: "Vol × avg",
    title: "Latest volume vs its 20-day average. 2× or more is unusual activity.",
    align: "right",
    sort: (r) => r.volumeRatio,
    cell: (r) => <span className={`tabular ${r.volumeRatio != null && r.volumeRatio >= 2 ? "font-semibold" : ""}`}>{fmt(r.volumeRatio, "ratio")}</span>,
  },
  pctCol("fromHigh", "From 1Y high"),
  { key: "spark", label: "60D", sort: (r) => r.chg30d, cell: (r) => <Sparkline values={r.spark} /> },
];

const CRYPTO_COLS: Col[] = [
  ...COMMON_HEAD,
  { key: "marketCap", label: "Mkt cap", align: "right", sort: (r) => r.marketCap, cell: (r) => <span className="tabular">{fmt(r.marketCap, "usd")}</span> },
  ...COMMON_TAIL,
];

const STOCK_COLS: Col[] = [
  ...COMMON_HEAD,
  pctCol("chg1y", "1Y"),
  { key: "marketCap", label: "Mkt cap", align: "right", sort: (r) => r.marketCap, cell: (r) => <span className="tabular">{fmt(r.marketCap, "compact")}</span> },
  { key: "pe", label: "P/E", title: "Trailing price / earnings", align: "right", sort: (r) => r.peTrailing, cell: (r) => <span className="tabular">{fmt(r.peTrailing, "num")}</span> },
  { key: "pb", label: "P/B", title: "Price / book value", align: "right", sort: (r) => r.priceToBook, cell: (r) => <span className="tabular">{fmt(r.priceToBook, "num")}</span> },
  ...COMMON_TAIL,
];

export function MarketTable({ rows, preset }: { rows: MarketRow[]; preset: "crypto" | "stocks" }) {
  const cols = preset === "crypto" ? CRYPTO_COLS : STOCK_COLS;
  const [sortKey, setSortKey] = useState<string>("marketCap");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [q, setQ] = useState("");

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey) ?? cols[0];
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !needle || r.symbol.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle) || r.sector?.toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = col.sort(a);
        const y = col.sort(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
  }, [rows, cols, sortKey, dir, q]);

  const onSort = (k: string) => {
    if (k === sortKey) setDir(dir === 1 ? -1 : 1);
    else {
      setSortKey(k);
      setDir(-1);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name, symbol or sector"
          aria-label="Filter table"
          className="w-full max-w-xs rounded border border-line bg-page px-2 py-1 text-sm outline-none focus:border-ink-2"
        />
        <span className="text-xs text-muted whitespace-nowrap">{sorted.length} assets · click a header to sort</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              {cols.map((c) => (
                <th key={c.key} title={c.title} className={`px-3 py-2 font-normal whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
                  <button onClick={() => onSort(c.key)} className="hover:text-ink">
                    {c.label}
                    {sortKey === c.key && <span aria-hidden className="ml-1">{dir === -1 ? "↓" : "↑"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-surface-2">
                {cols.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${c.align === "right" ? "text-right" : ""} ${c.key === "symbol" ? "max-w-64" : ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
