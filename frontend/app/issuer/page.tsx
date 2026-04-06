"use client";

import { useState, useEffect } from "react";
import { useReadContract, useWatchContractEvent, usePublicClient } from "wagmi";
import { formatUnits, parseAbiItem } from "viem";
import { CONTRACT_ADDRESSES, BOOK_BUILDER_ABI, ORDER_BOOK_ABI, ALLOCATION_ABI } from "@/lib/contracts";
import StatCard from "@/components/book/StatCard";
import DemandCurve from "@/components/book/DemandCurve";
import AllocationChart from "@/components/book/AllocationChart";
import PhaseTimeline from "@/components/book/PhaseTimeline";
import Badge from "@/components/ui/Badge";

const PHASE_NAMES = ["Setup", "Commitment", "Reveal", "Price Discovery", "Allocation", "Settlement", "Closed"];

export default function IssuerPage() {
  const [revealedBids, setRevealedBids] = useState<{ price: number; quantity: number }[]>([]);
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!publicClient) return;
    const fetch = async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const from = latest > 10000n ? latest - 10000n : 0n;
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESSES.orderBook,
          event: parseAbiItem("event IOIRevealed(address indexed investor, uint256 price, uint256 quantity, uint8 investorType, uint8 orderType)"),
          fromBlock: from, toBlock: "latest",
        });
        const bids = logs.map((l) => ({
          price:    Number(formatUnits((l.args as { price: bigint }).price, 18)),
          quantity: Number((l.args as { quantity: bigint }).quantity),
        }));
        if (bids.length > 0) setRevealedBids(bids);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, [publicClient]);

  const { data: phase } = useReadContract({ address: CONTRACT_ADDRESSES.bookBuilder, abi: BOOK_BUILDER_ABI, functionName: "getPhase" });
  const { data: offering } = useReadContract({ address: CONTRACT_ADDRESSES.bookBuilder, abi: BOOK_BUILDER_ABI, functionName: "getOffering" });
  const { data: demand, refetch } = useReadContract({ address: CONTRACT_ADDRESSES.orderBook, abi: ORDER_BOOK_ABI, functionName: "getAggregatedDemand" });
  const { data: commitCount } = useReadContract({ address: CONTRACT_ADDRESSES.orderBook, abi: ORDER_BOOK_ABI, functionName: "getCommitmentCount" });
  const { data: strikePrice } = useReadContract({ address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "strikePrice" });
  const { data: trancheSummary } = useReadContract({ address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "getTrancheSummary" });

  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    eventName: "AggregatedDemandUpdated",
    onLogs: () => refetch(),
  });

  const currentPhase = typeof phase === "number" ? phase : 0;
  const priceLow   = offering ? Number(formatUnits(offering.priceRangeLow, 18))  : 8;
  const priceHigh  = offering ? Number(formatUnits(offering.priceRangeHigh, 18)) : 10;
  const totalShares = demand ? Number(demand.totalShares) : 0;
  const weightedAvg = demand ? Number(formatUnits(demand.weightedAvgPrice, 18)) : 0;
  const coverage    = demand ? (Number(demand.coverageRatio) / 1e18).toFixed(2) : "0.00";
  const strikePriceNum = strikePrice ? Number(formatUnits(strikePrice, 18)) : undefined;

  const demandCurveData = (() => {
    if (revealedBids.length === 0) return [];
    const priceMap = new Map<number, number>();
    for (const bid of revealedBids) {
      priceMap.set(bid.price, (priceMap.get(bid.price) ?? 0) + bid.quantity);
    }
    const sortedPrices = Array.from(priceMap.keys()).sort((a, b) => b - a);
    const points: { price: number; demand: number }[] = [];
    let cumulative = 0;
    for (const price of sortedPrices) {
      cumulative += priceMap.get(price)!;
      points.push({ price, demand: cumulative });
    }
    points.reverse();
    const withDrops: { price: number; demand: number }[] = [];
    for (let i = 0; i < points.length; i++) {
      withDrops.push(points[i]);
      if (i < points.length - 1) {
        withDrops.push({ price: points[i].price + 0.001, demand: points[i + 1].demand });
      }
    }
    if (withDrops.length > 0 && priceLow < withDrops[0].price) {
      withDrops.unshift({ price: priceLow, demand: withDrops[0].demand });
    }
    return withDrops;
  })();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.02em" }}>Issuer View</h1>
        {offering && (
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, color: "rgba(0,0,0,0.55)", fontSize: "0.875rem", marginTop: "0.2rem" }}>
            {offering.companyName} ({offering.ticker})
          </p>
        )}
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Badge color="yellow">{PHASE_NAMES[currentPhase]}</Badge>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.75rem", color: "rgba(0,0,0,0.5)" }}>
            You are seeing verified on-chain aggregate demand — not the bookrunner&apos;s characterization of it.
          </span>
        </div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <PhaseTimeline currentPhase={currentPhase} />
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total Demand"    value={totalShares > 0 ? `${(totalShares / 1_000_000).toFixed(1)}M` : "—"} unit="shares" />
        <StatCard label="Coverage Ratio"  value={Number(coverage) > 0 ? `${coverage}x` : "—"} />
        <StatCard label="Weighted Avg Bid" value={weightedAvg > 0 ? `HK$${weightedAvg.toFixed(2)}` : "—"} />
        <StatCard label="IOI Count"       value={String(demand?.bidCount ?? commitCount ?? 0)} />
      </div>

      {/* Demand curve */}
      <div style={{ marginBottom: "1.5rem" }}>
        <DemandCurve
          data={demandCurveData}
          priceRangeLow={priceLow}
          priceRangeHigh={priceHigh}
          strikePrice={strikePriceNum}
        />
      </div>

      {/* Tranche breakdown */}
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
