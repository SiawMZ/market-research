import type { Headline } from "@/lib/data";

export const toneOf = (score: number) => (score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral");

/** Average keyword tone of a set of headlines, as a label with an icon (never colour alone). */
export function ToneBadge({ score, count }: { score: number; count?: number }) {
  const t = toneOf(score);
  const label = t === "positive" ? "Mostly positive" : t === "negative" ? "Mostly negative" : "Mixed / neutral";
  const cls = t === "positive" ? "text-up border-current" : t === "negative" ? "text-down border-current" : "text-ink-2 border-line";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs ${cls}`}>
      <span aria-hidden>{t === "positive" ? "▲" : t === "negative" ? "▼" : "●"}</span>
      {label}
      {count != null && <span className="text-muted">· {count}</span>}
    </span>
  );
}

const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export function NewsList({ items }: { items: Headline[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((n) => (
        <li key={n.id} className="flex gap-2">
          <span aria-hidden className={`mt-0.5 text-xs ${n.score > 0 ? "text-up" : n.score < 0 ? "text-down" : "text-muted"}`}>
            {n.score > 0 ? "▲" : n.score < 0 ? "▼" : "●"}
          </span>
          <span>
            <a href={n.id} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {n.title}
            </a>
            <span className="ml-2 text-xs text-muted">
              {n.source ? `${n.source} · ` : ""}
              {ago(n.publishedAt)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
