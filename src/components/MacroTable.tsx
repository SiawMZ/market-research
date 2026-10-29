import type { schema } from "@/lib/db/client";
import { Card } from "./ui";

type Event = typeof schema.macroEvents.$inferSelect;

const fmtWhen = (d: Date) =>
  d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

/** This week's calendar, times in Malaysia time. */
export function MacroTable({ events }: { events: Event[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-2 text-sm font-medium">This week&apos;s calendar (Malaysia time)</div>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-2">No upcoming high-impact events this week.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-4 py-1.5 text-left font-normal">When</th>
                <th className="px-4 py-1.5 text-left font-normal">Event</th>
                <th className="px-4 py-1.5 text-left font-normal">Impact</th>
                <th className="px-4 py-1.5 text-right font-normal">Forecast</th>
                <th className="px-4 py-1.5 text-right font-normal">Previous</th>
                <th className="px-4 py-1.5 text-right font-normal">Actual</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const past = e.at.getTime() < Date.now();
                return (
                  <tr key={e.id} className={`border-t border-line ${past ? "text-ink-2" : ""}`}>
                    <td className="px-4 py-1.5 whitespace-nowrap tabular">{fmtWhen(e.at)}</td>
                    <td className="px-4 py-1.5">
                      <span className="mr-2 text-xs text-muted">{e.country}</span>
                      {e.title}
                    </td>
                    <td className="px-4 py-1.5">
                      <span className={`text-xs ${e.impact === "High" ? "font-semibold" : "text-ink-2"}`}>
                        {e.impact === "High" ? "● High" : "○ Medium"}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular">{e.forecast ?? "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular">{e.previous ?? "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular font-medium">{e.actual ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
