"use client";

import { useEffect, useState } from "react";
import { ColorType, CrosshairMode, type DeepPartial, type ChartOptions, type Time } from "lightweight-charts";

/** Crosshair times come back as a string or a BusinessDay object depending on input; normalise to "YYYY-MM-DD". */
export function timeToDate(t: Time | undefined): string | null {
  if (t == null) return null;
  if (typeof t === "string") return t;
  if (typeof t === "number") return new Date(t * 1000).toISOString().slice(0, 10);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

export type Tokens = Record<"surface" | "ink" | "ink2" | "muted" | "grid" | "axis" | "s1" | "s2" | "s3" | "s4" | "up" | "down", string>;

export function readTokens(): Tokens {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    s1: v("--series-1"),
    s2: v("--series-2"),
    s3: v("--series-3"),
    s4: v("--series-4"),
    up: v("--up"),
    down: v("--down"),
  };
}

/** Re-reads tokens when the OS colour scheme flips, so charts follow light/dark. */
export function useTokens(): Tokens | null {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTokens(readTokens());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return tokens;
}

export function baseOptions(t: Tokens, height: number): DeepPartial<ChartOptions> {
  return {
    height,
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: t.surface },
      textColor: t.muted,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      fontSize: 11,
      attributionLogo: false,
      panes: { separatorColor: t.grid, separatorHoverColor: t.axis },
    },
    grid: { vertLines: { visible: false }, horzLines: { color: t.grid } },
    rightPriceScale: { borderColor: t.axis },
    timeScale: { borderColor: t.axis, rightOffset: 2 },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: t.muted, labelBackgroundColor: t.ink2 },
      horzLine: { color: t.muted, labelBackgroundColor: t.ink2 },
    },
    handleScroll: { vertTouchDrag: false },
  };
}
