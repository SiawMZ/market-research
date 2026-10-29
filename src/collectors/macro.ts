import { z } from "zod";
import { insiderTrades, macroEvents } from "@/lib/db/schema";
import { batch, fetchJson, fetchText, type Collector } from "./core";

const FfCalendar = z.array(
  z.object({
    title: z.string(),
    country: z.string(),
    date: z.string(),
    impact: z.string(),
    forecast: z.string().optional(),
    previous: z.string().optional(),
    actual: z.string().optional(),
  }),
);

const MAJOR = new Set(["EUR", "CNY", "JPY", "GBP"]);

/** This week's macro calendar (Forex Factory feed). Keeps USD medium/high and other majors' high-impact events. */
export const macroCalendar: Collector = {
  name: "macro-calendar",
  description: "This week's economic calendar (Forex Factory)",
  async run() {
    const events = await fetchJson("https://nfs.faireconomy.media/ff_calendar_thisweek.json", FfCalendar);
    const keep = events.filter(
      (e) => (e.country === "USD" && (e.impact === "High" || e.impact === "Medium")) || (MAJOR.has(e.country) && e.impact === "High"),
    );
    return [
      batch("macro_events", macroEvents, ["id"], keep.map((e) => ({
        id: `${e.date}|${e.country}|${e.title}`,
        at: new Date(e.date),
        country: e.country,
        title: e.title,
        impact: e.impact,
        forecast: e.forecast || null,
        previous: e.previous || null,
        actual: e.actual || null,
      }))),
    ];
  },
};

// ---------- Insider trades ----------

const stripTags = (s: string) =>
  s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
const money = (s: string) => {
  const v = Number(s.replace(/[$,+]/g, ""));
  return Number.isFinite(v) ? v : null;
};

/** Parses OpenInsider's results table (SEC Form 4 filings). Column order is fixed on their screener pages. */
function parseOpenInsider(html: string) {
  const start = html.indexOf('class="tinytable"');
  if (start < 0) throw new Error("OpenInsider table not found; page layout may have changed");
  const body = html.slice(html.indexOf("<tbody>", start), html.indexOf("</tbody>", start));
  return body.split(/<tr[^>]*>/).slice(1).flatMap((tr) => {
    const raw = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (raw.length < 13) return [];
    const cells = raw.map(stripTags);
    const link = raw[1].match(/href="([^"]+)"/)?.[1];
    // The ticker cell embeds a chart tooltip with nested tags, so read the ticker from its link instead.
    const ticker = raw[3].match(/href="\/([^"/?]+)"/)?.[1];
    const [, filed, tradeDate, , company, insider, title, type, price, qty, , , value] = cells;
    if (!link || !ticker) return [];
    return [{
      id: link,
      filedAt: new Date(`${filed.replace(" ", "T")}-04:00`),
      tradeDate,
      ticker,
      company,
      insider,
      title,
      type,
      price: money(price),
      qty: money(qty),
      valueUsd: money(value),
    }];
  });
}

/** Recent insider buys >= $25k and sells >= $100k across US stocks. */
export const insiders: Collector = {
  name: "insiders",
  description: "US insider buys/sells from SEC Form 4 (OpenInsider)",
  async run() {
    const buys = parseOpenInsider(await fetchText("http://openinsider.com/latest-insider-purchases-25k"));
    const sells = parseOpenInsider(await fetchText("http://openinsider.com/latest-insider-sales-100k"));
    return [batch("insider_trades", insiderTrades, ["id"], [...buys, ...sells])];
  },
};
