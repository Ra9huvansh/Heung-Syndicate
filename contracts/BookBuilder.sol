// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BookBuilder
/// @notice Orchestrator contract. Manages IPO offering parameters, the phase
///         state machine (Setup → Commitment → Reveal → PriceDiscovery →
///         Allocation → Settlement → Closed), and role-based access control.
contract BookBuilder is AccessControl {
    // ─────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────
    bytes32 public constant ISSUER_ROLE     = keccak256("ISSUER_ROLE");
    bytes32 public constant BOOKRUNNER_ROLE = keccak256("BOOKRUNNER_ROLE");
    bytes32 public constant INVESTOR_ROLE   = keccak256("INVESTOR_ROLE");

    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────
    enum Phase {
        Setup,
        Commitment,
        Reveal,
        PriceDiscovery,
        Allocation,
        Settlement,
        Closed
    }

    enum Mechanism { A, B }

    struct Offering {
        bytes32   offeringId;
        string    companyName;
        string    ticker;
        uint256   totalShares;
        uint256   priceRangeLow;   // HKD in wei (18 decimals)
        uint256   priceRangeHigh;
        uint256   commitDeadline;
        uint256   revealDeadline;
        uint256   pricingDeadline;
        Mechanism mechanism;
        bool      active;
    }

    struct WhitelistEntry {
        bool    whitelisted;
        bool    isCornerstone;
        bool    isConnectedPerson;
        uint256 addedAt;
    }

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────
    Offering public offering;
    Phase    public currentPhase;

    mapping(address => WhitelistEntry) public whitelist;
    address[] private _whitelistedAddresses;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────
    event OfferingCreated(
        bytes32 indexed offeringId,
        string  companyName,
        string  ticker,
        uint256 totalShares,
        uint256 priceRangeLow,
        uint256 priceRangeHigh
    );
    event PhaseAdvanced(Phase indexed from, Phase indexed to, uint256 timestamp);
    event InvestorWhitelisted(address indexed investor, bool isCornerstone, bool isConnectedPerson);
    event InvestorDewhitelisted(address indexed investor);

    // ─────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────
    modifier onlyPhase(Phase phase_) {
        require(currentPhase == phase_, "Wrong phase");
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────
    constructor(
        address bookrunner_,
        address issuer_,
        bytes32 offeringId_,
        string  memory companyName_,
        string  memory ticker_,
        uint256 totalShares_,
        uint256 priceRangeLow_,
        uint256 priceRangeHigh_,
        uint256 commitDeadline_,
        uint256 revealDeadline_,
        uint256 pricingDeadline_,
        Mechanism mechanism_
    ) {
        require(priceRangeLow_ < priceRangeHigh_, "Invalid price range");
        require(commitDeadline_ > block.timestamp,  "Commit deadline in past");
        require(revealDeadline_ > commitDeadline_,  "Reveal before commit");
        require(pricingDeadline_ > revealDeadline_, "Pricing before reveal");

        _grantRole(DEFAULT_ADMIN_ROLE, bookrunner_);
        _grantRole(BOOKRUNNER_ROLE,   bookrunner_);
        _grantRole(ISSUER_ROLE,        issuer_);

        offering = Offering({
            offeringId:     offeringId_,
            companyName:    companyName_,
            ticker:         ticker_,
            totalShares:    totalShares_,
            priceRangeLow:  priceRangeLow_,
            priceRangeHigh: priceRangeHigh_,
            commitDeadline: commitDeadline_,
            revealDeadline: revealDeadline_,
            pricingDeadline: pricingDeadline_,
            mechanism:      mechanism_,
            active:         true
        });

        currentPhase = Phase.Setup;

        emit OfferingCreated(
            offeringId_,
            companyName_,
            ticker_,
            totalShares_,
            priceRangeLow_,
            priceRangeHigh_
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Phase management
    // ─────────────────────────────────────────────────────────────

    /// @notice Advance to the next phase. Only bookrunner.
    function advancePhase() external onlyRole(BOOKRUNNER_ROLE) {
        require(currentPhase != Phase.Closed, "Already closed");
        Phase next = Phase(uint8(currentPhase) + 1);
        _validatePhaseTransition(next);
        Phase prev = currentPhase;
        currentPhase = next;
        emit PhaseAdvanced(prev, next, block.timestamp);
    }

    /// @notice Anyone can call this to auto-advance past a deadline.
    function checkAndAdvancePhase() external {
        if (currentPhase == Phase.Commitment && block.timestamp > offering.commitDeadline) {
            Phase prev = currentPhase;
            currentPhase = Phase.Reveal;
            emit PhaseAdvanced(prev, Phase.Reveal, block.timestamp);
        } else if (currentPhase == Phase.Reveal && block.timestamp > offering.revealDeadline) {
            Phase prev = currentPhase;
            currentPhase = Phase.PriceDiscovery;
            emit PhaseAdvanced(prev, Phase.PriceDiscovery, block.timestamp);
        } else if (currentPhase == Phase.PriceDiscovery && block.timestamp > offering.pricingDeadline) {
            Phase prev = currentPhase;
            currentPhase = Phase.Allocation;
            emit PhaseAdvanced(prev, Phase.Allocation, block.timestamp);
        }
    }

    function _validatePhaseTransition(Phase next_) internal view {
        if (next_ == Phase.Commitment) {
            require(_whitelistedAddresses.length > 0, "No investors whitelisted");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Whitelist management
    // ─────────────────────────────────────────────────────────────

    function whitelistInvestor(
        address investor_,
        bool    isCornerstone_,
        bool    isConnectedPerson_
    ) external onlyRole(BOOKRUNNER_ROLE) {
        require(investor_ != address(0), "Zero address");
        if (!whitelist[investor_].whitelisted) {
            _whitelistedAddresses.push(investor_);
        }
        whitelist[investor_] = WhitelistEntry({
            whitelisted:      true,
            isCornerstone:    isCornerstone_,
            isConnectedPerson: isConnectedPerson_,
            addedAt:          block.timestamp
        });
        _grantRole(INVESTOR_ROLE, investor_);
        emit InvestorWhitelisted(investor_, isCornerstone_, isConnectedPerson_);
    }

    function whitelistInvestorsBatch(
        address[] calldata investors_,
        bool[]    calldata isCornerstone_,
        bool[]    calldata isConnectedPerson_
    ) external onlyRole(BOOKRUNNER_ROLE) {
        require(
            investors_.length == isCornerstone_.length &&
            isCornerstone_.length == isConnectedPerson_.length,
            "Array length mismatch"
        );
        for (uint256 i = 0; i < investors_.length; i++) {
            if (!whitelist[investors_[i]].whitelisted) {
                _whitelistedAddresses.push(investors_[i]);
            }
            whitelist[investors_[i]] = WhitelistEntry({
                whitelisted:      true,
                isCornerstone:    isCornerstone_[i],
                isConnectedPerson: isConnectedPerson_[i],
                addedAt:          block.timestamp
            });
            _grantRole(INVESTOR_ROLE, investors_[i]);
            emit InvestorWhitelisted(investors_[i], isCornerstone_[i], isConnectedPerson_[i]);
        }
    }

    function dewhitelistInvestor(address investor_) external onlyRole(BOOKRUNNER_ROLE) {
        whitelist[investor_].whitelisted = false;
        _revokeRole(INVESTOR_ROLE, investor_);
        emit InvestorDewhitelisted(investor_);
    }

    // ─────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────

    function getWhitelistedAddresses() external view returns (address[] memory) {
        return _whitelistedAddresses;
    }

    function isWhitelisted(address investor_) external view returns (bool) {
        return whitelist[investor_].whitelisted;
    }

    function getOffering() external view returns (Offering memory) {
        return offering;
    }

    function getPhase() external view returns (Phase) {
        return currentPhase;
    }

    function timeUntilNextDeadline() external view returns (uint256) {
        if (currentPhase == Phase.Commitment) {
            return offering.commitDeadline > block.timestamp
                ? offering.commitDeadline - block.timestamp : 0;
        }
        if (currentPhase == Phase.Reveal) {
            return offering.revealDeadline > block.timestamp
                ? offering.revealDeadline - block.timestamp : 0;
        }
        if (currentPhase == Phase.PriceDiscovery) {
            return offering.pricingDeadline > block.timestamp
                ? offering.pricingDeadline - block.timestamp : 0;
        }
        return 0;
    }
}
