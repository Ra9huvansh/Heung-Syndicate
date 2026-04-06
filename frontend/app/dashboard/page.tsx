"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWatchContractEvent, usePublicClient } from "wagmi";
import { formatUnits, parseUnits, parseAbiItem } from "viem";
import { CONTRACT_ADDRESSES, BOOK_BUILDER_ABI, ORDER_BOOK_ABI, ALLOCATION_ABI } from "@/lib/contracts";
import StatCard from "@/components/book/StatCard";
import PhaseTimeline from "@/components/book/PhaseTimeline";
import DemandCurve from "@/components/book/DemandCurve";
import AllocationChart from "@/components/book/AllocationChart";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

const PHASE_NAMES = ["Setup", "Commitment", "Reveal", "Price Discovery", "Allocation", "Settlement", "Closed"];

// ─── Neo brutalist toast ──────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
interface Toast { id: number; message: string; type: ToastType }

const TOAST_BG:     Record<ToastType, string> = { success: "#22C55E", error: "#EF4444", info: "#FFD23F" };
const TOAST_COLOR:  Record<ToastType, string> = { success: "#000",    error: "#fff",    info: "#000"    };
const TOAST_SHADOW: Record<ToastType, string> = { success: "5px 5px 0 0 #000", error: "5px 5px 0 0 #000", info: "5px 5px 0 0 #000" };

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 9999, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            backgroundColor: TOAST_BG[t.type],
            color: TOAST_COLOR[t.type],
            border: "3px solid #000",
            boxShadow: TOAST_SHADOW[t.type],
            padding: "0.75rem 1.25rem",
            fontFamily: "Space Grotesk, sans-serif",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            minWidth: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            animation: "slideIn 150ms ease-out",
          }}
        >
          <span>{t.message}</span>
          <span style={{ fontSize: "1rem", opacity: 0.6 }}>✕</span>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translate(20px, 0); opacity: 0; }
          to   { transform: translate(0,    0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function DashboardPage() {
  const { address } = useAccount();
  const [strikeInput,    setStrikeInput]    = useState("");
  const [whitelistInput, setWhitelistInput] = useState("");
  const [timeRemaining,  setTimeRemaining]  = useState(0);
  const [toasts,         setToasts]         = useState<Toast[]>([]);
  const [revealedBids,   setRevealedBids]   = useState<{ price: number; quantity: number }[]>([]);

  const publicClient = usePublicClient();
  let   toastId = 0;

  const { writeContract, isPending } = useWriteContract();

  // ── Toast helpers ───────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Contract reads ──────────────────────────────────────────────────────
  const { data: phase, refetch: refetchPhase } = useReadContract({
    address: CONTRACT_ADDRESSES.bookBuilder,
    abi: BOOK_BUILDER_ABI,
    functionName: "getPhase",
    query: { refetchInterval: 3000 },
  });

  const { data: offering } = useReadContract({
    address: CONTRACT_ADDRESSES.bookBuilder,
    abi: BOOK_BUILDER_ABI,
    functionName: "getOffering",
    query: { refetchInterval: 5000 },
  });

  const { data: demand, refetch: refetchDemand } = useReadContract({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    functionName: "getAggregatedDemand",
    query: { refetchInterval: 3000 },
  });

  const { data: commitCount, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    functionName: "getCommitmentCount",
    query: { refetchInterval: 3000 },
  });

  const { data: strikePrice, refetch: refetchStrike } = useReadContract({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    functionName: "strikePrice",
    query: { refetchInterval: 5000 },
  });

  const { data: trancheSummary, refetch: refetchTranche } = useReadContract({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    functionName: "getTrancheSummary",
    query: { refetchInterval: 5000 },
  });

  const { data: timeUntil } = useReadContract({
    address: CONTRACT_ADDRESSES.bookBuilder,
    abi: BOOK_BUILDER_ABI,
    functionName: "timeUntilNextDeadline",
    query: { refetchInterval: 5000 },
  });

  const { data: whitelistedAddresses, refetch: refetchWhitelist } = useReadContract({
    address: CONTRACT_ADDRESSES.bookBuilder,
    abi: BOOK_BUILDER_ABI,
    functionName: "getWhitelistedAddresses",
    query: { refetchInterval: 5000 },
  });

  // ── Fetch historical IOIRevealed events to build accurate demand curve ──
  useEffect(() => {
    if (!publicClient) return;
    const fetchLogs = async () => {
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESSES.orderBook,
          event: parseAbiItem("event IOIRevealed(address indexed investor, uint256 price, uint256 quantity, uint8 investorType, uint8 orderType)"),
          fromBlock,
          toBlock: "latest",
        });
        const bids = logs.map((log) => ({
          price:    Number(formatUnits((log.args as { price: bigint }).price, 18)),
          quantity: Number((log.args as { quantity: bigint }).quantity),
        }));
        if (bids.length > 0) setRevealedBids(bids);
      } catch (e) {
        console.error("getLogs failed", e);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [publicClient]);

  // ── Watch events ────────────────────────────────────────────────────────
  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    eventName: "AggregatedDemandUpdated",
    onLogs: () => { refetchDemand(); refetchCount(); },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.bookBuilder,
    abi: BOOK_BUILDER_ABI,
    eventName: "PhaseAdvanced",
    onLogs: (logs) => {
      refetchPhase();
      const to = Number((logs[0] as { args?: { to?: number } }).args?.to ?? 0);
      addToast(`Phase advanced → ${PHASE_NAMES[to]}`, "success");
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.bookBuilder,
    abi: BOOK_BUILDER_ABI,
    eventName: "InvestorWhitelisted",
    onLogs: (logs) => {
      const addr = String((logs[0] as { args?: { investor?: string } }).args?.investor ?? "");
      addToast(`Whitelisted ${addr.slice(0, 8)}…${addr.slice(-4)}`, "success");
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    eventName: "StrikePriceSet",
    onLogs: (logs) => {
      refetchStrike();
      const p = (logs[0] as { args?: { strikePrice?: bigint } }).args?.strikePrice ?? 0n;
      addToast(`Strike price set: HK$${Number(formatUnits(p, 18)).toFixed(2)}`, "success");
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    eventName: "AllocationFinalized",
    onLogs: () => {
      refetchTranche();
      addToast("Allocations finalized — Merkle root on-chain", "success");
    },
  });

  // ── Countdown ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (timeUntil) setTimeRemaining(Number(timeUntil));
    const interval = setInterval(() => setTimeRemaining((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [timeUntil]);

  // ── Demand curve data ────────────────────────────────────────────────────
  const priceLow       = offering ? Number(formatUnits(offering.priceRangeLow, 18))  : 8;
  const priceHigh      = offering ? Number(formatUnits(offering.priceRangeHigh, 18)) : 10;
  const strikePriceNum = strikePrice ? Number(formatUnits(strikePrice, 18)) : undefined;
  const coverageRatio  = demand ? Number(demand.coverageRatio) / 1e18 : 0;
  const weightedAvg    = demand ? Number(formatUnits(demand.weightedAvgPrice, 18)) : 0;
  const totalShares    = demand ? Number(demand.totalShares) : 0;

  // Build accurate cumulative demand curve from IOIRevealed events
  const demandCurveData = (() => {
    if (revealedBids.length === 0) return [];

    // Group quantities by price
    const priceMap = new Map<number, number>();
    for (const bid of revealedBids) {
      priceMap.set(bid.price, (priceMap.get(bid.price) ?? 0) + bid.quantity);
    }

    // Sort prices DESCENDING: walk from highest bid down to lowest
    // At each price point, demand = cumulative shares from investors willing to pay AT LEAST this price
    // i.e. subtract bids ABOVE this price as we walk down
    const sortedPrices = Array.from(priceMap.keys()).sort((a, b) => b - a); // high → low
    const points: { price: number; demand: number }[] = [];
    let cumulative = 0;
    for (const price of sortedPrices) {
      cumulative += priceMap.get(price)!;
      points.push({ price, demand: cumulative });
    }
    // Points are high→low; reverse to low→high for chart (left = cheap, right = expensive)
    points.reverse();
    // Extend flat line left to priceLow
    if (points.length > 0 && priceLow < points[0].price) {
      points.unshift({ price: priceLow, demand: points[0].demand });
    }
    return points;
  })();

  // ── Actions ──────────────────────────────────────────────────────────────
  function advancePhase() {
    writeContract(
      { address: CONTRACT_ADDRESSES.bookBuilder, abi: BOOK_BUILDER_ABI, functionName: "advancePhase" },
      {
        onSuccess: () => { refetchPhase(); addToast("Phase advanced successfully", "success"); },
        onError: (e) => addToast(e.message.split("\n")[0], "error"),
      }
    );
  }

  function setStrike() {
    if (!strikeInput) return;
    writeContract(
      { address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "setStrikePrice", args: [parseUnits(strikeInput, 18)] },
      {
        onSuccess: () => { setStrikeInput(""); addToast(`Strike set: HK$${strikeInput}`, "success"); },
        onError:   (e) => addToast(e.message.split("\n")[0], "error"),
      }
    );
  }

  function slashNonRevealers() {
    writeContract(
      { address: CONTRACT_ADDRESSES.orderBook, abi: ORDER_BOOK_ABI, functionName: "slashNonRevealers" },
      {
        onSuccess: () => addToast("Non-revealers slashed — deposits forfeited", "info"),
        onError:   (e) => addToast(e.message.split("\n")[0], "error"),
      }
    );
  }

  function computeAllocations() {
    writeContract(
      { address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "computeAllocations" },
      { onError: (e) => addToast(e.message.split("\n")[0], "error") }
    );
  }

  function whitelistInvestor() {
    if (!whitelistInput) return;
    writeContract(
      {
        address: CONTRACT_ADDRESSES.bookBuilder,
        abi: BOOK_BUILDER_ABI,
        functionName: "whitelistInvestor",
        args: [whitelistInput as `0x${string}`, false, false],
      },
      {
        onSuccess: () => {
          setWhitelistInput("");
          refetchWhitelist();
          addToast(`Address whitelisted`, "success");
        },
        onError: (e) => addToast(e.message.split("\n")[0], "error"),
      }
    );
  }

  const currentPhase = phase !== undefined ? Number(phase) : 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.02em" }}>
            Bookrunner Dashboard
          </h1>
          {offering && (
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, color: "rgba(0,0,0,0.55)", fontSize: "0.875rem", marginTop: "0.2rem" }}>
              {offering.companyName} ({offering.ticker}) — {Number(offering.totalShares).toLocaleString()} shares
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Badge color="yellow">{PHASE_NAMES[currentPhase]}</Badge>
          {address && (
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", border: "2px solid #000", padding: "0.2rem 0.5rem" }}>
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
        </div>
      </div>

      {/* Phase timeline */}
      <div style={{ marginBottom: "1.5rem" }}>
        <PhaseTimeline currentPhase={currentPhase} timeRemaining={timeRemaining} />
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Commitments"      value={String(commitCount ?? 0)}                                                                    unit="IOIs"   />
        <StatCard label="Coverage Ratio"   value={coverageRatio > 0 ? `${coverageRatio.toFixed(2)}x` : "—"}                                              />
        <StatCard label="Weighted Avg Bid" value={weightedAvg > 0 ? `HK$${weightedAvg.toFixed(2)}` : "—"}                                               />
        <StatCard label="Total Demand"     value={totalShares > 0 ? `${(totalShares / 1_000_000).toFixed(2)}M` : "—"}                         unit="shares" />
      </div>

      {/* Demand curve + controls */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <DemandCurve data={demandCurveData} priceRangeLow={priceLow} priceRangeHigh={priceHigh} strikePrice={strikePriceNum} />

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Phase advancement */}
          <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.25rem" }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>Phase Control</p>
            <Button onClick={advancePhase} disabled={isPending || currentPhase >= 6} variant="primary" size="sm" style={{ width: "100%" }}>
              {isPending ? "Confirming…" : "Advance Phase →"}
            </Button>
          </div>

          {/* Whitelist */}
          <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Whitelist Investor</p>
              <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", backgroundColor: "#FFD23F", border: "2px solid #000", padding: "0.1rem 0.5rem", fontWeight: 700 }}>
                {whitelistedAddresses ? whitelistedAddresses.length : 0} whitelisted
              </span>
            </div>
            <input
              value={whitelistInput}
              onChange={(e) => setWhitelistInput(e.target.value)}
              placeholder="0x..."
              style={{ width: "100%", border: "2px solid #000", padding: "0.4rem 0.6rem", fontFamily: "Space Mono, monospace", fontSize: "0.75rem", marginBottom: "0.5rem", boxSizing: "border-box" }}
            />
            <Button onClick={whitelistInvestor} disabled={isPending || !whitelistInput} variant="ghost" size="sm" style={{ width: "100%" }}>
              {isPending ? "Confirming…" : "Whitelist"}
            </Button>
            {whitelistedAddresses && whitelistedAddresses.length > 0 && (
              <div style={{ marginTop: "0.75rem", borderTop: "2px solid #000", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {whitelistedAddresses.map((addr) => (
                  <p key={addr} style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "rgba(0,0,0,0.6)", margin: 0 }}>
                    ✓ {addr.slice(0, 10)}…{addr.slice(-6)}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Strike price — only in PriceDiscovery */}
          {currentPhase === 3 && (
            <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #EF4444", backgroundColor: "#fff", padding: "1.25rem" }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>Set Strike Price (HKD)</p>
              <input
                value={strikeInput}
                onChange={(e) => setStrikeInput(e.target.value)}
                placeholder="e.g. 9.50"
                style={{ width: "100%", border: "2px solid #000", padding: "0.4rem 0.6rem", fontFamily: "Space Mono, monospace", fontSize: "0.875rem", marginBottom: "0.5rem", boxSizing: "border-box" }}
              />
              <Button onClick={setStrike} disabled={isPending || !strikeInput} variant="danger" size="sm" style={{ width: "100%" }}>
                Set Strike
              </Button>
              <div style={{ marginTop: "0.5rem" }}>
                <Button onClick={slashNonRevealers} disabled={isPending} variant="ghost" size="sm" style={{ width: "100%" }}>
                  Slash Non-Revealers
                </Button>
              </div>
            </div>
          )}

          {/* Compute allocations — only in Allocation */}
          {currentPhase === 4 && (
            <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #FFD23F", backgroundColor: "#fff", padding: "1.25rem" }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>Finalize Allocations</p>
              <Button onClick={computeAllocations} disabled={isPending} variant="yellow" size="sm" style={{ width: "100%" }}>
                Compute + Finalize
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tranche chart */}
      {trancheSummary && (
        <AllocationChart
          cornerstoneBps={Number(trancheSummary.cornerstoneBps)}
          institutionalBps={Number(trancheSummary.institutionalBps)}
          retailBps={Number(trancheSummary.retailBps)}
          cornerstoneShares={Number(trancheSummary.cornerstoneShares)}
          institutionalShares={Number(trancheSummary.institutionalShares)}
          retailShares={Number(trancheSummary.retailShares)}
        />
      )}
    </div>
  );
}
