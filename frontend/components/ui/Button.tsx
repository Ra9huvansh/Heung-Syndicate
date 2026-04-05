"use client";

import { ButtonHTMLAttributes, CSSProperties } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "ghost" | "yellow";
  size?: "sm" | "md" | "lg";
}

const VARIANTS: Record<string, CSSProperties> = {
  primary: { backgroundColor: "#000", color: "#FFD23F",  boxShadow: "4px 4px 0 0 #FFD23F" },
  danger:  { backgroundColor: "#EF4444", color: "#fff",  boxShadow: "4px 4px 0 0 #000"   },
  ghost:   { backgroundColor: "#fff",  color: "#000",    boxShadow: "4px 4px 0 0 #000"   },
  yellow:  { backgroundColor: "#FFD23F", color: "#000",  boxShadow: "4px 4px 0 0 #000"   },
};

const SIZES: Record<string, CSSProperties> = {
  sm: { padding: "0.35rem 0.8rem",  fontSize: "0.75rem" },
  md: { padding: "0.6rem 1.25rem",  fontSize: "0.875rem" },
  lg: { padding: "0.85rem 1.75rem", fontSize: "1rem"     },
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  style,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        border: "3px solid #000",
        fontFamily: "Space Grotesk, sans-serif",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "transform 100ms ease, box-shadow 100ms ease",
        ...VARIANTS[variant],
        ...SIZES[size],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).style.transform = "translate(-2px, -2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = `7px 7px 0 0 #000`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = VARIANTS[variant].boxShadow as string;
      }}
      onMouseDown={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).style.transform = "translate(3px, 3px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {children}
    </button>
  );
}
