"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, type IChartApi, type Time } from "lightweight-charts";
import { macd, rsi, sma } from "@/lib/indicators";
import { fmt, fmtPrice } from "@/lib/format";
import { baseOptions, timeToDate, useTokens } from "./theme";

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

const RANGES = [
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
];

/**
 * Candles with MA20/50/200, then volume, RSI(14) and MACD(12,26,9) each in their own pane,
 * so every pane keeps a single y-axis.
 */
export function PriceChart({ candles, currency }: { candles: Candle[]; currency: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tokens = useTokens();
  const [range, setRange] = useState(182);
  const [hover, setHover] = useState<number | null>(null);

  const ind = useMemo(() => {
    const closes = candles.map((c) => c.close);
    return { ma20: sma(closes, 20), ma50: sma(closes, 50), ma200: sma(closes, 200), rsi: rsi(closes), macd: macd(closes) };
  }, [candles]);

  useEffect(() => {
    if (!el.current || !tokens || candles.length === 0) return;
    const t = tokens;
    const chart = createChart(el.current, baseOptions(t, 640));
    chartRef.current = chart;
    const time = (i: number) => candles[i].date as Time;
    const line = (s: (number | null)[]) => s.flatMap((v, i) => (v == null ? [] : [{ time: time(i), value: v }]));

    const price = chart.addSeries(CandlestickSeries, {
      upColor: t.up,
      downColor: t.down,
      borderVisible: false,
      wickUpColor: t.up,
      wickDownColor: t.down,
      priceFormat: { type: "custom", formatter: (v: number) => fmtPrice(v, currency), minMove: 0.000001 },
    });
    price.setData(candles.map((c) => ({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close })));

    const maOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    chart.addSeries(LineSeries, { ...maOpts, color: t.s1 }).setData(line(ind.ma20));
    chart.addSeries(LineSeries, { ...maOpts, color: t.s2 }).setData(line(ind.ma50));
    chart.addSeries(LineSeries, { ...maOpts, color: t.s3 }).setData(line(ind.ma200));

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, 1);
    vol.setData(candles.map((c) => ({ time: c.date as Time, value: c.volume, color: c.close >= c.open ? t.up + "99" : t.down + "99" })));

    const r = chart.addSeries(LineSeries, { color: t.s1, lineWidth: 2, priceLineVisible: false, lastValueVisible: true }, 2);
    r.setData(line(ind.rsi));
    r.createPriceLine({ price: 70, color: t.axis, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
    r.createPriceLine({ price: 30, color: t.axis, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });

    const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 3);
    hist.setData(ind.macd.hist.flatMap((v, i) => (v == null ? [] : [{ time: time(i), value: v, color: v >= 0 ? t.up + "88" : t.down + "88" }])));
    chart.addSeries(LineSeries, { color: t.s1, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 3).setData(line(ind.macd.line));
    chart.addSeries(LineSeries, { color: t.s2, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 3).setData(line(ind.macd.signal));

    const panes = chart.panes();
    [0.58, 0.14, 0.14, 0.14].forEach((f, i) => panes[i]?.setStretchFactor(f));

    const index = new Map(candles.map((c, i) => [c.date, i]));
    chart.subscribeCrosshairMove((p) => {
      const d = timeToDate(p.time);
      setHover(d ? (index.get(d) ?? null) : null);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [tokens, candles, ind, currency]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    const to = candles.at(-1)!.date;
    const fromIdx = Math.max(0, candles.findIndex((c) => c.date >= new Date(Date.parse(to) - range * 86_400_000).toISOString().slice(0, 10)));
    chart.timeScale().setVisibleRange({ from: candles[fromIdx].date as Time, to: to as Time });
  }, [range, candles, tokens]);

  const i = hover ?? candles.length - 1;
  const c = candles[i];

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
        {c && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular text-ink-2">
            <span className="text-ink font-medium">{c.date}</span>
            <span>O {fmtPrice(c.open, currency)}</span>
            <span>H {fmtPrice(c.high, currency)}</span>
            <span>L {fmtPrice(c.low, currency)}</span>
            <span className="text-ink">C {fmtPrice(c.close, currency)}</span>
            <span>Vol {fmt(c.volume, "compact")}</span>
          </div>
        )}
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.days)}
              aria-pressed={range === r.days}
              className={`rounded px-2 py-1 text-xs ${range === r.days ? "bg-surface-2 text-ink font-medium" : "text-ink-2 hover:text-ink"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-xs tabular text-ink-2">
        <Legend color="var(--series-1)" label="MA20" value={ind.ma20[i]} currency={currency} />
        <Legend color="var(--series-2)" label="MA50" value={ind.ma50[i]} currency={currency} />
        <Legend color="var(--series-3)" label="MA200" value={ind.ma200[i]} currency={currency} />
        <span className="ml-auto">
          RSI14 <span className="text-ink">{fmt(ind.rsi[i], "num")}</span>
          <span className="mx-2 text-muted">·</span>
          MACD <span className="text-ink">{ind.macd.line[i]?.toPrecision(3) ?? "—"}</span> / signal{" "}
          <span className="text-ink">{ind.macd.signal[i]?.toPrecision(3) ?? "—"}</span>
        </span>
      </div>
      <div ref={el} className="h-[640px]" />
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        Panes, top to bottom: price, volume, RSI(14) with 30/70 lines, MACD(12,26,9) with signal line.
      </p>
    </div>
  );
}

function Legend({ color, label, value, currency }: { color: string; label: string; value: number | null | undefined; currency: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
      {label} <span className="text-ink">{value == null ? "—" : fmtPrice(value, currency)}</span>
    </span>
  );
}
