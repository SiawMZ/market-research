"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Summary" },
  { href: "/crypto", label: "Crypto" },
  { href: "/stocks", label: "Stocks" },
  { href: "/sentiment", label: "Sentiment" },
  { href: "/screener", label: "Screener" },
  { href: "/ideas", label: "Ideas" },
  { href: "/planner", label: "Planner" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${active ? "bg-surface-2 text-ink font-medium" : "text-ink-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
