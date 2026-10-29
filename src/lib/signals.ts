import type { MarketRow } from "@/lib/data";
import { fmt } from "@/lib/format";

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Our own US market-mood gauge (CNN's Fear & Greed can't be fetched). Four equal parts, each 0-100:
 * VIX level, S&P 500 vs its 200-day average, share of stocks above their 50-day average,
 * and share of stocks within 10% of their 1-year high.
 */
export function moodIndex(spx: MarketRow | undefined, vix: MarketRow | undefined, stocks: MarketRow[]) {
  const parts: { label: string; score: number; detail: string }[] = [];
  if (vix) parts.push({ label: "Volatility (VIX)", score: clamp(((35 - vix.price) / 23) * 100), detail: `VIX ${vix.price.toFixed(1)}` });
  if (spx?.ma200) {
    const gap = spx.price / spx.ma200 - 1;
    parts.push({ label: "S&P 500 momentum", score: clamp(((gap + 0.15) / 0.3) * 100), detail: `${fmt(gap, "pct")} vs 200-day avg` });
  }
  const withMa = stocks.filter((s) => s.ma50 != null);
  if (withMa.length) {
    const share = withMa.filter((s) => s.price > s.ma50!).length / withMa.length;
    parts.push({ label: "Breadth", score: share * 100, detail: `${Math.round(share * 100)}% above 50-day avg` });
  }
  const withHigh = stocks.filter((s) => s.fromHigh != null);
  if (withHigh.length) {
    const share = withHigh.filter((s) => s.fromHigh! > -0.1).length / withHigh.length;
    parts.push({ label: "Near highs", score: share * 100, detail: `${Math.round(share * 100)}% within 10% of 1Y high` });
  }
  const score = parts.length ? parts.reduce((a, p) => a + p.score, 0) / parts.length : null;
  return { score, parts };
}

export const moodLabel = (v: number) => (v < 25 ? "Extreme fear" : v < 45 ? "Fear" : v <= 55 ? "Neutral" : v <= 75 ? "Greed" : "Extreme greed");

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Plain-language reading of one asset's indicators, used on detail pages and the summary. */
export function readSignals(r: MarketRow): { tone: "positive" | "negative" | "neutral"; text: string }[] {
  const out: { tone: "positive" | "negative" | "neutral"; text: string }[] = [];
  if (r.trend === "Uptrend") out.push({ tone: "positive", text: "Price is above its 50-day average, which is above the 200-day: an established uptrend." });
  if (r.trend === "Downtrend") out.push({ tone: "negative", text: "Price is below its 50-day average, which is below the 200-day: an established downtrend." });
  if (r.trend === "Mixed") out.push({ tone: "neutral", text: "Moving averages disagree: the trend is changing or sideways." });
  if (r.rsi14 != null && r.rsi14 > 70) out.push({ tone: "negative", text: `RSI is ${r.rsi14.toFixed(0)}: overbought. Rallies often pause from here.` });
  if (r.rsi14 != null && r.rsi14 < 30) out.push({ tone: "positive", text: `RSI is ${r.rsi14.toFixed(0)}: oversold. Bounces often start from here, though downtrends can stay oversold.` });
  if (r.volumeRatio != null && r.volumeRatio >= 2) out.push({ tone: "neutral", text: `Volume is ${r.volumeRatio.toFixed(1)}× its 20-day average: unusual activity, often big players.` });
  if (r.fromHigh != null && r.fromHigh < -0.5) out.push({ tone: "neutral", text: `Trading ${fmt(-r.fromHigh, "pct").replace("+", "")} below its 1-year high: deeply discounted, or broken.` });
  if (r.peTrailing != null && r.peTrailing > 0 && r.peTrailing < 12) out.push({ tone: "positive", text: `P/E of ${r.peTrailing.toFixed(1)} is low: cheap on earnings, worth checking why.` });
  if (r.peTrailing != null && r.peTrailing > 60) out.push({ tone: "negative", text: `P/E of ${r.peTrailing.toFixed(0)} is high: priced for strong growth.` });
  return out;
}
