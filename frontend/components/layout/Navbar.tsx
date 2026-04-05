"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

const NAV_LINKS = [
  { href: "/ipos",      label: "IPOs"       },
  { href: "/dashboard", label: "Bookrunner" },
  { href: "/investor",  label: "Investor"   },
  { href: "/issuer",    label: "Issuer"     },
  { href: "/regulator", label: "Regulator"  },
  { href: "/float",     label: "Float"      },
];

function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect }    = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        style={{
          border: "2px solid #000",
          backgroundColor: "#000",
          color: "#FFD23F",
          fontFamily: "Space Mono, monospace",
          fontSize: "0.75rem",
          padding: "0.35rem 0.75rem",
          cursor: "pointer",
          boxShadow: "2px 2px 0 0 #FFD23F",
          letterSpacing: "0.02em",
        }}
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      style={{
        border: "2px solid #000",
        backgroundColor: "#000",
        color: "#FFD23F",
        fontFamily: "Space Grotesk, sans-serif",
        fontWeight: 700,
        fontSize: "0.75rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "0.35rem 0.9rem",
        cursor: "pointer",
        boxShadow: "2px 2px 0 0 #000",
        transition: "transform 100ms ease, box-shadow 100ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translate(-2px, -2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "4px 4px 0 0 #000";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "2px 2px 0 0 #000";
      }}
    >
      Connect Wallet
    </button>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        borderBottom: "3px solid #000",
        backgroundColor: "#FFD23F",
        boxShadow: "0 3px 0 0 #000",
      }}
      className="sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.25rem", color: "#000", textDecoration: "none", letterSpacing: "-0.02em" }}>
          HEUNG SYNDICATE
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  fontFamily: "Space Grotesk, sans-serif",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  textDecoration: "none",
                  padding: "0.35rem 0.75rem",
                  border: "2px solid #000",
                  backgroundColor: active ? "#000" : "transparent",
                  color: active ? "#FFD23F" : "#000",
                  boxShadow: active ? "none" : "2px 2px 0 0 #000",
                  transition: "transform 100ms ease, box-shadow 100ms ease",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <WalletButton />
      </div>
    </nav>
  );
}
