/**
 * Technical indicators over a close-price series (oldest first).
 * Every function returns an array aligned with the input; positions without enough history are null.
 */

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. Above 70 is usually called overbought, below 30 oversold. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** MACD (12, 26, 9): line = fast EMA - slow EMA, signal = EMA of the line, histogram = line - signal. */
export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const start = line.findIndex((v) => v != null);
  const sig: Series = new Array(values.length).fill(null);
  if (start >= 0) {
    const e = ema(line.slice(start) as number[], signal);
    e.forEach((v, i) => (sig[start + i] = v));
  }
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null));
  return { line, signal: sig, hist };
}

// ---------- Summary statistics ----------

/** Percent change over the last n bars, as a fraction (0.05 = +5%). */
export function change(values: number[], n: number): number | null {
  if (values.length <= n) return null;
  const prev = values[values.length - 1 - n];
  return prev ? values[values.length - 1] / prev - 1 : null;
}

/** Annualised volatility of daily returns. periodsPerYear: 365 for crypto, 252 for stocks. */
export function volatility(values: number[], periodsPerYear: number, lookback = 90): number | null {
  const v = values.slice(-lookback - 1);
  if (v.length < 20) return null;
  const r = v.slice(1).map((x, i) => Math.log(x / v[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance * periodsPerYear);
}

/** Largest peak-to-trough fall, as a negative fraction. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

export const last = <T>(s: (T | null)[]): T | null => {
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
  return null;
};

/**
 * A plain-language trend label from moving averages:
 * "Uptrend" when price > MA50 > MA200, "Downtrend" when price < MA50 < MA200, otherwise "Mixed".
 */
export function trendLabel(price: number, ma50: number | null, ma200: number | null): "Uptrend" | "Downtrend" | "Mixed" | "—" {
  if (ma50 == null || ma200 == null) return "—";
  if (price > ma50 && ma50 > ma200) return "Uptrend";
  if (price < ma50 && ma50 < ma200) return "Downtrend";
  return "Mixed";
}
