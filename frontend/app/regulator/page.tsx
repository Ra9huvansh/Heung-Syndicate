"use client";

import { useState } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { formatUnits, parseAbiItem, keccak256, encodePacked } from "viem";
import { CONTRACT_ADDRESSES, BOOK_BUILDER_ABI, ORDER_BOOK_ABI, ALLOCATION_ABI } from "@/lib/contracts";
import { computeLeaf, buildMerkleTree, generateProof } from "@/lib/merkle";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import StatCard from "@/components/book/StatCard";

const PHASE_NAMES = ["Setup", "Commitment", "Reveal", "Price Discovery", "Allocation", "Settlement", "Closed"];

export default function RegulatorPage() {
  const client = usePublicClient();
  const [events, setEvents] = useState<{ type: string; data: string; block: string; tx: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyAddress, setVerifyAddress] = useState("");
  const [verifyAmount,  setVerifyAmount]  = useState("");
  const [verifyResult,  setVerifyResult]  = useState<"valid" | "invalid" | null>(null);

  const { data: phase }   = useReadContract({ address: CONTRACT_ADDRESSES.bookBuilder, abi: BOOK_BUILDER_ABI, functionName: "getPhase" });
  const { data: merkleRoot } = useReadContract({ address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "merkleRoot" });
  const { data: strikePrice } = useReadContract({ address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "strikePrice" });
  const { data: allocationFinalized } = useReadContract({ address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "allocationFinalized" });
  const { data: allAllocations } = useReadContract({ address: CONTRACT_ADDRESSES.allocation, abi: ALLOCATION_ABI, functionName: "getAllAllocations" });

  const currentPhase = phase !== undefined ? Number(phase) : 0;

  async function fetchEvents() {
    if (!client) return;
    setLoading(true);
    try {
      // Use a 50k-block window to avoid RPC timeout on full history scans
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock > 50000n ? latestBlock - 50000n : 0n;

      const [commits, reveals, phases, strikes, allocations, claims] = await Promise.all([
        client.getLogs({ address: CONTRACT_ADDRESSES.orderBook,   event: parseAbiItem("event IOICommitted(address indexed investor, bytes32 commitHash, uint256 timestamp)"),    fromBlock }),
        client.getLogs({ address: CONTRACT_ADDRESSES.orderBook,   event: parseAbiItem("event IOIRevealed(address indexed investor, uint256 price, uint256 quantity, uint8 investorType, uint8 orderType)"), fromBlock }),
        client.getLogs({ address: CONTRACT_ADDRESSES.bookBuilder, event: parseAbiItem("event PhaseAdvanced(uint8 indexed from, uint8 indexed to, uint256 timestamp)"),           fromBlock }),
        client.getLogs({ address: CONTRACT_ADDRESSES.allocation,  event: parseAbiItem("event StrikePriceSet(uint256 strikePrice, uint256 timestamp)"),                           fromBlock }),
        client.getLogs({ address: CONTRACT_ADDRESSES.allocation,  event: parseAbiItem("event AllocationFinalized(bytes32 merkleRoot, uint256 strikePriceWei, uint256 totalAllocatedShares)"), fromBlock }),
        client.getLogs({ address: CONTRACT_ADDRESSES.allocation,  event: parseAbiItem("event SharesClaimed(address indexed investor, uint256 shares)"),                          fromBlock }),
      ]);

      const all = [
        ...commits.map((e) => ({ type: "IOICommitted",    data: `${String(e.args.investor).slice(0,10)}… committed sealed bid`, block: String(e.blockNumber), tx: String(e.transactionHash).slice(0,12) + "…" })),
        ...reveals.map((e) => ({ type: "IOIRevealed",     data: `${String(e.args.investor).slice(0,10)}… revealed HK$${Number(formatUnits(e.args.price ?? 0n, 18)).toFixed(2)}, ${Number(e.args.quantity ?? 0n).toLocaleString()} shares`, block: String(e.blockNumber), tx: String(e.transactionHash).slice(0,12) + "…" })),
        ...phases.map((e) => ({ type: "PhaseAdvanced",    data: `Phase ${PHASE_NAMES[Number(e.args.from ?? 0)]} → ${PHASE_NAMES[Number(e.args.to ?? 0)]}`, block: String(e.blockNumber), tx: String(e.transactionHash).slice(0,12) + "…" })),
        ...strikes.map((e) => ({ type: "StrikePriceSet",  data: `Strike price set: HK$${Number(formatUnits(e.args.strikePrice ?? 0n, 18)).toFixed(2)}`, block: String(e.blockNumber), tx: String(e.transactionHash).slice(0,12) + "…" })),
        ...allocations.map((e) => ({ type: "AllocationFinalized", data: `Merkle root: ${String(e.args.merkleRoot).slice(0,14)}…  Strike: HK$${Number(formatUnits(e.args.strikePriceWei ?? 0n, 18)).toFixed(2)}`, block: String(e.blockNumber), tx: String(e.transactionHash).slice(0,12) + "…" })),
        ...claims.map((e) => ({ type: "SharesClaimed",    data: `${String(e.args.investor).slice(0,10)}… claimed ${Number(e.args.shares ?? 0n).toLocaleString()} shares`, block: String(e.blockNumber), tx: String(e.transactionHash).slice(0,12) + "…" })),
      ].sort((a, b) => Number(a.block) - Number(b.block));

      setEvents(all);
    } finally {
      setLoading(false);
    }
  }

  function verifyMerkleProof() {
    if (!verifyAddress || !verifyAmount || !merkleRoot || !allAllocations) return;
    try {
      const entries = (allAllocations as unknown as { investor: `0x${string}`; allocatedShares: bigint }[]).map((a) => ({
        investor: a.investor,
        allocatedShares: a.allocatedShares,
      }));
      const tree  = buildMerkleTree(entries);
      const proof = generateProof(tree, verifyAddress as `0x${string}`, BigInt(verifyAmount), entries);

      // OZ-compatible client-side verification: walk the proof path and check root
      let hash: `0x${string}` = keccak256(encodePacked(["address", "uint256"], [verifyAddress as `0x${string}`, BigInt(verifyAmount)]));
      for (const p of proof) {
        const [a, b] = hash <= p ? [hash, p] : [p, hash];
        hash = keccak256(encodePacked(["bytes32", "bytes32"], [a, b]));
      }
      const isValid = hash === (merkleRoot as string);
      setVerifyResult(isValid ? "valid" : "invalid");
    } catch {
      setVerifyResult("invalid");
    }
  }

  const TYPE_COLORS: Record<string, "yellow" | "green" | "blue" | "orange" | "gray"> = {
    IOICommitted:        "gray",
    IOIRevealed:         "blue",
    PhaseAdvanced:       "yellow",
    StrikePriceSet:      "orange",
    AllocationFinalized: "green",
    SharesClaimed:       "green",
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.02em" }}>Regulator View</h1>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, color: "rgba(0,0,0,0.55)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Complete immutable on-chain audit trail. Every bookbuilding action is recorded.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Current Phase"   value={PHASE_NAMES[currentPhase]} />
        <StatCard label="Strike Price"    value={strikePrice && strikePrice > 0n ? `HK$${Number(formatUnits(strikePrice, 18)).toFixed(2)}` : "—"} />
        <StatCard label="Allocation"      value={allocationFinalized ? "Finalized" : "Pending"} />
      </div>

      {/* Merkle root display */}
      {merkleRoot && merkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #22C55E", backgroundColor: "#f0fdf4", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>On-Chain Merkle Root</p>
          <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>{merkleRoot}</p>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.75rem", color: "rgba(0,0,0,0.55)", marginTop: "0.5rem" }}>
            This root is the cryptographic commitment to every allocation. Any investor can verify their allocation against it.
          </p>
        </div>
      )}

      {/* Merkle verifier */}
      <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Allocation Verifier</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
          <div>
            <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>Investor Address</label>
            <input value={verifyAddress} onChange={(e) => setVerifyAddress(e.target.value)} placeholder="0x..." style={{ width: "100%", border: "3px solid #000", padding: "0.5rem 0.75rem", fontFamily: "Space Mono, monospace", fontSize: "0.8rem", boxSizing: "border-box" as const }} />
          </div>
          <div>
            <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>Allocated Shares</label>
            <input value={verifyAmount} onChange={(e) => setVerifyAmount(e.target.value)} placeholder="e.g. 1000000000000000000000000" style={{ width: "100%", border: "3px solid #000", padding: "0.5rem 0.75rem", fontFamily: "Space Mono, monospace", fontSize: "0.8rem", boxSizing: "border-box" as const }} />
          </div>
          <Button onClick={verifyMerkleProof} variant="primary">Verify</Button>
        </div>
        {verifyResult && (
          <div style={{ marginTop: "1rem", border: "3px solid #000", padding: "1rem", backgroundColor: verifyResult === "valid" ? "#22C55E" : "#EF4444", boxShadow: `5px 5px 0 0 ${verifyResult === "valid" ? "#22C55E" : "#EF4444"}` }}>
            <p style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.75rem", color: verifyResult === "valid" ? "#000" : "#fff", textAlign: "center" }}>
              {verifyResult === "valid" ? "✓ VALID" : "✗ INVALID"}
            </p>
          </div>
        )}
      </div>

      {/* Event log */}
      <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff" }}>
        <div style={{ borderBottom: "3px solid #000", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#000" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#FFD23F" }}>
            On-Chain Event Log ({events.length} events)
          </p>
          <Button onClick={fetchEvents} disabled={loading} variant="yellow" size="sm">
            {loading ? "Loading…" : "Fetch Events"}
          </Button>
        </div>

        {events.length === 0 && (
          <div style={{ padding: "3rem", textAlign: "center" }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", color: "rgba(0,0,0,0.4)", fontSize: "0.875rem" }}>
              Click &quot;Fetch Events&quot; to load the full on-chain audit trail
            </p>
          </div>
        )}

        {events.map((ev, i) => (
          <div key={i} style={{ borderBottom: i < events.length - 1 ? "1px solid #e5e7eb" : "none", padding: "0.75rem 1.5rem", display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "1rem", alignItems: "center" }}>
            <Badge color={TYPE_COLORS[ev.type] ?? "gray"}>{ev.type}</Badge>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.8rem" }}>{ev.data}</span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "rgba(0,0,0,0.5)" }}>Block {ev.block}</span>
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "rgba(0,0,0,0.4)" }}>{ev.tx}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
