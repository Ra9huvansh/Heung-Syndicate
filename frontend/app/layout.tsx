import type { Metadata } from "next";
import "./globals.css";
import ClientShell from "@/components/layout/ClientShell";

export const metadata: Metadata = {
  title: "Heung Syndicate: On-Chain IPO Compliance",
  description: "Complete on-chain IPO lifecycle compliance infrastructure for post-August-2025 HKEX rules.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: "#FFFDF5", fontFamily: "Inter, sans-serif" }}
      >
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
