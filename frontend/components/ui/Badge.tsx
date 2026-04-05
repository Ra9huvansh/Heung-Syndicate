interface BadgeProps {
  children: React.ReactNode;
  color?: "green" | "red" | "yellow" | "orange" | "blue" | "gray";
}

const COLORS = {
  green:  { background: "#22C55E", color: "#000", boxShadow: "2px 2px 0 0 #000" },
  red:    { background: "#EF4444", color: "#fff", boxShadow: "2px 2px 0 0 #000" },
  yellow: { background: "#FFD23F", color: "#000", boxShadow: "2px 2px 0 0 #000" },
  orange: { background: "#FFA552", color: "#000", boxShadow: "2px 2px 0 0 #000" },
  blue:   { background: "#74B9FF", color: "#000", boxShadow: "2px 2px 0 0 #000" },
  gray:   { background: "#e5e7eb", color: "#000", boxShadow: "2px 2px 0 0 #000" },
};

export default function Badge({ children, color = "gray" }: BadgeProps) {
  return (
    <span
      style={{
        ...COLORS[color],
        border: "2px solid #000",
        padding: "0.1rem 0.5rem",
        fontFamily: "Space Grotesk, sans-serif",
        fontWeight: 600,
        fontSize: "0.7rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}
