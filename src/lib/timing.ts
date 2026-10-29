import type { MarketRow } from "@/lib/data";
import { fmt } from "@/lib/format";

/*
 * Timing rules: "is now a good moment to buy or sell this?", separate from "is this a good asset?" (scoring.ts).
 * Trend decides the direction; RSI, distance from the 50-day average and MACD decide the moment.
 * The market's climate then tempers the signal: in a cautious or risky market, buy signals step down a notch.
 */

export type Signal = "buy" | "add" | "hold" | "chase" | "wait" | "avoid";

export const SIGNALS: Record<Signal, { label: string; icon: string; tone: "up" | "neutral" | "down"; meaning: string }> = {
  buy: { label: "Buy zone", icon: "▲", tone: "up", meaning: "Pullback inside an uptrend: historically the better moment to buy." },
  add: { label: "Add slowly", icon: "↗", tone: "up", meaning: "Healthy trend, nothing stretched. Build in small steps." },
  hold: { label: "Hold", icon: "●", tone: "neutral", meaning: "No clear edge either way. Keep what you have; don't add much." },
  chase: { label: "Don't chase", icon: "◆", tone: "down", meaning: "Strong but stretched. Consider taking some profit; wait for a pullback to buy." },
  wait: { label: "Wait", icon: "‖", tone: "neutral", meaning: "Oversold or turning, but not confirmed. Let the trend prove itself first." },
  avoid: { label: "Avoid for now", icon: "▼", tone: "down", meaning: "Downtrend. Rallies tend to get sold; reduce or stay out until it turns." },
};

export type Timing = { signal: Signal; reason: string; downgraded: boolean };

const pct = (v: number) => fmt(v, "pct").replace("+", "");

export function assetTiming(r: MarketRow, climate?: Climate["level"]): Timing {
  const { price, ma50, ma200, rsi14: rsi, fromMa50, macdCross } = r;
  let t: Omit<Timing, "downgraded">;
  if (ma50 == null || ma200 == null || rsi == null) {
    t = { signal: "hold", reason: "Not enough price history for a timing read." };
  } else {
    const aboveLong = price > ma200;
    const structUp = ma50 > ma200;
    const rsiTxt = `RSI ${rsi.toFixed(0)}`;
    if (aboveLong && structUp) {
      const d = fromMa50 ?? 0;
      if (rsi > 72 || d > 0.15) t = { signal: "chase", reason: `Uptrend, but stretched: ${rsiTxt}, ${pct(d)} above its 50-day average.` };
      else if (d < -0.05) {
        // Fell well below the 50-day but still above the 200-day: the pullback is deeper than a normal dip.
        if (rsi < 32) t = { signal: "add", reason: `Oversold pullback (${rsiTxt}) toward its 200-day average, long-term uptrend intact. Small steps only.` };
        else t = { signal: "wait", reason: `Sliding ${pct(-d)} below its 50-day average toward the 200-day. Wait for it to steady.` };
      } else if (macdCross === "bearish") t = { signal: "hold", reason: `Uptrend intact, but momentum just turned down (MACD cross). ${rsiTxt}.` };
      else if (d <= 0.03 && rsi <= 60)
        t = { signal: "buy", reason: `Back near its 50-day average (${d >= 0 ? "+" : "−"}${pct(Math.abs(d))}) inside an uptrend, ${rsiTxt}.` };
      else t = { signal: "add", reason: `Steady uptrend, not overheated (${rsiTxt}).` };
    } else if (!aboveLong && !structUp) {
      if (rsi < 30) t = { signal: "wait", reason: `Oversold (${rsiTxt}) but still in a downtrend. Wait until it gets back above its 50-day average.` };
      else t = { signal: "avoid", reason: `Below both its 50- and 200-day averages: downtrend (${rsiTxt}).` };
    } else if (aboveLong) {
      // Back above the 200-day while the 50-day is still below it: an early recovery.
      if (macdCross === "bullish") t = { signal: "add", reason: "Early turn: back above its 200-day average and momentum just turned up. Small starter only." };
      else t = { signal: "wait", reason: "Recovering above its 200-day average; wait for the 50-day to cross above it to confirm." };
    } else {
      // Below the 200-day while the longer structure is still up: a deep pullback or a trend breaking.
      if (rsi < 35) t = { signal: "add", reason: `Deep pullback in a longer uptrend (${rsiTxt}). Buy only in small steps.` };
      else t = { signal: "wait", reason: "Testing its 200-day average. Wait to see if it holds." };
    }
  }
  // The market climate tempers buy signals: cautious steps "Buy zone" down one notch, risky steps both buy signals down.
  if ((climate === "Cautious" && t.signal === "buy") || (climate === "Risky" && (t.signal === "buy" || t.signal === "add"))) {
    return {
      signal: t.signal === "buy" ? "add" : "hold",
      reason: `${t.reason} Stepped down one notch because the market climate is ${climate.toLowerCase()}.`,
      downgraded: true,
    };
  }
  return { ...t, downgraded: false };
}

// ---------- Market climate ----------

export type Climate = { market: string; level: "Favourable" | "Neutral" | "Cautious" | "Risky"; points: { text: string; v: -1 | 0 | 1 }[] };

const levelOf = (score: number): Climate["level"] => (score >= 2 ? "Favourable" : score >= 0 ? "Neutral" : score === -1 ? "Cautious" : "Risky");

function breadthPoint(rows: MarketRow[]): Climate["points"][number] | null {
  const t = rows.filter((r) => r.trend !== "—");
  if (t.length < 5) return null;
  const up = t.filter((r) => r.trend === "Uptrend").length / t.length;
  const txt = `${Math.round(up * 100)}% of tracked assets are in uptrends`;
  return { text: txt, v: up > 0.6 ? 1 : up < 0.3 ? -1 : 0 };
}

function trendPoint(name: string, r: MarketRow | undefined): Climate["points"][number] | null {
  if (!r) return null;
  if (r.trend === "Uptrend") return { text: `${name} is in an uptrend`, v: 1 };
  if (r.trend === "Downtrend") return { text: `${name} is in a downtrend`, v: -1 };
  return { text: `${name}'s trend is mixed`, v: 0 };
}

/** Sentiment is read contrarian: extreme fear has tended to be a better time to buy than extreme greed. */
function sentimentPoint(label: string, v: number | null | undefined): Climate["points"][number] | null {
  if (v == null) return null;
  if (v < 25) return { text: `${label} shows extreme fear (${Math.round(v)}): often a better time to buy`, v: 1 };
  if (v > 75) return { text: `${label} shows extreme greed (${Math.round(v)}): often a riskier time to buy`, v: -1 };
  return { text: `${label} is ${Math.round(v)}, not at an extreme`, v: 0 };
}

export function marketClimate(
  market: string,
  opts: { bench?: MarketRow; benchName: string; rows: MarketRow[]; sentiment?: { label: string; value: number | null | undefined }; extra?: (Climate["points"][number] | null)[] },
): Climate {
  const points = [
    trendPoint(opts.benchName, opts.bench),
    breadthPoint(opts.rows),
    opts.sentiment ? sentimentPoint(opts.sentiment.label, opts.sentiment.value) : null,
    ...(opts.extra ?? []),
  ].filter((p): p is Climate["points"][number] => p != null);
  const score = points.reduce((a, p) => a + p.v, 0);
  return { market, level: levelOf(score), points };
}
