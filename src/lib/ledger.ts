import { isoDate } from "@/collectors/core";
import type { schema } from "@/lib/db/client";
import type { Venue } from "@/lib/fees";

export type Holding = { assetId: string; venue: Venue; qty: number; avgUsd: number; entryDate: string };

export const venueOf = (assetId: string) => assetId.split(":")[0] as Venue;

/** Rebuilds holdings (quantity, average entry price, entry date) and cash from the full trade history. */
export function replay(tradeRows: (typeof schema.trades.$inferSelect)[], startCash: number) {
  const h = new Map<string, Holding>();
  let cash = startCash;
  for (const t of [...tradeRows].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id)) {
    const cur = h.get(t.assetId) ?? { assetId: t.assetId, venue: venueOf(t.assetId), qty: 0, avgUsd: 0, entryDate: isoDate(t.at) };
    if (t.side === "buy") {
      if (cur.qty <= 1e-12) cur.entryDate = isoDate(t.at);
      cur.avgUsd = (cur.avgUsd * cur.qty + t.priceUsd * t.qty) / (cur.qty + t.qty);
      cur.qty += t.qty;
      cash -= t.qty * t.priceUsd + t.feeUsd;
    } else {
      cur.qty -= t.qty;
      cash += t.qty * t.priceUsd - t.feeUsd;
    }
    if (cur.qty <= 1e-9) h.delete(t.assetId);
    else h.set(t.assetId, cur);
  }
  return { holdings: [...h.values()], cash };
}
