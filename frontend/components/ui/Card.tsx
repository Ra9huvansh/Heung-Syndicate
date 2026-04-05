import { CSSProperties } from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  shadowColor?: string;
}

export default function Card({ children, className = "", style, shadowColor = "#000" }: CardProps) {
  return (
    <div
      className={className}
      style={{
        border: "3px solid #000",
        boxShadow: `5px 5px 0 0 ${shadowColor}`,
        backgroundColor: "#fff",
        padding: "1.5rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
