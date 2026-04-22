import Link from "next/link";

const VIEWS = [
  {
    href: "/dashboard",
    label: "Bookrunner",
    desc: "Manage phases, set strike price, whitelist investors, view full order book post-reveal.",
    color: "#FFD23F",
  },
  {
    href: "/investor",
    label: "Investor Portal",
    desc: "Commit sealed IOI bids, reveal to update the live demand curve, claim allocated shares.",
    color: "#74B9FF",
  },
  {
    href: "/issuer",
    label: "Issuer View",
    desc: "Real-time verified aggregate demand: coverage ratio, weighted avg price, tranche split.",
    color: "#88D498",
  },
  {
    href: "/regulator",
    label: "Regulator View",
    desc: "Full immutable event log, Merkle allocation verifier, complete on-chain audit trail.",
    color: "#B8A9FA",
  },
  {
    href: "/float",
    label: "Float Monitor",
    desc: "Real-time HKEX float compliance: tiered thresholds, breach alerts, lock-up countdowns.",
    color: "#FF6B6B",
  },
];

export default function LandingPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 1.5rem" }}>
      {/* Hero */}
      <div style={{ marginBottom: "3.5rem" }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(0,0,0,0.5)", marginBottom: "0.75rem" }}>
          HashKey Chain Testnet | Chain ID 133
        </p>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.05, letterSpacing: "-0.03em", color: "#000", marginBottom: "1.25rem" }}>
          On-Chain IPO Lifecycle
          <br />
          Compliance Infrastructure
        </h1>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, fontSize: "1.1rem", color: "rgba(0,0,0,0.65)", maxWidth: 620, lineHeight: 1.6 }}>
          The complete post-August-2025 HKEX compliance system. Cryptographic
          bookbuilding, Merkle-rooted allocation reporting, and real-time public
          float monitoring, in a single on-chain system.
        </p>
      </div>

      {/* Three pillars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "3px solid #000", boxShadow: "8px 8px 0 0 #000", marginBottom: "4rem" }}>
        {[
          { label: "Commit-Reveal IOIs", desc: "Sealed bids cryptographically committed. Cannot be inflated or fabricated.", bg: "#FFD23F", color: "#000" },
          { label: "Merkle Audit Trail",  desc: "Every allocation verifiable on-chain. Any investor can prove their share.", bg: "#fff",    color: "#000" },
          { label: "Float Compliance",    desc: "Live HKEX float monitoring. Instant alerts for Warning and Breach status.", bg: "#000",    color: "#FFD23F" },
        ].map((item, i) => (
          <div key={item.label} style={{ padding: "1.75rem", borderRight: i < 2 ? "3px solid #000" : "none", backgroundColor: item.bg }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem", color: item.color }}>{item.label}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.875rem", lineHeight: 1.55, color: item.color, opacity: 0.75 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* View cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
        {VIEWS.map((view) => (
          <Link key={view.href} href={view.href} style={{ textDecoration: "none" }}>
            <div
              className="nb-interactive"
              style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: view.color, padding: "1.5rem", height: "100%" }}
            >
              <p style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.25rem", color: "#000", marginBottom: "0.5rem" }}>{view.label}</p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.875rem", color: "rgba(0,0,0,0.7)", lineHeight: 1.55 }}>{view.desc}</p>
              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid #000" }}>Open →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
