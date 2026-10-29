import type { Fees } from "@/config/portfolios";

export type Venue = "crypto" | "us" | "my";

/**
 * Fee in USD for one order. qty is units/shares; priceUsd is the per-unit price in USD.
 * Bursa fees are charged in ringgit, so they're computed in MYR and converted back with usdMyr.
 */
export function orderFeeUsd(venue: Venue, qty: number, priceUsd: number, fees: Fees, usdMyr: number): number {
  const value = qty * priceUsd;
  if (venue === "crypto") return value * fees.cryptoPct;
  if (venue === "us") {
    const settlement = Math.min(qty * fees.usSettlementPerShareUsd, value * fees.usSettlementCapPct);
    return value * fees.usCommissionPct + fees.usPlatformUsd + settlement;
  }
  const valueMyr = value * usdMyr;
  const stamp = Math.ceil(valueMyr / 1000) * fees.myStampPerThousandMyr;
  const feeMyr = valueMyr * fees.myCommissionPct + fees.myPlatformMyr + valueMyr * fees.myClearingPct + stamp;
  return feeMyr / usdMyr;
}
