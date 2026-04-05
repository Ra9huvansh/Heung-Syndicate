"use client";

const RISK_BG     = { 0: "#f0fdf4", 1: "#fff7ed", 2: "#fef2f2" };
const RISK_BORDER = { 0: "#22C55E", 1: "#FFA552", 2: "#EF4444" };
const RISK_LABEL  = { 0: "SAFE", 1: "WARNING", 2: "BREACH" };
const RISK_BADGE  = { 0: "#22C55E", 1: "#FFA552", 2: "#EF4444" };

const TIER_LABELS: Record<string, string> = {
  "1000000000000000000000000000":  "< HK$3B",
  "3000000000000000000000000000":  "HK$3B–10B",
  "10000000000000000000000000000": "> HK$10B",
};

function formatMarketCap(wei: bigint): string {
  const hkd = Number(wei) / 1e18;
  if (hkd >= 1e9) return `HK$${(hkd / 1e9).toFixed(1)}B`;
  if (hkd >= 1e6) return `HK$${(hkd / 1e6).toFixed(0)}M`;
  return `HK$${hkd.toFixed(0)}`;
}

export interface CompanyRow {
  name:            string;
  ticker:          string;
  shareToken:      string;
  marketCapHKD:    bigint;
  currentFloatBps: number;
  requiredMinBps:  number;
  risk:            0 | 1 | 2;
}

interface FloatRiskTableProps {
  companies:  CompanyRow[];
  onSelect:   (token: string) => void;
  selectedToken?: string;
}

export default function FloatRiskTable({ companies, onSelect, selectedToken }: FloatRiskTableProps) {
  return (
    <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff" }}>
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1.5fr 1.2fr 1.2fr 1fr",
          gap: 0,
          borderBottom: "3px solid #000",
          padding: "0.6rem 1rem",
          backgroundColor: "#000",
        }}
      >
        {["Company", "Ticker", "Market Cap", "Min Float", "Current Float", "Status"].map((h) => (
          <span key={h} style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#FFD23F" }}>
            {h}
          </span>
        ))}
      </div>

      {companies.map((c, i) => {
        const isSelected = c.shareToken === selectedToken;
        return (
          <div
            key={c.shareToken}
            onClick={() => onSelect(c.shareToken)}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1.5fr 1.2fr 1.2fr 1fr",
              gap: 0,
              padding: "0.75rem 1rem",
              borderBottom: i < companies.length - 1 ? "2px solid #e5e7eb" : "none",
              borderLeft: `4px solid ${RISK_BORDER[c.risk]}`,
              backgroundColor: isSelected ? RISK_BG[c.risk] : "#fff",
              cursor: "pointer",
              transition: "background-color 120ms",
            }}
          >
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.875rem" }}>{c.name}</span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", fontWeight: 700 }}>{c.ticker}</span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem" }}>{formatMarketCap(c.marketCapHKD)}</span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem" }}>{(c.requiredMinBps / 100).toFixed(0)}%</span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", fontWeight: 700, color: RISK_BORDER[c.risk] }}>
              {(c.currentFloatBps / 100).toFixed(2)}%
            </span>
            <span>
              <span
                style={{
                  backgroundColor: RISK_BADGE[c.risk],
                  color: c.risk === 2 ? "#fff" : "#000",
                  border: "2px solid #000",
                  boxShadow: "2px 2px 0 0 #000",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "0.15rem 0.5rem",
                  display: "inline-block",
                }}
              >
                {RISK_LABEL[c.risk]}
              </span>
            </span>
          </div>
        );
      })}

      {companies.length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", color: "rgba(0,0,0,0.4)" }}>No companies registered</p>
        </div>
      )}
    </div>
  );
}
