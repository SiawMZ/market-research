"use client";

import { useEffect, useRef, useState } from "react";
import { AreaSeries, HistogramSeries, LineSeries, createChart, type Time } from "lightweight-charts";
import { fmt, type FormatKind } from "@/lib/format";
import { baseOptions, timeToDate, useTokens, type Tokens } from "./theme";

export type TimeSeries = {
  name: string;
  /** Categorical slot 1-4 (fixed order), or "updown" to colour bars by sign. */
  color: 1 | 2 | 3 | 4 | "updown";
  type: "line" | "area" | "histogram";
  data: { date: string; value: number }[];
};

const NO_GUIDES: { value: number; label: string }[] = [];

const slot = (t: Tokens, c: TimeSeries["color"]) => (c === "updown" ? t.s1 : [t.s1, t.s2, t.s3, t.s4][c - 1]);

/**
 * Time-series chart with one y-axis, crosshair, and a live legend row that doubles as the tooltip.
 * Two or more series always get a legend; guides draw dashed reference lines (e.g. 25/75 on Fear & Greed).
 */
export function TimeChart({
  series,
  format,
  height = 240,
  guides = NO_GUIDES,
}: {
  series: TimeSeries[];
  format: FormatKind;
  height?: number;
  guides?: { value: number; label: string }[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const tokens = useTokens();
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current || !tokens) return;
    const t = tokens;
    const chart = createChart(el.current, {
      ...baseOptions(t, height),
      localization: { priceFormatter: (v: number) => fmt(v, format) },
    });
    series.forEach((s, idx) => {
      const color = slot(t, s.color);
      const common = { priceLineVisible: false, lastValueVisible: idx === 0 };
      const api =
        s.type === "histogram"
          ? chart.addSeries(HistogramSeries, { ...common, color })
          : s.type === "area"
            ? chart.addSeries(AreaSeries, { ...common, lineColor: color, lineWidth: 2, topColor: color + "40", bottomColor: color + "05" })
            : chart.addSeries(LineSeries, { ...common, color, lineWidth: 2 });
      api.setData(
        s.data.map((d) => ({
          time: d.date as Time,
          value: d.value,
          ...(s.color === "updown" ? { color: d.value >= 0 ? t.up : t.down } : {}),
        })),
      );
      if (idx === 0) for (const g of guides) api.createPriceLine({ price: g.value, color: t.axis, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: g.label });
    });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => setHover(timeToDate(p.time)));
    return () => chart.remove();
  }, [tokens, series, format, height, guides]);

  const at = (s: TimeSeries) => (hover ? s.data.find((d) => d.date === hover) : s.data.at(-1));
  const date = hover ?? series[0]?.data.at(-1)?.date;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular text-ink-2 min-h-5">
        <span className="text-ink font-medium">{date ?? ""}</span>
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            {series.length > 1 && (
              <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color === "updown" ? "var(--ink-2)" : `var(--series-${s.color})` }} />
            )}
            {s.name} <span className="text-ink">{fmt(at(s)?.value, format)}</span>
          </span>
        ))}
      </div>
      <div ref={el} style={{ height }} />
    </div>
  );
}
