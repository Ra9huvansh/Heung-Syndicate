"use client";

import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

interface FloatGaugeProps {
  currentFloatBps:  number; // e.g. 2730 = 27.30%
  requiredMinBps:   number; // e.g. 2500 = 25.00%
  ticker:           string;
  risk:             0 | 1 | 2; // 0=Safe, 1=Warning, 2=Breach
}

const RISK_COLORS = { 0: "#22C55E", 1: "#FFA552", 2: "#EF4444" };
const RISK_LABELS = { 0: "SAFE", 1: "WARNING", 2: "BREACH" };
const RISK_SHADOW = { 0: "5px 5px 0 0 #22C55E", 1: "5px 5px 0 0 #FFA552", 2: "5px 5px 0 0 #EF4444" };

export default function FloatGauge({ currentFloatBps, requiredMinBps, ticker, risk }: FloatGaugeProps) {
  const currentPct = (currentFloatBps / 100).toFixed(2);
  const requiredPct = (requiredMinBps / 100).toFixed(1);
  const color = RISK_COLORS[risk];

  const data = [{ value: currentFloatBps, fill: color }];

  return (
    <div
      style={{
        border: "3px solid #000",
        boxShadow: RISK_SHADOW[risk],
        backgroundColor: "#fff",
        padding: "1.5rem",
        textAlign: "center",
        minWidth: 180,
      }}
    >
      {/* Ticker */}
      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
        {ticker}
      </p>

      {/* Gauge */}
      <div style={{ position: "relative", height: 140 }}>
        <ResponsiveContainer width="100%" height={140}>
          <RadialBarChart
            cx="50%"
            cy="70%"
            innerRadius="60%"
            outerRadius="90%"
            startAngle={180}
            endAngle={0}
            data={data}
            barSize={14}
          >
            {/* Background track */}
            <RadialBar background={{ fill: "#e5e7eb" }} dataKey="value" />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center text overlay */}
        <div
          style={{
            position: "absolute",
            bottom: "14px",
            left: 0,
            right: 0,
            textAlign: "center",
          }}
        >
          <span style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1.75rem", color }}>
            {currentPct}%
          </span>
        </div>
      </div>

      {/* Risk badge */}
      <div style={{ marginTop: "0.5rem" }}>
        <span
          style={{
            backgroundColor: color,
            color: risk === 2 ? "#fff" : "#000",
            border: "2px solid #000",
            boxShadow: "2px 2px 0 0 #000",
            fontFamily: "Space Grotesk, sans-serif",
            fontWeight: 700,
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "0.2rem 0.7rem",
            display: "inline-block",
          }}
        >
          {RISK_LABELS[risk]}
        </span>
      </div>

      <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "rgba(0,0,0,0.5)", marginTop: "0.5rem" }}>
        Min required: {requiredPct}%
      </p>
    </div>
  );
}
