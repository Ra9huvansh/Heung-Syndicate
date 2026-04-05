"use client";

import { useEffect, useRef, useState } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: string;
  changeDirection?: "up" | "down" | "neutral";
  bgColor?: string;
  shadowColor?: string;
}

export default function StatCard({
  label,
  value,
  unit,
  change,
  changeDirection = "neutral",
  bgColor = "#fff",
  shadowColor = "#000",
}: StatCardProps) {
  const [flashClass, setFlashClass] = useState("");
  const [expanded, setExpanded] = useState(false);
  const valueRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    const el = valueRef.current;
    if (el) setOverflows(el.scrollWidth > el.clientWidth);
  }, [value]);

  useEffect(() => {
    if (value !== prevValue.current) {
      const cls = changeDirection === "up" ? "flash-positive" : changeDirection === "down" ? "flash-negative" : "";
      if (cls) {
        setFlashClass(cls);
        const t = setTimeout(() => setFlashClass(""), 350);
        prevValue.current = value;
        return () => clearTimeout(t);
      }
      prevValue.current = value;
    }
  }, [value, changeDirection]);

  return (
    <div
      className={flashClass}
      style={{
        border: "3px solid #000",
        boxShadow: `5px 5px 0 0 ${shadowColor}`,
        backgroundColor: bgColor,
        padding: "1.25rem 1.5rem",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <p
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontWeight: 600,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(0,0,0,0.55)",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </p>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", minWidth: 0 }}>
        <span
          ref={valueRef}
          onClick={() => overflows && setExpanded((e) => !e)}
          style={{
            fontFamily: "Space Mono, monospace",
            fontWeight: 700,
            fontSize: "1.75rem",
            lineHeight: 1,
            color: "#000",
            whiteSpace: expanded ? "normal" : "nowrap",
            overflow: expanded ? "visible" : "hidden",
            textOverflow: expanded ? "unset" : "ellipsis",
            cursor: overflows ? "pointer" : "default",
            textDecoration: overflows && !expanded ? "underline dotted rgba(0,0,0,0.3)" : "none",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontWeight: 500,
              fontSize: "0.875rem",
              color: "rgba(0,0,0,0.6)",
            }}
          >
            {unit}
          </span>
        )}
      </div>

      {change && (
        <div style={{ marginTop: "0.5rem" }}>
          <span
            style={{
              fontFamily: "Space Mono, monospace",
              fontSize: "0.75rem",
              padding: "0.1rem 0.5rem",
              border: "2px solid #000",
              boxShadow: "2px 2px 0 0 #000",
              backgroundColor: changeDirection === "up" ? "#22C55E" : changeDirection === "down" ? "#EF4444" : "#e5e7eb",
              color: changeDirection === "down" ? "#fff" : "#000",
            }}
          >
            {change}
          </span>
        </div>
      )}
    </div>
  );
}
