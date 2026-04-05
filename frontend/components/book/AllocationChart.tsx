"use client";

interface AllocationChartProps {
  cornerstoneBps:   number;
  institutionalBps: number;
  retailBps:        number;
  cornerstoneShares:   number;
  institutionalShares: number;
  retailShares:        number;
}

export default function AllocationChart({
  cornerstoneBps, institutionalBps, retailBps,
  cornerstoneShares, institutionalShares, retailShares,
}: AllocationChartProps) {
  const total = cornerstoneBps + institutionalBps + retailBps;
  if (total === 0) {
    return (
      <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.5rem" }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Tranche Allocation</p>
        <p style={{ fontFamily: "Space Grotesk", fontSize: "0.875rem", color: "rgba(0,0,0,0.4)" }}>Allocation not yet computed</p>
      </div>
    );
  }

  const segments = [
    { label: "Cornerstone",   bps: cornerstoneBps,   shares: cornerstoneShares,   color: "#FFD23F" },
    { label: "Institutional", bps: institutionalBps, shares: institutionalShares, color: "#74B9FF" },
    { label: "Retail",        bps: retailBps,        shares: retailShares,        color: "#88D498" },
  ];

  return (
    <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.5rem" }}>
      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
        Tranche Allocation
      </p>

      {/* Stacked bar */}
      <div style={{ display: "flex", height: 52, border: "3px solid #000", overflow: "hidden", position: "relative" }}>
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            style={{
              width: `${(seg.bps / total) * 100}%`,
              backgroundColor: seg.color,
              borderRight: i < segments.length - 1 ? "2px solid #000" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap", color: "#000" }}>
              {(seg.bps / 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Min 40% bookbuilding reference */}
      <div style={{ marginTop: "0.5rem", position: "relative", height: 20 }}>
        <div style={{ position: "absolute", left: "40%", top: 0, width: 2, height: 14, backgroundColor: "#EF4444" }} />
        <p style={{ position: "absolute", left: "40%", top: 14, transform: "translateX(-50%)", fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#EF4444", whiteSpace: "nowrap" }}>
          ▲ Min 40% bookbuilding (HKEX Aug 2025)
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ width: 14, height: 14, backgroundColor: seg.color, border: "2px solid #000" }} />
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem" }}>
              {seg.label}
            </span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "rgba(0,0,0,0.6)" }}>
              {(seg.shares / 1_000_000).toFixed(1)}M
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
