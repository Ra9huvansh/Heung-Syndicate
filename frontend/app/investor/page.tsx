"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { CONTRACT_ADDRESSES, BOOK_BUILDER_ABI, ORDER_BOOK_ABI, ALLOCATION_ABI } from "@/lib/contracts";
import { generateSalt, computeCommitHash, buildMerkleTree, generateProof } from "@/lib/merkle";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/book/StatCard";

const PHASE_NAMES   = ["Setup", "Commitment", "Reveal", "Price Discovery", "Allocation", "Settlement", "Closed"];
const INVESTOR_TYPES = ["Long-Only", "Hedge Fund", "SWF", "Pension", "Insurance"];
const ORDER_TYPES    = ["Limit", "Strike (Any Price)"];

const saltKey     = (addr: string) => `heung_ioi_salt_${addr}`;
const priceKey    = (addr: string) => `heung_ioi_price_${addr}`;
const quantityKey = (addr: string) => `heung_ioi_quantity_${addr}`;

export default function InvestorPage() {
  const { address } = useAccount();

  const [price,        setPrice]        = useState("");
  const [quantity,     setQuantity]     = useState("");
  const [investorType, setInvestorType] = useState(0);
  const [orderType,    setOrderType]    = useState(0);
  const [salt,         setSalt]         = useState("");
  const [commitHash,   setCommitHash]   = useState("");

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const { writeContract, isPending } = useWriteContract();

  // ── Contract reads ──────────────────────────────────────────────────────
  const { data: phase } = useReadContract({
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

  const { data: myIOI } = useReadContract({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    functionName: "iois",
    args: address ? [address] : undefined,
    query: { refetchInterval: 3000 },
  });

  const { data: depositAmount } = useReadContract({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    functionName: "depositAmount",
  });

  const { data: myAllocation } = useReadContract({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    functionName: "allocatedShares",
    args: address ? [address] : undefined,
    query: { refetchInterval: 5000 },
  });

  const { data: hasClaimed } = useReadContract({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    functionName: "claimed",
    args: address ? [address] : undefined,
    query: { refetchInterval: 5000 },
  });

  const { data: merkleRoot } = useReadContract({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    functionName: "merkleRoot",
    query: { refetchInterval: 5000 },
  });

  const { data: allAllocations } = useReadContract({
    address: CONTRACT_ADDRESSES.allocation,
    abi: ALLOCATION_ABI,
    functionName: "getAllAllocations",
    query: { refetchInterval: 5000 },
  });

  const { data: demand } = useReadContract({
    address: CONTRACT_ADDRESSES.orderBook,
    abi: ORDER_BOOK_ABI,
    functionName: "getAggregatedDemand",
    query: { refetchInterval: 3000 },
  });

  // ── Load saved inputs per wallet — clear everything on wallet switch ────
  useEffect(() => {
    if (!address) return;
    setPrice("");
    setQuantity("");
    setSalt("");
    setCommitHash("");
    const savedSalt = localStorage.getItem(saltKey(address));
    const savedPrice = localStorage.getItem(priceKey(address));
    const savedQty   = localStorage.getItem(quantityKey(address));
    if (savedSalt)  setSalt(savedSalt);
    if (savedPrice) setPrice(savedPrice);
    if (savedQty)   setQuantity(savedQty);
  }, [address]);

  function generateAndStoreSalt() {
    if (!address) return;
    const newSalt = generateSalt();
    setSalt(newSalt);
    localStorage.setItem(saltKey(address), newSalt);
  }

  useEffect(() => {
    if (!address) return;
    if (price && quantity && salt) {
      try {
        const hash = computeCommitHash(parseUnits(price, 18), BigInt(quantity), salt as `0x${string}`);
        setCommitHash(hash);
        localStorage.setItem(priceKey(address),    price);
        localStorage.setItem(quantityKey(address), quantity);
      } catch { setCommitHash(""); }
    } else {
      setCommitHash("");
    }
  }, [price, quantity, salt, address]);

  // ── Actions ──────────────────────────────────────────────────────────────
  function commitIOI() {
    if (!commitHash || !depositAmount) return;
    writeContract({
      address: CONTRACT_ADDRESSES.orderBook,
      abi: ORDER_BOOK_ABI,
      functionName: "commitIOI",
      args: [commitHash as `0x${string}`],
      value: depositAmount,
    }, {
      onSuccess: () => {
        if (address) localStorage.setItem(saltKey(address), salt);
        showToast("Sealed bid committed. Salt saved — you need it to reveal.");
      },
      onError: (e) => showToast(e.message.slice(0, 80), "error"),
    });
  }

  function revealIOI() {
    if (!price || !quantity || !salt) return;
    writeContract({
      address: CONTRACT_ADDRESSES.orderBook,
      abi: ORDER_BOOK_ABI,
      functionName: "revealIOI",
      args: [parseUnits(price, 18), BigInt(quantity), salt as `0x${string}`, investorType, orderType],
    }, {
      onSuccess: () => showToast("Bid revealed. Deposit returned to your wallet."),
      onError: (e) => showToast(e.message.slice(0, 80), "error"),
    });
  }

  function claimShares() {
    if (!myAllocation || !address || !merkleRoot || !allAllocations) return;

    // Build Merkle tree from all on-chain allocations and generate proof for this investor
    const entries = allAllocations.map((a: { investor: `0x${string}`; allocatedShares: bigint }) => ({
      investor: a.investor,
      allocatedShares: a.allocatedShares,
    }));
    const tree  = buildMerkleTree(entries);
    const proof = generateProof(tree, address, myAllocation, entries);

    writeContract({
      address: CONTRACT_ADDRESSES.allocation,
      abi: ALLOCATION_ABI,
      functionName: "claimShares",
      args: [myAllocation, proof],
    }, {
      onSuccess: () => showToast(`Shares claimed! ${Number(myAllocation).toLocaleString()} HTH transferred to your wallet.`),
      onError: (e) => showToast(e.message.slice(0, 80), "error"),
    });
  }

  // ── Derived values ────────────────────────────────────────────────────
  const currentPhase = phase !== undefined ? Number(phase) : 0;
  const ioiStatus    = myIOI ? Number(myIOI[7]) : 0;
  const STATUS_LABELS = ["None", "Committed", "Revealed", "Allocated", "Claimed"];

  const priceLow   = offering ? Number(formatUnits(offering.priceRangeLow,  18)) : null;
  const priceHigh  = offering ? Number(formatUnits(offering.priceRangeHigh, 18)) : null;
  const totalShares = offering ? Number(offering.totalShares).toLocaleString() : null;
  const coverageRatio = demand && demand.coverageRatio > 0n
    ? (Number(demand.coverageRatio) / 1e18).toFixed(2)
    : null;

  const inputStyle = {
    width: "100%",
    border: "3px solid #000",
    padding: "0.6rem 0.8rem",
    fontFamily: "Space Mono, monospace",
    fontSize: "0.9rem",
    backgroundColor: "#fff",
    boxSizing: "border-box" as const,
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1.5rem" }}>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div onClick={() => setToast(null)} style={{
          position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 9999,
          border: "3px solid #000",
          boxShadow: toast.type === "success" ? "5px 5px 0 0 #22C55E" : "5px 5px 0 0 #EF4444",
          backgroundColor: toast.type === "success" ? "#22C55E" : "#EF4444",
          color: toast.type === "success" ? "#000" : "#fff",
          padding: "0.85rem 1.25rem",
          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "0.85rem",
          maxWidth: 360, cursor: "pointer",
          animation: "slideUp 200ms ease",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── IPO Info Banner ─────────────────────────────────────────────── */}
      {offering && (
        <div style={{
          border: "3px solid #000",
          boxShadow: "5px 5px 0 0 #000",
          backgroundColor: "#000",
          color: "#FFD23F",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,210,63,0.6)", marginBottom: "0.25rem" }}>
                Active IPO
              </p>
              <p style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {offering.companyName}
              </p>
              <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "rgba(255,210,63,0.7)", marginTop: "0.2rem" }}>
                {offering.ticker} · {totalShares} shares
              </p>
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,210,63,0.6)", marginBottom: "0.2rem" }}>
                  Price Range
                </p>
                <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1.1rem" }}>
                  HK${priceLow?.toFixed(2)} – HK${priceHigh?.toFixed(2)}
                </p>
              </div>
              {coverageRatio && (
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,210,63,0.6)", marginBottom: "0.2rem" }}>
                    Book Coverage
                  </p>
                  <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1.1rem" }}>
                    {coverageRatio}x
                  </p>
                </div>
              )}
              <div style={{ textAlign: "left" }}>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,210,63,0.6)", marginBottom: "0.2rem" }}>
                  Mechanism
                </p>
                <p style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1.1rem" }}>
                  {Number(offering.mechanism) === 0 ? "A" : "B"}
                </p>
              </div>
            </div>
          </div>

          {/* HKEX tranche info bar */}
          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255,210,63,0.2)", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            {[
              { label: "Cornerstone max",    value: "55%" },
              { label: "Bookbuilding min",   value: "40%" },
              { label: "Retail base",        value: "5%"  },
              { label: "Lock-up",            value: "6 months" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.7rem", color: "rgba(255,210,63,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}:</span>
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.02em" }}>Investor Portal</h1>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", alignItems: "center" }}>
          <Badge color={currentPhase === 1 ? "yellow" : currentPhase === 2 ? "green" : "gray"}>{PHASE_NAMES[currentPhase]}</Badge>
          {ioiStatus > 0 && <Badge color="blue">IOI: {STATUS_LABELS[ioiStatus]}</Badge>}
        </div>
      </div>

      {/* ── My IOI status ────────────────────────────────────────────────── */}
      {ioiStatus > 0 && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#fff", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            <StatCard label="My Bid Price" value={ioiStatus >= 2 && myIOI ? `HK$${Number(formatUnits(myIOI[1], 18)).toFixed(2)}` : "Sealed"} />
            <StatCard label="Quantity"     value={ioiStatus >= 2 && myIOI ? Number(myIOI[2]).toLocaleString() : "—"} unit="shares" />
            <StatCard label="Status"       value={STATUS_LABELS[ioiStatus]} />
          </div>
        </div>
      )}

      {/* ── STEP 1: Commit ──────────────────────────────────────────────── */}
      {currentPhase === 1 && ioiStatus === 0 && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #FFD23F", backgroundColor: "#fff", padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1rem", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Step 1 — Commit Sealed Bid
          </h2>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>
              Your Salt (secret — save this!)
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input value={salt} readOnly style={{ ...inputStyle, flex: 1, fontSize: "0.7rem", backgroundColor: "#FFFDF5" }} placeholder="Generate a salt first" />
              <Button onClick={generateAndStoreSalt} variant="yellow" size="sm">Generate</Button>
            </div>
            {salt && (
              <div style={{ marginTop: "0.4rem", backgroundColor: "#FFF3CD", border: "2px solid #FFD23F", padding: "0.5rem 0.75rem" }}>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.75rem", fontWeight: 600 }}>
                  Saved to localStorage. Back it up — you cannot reveal without it.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>
                Price per Share (HKD) {priceLow && priceHigh && (
                  <span style={{ color: "rgba(0,0,0,0.4)", fontWeight: 400 }}>range: {priceLow}–{priceHigh}</span>
                )}
              </label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={priceLow ? `e.g. ${priceLow}` : "e.g. 9.50"} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>
                Quantity (shares)
              </label>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 1000000" style={inputStyle} />
            </div>
          </div>

          {commitHash && (
            <div style={{ marginBottom: "1rem", backgroundColor: "#f0fdf4", border: "2px solid #22C55E", padding: "0.6rem 0.75rem" }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.2rem" }}>Commit hash (auto-computed):</p>
              <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", wordBreak: "break-all" }}>{commitHash}</p>
            </div>
          )}

          {depositAmount && (
            <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "rgba(0,0,0,0.5)", marginBottom: "0.75rem" }}>
              Deposit required: {formatUnits(depositAmount, 18)} HSK (returned on reveal)
            </p>
          )}

          <Button onClick={commitIOI} disabled={isPending || !commitHash || !salt} variant="primary" size="md" style={{ width: "100%" }}>
            {isPending ? "Confirming…" : "Submit Sealed Bid"}
          </Button>
        </div>
      )}

      {/* ── STEP 2: Reveal ──────────────────────────────────────────────── */}
      {currentPhase === 2 && ioiStatus === 1 && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #22C55E", backgroundColor: "#fff", padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1rem", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Step 2 — Reveal Your Bid
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>Price (HKD)</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>Quantity</label>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>Investor Type</label>
              <select value={investorType} onChange={(e) => setInvestorType(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
                {INVESTOR_TYPES.map((t, i) => <option key={i} value={i}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>Order Type</label>
              <select value={orderType} onChange={(e) => setOrderType(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
                {ORDER_TYPES.map((t, i) => <option key={i} value={i}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>
              Your Salt {salt && <span style={{ color: "#22C55E", fontWeight: 700 }}>✓ Auto-loaded</span>}
            </label>
            <input value={salt} readOnly style={{ ...inputStyle, backgroundColor: salt ? "#f0fdf4" : "#fff", fontSize: "0.7rem", color: "rgba(0,0,0,0.6)" }} placeholder="Salt will auto-load from your commit" />
            {!salt && (
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "0.72rem", color: "#EF4444", fontWeight: 600, marginTop: "0.35rem" }}>
                Salt not found. Did you commit from this wallet on this browser?
              </p>
            )}
          </div>

          <Button onClick={revealIOI} disabled={isPending || !price || !quantity || !salt} variant="primary" size="md" style={{ width: "100%" }}>
            {isPending ? "Confirming…" : "Reveal Bid — Get Deposit Back"}
          </Button>
        </div>
      )}

      {/* ── STEP 3: Claim ───────────────────────────────────────────────── */}
      {currentPhase === 5 && myAllocation && myAllocation > 0n && !hasClaimed && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #74B9FF", backgroundColor: "#fff", padding: "1.5rem" }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1rem", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Step 3 — Claim Your Shares
          </h2>
          <div style={{ marginBottom: "1rem" }}>
            <StatCard label="Allocated to You" value={(Number(myAllocation) / 1_000_000).toFixed(2)} unit="M shares" bgColor="#f0f8ff" />
          </div>
          <Button onClick={claimShares} disabled={isPending} variant="primary" size="md" style={{ width: "100%" }}>
            {isPending ? "Confirming…" : "Claim Shares with Merkle Proof"}
          </Button>
        </div>
      )}

      {hasClaimed && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #22C55E", backgroundColor: "#22C55E", padding: "1.5rem", textAlign: "center" }}>
          <p style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.25rem" }}>Shares Claimed</p>
          <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {myAllocation ? (Number(myAllocation) / 1_000_000).toFixed(2) : "—"}M shares transferred to your wallet
          </p>
        </div>
      )}

      {currentPhase === 1 && ioiStatus > 0 && (
        <div style={{ border: "3px solid #000", backgroundColor: "#f0fdf4", padding: "1rem", textAlign: "center" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: "0.875rem" }}>
            IOI committed. Wait for the Reveal phase to open.
          </p>
        </div>
      )}

      {!address && (
        <div style={{ border: "3px solid #000", boxShadow: "5px 5px 0 0 #000", backgroundColor: "#FFD23F", padding: "1.5rem", textAlign: "center" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1rem" }}>
            Connect your wallet to participate
          </p>
        </div>
      )}
    </div>
  );
}
