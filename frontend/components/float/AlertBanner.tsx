interface AlertBannerProps {
  ticker:       string;
  floatPct:     string;
  requiredPct:  string;
  type:         "warning" | "breach";
}

export default function AlertBanner({ ticker, floatPct, requiredPct, type }: AlertBannerProps) {
  const isBreach = type === "breach";
  return (
    <div
      style={{
        border: "3px solid #000",
        boxShadow: isBreach ? "5px 5px 0 0 #EF4444" : "5px 5px 0 0 #FFA552",
        backgroundColor: isBreach ? "#EF4444" : "#FFA552",
        color: isBreach ? "#fff" : "#000",
        padding: "0.75rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {isBreach ? "⚠ FLOAT BREACH" : "⚑ FLOAT WARNING"}
        </span>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.95rem" }}>
          {ticker}
        </span>
      </div>
      <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.85rem" }}>
        {floatPct}% public float — minimum {requiredPct}%
      </span>
    </div>
  );
}
