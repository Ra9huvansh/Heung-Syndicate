// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BookBuilder} from "./BookBuilder.sol";
import {OrderBook} from "./OrderBook.sol";

/// @title Allocation
/// @notice Handles strike price setting, HKEX-compliant tranche allocation
///         (40% bookbuilding minimum enforced in code), Merkle audit trail,
///         and share claim with proof verification.
contract Allocation is ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────
    // HKEX August 2025 Reform Constants (basis points, 10000 = 100%)
    // ─────────────────────────────────────────────────────────────
    uint256 public constant BOOKBUILDING_TRANCHE_MIN_BPS = 4000; // 40% minimum — ENFORCED
    uint256 public constant RETAIL_TRANCHE_BASE_BPS      = 500;  // 5% baseline
    uint256 public constant RETAIL_TRANCHE_MAX_BPS       = 3500; // 35% max clawback
    uint256 public constant CORNERSTONE_MAX_BPS_MECH_A   = 5500; // 55% cap Mechanism A
    uint256 public constant CORNERSTONE_MAX_BPS_MECH_B   = 5000; // 50% cap Mechanism B

    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────
    enum Tranche { Cornerstone, Institutional, Retail }

    struct AllocationRecord {
        address  investor;
        uint256  allocatedShares;
        Tranche  tranche;
        uint256  pricePerShare; // strike price — everyone pays same
    }

    struct TrancheSummary {
        uint256 cornerstoneShares;
        uint256 institutionalShares;
        uint256 retailShares;
        uint256 cornerstoneBps;
        uint256 institutionalBps;
        uint256 retailBps;
    }

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────
    BookBuilder public immutable bookBuilder;
    OrderBook   public immutable orderBook;
    IERC20      public immutable shareToken;

    uint256 public strikePrice;
    bytes32 public merkleRoot;

    AllocationRecord[]          private _allocations;
    mapping(address => uint256) public  allocatedShares;
    mapping(address => bool)    public  claimed;

    TrancheSummary public trancheSummary;

    bool public allocationFinalized;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────
    event StrikePriceSet(uint256 strikePrice, uint256 timestamp);
    event SharesAllocated(address indexed investor, uint256 shares, Tranche tranche);
    event AllocationFinalized(bytes32 merkleRoot, uint256 strikePriceWei, uint256 totalAllocatedShares);
    event SharesClaimed(address indexed investor, uint256 shares);

    // ─────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────
    modifier onlyBookrunner() {
        require(
            bookBuilder.hasRole(bookBuilder.BOOKRUNNER_ROLE(), msg.sender),
            "Not bookrunner"
        );
        _;
    }

    modifier onlyPhase(BookBuilder.Phase phase_) {
        require(bookBuilder.getPhase() == phase_, "Wrong phase");
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────
    constructor(address bookBuilder_, address payable orderBook_, address shareToken_) {
        require(bookBuilder_ != address(0) && orderBook_ != address(0) && shareToken_ != address(0), "Zero address");
        bookBuilder = BookBuilder(bookBuilder_);
        orderBook   = OrderBook(orderBook_);
        shareToken  = IERC20(shareToken_);
    }

    // ─────────────────────────────────────────────────────────────
    // Price Discovery
    // ─────────────────────────────────────────────────────────────

    function setStrikePrice(uint256 strikePrice_)
        external
        onlyBookrunner
        onlyPhase(BookBuilder.Phase.PriceDiscovery)
    {
        BookBuilder.Offering memory offering = bookBuilder.getOffering();
        // Allow up to 10% below low end of range (HKEX downward pricing flexibility)
        uint256 minAllowed = (offering.priceRangeLow * 9000) / 10000;
        require(strikePrice_ >= minAllowed, "Below 10% downward flexibility limit");
        require(strikePrice_ <= offering.priceRangeHigh, "Above price range high");

        strikePrice = strikePrice_;
        emit StrikePriceSet(strikePrice_, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────
    // Allocation computation
    // ─────────────────────────────────────────────────────────────

    /// @notice Compute pro-rata allocations, enforce HKEX tranche minimums,
    ///         build Merkle root, finalize. Called once by bookrunner.
    function computeAllocations()
        external
        onlyBookrunner
        onlyPhase(BookBuilder.Phase.Allocation)
    {
        require(strikePrice > 0,          "Strike price not set");
        require(!allocationFinalized,     "Already finalized");

        BookBuilder.Offering memory offering = bookBuilder.getOffering();
        uint256 totalShares = offering.totalShares;
        uint256 maxCornerstone = offering.mechanism == BookBuilder.Mechanism.A
            ? (totalShares * CORNERSTONE_MAX_BPS_MECH_A) / 10000
            : (totalShares * CORNERSTONE_MAX_BPS_MECH_B) / 10000;

        OrderBook.IOI[] memory allIOIs = orderBook.getAllRevealedIOIs();

        // ── Step 1: Cornerstone allocation (guaranteed, irrevocable) ──────────
        uint256 cornerstoneAllocated = 0;
        for (uint256 i = 0; i < allIOIs.length; i++) {
            if (allIOIs[i].isCornerstone) {
                // Cornerstones get their full requested quantity, capped at max
                uint256 shares = allIOIs[i].quantity;
                if (cornerstoneAllocated + shares > maxCornerstone) {
                    shares = maxCornerstone - cornerstoneAllocated;
                }
                if (shares > 0) {
                    _recordAllocation(allIOIs[i].investor, shares, Tranche.Cornerstone);
                    cornerstoneAllocated += shares;
                }
            }
        }

        // ── Step 2: Retail tranche (5% base, up to 35% clawback) ─────────────
        // For simplicity in prototype, use oversubscription ratio to determine clawback
        AggregatedDemandData memory demand = _getAggregatedDemand();
        uint256 oversubRatio = demand.totalShares > 0
            ? (demand.totalShares * 100) / totalShares
            : 1;

        uint256 retailBps = RETAIL_TRANCHE_BASE_BPS;
        if (oversubRatio >= 50) {
            retailBps = RETAIL_TRANCHE_MAX_BPS; // 50x+ oversubscribed → full 35% clawback
        } else if (oversubRatio >= 10) {
            retailBps = RETAIL_TRANCHE_BASE_BPS + ((oversubRatio - 10) * 75); // linear scale
            if (retailBps > RETAIL_TRANCHE_MAX_BPS) retailBps = RETAIL_TRANCHE_MAX_BPS;
        }
        uint256 retailShares = (totalShares * retailBps) / 10000;

        // ── Step 3: Institutional / bookbuilding tranche ───────────────────────
        uint256 remainingForInstitutional = totalShares - cornerstoneAllocated - retailShares;

        // HKEX ENFORCEMENT: bookbuilding must be >= 40% of total offer
        uint256 minBookbuilding = (totalShares * BOOKBUILDING_TRANCHE_MIN_BPS) / 10000;
        if (remainingForInstitutional < minBookbuilding) {
            // Claw back from retail to meet the 40% minimum
            uint256 shortfall = minBookbuilding - remainingForInstitutional;
            require(retailShares >= shortfall, "Cannot meet 40% bookbuilding minimum");
            retailShares -= shortfall;
            remainingForInstitutional = minBookbuilding;
        }

        require(
            remainingForInstitutional >= minBookbuilding,
            "40% bookbuilding tranche minimum violated"
        );

        // ── Step 4: Pro-rata for institutional bids at or above strike ─────────
        uint256 eligibleShares = 0;
        for (uint256 i = 0; i < allIOIs.length; i++) {
            if (!allIOIs[i].isCornerstone && allIOIs[i].pricePerShare >= strikePrice) {
                eligibleShares += allIOIs[i].quantity;
            }
        }

        for (uint256 i = 0; i < allIOIs.length; i++) {
            if (!allIOIs[i].isCornerstone && allIOIs[i].pricePerShare >= strikePrice) {
                uint256 proRata = eligibleShares > 0
                    ? (allIOIs[i].quantity * remainingForInstitutional) / eligibleShares
                    : 0;
                if (proRata > 0) {
                    _recordAllocation(allIOIs[i].investor, proRata, Tranche.Institutional);
                }
            }
        }

        // ── Step 5: Store tranche summary ─────────────────────────────────────
        uint256 instAllocated = _sumTranche(Tranche.Institutional);
        trancheSummary = TrancheSummary({
            cornerstoneShares:  cornerstoneAllocated,
            institutionalShares: instAllocated,
            retailShares:       retailShares,
            cornerstoneBps:     (cornerstoneAllocated * 10000) / totalShares,
            institutionalBps:   (instAllocated * 10000) / totalShares,
            retailBps:          (retailShares * 10000) / totalShares
        });

        // ── Step 6: Build Merkle root ──────────────────────────────────────────
        merkleRoot = _buildMerkleRoot();
        allocationFinalized = true;

        emit AllocationFinalized(merkleRoot, strikePrice, cornerstoneAllocated + instAllocated);
    }

    // ─────────────────────────────────────────────────────────────
    // Claim
    // ─────────────────────────────────────────────────────────────

    /// @notice Investor claims allocated shares using a Merkle proof.
    ///         Proof is generated client-side using merkletreejs.
    function claimShares(uint256 allocatedShares_, bytes32[] calldata merkleProof_)
        external
        nonReentrant
        onlyPhase(BookBuilder.Phase.Settlement)
    {
        require(allocationFinalized, "Allocation not finalized");
        require(!claimed[msg.sender], "Already claimed");
        require(allocatedShares[msg.sender] == allocatedShares_, "Amount mismatch");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, allocatedShares_));
        require(MerkleProof.verify(merkleProof_, merkleRoot, leaf), "Invalid Merkle proof");

        claimed[msg.sender] = true;
        orderBook.markClaimed(msg.sender);

        require(shareToken.transfer(msg.sender, allocatedShares_), "Transfer failed");
        emit SharesClaimed(msg.sender, allocatedShares_);
    }

    // ─────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────

    function _recordAllocation(address investor_, uint256 shares_, Tranche tranche_) internal {
        _allocations.push(AllocationRecord({
            investor:       investor_,
            allocatedShares: shares_,
            tranche:        tranche_,
            pricePerShare:  strikePrice
        }));
        allocatedShares[investor_] += shares_;
        emit SharesAllocated(investor_, shares_, tranche_);
    }

    struct AggregatedDemandData {
        uint256 totalShares;
        uint256 bidCount;
    }

    function _getAggregatedDemand() internal view returns (AggregatedDemandData memory) {
        OrderBook.AggregatedDemand memory d = orderBook.getAggregatedDemand();
        return AggregatedDemandData({ totalShares: d.totalShares, bidCount: d.bidCount });
    }

    function _sumTranche(Tranche tranche_) internal view returns (uint256 total) {
        for (uint256 i = 0; i < _allocations.length; i++) {
            if (_allocations[i].tranche == tranche_) {
                total += _allocations[i].allocatedShares;
            }
        }
    }

    /// @notice Builds a Merkle root from all allocation records.
    ///         Leaf = keccak256(abi.encodePacked(investor, allocatedShares))
    ///         Same scheme used client-side in merkle.ts.
    function _buildMerkleRoot() internal view returns (bytes32) {
        uint256 n = _allocations.length;
        require(n > 0, "No allocations");

        bytes32[] memory leaves = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            leaves[i] = keccak256(
                abi.encodePacked(
                    _allocations[i].investor,
                    _allocations[i].allocatedShares
                )
            );
        }

        // Iterative Merkle tree build
        while (leaves.length > 1) {
            uint256 len = leaves.length;
            uint256 newLen = (len + 1) / 2;
            bytes32[] memory next = new bytes32[](newLen);
            for (uint256 i = 0; i < newLen; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                if (right >= len) {
                    next[i] = leaves[left]; // odd leaf carries up
                } else {
                    // Sort to ensure deterministic tree regardless of leaf order
                    (bytes32 a, bytes32 b) = leaves[left] <= leaves[right]
                        ? (leaves[left], leaves[right])
                        : (leaves[right], leaves[left]);
                    next[i] = keccak256(abi.encodePacked(a, b));
                }
            }
            leaves = next;
        }

        return leaves[0];
    }

    // ─────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────

    function getAllAllocations() external view returns (AllocationRecord[] memory) {
        return _allocations;
    }

    function getTrancheSummary() external view returns (TrancheSummary memory) {
        return trancheSummary;
    }

    function getAllocationCount() external view returns (uint256) {
        return _allocations.length;
    }
}
