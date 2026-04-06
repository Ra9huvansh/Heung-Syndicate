"use client";

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DemandPoint {
  price: number;  // HKD (already converted from wei)
  demand: number; // cumulative shares
}

interface DemandCurveProps {
  data: DemandPoint[];
  priceRangeLow: number;
  priceRangeHigh: number;
  strikePrice?: number;
}

const MonoTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) => (
  <text
    x={x}
    y={y}
    dy={14}
    textAnchor="middle"
    fill="#000"
    style={{ fontFamily: "Space Mono, monospace", fontSize: 11 }}
  >
    {typeof payload?.value === "number" ? `HK$${payload.value.toFixed(2)}` : ""}
  </text>
);

const MonoTickY = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) => (
  <text
    x={x}
    y={y}
    dx={-6}
    dy={4}
    textAnchor="end"
    fill="#000"
    style={{ fontFamily: "Space Mono, monospace", fontSize: 11 }}
  >
    {typeof payload?.value === "number" ? (payload.value / 1_000_000).toFixed(1) + "M" : ""}
  </text>
);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ border: "3px solid #000", backgroundColor: "#fff", padding: "0.75rem", boxShadow: "4px 4px 0 0 #000" }}>
      <p style={{ fontFamily: "Space Mono, monospace", fontSize: 12, margin: 0 }}>
        Price: <strong>HK${Number(label).toFixed(2)}</strong>
      </p>
      <p style={{ fontFamily: "Space Mono, monospace", fontSize: 12, margin: "0.25rem 0 0" }}>
        Demand: <strong>{(payload[0].value / 1_000_000).toFixed(2)}M shares</strong>
      </p>
    </div>
  );
};

export default function DemandCurve({ data, priceRangeLow, priceRangeHigh, strikePrice }: DemandCurveProps) {
  return (
    <div
      style={{
        border: "3px solid #000",
        boxShadow: "5px 5px 0 0 #000",
        backgroundColor: "#fff",
        padding: "1.5rem",
      }}
    >
      <p
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontWeight: 700,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "1.25rem",
        }}
      >
        Demand Curve — Cumulative IOI Book
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="none" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="price" type="number" domain={[priceRangeLow - 0.5, priceRangeHigh + 0.5]} tick={<MonoTick />} tickLine={false} axisLine={{ stroke: "#000", strokeWidth: 2 }} />
          <YAxis tick={<MonoTickY />} tickLine={false} axisLine={{ stroke: "#000", strokeWidth: 2 }} />
          <Tooltip content={<CustomTooltip />} />

          {/* Price range bands */}
          <ReferenceLine x={priceRangeLow}  stroke="#000" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "Low",  position: "insideTopLeft",  style: { fontFamily: "Space Mono", fontSize: 10 } }} />
          <ReferenceLine x={priceRangeHigh} stroke="#000" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "High", position: "insideTopRight", style: { fontFamily: "Space Mono", fontSize: 10 } }} />

          {/* Strike price line */}
          {strikePrice != null && (
            <ReferenceLine x={strikePrice} stroke="#EF4444" strokeWidth={2.5} label={{ value: "Strike", position: "insideTopLeft", style: { fontFamily: "Space Mono", fontSize: 11, fill: "#EF4444", fontWeight: 700 } }} />
          )}

          {/* Stepped demand area — the core visual */}
          <Area
            type="stepAfter"
            dataKey="demand"
            stroke="#22C55E"
            strokeWidth={3}
            fill="#22C55E"
            fillOpacity={0.18}
            dot={false}
            activeDot={{ r: 4, stroke: "#000", strokeWidth: 2, fill: "#22C55E" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {data.length === 0 && (
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.875rem", color: "rgba(0,0,0,0.4)", textAlign: "center", marginTop: "1rem" }}>
          Awaiting reveal phase — demand curve builds as IOIs are revealed
        </p>
      )}
    </div>
  );
}
