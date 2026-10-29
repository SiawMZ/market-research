import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Desk",
  description: "Stocks and crypto tracker with two paper portfolios",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center gap-8">
            <span className="font-semibold tracking-tight">Market Desk</span>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 sm:px-6 pb-10 text-xs text-muted leading-relaxed">
          Paper trading and personal research only, not financial advice. Data: CoinGecko, Binance, Hyperliquid, DefiLlama,
          alternative.me, Yahoo Finance, Forex Factory, OpenInsider (SEC Form 4). BTC ETF flows: The Commoner Bitcoin ETF
          Tracker by TFTC, tftc.io/bitcoin-etf-flows (CC BY 4.0).
        </footer>
      </body>
    </html>
  );
}
