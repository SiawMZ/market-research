export type FormatKind = "price" | "pct" | "pctPoints" | "usd" | "usdM" | "compact" | "num" | "ratio" | "rate";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function fmtPrice(v: number, currency = "USD") {
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
  const prefix = currency === "USD" ? "$" : currency === "MYR" ? "RM" : "";
  return `${prefix}${v.toLocaleString("en-US", { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })}`;
}

/** Formats a number for display; null/undefined render as an em dash. */
export function fmt(v: number | null | undefined, kind: FormatKind, currency?: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (kind) {
    case "price":
      return fmtPrice(v, currency);
    case "pct":
      return `${v > 0 ? "+" : ""}${(v * 100).toFixed(Math.abs(v) < 0.1 ? 2 : 1)}%`;
    case "pctPoints":
      return `${v.toFixed(1)}%`;
    case "usd":
      return `${v < 0 ? "−" : ""}$${compact.format(Math.abs(v))}`;
    case "usdM":
      return `${v < 0 ? "−" : "+"}$${Math.abs(v).toFixed(1)}M`;
    case "compact":
      return compact.format(v);
    case "ratio":
      return `${v.toFixed(1)}×`;
    case "rate":
      return `${(v * 100).toFixed(4)}%`;
    case "num":
      return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
}
