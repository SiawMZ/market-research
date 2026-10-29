import type { ReactNode } from "react";
import { fmt, type FormatKind } from "@/lib/format";

export function PageHeader({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {intro && <p className="mt-1 text-sm text-ink-2 max-w-2xl">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

/** A numbered section, Swiss style: a step number, a title, and a one-line "why it matters". */
export function Section({ n, title, why, children, aside, id }: { n?: string; title: string; why?: string; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-10 scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-ink pt-3">
        <h2 className="text-base font-semibold">
          {n && <span className="mr-2 text-muted tabular">{n}</span>}
          {title}
        </h2>
        {aside}
      </div>
      {why && <p className="-mt-1 mb-4 text-sm text-ink-2 max-w-3xl">{why}</p>}
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-surface p-4 ${className}`}>{children}</div>;
}

/** Up/down value: sign, arrow and colour together, so meaning never rests on colour alone. */
export function Delta({ v, kind = "pct", className = "" }: { v: number | null | undefined; kind?: FormatKind; className?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className={`text-muted ${className}`}>—</span>;
  const up = v > 0;
  const flat = v === 0;
  return (
    <span className={`tabular ${flat ? "text-ink-2" : up ? "text-up" : "text-down"} ${className}`}>
      {!flat && <span aria-hidden className="mr-0.5 text-[0.8em]">{up ? "▲" : "▼"}</span>}
      {fmt(v, kind)}
    </span>
  );
}

export function Stat({ label, value, sub, note }: { label: string; value: ReactNode; sub?: ReactNode; note?: string }) {
  return (
    <Card>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-sm">{sub}</div>}
      {note && <div className="mt-2 text-xs text-ink-2 leading-snug">{note}</div>}
    </Card>
  );
}

export function TrendBadge({ trend }: { trend: string }) {
  const style =
    trend === "Uptrend" ? "text-up border-current" : trend === "Downtrend" ? "text-down border-current" : "text-ink-2 border-line";
  const icon = trend === "Uptrend" ? "↗" : trend === "Downtrend" ? "↘" : trend === "Mixed" ? "→" : "";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs whitespace-nowrap ${style}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {trend}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-2 max-w-lg mx-auto">{children}</div>}
    </div>
  );
}

/** Small inline trend line for table rows. Neutral ink: the shape matters, not identity. */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const up = values.at(-1)! >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`60-day trend, ${up ? "up" : "down"}`}>
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Fear & Greed style gauge text: value plus its band name. */
export function sentimentBand(v: number) {
  if (v <= 24) return "Extreme fear";
  if (v <= 44) return "Fear";
  if (v <= 55) return "Neutral";
  if (v <= 75) return "Greed";
  return "Extreme greed";
}
