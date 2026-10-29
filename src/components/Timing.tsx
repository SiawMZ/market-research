import Link from "next/link";
import type { MarketRow } from "@/lib/data";
import { fmtPrice } from "@/lib/format";
import { SIGNALS, type Climate, type Signal, type Timing } from "@/lib/timing";
import { Card } from "./ui";

const TONE = { up: "text-up border-current", neutral: "text-ink-2 border-line", down: "text-down border-current" } as const;

/** Signal label with an icon, so it never relies on colour alone. */
export function SignalBadge({ signal }: { signal: Signal }) {
  const s = SIGNALS[signal];
  return (
    <span title={s.meaning} className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${TONE[s.tone]}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

const LEVEL: Record<Climate["level"], { icon: string; cls: string }> = {
  Favourable: { icon: "▲", cls: "text-up" },
  Neutral: { icon: "●", cls: "text-ink-2" },
  Cautious: { icon: "◆", cls: "text-down" },
  Risky: { icon: "▼", cls: "text-down" },
};

export function ClimateCard({ c, counts }: { c: Climate; counts: Partial<Record<Signal, number>> }) {
  const l = LEVEL[c.level];
  const order: Signal[] = ["buy", "add", "hold", "wait", "chase", "avoid"];
  return (
    <Card>
      <div className="text-xs text-muted">{c.market}</div>
      <div className={`mt-1 flex items-center gap-2 text-xl font-semibold ${l.cls}`}>
        <span aria-hidden className="text-base">{l.icon}</span>
        {c.level}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {c.points.map((p) => (
          <li key={p.text} className="flex gap-2">
            <span aria-hidden className={p.v > 0 ? "text-up" : p.v < 0 ? "text-down" : "text-muted"}>
              {p.v > 0 ? "+" : p.v < 0 ? "−" : "·"}
            </span>
            <span className="text-ink-2">{p.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
        Signals across this market:{" "}
        {order
          .filter((s) => counts[s])
          .map((s) => `${SIGNALS[s].label} ${counts[s]}`)
          .join(" · ")}
      </div>
    </Card>
  );
}

export function TimingTable({ rows }: { rows: (MarketRow & { timing: Timing })[] }) {
  return (
    <Card className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="px-4 py-2 text-left font-normal">Asset</th>
            <th className="px-4 py-2 text-left font-normal">Signal</th>
            <th className="px-4 py-2 text-left font-normal">Why</th>
            <th className="px-4 py-2 text-right font-normal">Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="px-4 py-2 whitespace-nowrap">
                <Link href={`/asset/${encodeURIComponent(r.id)}`} className="group">
                  <span className="mr-2 text-xs uppercase text-muted">{r.market}</span>
                  <span className="font-medium group-hover:underline">{r.symbol.replace(".KL", "")}</span>
                  <div className="max-w-48 truncate text-xs text-ink-2">{r.name}</div>
                </Link>
              </td>
              <td className="px-4 py-2">
                <SignalBadge signal={r.timing.signal} />
              </td>
              <td className="px-4 py-2 text-ink-2 min-w-72">{r.timing.reason}</td>
              <td className="px-4 py-2 text-right tabular whitespace-nowrap">{fmtPrice(r.price, r.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function SignalLegend() {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {(Object.keys(SIGNALS) as Signal[]).map((s) => (
        <div key={s} className="flex items-start gap-2">
          <dt className="shrink-0">
            <SignalBadge signal={s} />
          </dt>
          <dd className="text-ink-2">{SIGNALS[s].meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
