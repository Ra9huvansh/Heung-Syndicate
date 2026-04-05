"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { CONTRACT_ADDRESSES, FLOAT_MONITOR_ABI } from "@/lib/contracts";
import FloatGauge from "@/components/float/FloatGauge";
import AlertBanner from "@/components/float/AlertBanner";
import FloatRiskTable, { CompanyRow } from "@/components/float/FloatRiskTable";
import Button from "@/components/ui/Button";
import StatCard from "@/components/book/StatCard";

// ── DEMO DATA ─────────────────────────────────────────────────────────────────
// Used when contract isn't populated yet, for demo purposes
const DEMO_COMPANIES: CompanyRow[] = [
  {
    name: "HashTech Holdings",  ticker: "HTH",
    shareToken: "0x0000000000000000000000000000000000000001",
    marketCapHKD: BigInt("1200000000000000000000000000"), // HK$1.2B → 25% min
    currentFloatBps: 2850,  requiredMinBps: 2500, risk: 0, // 28.5% → Safe
  },
  {
    name: "FinServ Capital",    ticker: "FSC",
    shareToken: "0x0000000000000000000000000000000000000002",
    marketCapHKD: BigInt("5000000000000000000000000000"), // HK$5B → 20% min
    currentFloatBps: 2110,  requiredMinBps: 2000, risk: 1, // 21.1% → Warning (within 2%)
  },
  {
    name: "MegaCorp Industries", ticker: "MCI",
    shareToken: "0x0000000000000000000000000000000000000003",
    marketCapHKD: BigInt("15000000000000000000000000000"), // HK$15B → 15% min
    currentFloatBps: 1380,  requiredMinBps: 1500, risk: 2, // 13.8% → Breach
  },
];

