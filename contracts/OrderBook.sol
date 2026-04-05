// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BookBuilder} from "./BookBuilder.sol";

/// @title OrderBook
/// @notice Handles the full IOI lifecycle using commit-reveal sealed bids.
///
///         Commit phase  — investors submit keccak256(price, qty, salt).
///                         Nobody can see individual bids. Only count is visible.
///         Reveal phase  — investors reveal plaintext. Hash is verified on-chain.
///                         Aggregated demand updates in real-time.
///         Non-revealers — deposit is slashed during PriceDiscovery phase.
contract OrderBook is AccessControl, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────
    // Roles (mirrored from BookBuilder for local access checks)
    // ─────────────────────────────────────────────────────────────
    bytes32 public constant BOOKRUNNER_ROLE = keccak256("BOOKRUNNER_ROLE");
    bytes32 public constant INVESTOR_ROLE   = keccak256("INVESTOR_ROLE");

    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────
    enum IOIStatus    { None, Committed, Revealed, Allocated, Claimed }
    enum InvestorType { LongOnly, HedgeFund, SovereignWealth, Pension, Insurance }
    enum OrderType    { Limit, Strike }  // Strike = any price / market order

    struct IOI {
        address      investor;
        uint256      pricePerShare;    // HKD in wei; type(uint256).max = Strike order
        uint256      quantity;         // number of shares
        uint256      totalValue;       // pricePerShare * quantity
        bytes32      commitHash;       // keccak256(abi.encodePacked(price, qty, salt))
        uint256      commitTimestamp;
        uint256      revealTimestamp;
        IOIStatus    status;
        InvestorType investorType;
        OrderType    orderType;
        bool         isCornerstone;
        bool         isConnectedPerson;
    }

    struct AggregatedDemand {
        uint256 totalShares;
        uint256 totalValue;
        uint256 bidCount;
        uint256 weightedAvgPrice;  // totalValue / totalShares
        uint256 coverageRatio;     // (totalShares * 1e18) / offeringTotalShares
        uint256 lastUpdated;
    }

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────
    BookBuilder         public immutable bookBuilder;
    uint256             public immutable depositAmount;

    mapping(address => IOI) public iois;
    address[]               private _committedInvestors;

    AggregatedDemand public aggregatedDemand;

    uint256 public totalSlashed;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────
    event IOICommitted(address indexed investor, bytes32 commitHash, uint256 timestamp);
    event IOIRevealed(
        address      indexed investor,
        uint256             price,
        uint256             quantity,
        InvestorType        investorType,
        OrderType           orderType
    );
    event AggregatedDemandUpdated(
        uint256 totalShares,
        uint256 totalValue,
        uint256 bidCount,
        uint256 coverageRatio
    );
    event NonRevealer(address indexed investor, uint256 depositSlashed);
    event IOIStatusUpdated(address indexed investor, IOIStatus status);

    // ─────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────
    modifier onlyPhase(BookBuilder.Phase phase_) {
        require(bookBuilder.getPhase() == phase_, "Wrong phase");
        _;
    }

    modifier onlyBookrunner() {
        require(bookBuilder.hasRole(BOOKRUNNER_ROLE, msg.sender), "Not bookrunner");
        _;
    }

    modifier onlyWhitelistedInvestor() {
        require(bookBuilder.isWhitelisted(msg.sender), "Not whitelisted");
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────
    constructor(address bookBuilder_, uint256 depositAmount_) {
        require(bookBuilder_ != address(0), "Zero address");
        bookBuilder   = BookBuilder(bookBuilder_);
        depositAmount = depositAmount_;
    }

    // ─────────────────────────────────────────────────────────────
    // Commit phase
    // ─────────────────────────────────────────────────────────────

    /// @notice Investor commits a sealed bid.
    ///         hash = keccak256(abi.encodePacked(pricePerShare, quantity, salt))
    ///         Must send exactly depositAmount in native HSK.
    function commitIOI(bytes32 commitHash_)
        external
        payable
        nonReentrant
        onlyWhitelistedInvestor
        onlyPhase(BookBuilder.Phase.Commitment)
    {
        require(msg.value >= depositAmount, "Insufficient deposit");
        require(iois[msg.sender].status == IOIStatus.None, "Already committed");
        require(commitHash_ != bytes32(0), "Empty hash");

        (bool whitelisted, bool isCornerstone, bool isConnectedPerson,) = bookBuilder.whitelist(msg.sender);
        require(whitelisted, "Not whitelisted");

        iois[msg.sender] = IOI({
            investor:         msg.sender,
            pricePerShare:    0,
            quantity:         0,
            totalValue:       0,
            commitHash:       commitHash_,
            commitTimestamp:  block.timestamp,
            revealTimestamp:  0,
            status:           IOIStatus.Committed,
            investorType:     InvestorType.LongOnly,
            orderType:        OrderType.Limit,
            isCornerstone:    isCornerstone,
            isConnectedPerson: isConnectedPerson
        });

        _committedInvestors.push(msg.sender);

        emit IOICommitted(msg.sender, commitHash_, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────
    // Reveal phase
    // ─────────────────────────────────────────────────────────────

    /// @notice Investor reveals their bid. Hash must match committed hash.
    ///         On success, deposit is returned and aggregated demand updates.
    function revealIOI(
        uint256      price_,
        uint256      quantity_,
        bytes32      salt_,
        InvestorType investorType_,
        OrderType    orderType_
    )
        external
        nonReentrant
        onlyPhase(BookBuilder.Phase.Reveal)
    {
        IOI storage ioi = iois[msg.sender];
        require(ioi.status == IOIStatus.Committed, "Not committed or already revealed");

        // Strike order uses type(uint256).max as price sentinel
        uint256 effectivePrice = orderType_ == OrderType.Strike
            ? bookBuilder.getOffering().priceRangeHigh
            : price_;

        bytes32 expected = keccak256(abi.encodePacked(price_, quantity_, salt_));
        require(expected == ioi.commitHash, "Hash mismatch - invalid reveal");
        require(quantity_ > 0, "Zero quantity");
        require(price_ > 0, "Zero price");

        ioi.pricePerShare   = price_;
        ioi.quantity        = quantity_;
        ioi.totalValue      = effectivePrice * quantity_;
        ioi.revealTimestamp = block.timestamp;
        ioi.status          = IOIStatus.Revealed;
        ioi.investorType    = investorType_;
        ioi.orderType       = orderType_;

        _updateAggregatedDemand(effectivePrice, quantity_);

        // Return deposit to honest revealer
        (bool ok,) = payable(msg.sender).call{value: depositAmount}("");
        require(ok, "Deposit return failed");

        emit IOIRevealed(msg.sender, price_, quantity_, investorType_, orderType_);
    }

    // ─────────────────────────────────────────────────────────────
    // PriceDiscovery phase — slash non-revealers
    // ─────────────────────────────────────────────────────────────

    /// @notice Slash all committed-but-not-revealed investors.
    ///         Their deposits are forfeited to the contract.
    function slashNonRevealers()
        external
        onlyBookrunner
        onlyPhase(BookBuilder.Phase.PriceDiscovery)
    {
        for (uint256 i = 0; i < _committedInvestors.length; i++) {
            address investor = _committedInvestors[i];
            if (iois[investor].status == IOIStatus.Committed) {
                iois[investor].status = IOIStatus.None; // invalidate
                totalSlashed += depositAmount;
                emit NonRevealer(investor, depositAmount);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Status updates (called by Allocation contract)
    // ─────────────────────────────────────────────────────────────

    function markAllocated(address investor_) external {
        require(
            bookBuilder.hasRole(BOOKRUNNER_ROLE, msg.sender) ||
            // Allow Allocation contract (set as admin) to call this
            bookBuilder.hasRole(bookBuilder.DEFAULT_ADMIN_ROLE(), msg.sender),
            "Not authorized"
        );
        iois[investor_].status = IOIStatus.Allocated;
        emit IOIStatusUpdated(investor_, IOIStatus.Allocated);
    }

    function markClaimed(address investor_) external {
        require(
            bookBuilder.hasRole(BOOKRUNNER_ROLE, msg.sender) ||
            bookBuilder.hasRole(bookBuilder.DEFAULT_ADMIN_ROLE(), msg.sender),
            "Not authorized"
        );
        iois[investor_].status = IOIStatus.Claimed;
        emit IOIStatusUpdated(investor_, IOIStatus.Claimed);
    }

    // ─────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────

    function _updateAggregatedDemand(uint256 price_, uint256 quantity_) internal {
        AggregatedDemand storage d = aggregatedDemand;
        d.totalShares += quantity_;
        d.totalValue  += price_ * quantity_;
        d.bidCount    += 1;
        d.weightedAvgPrice = d.totalShares > 0 ? d.totalValue / d.totalShares : 0;

        uint256 offeringShares = bookBuilder.getOffering().totalShares;
        d.coverageRatio = offeringShares > 0
            ? (d.totalShares * 1e18) / offeringShares
            : 0;
        d.lastUpdated = block.timestamp;

        emit AggregatedDemandUpdated(d.totalShares, d.totalValue, d.bidCount, d.coverageRatio);
    }

    // ─────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────

    /// @notice Returns own IOI (investor) or any IOI (bookrunner, post-reveal).
    function getIOI(address investor_) external view returns (IOI memory) {
        IOI memory ioi = iois[investor_];
        bool isBookrunner = bookBuilder.hasRole(BOOKRUNNER_ROLE, msg.sender);
        bool isSelf = msg.sender == investor_;

        if (!isSelf && !isBookrunner) {
            // Return only non-sensitive fields during commit phase
            BookBuilder.Phase phase = bookBuilder.getPhase();
            require(
                phase != BookBuilder.Phase.Commitment,
                "Order details hidden during commitment phase"
            );
        }
        return ioi;
    }

    function getCommitmentCount() external view returns (uint256) {
        return _committedInvestors.length;
    }

    function getAggregatedDemand() external view returns (AggregatedDemand memory) {
        return aggregatedDemand;
    }

    /// @notice Returns all revealed IOIs. Bookrunner only.
    function getAllRevealedIOIs() external view returns (IOI[] memory) {
        require(bookBuilder.hasRole(BOOKRUNNER_ROLE, msg.sender), "Not bookrunner");

        uint256 count = 0;
        for (uint256 i = 0; i < _committedInvestors.length; i++) {
            if (iois[_committedInvestors[i]].status >= IOIStatus.Revealed) count++;
        }

        IOI[] memory result = new IOI[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _committedInvestors.length; i++) {
            IOI storage ioi = iois[_committedInvestors[i]];
            if (ioi.status >= IOIStatus.Revealed) {
                result[idx++] = ioi;
            }
        }
        return result;
    }

    function getCommittedInvestors() external view returns (address[] memory) {
        return _committedInvestors;
    }

    // Allow withdrawal of slashed deposits by bookrunner
    function withdrawSlashed() external onlyBookrunner {
        uint256 amount = totalSlashed;
        totalSlashed = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdraw failed");
    }

    receive() external payable {}
}
