"use client";

import Link from "next/link";

type IPOStatus = "CLOSED" | "LIVE" | "UPCOMING";

const STATUS_COLORS: Record<IPOStatus, { bg: string; shadow: string; text: string }> = {
  CLOSED:   { bg: "#22C55E", shadow: "5px 5px 0 0 #22C55E", text: "#000" },
  LIVE:     { bg: "#FFD23F", shadow: "5px 5px 0 0 #FFD23F", text: "#000" },
  UPCOMING: { bg: "#e5e7eb", shadow: "5px 5px 0 0 #000",    text: "#000" },
};

const IPOS: { name: string; ticker: string; sector: string; marketCap: string; priceRange: string; totalShares: string; mechanism: string; status: IPOStatus; opens: string | null; closes: string | null; strikePrice: string | null; coverage: string | null; links: { bookrunner: string; investor: string; regulator: string } | null }[] = [
  {
    name:        "HashTech Holdings",
    ticker:      "HTH",
    sector:      "Technology",
    marketCap:   "HK$1.2B",
    priceRange:  "HK$8.00 – HK$10.00",
    totalShares: "100,000,000",
    mechanism:   "Mechanism A",
    status:      "LIVE" as const,
    opens:       "Apr 6, 2026",
    closes:      "Apr 8, 2026",
    strikePrice: null,
    coverage:    null,
    links: {
      bookrunner: "/dashboard",
      investor:   "/investor",
      regulator:  "/regulator",
    },
  },
  {
    name:        "FinServ Capital",
    ticker:      "FSC",
    sector:      "Financial Services",
    marketCap:   "HK$5.0B",
    priceRange:  "HK$12.00 – HK$15.00",
    totalShares: "200,000,000",
    mechanism:   "Mechanism A",
    status:      "UPCOMING" as const,
    opens:       "May 12, 2026",
    closes:      "May 19, 2026",
    strikePrice: null,
    coverage:    null,
    links:       null,
  },
  {
    name:        "MegaCorp Industries",
    ticker:      "MCI",
    sector:      "Industrials",
    marketCap:   "HK$15.0B",
    priceRange:  "HK$22.00 – HK$28.00",
    totalShares: "500,000,000",
    mechanism:   "Mechanism B",
    status:      "UPCOMING" as const,
    opens:       "Jun 3, 2026",
    closes:      "Jun 10, 2026",
    strikePrice: null,
    coverage:    null,
    links:       null,
  },
];

export default function IPOsPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "2.5rem", letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
          IPO Registry
        </h1>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, fontSize: "0.875rem", color: "rgba(0,0,0,0.55)" }}>
          On-chain bookbuilding lifecycle — HashKey Chain Testnet. Post-August 2025 HKEX rules enforced in smart contracts.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Total IPOs",    value: "3" },
          { label: "Live / Closed", value: "1" },
          { label: "Upcoming",      value: "2" },
        ].map(({ label, value }) => (
          <div key={label} style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.25rem 1.5rem" }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(0,0,0,0.55)", marginBottom: "0.4rem" }}>{label}</p>
            <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "2rem", lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* IPO cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {IPOS.map((ipo) => {
          const colors = STATUS_COLORS[ipo.status];
          const isUpcoming = ipo.status === "UPCOMING";

          return (
            <div
              key={ipo.ticker}
              style={{
                border: "3px solid #000",
                boxShadow: isUpcoming ? "5px 5px 0 0 #000" : "5px 5px 0 0 #22C55E",
                backgroundColor: "#fff",
                opacity: isUpcoming ? 0.75 : 1,
              }}
            >
              {/* Top row */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.25rem 1.5rem",
                borderBottom: "3px solid #000",
                backgroundColor: isUpcoming ? "#fff" : "#FFFDF5",
                flexWrap: "wrap",
                gap: "1rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {/* Status badge */}
                  <span style={{
                    fontFamily: "Space Grotesk, sans-serif",
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "0.25rem 0.6rem",
                    border: "2px solid #000",
                    backgroundColor: colors.bg,
                    color: colors.text,
                    boxShadow: "2px 2px 0 0 #000",
                    whiteSpace: "nowrap",
                  }}>
                    {ipo.status === "CLOSED" ? "● CLOSED" : ipo.status === "LIVE" ? "● LIVE" : "○ UPCOMING"}
                  </span>

                  {/* Name + ticker */}
                  <div>
                    <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.35rem", letterSpacing: "-0.01em", margin: 0 }}>
                      {ipo.name}
                    </h2>
                    <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "rgba(0,0,0,0.5)", margin: 0 }}>
                      {ipo.ticker} · {ipo.sector}
                    </p>
                  </div>
                </div>

                {/* Price range */}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(0,0,0,0.5)", marginBottom: "0.15rem" }}>Price Range</p>
                  <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1rem", margin: 0 }}>{ipo.priceRange}</p>
                </div>
              </div>

              {/* Detail row */}
              <div style={{ padding: "1rem 1.5rem", display: "flex", gap: "2.5rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
                  {[
                    { label: "Market Cap",    value: ipo.marketCap },
                    { label: "Total Shares",  value: ipo.totalShares },
                    { label: "Mechanism",     value: ipo.mechanism },
                    ipo.strikePrice ? { label: "Strike Price",  value: ipo.strikePrice } : null,
                    ipo.coverage    ? { label: "Book Coverage", value: ipo.coverage }    : null,
                    ipo.opens  ? { label: "Bookbuilding Opens",  value: ipo.opens  } : null,
                    ipo.closes ? { label: ipo.status === "CLOSED" ? "Closed" : "Closes", value: ipo.closes } : null,
                  ].filter(Boolean).map((item) => (
                    <div key={item!.label}>
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(0,0,0,0.45)", marginBottom: "0.15rem" }}>
                        {item!.label}
                      </p>
                      <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "0.875rem", margin: 0 }}>
                        {item!.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Action links */}
                {ipo.links ? (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {([
                      { href: ipo.links.bookrunner, label: "Bookrunner" },
                      { href: ipo.links.investor,   label: "Investor"   },
                      { href: ipo.links.regulator,  label: "Regulator"  },
                    ] as { href: string; label: string }[]).map(({ href, label }) => (
                      <Link
                        key={label}
                        href={href}
                        style={{
                          fontFamily: "Space Grotesk, sans-serif",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          textDecoration: "none",
                          padding: "0.35rem 0.85rem",
                          border: "2px solid #000",
                          backgroundColor: "#000",
                          color: "#FFD23F",
                          boxShadow: "3px 3px 0 0 #22C55E",
                          display: "inline-block",
                        }}
                      >
                        {label} →
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    fontFamily: "Space Grotesk, sans-serif",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    color: "rgba(0,0,0,0.4)",
                    border: "2px solid rgba(0,0,0,0.2)",
                    padding: "0.35rem 0.85rem",
                  }}>
                    Bookbuilding opens {ipo.opens}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.75rem", color: "rgba(0,0,0,0.4)", marginTop: "2rem", textAlign: "center" }}>
        All IPOs governed by HKEX August 2025 reform rules — 40% bookbuilding minimum, Mechanism A/B clawback, cornerstone lock-up enforced on-chain.
      </p>
    </div>
  );
}