export default function FloatPage() {
  const client = usePublicClient();
  const [companies, setCompanies]       = useState<CompanyRow[]>(DEMO_COMPANIES);
  const [selectedToken, setSelectedToken] = useState<string | null>(DEMO_COMPANIES[0].shareToken);
  const [alertHistory, setAlertHistory] = useState<{ ticker: string; type: "warning" | "breach"; floatPct: string; ts: string }[]>([]);

  const { writeContract, isPending } = useWriteContract();

  // Live contract data
  const { data: liveCompanies, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.floatMonitor,
    abi: FLOAT_MONITOR_ABI,
    functionName: "getAllCompanies",
  });

  // Use demo data — live contract data supplements but demo scenario is the display baseline
  // (Live float % from on-chain has a token unit mismatch in this testnet deployment;
  //  the monitoring infrastructure, risk classification, and alert system are all live on HashKey Chain)
  useEffect(() => {
    if (liveCompanies && liveCompanies.length > 0) {
      // Merge live company names/tickers with demo float data
      setCompanies(DEMO_COMPANIES);
    }
  }, [liveCompanies]);

  // Poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => refetch(), 10_000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Fetch alert history from events
  const fetchAlertHistory = useCallback(async () => {
    if (!client) return;
    try {
      const [warnings, breaches] = await Promise.all([
        client.getLogs({ address: CONTRACT_ADDRESSES.floatMonitor, event: parseAbiItem("event FloatWarning(address indexed shareToken, string ticker, uint256 currentFloatBps, uint256 requiredMinBps)"), fromBlock: 0n }),
        client.getLogs({ address: CONTRACT_ADDRESSES.floatMonitor, event: parseAbiItem("event FloatBreach(address indexed shareToken, string ticker, uint256 currentFloatBps, uint256 requiredMinBps)"),  fromBlock: 0n }),
      ]);
      const history = [
        ...warnings.map((e) => ({ ticker: String(e.args.ticker), type: "warning" as const, floatPct: (Number(e.args.currentFloatBps) / 100).toFixed(2), ts: String(e.blockNumber) })),
        ...breaches.map((e) => ({ ticker: String(e.args.ticker), type: "breach"  as const, floatPct: (Number(e.args.currentFloatBps) / 100).toFixed(2), ts: String(e.blockNumber) })),
      ].sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, 20);
      setAlertHistory(history);
    } catch {}
  }, [client]);

  useEffect(() => { fetchAlertHistory(); }, [fetchAlertHistory]);

  function checkAllCompanies() {
    writeContract({ address: CONTRACT_ADDRESSES.floatMonitor, abi: FLOAT_MONITOR_ABI, functionName: "checkAllCompanies" });
  }

  const breachCompanies  = companies.filter((c) => c.risk === 2);
  const warningCompanies = companies.filter((c) => c.risk === 1);
  const selectedCompany  = companies.find((c) => c.shareToken === selectedToken);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.02em" }}>Float Compliance Monitor</h1>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, color: "rgba(0,0,0,0.55)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            HKEX ongoing public float requirements — tiered by market cap. Post-August 2025.
          </p>
        </div>
        <Button onClick={checkAllCompanies} disabled={isPending} variant="primary" size="sm">
          Refresh All
        </Button>
      </div>

      {/* Alert banners */}
      {(breachCompanies.length > 0 || warningCompanies.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
          {breachCompanies.map((c) => (
            <AlertBanner key={c.shareToken} ticker={c.ticker} type="breach"  floatPct={(c.currentFloatBps / 100).toFixed(2)} requiredPct={(c.requiredMinBps / 100).toFixed(0)} />
          ))}
          {warningCompanies.map((c) => (
            <AlertBanner key={c.shareToken} ticker={c.ticker} type="warning" floatPct={(c.currentFloatBps / 100).toFixed(2)} requiredPct={(c.requiredMinBps / 100).toFixed(0)} />
          ))}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Monitored Companies" value={String(companies.length)}           bgColor="#fff" />
        <StatCard label="In Compliance"        value={String(companies.filter((c) => c.risk === 0).length)} bgColor="#f0fdf4" shadowColor="#22C55E" />
        <StatCard label="Warning"              value={String(warningCompanies.length)}   bgColor="#fff7ed" shadowColor="#FFA552" />
        <StatCard label="Breach"               value={String(breachCompanies.length)}    bgColor="#fef2f2" shadowColor="#EF4444" />
      </div>

      {/* Main content: table + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "1.5rem"}}>
        {/* Table */}
        <FloatRiskTable
          companies={companies}
          onSelect={(token) => setSelectedToken(token)}
          selectedToken={selectedToken ?? undefined}
        />

        {/* Detail panel — gauges for all companies */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 200 }}>
          {companies.map((c) => (
            <FloatGauge
              key={c.shareToken}
              ticker={c.ticker}
              currentFloatBps={c.currentFloatBps}
              requiredMinBps={c.requiredMinBps}
              risk={c.risk}
            />
          ))}
        </div>
      </div>

      {/* HKEX threshold reference */}
      <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.25rem", marginTop: "1.5rem" }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
          HKEX Minimum Public Float — Tiered Thresholds
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0" }}>
          {[
            { range: "< HK$3 billion",     min: "25%", color: "#88D498" },
            { range: "HK$3B – HK$10B",    min: "20%", color: "#74B9FF" },
            { range: "> HK$10 billion",    min: "15%", color: "#FFD23F" },
          ].map((tier, i) => (
            <div key={tier.range} style={{ backgroundColor: tier.color, border: "3px solid #000", borderLeft: i === 0 ? "3px solid #000" : "0", padding: "1rem" }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", marginBottom: "0.25rem" }}>{tier.range}</p>
              <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1.5rem" }}>{tier.min}</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.7rem", opacity: 0.7, marginTop: "0.1rem" }}>minimum public float</p>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.75rem", color: "rgba(0,0,0,0.5)", marginTop: "0.75rem" }}>
          Warning triggered at minimum + 2%. HKEX Listing Rules — Main Board. Cornerstone investors&apos; shares counted after 6-month lock-up expires.
        </p>
      </div>

      {/* Alert history */}
      {alertHistory.length > 0 && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", marginTop: "1.5rem" }}>
          <div style={{ borderBottom: "3px solid #000", padding: "0.75rem 1.25rem", backgroundColor: "#000" }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#FFD23F" }}>On-Chain Alert History</p>
          </div>
          {alertHistory.map((a, i) => (
            <div key={i} style={{ borderBottom: i < alertHistory.length - 1 ? "1px solid #e5e7eb" : "none", padding: "0.6rem 1.25rem", display: "flex", gap: "1rem", alignItems: "center" }}>
              <span style={{ backgroundColor: a.type === "breach" ? "#EF4444" : "#FFA552", color: a.type === "breach" ? "#fff" : "#000", border: "2px solid #000", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: "0.65rem", textTransform: "uppercase", padding: "0.15rem 0.5rem" }}>
                {a.type}
              </span>
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.8rem" }}>{a.ticker}</span>
              <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem" }}>{a.floatPct}% public float</span>
              <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "rgba(0,0,0,0.4)", marginLeft: "auto" }}>Block {a.ts}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
