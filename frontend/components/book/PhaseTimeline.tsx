"use client";

const PHASES = [
  { label: "Setup",          id: 0 },
  { label: "Commitment",     id: 1 },
  { label: "Reveal",         id: 2 },
  { label: "Price Discovery",id: 3 },
  { label: "Allocation",     id: 4 },
  { label: "Settlement",     id: 5 },
  { label: "Closed",         id: 6 },
];

interface PhaseTimelineProps {
  currentPhase: number;
  timeRemaining?: number; // seconds
}

function formatTime(seconds: number) {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function PhaseTimeline({ currentPhase, timeRemaining }: PhaseTimelineProps) {
  return (
    <div
      style={{
        border: "3px solid #000",
        boxShadow: "5px 5px 0 0 #000",
        backgroundColor: "#fff",
        padding: "1.25rem 1.5rem",
      }}
    >
      <p
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontWeight: 700,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "1rem",
        }}
      >
        IPO Phase
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {PHASES.map((phase, i) => {
          const isPast    = phase.id < currentPhase;
          const isCurrent = phase.id === currentPhase;
          const isFuture  = phase.id > currentPhase;

          return (
            <div key={phase.id} style={{ display: "flex", alignItems: "center", flex: i < PHASES.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Circle */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    border: "3px solid #000",
                    backgroundColor: isCurrent ? "#FFD23F" : isPast ? "#000" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isCurrent ? "3px 3px 0 0 #000" : "none",
                    flexShrink: 0,
                  }}
                >
                  {isPast && (
                    <span style={{ color: "#FFD23F", fontSize: "0.75rem", fontWeight: 700 }}>✓</span>
                  )}
                  {isCurrent && (
                    <span style={{ fontFamily: "Space Mono", fontSize: "0.6rem", fontWeight: 700 }}>
                      {phase.id}
                    </span>
                  )}
                </div>
                {/* Label */}
                <span
                  style={{
                    fontFamily: "Space Grotesk, sans-serif",
                    fontWeight: isCurrent ? 700 : 400,
                    fontSize: "0.6rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginTop: "0.35rem",
                    color: isFuture ? "rgba(0,0,0,0.35)" : "#000",
                    whiteSpace: "nowrap",
                  }}
                >
                  {phase.label}
                </span>
              </div>

              {/* Connector line */}
              {i < PHASES.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 3,
                    backgroundColor: isPast ? "#000" : "#e5e7eb",
                    marginBottom: "1.1rem",
                    marginLeft: "-1px",
                    marginRight: "-1px",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Countdown */}
      {typeof timeRemaining === "number" && currentPhase < 6 && (
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(0,0,0,0.55)" }}>
            Time remaining:{"  "}
          </span>
          <span style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1rem" }}>
            {formatTime(timeRemaining)}
          </span>
        </div>
      )}
    </div>
  );
}
