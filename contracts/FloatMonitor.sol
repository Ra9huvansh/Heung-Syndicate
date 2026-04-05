// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShareRegistry} from "./ShareRegistry.sol";

/// @title FloatMonitor
/// @notice Monitors post-IPO public float compliance against HKEX tiered thresholds.
///
///         HKEX Listing Rules minimum public float:
///           < HK$3B market cap  → 25% minimum
///           HK$3B–10B           → 20% minimum
///           > HK$10B            → 15% minimum
///
///         Emits FloatWarning when within 2% of minimum.
///         Emits FloatBreach when below minimum.
///         Frontend polls FloatUpdated every 10 seconds for live dashboard.
contract FloatMonitor is AccessControl {
    // ─────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────
    bytes32 public constant KEEPER_ROLE    = keccak256("KEEPER_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────
    enum FloatRisk { Safe, Warning, Breach }

    struct FloatThreshold {
        uint256 marketCapHigh; // upper bound in HKD (18 decimals); 0 = no upper bound
        uint256 minFloatBps;   // minimum public float in basis points
    }

    struct ListedCompany {
        string         name;
        string         ticker;
        address        shareToken;    // the ShareRegistry contract address
        uint256        marketCapHKD;  // current market cap in HKD wei (updated by keeper)
        uint256        lastChecked;
        uint256        currentFloatBps;
        FloatRisk      risk;
        bool           active;
    }

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    // Tiered thresholds (HKEX Main Board Listing Rules)
    // Tier 0: < HK$3B  → 25%
    // Tier 1: < HK$10B → 20%
    // Tier 2: no limit → 15%
    FloatThreshold[3] public thresholds;

    uint256 public constant WARNING_BUFFER_BPS = 200; // 2% buffer before breach = Warning

    mapping(address => ListedCompany) public companies;
    address[] private _companyList;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────
    event CompanyRegistered(address indexed shareToken, string name, string ticker);
    event FloatUpdated(
        address indexed shareToken,
        string          ticker,
        uint256         currentFloatBps,
        uint256         requiredMinBps,
        FloatRisk       risk,
        uint256         timestamp
    );
    event FloatWarning(address indexed shareToken, string ticker, uint256 currentFloatBps, uint256 requiredMinBps);
    event FloatBreach(address indexed shareToken, string ticker, uint256 currentFloatBps, uint256 requiredMinBps);
    event MarketCapUpdated(address indexed shareToken, uint256 newMarketCapHKD);

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────
    constructor(address admin_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE,        admin_);
        _grantRole(REGISTRAR_ROLE,     admin_);

        // HKEX tiered thresholds
        // HKD values use 18 decimals (1e18 = HK$1)
        thresholds[0] = FloatThreshold({
            marketCapHigh: 3_000_000_000 * 1e18, // HK$3 billion
            minFloatBps:   2500                   // 25%
        });
        thresholds[1] = FloatThreshold({
            marketCapHigh: 10_000_000_000 * 1e18, // HK$10 billion
            minFloatBps:   2000                    // 20%
        });
        thresholds[2] = FloatThreshold({
            marketCapHigh: 0,    // no upper bound
            minFloatBps:   1500  // 15%
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Company registration
    // ─────────────────────────────────────────────────────────────

    function registerCompany(
        address shareToken_,
        string  calldata name_,
        string  calldata ticker_,
        uint256 marketCapHKD_
    ) external onlyRole(REGISTRAR_ROLE) {
        require(shareToken_ != address(0), "Zero address");
        require(!companies[shareToken_].active, "Already registered");

        companies[shareToken_] = ListedCompany({
            name:           name_,
            ticker:         ticker_,
            shareToken:     shareToken_,
            marketCapHKD:   marketCapHKD_,
            lastChecked:    block.timestamp,
            currentFloatBps: 0,
            risk:           FloatRisk.Safe,
            active:         true
        });
        _companyList.push(shareToken_);

        emit CompanyRegistered(shareToken_, name_, ticker_);
    }

    function updateMarketCap(address shareToken_, uint256 marketCapHKD_)
        external
        onlyRole(KEEPER_ROLE)
    {
        require(companies[shareToken_].active, "Not registered");
        companies[shareToken_].marketCapHKD = marketCapHKD_;
        emit MarketCapUpdated(shareToken_, marketCapHKD_);
    }

    // ─────────────────────────────────────────────────────────────
    // Float computation
    // ─────────────────────────────────────────────────────────────

    /// @notice Compute the current public float percentage (in basis points) for a company.
    ///         Public float = shares held by holders classified as Public
    ///         (cornerstones whose lock-up has expired also count).
    function computePublicFloat(address shareToken_) public view returns (uint256 floatBps) {
        ShareRegistry registry = ShareRegistry(shareToken_);
        uint256 totalSupply = registry.totalSupply();
        if (totalSupply == 0) return 0;

        address[] memory holders = registry.getAllHolders();
        uint256 publicShares = 0;

        for (uint256 i = 0; i < holders.length; i++) {
            if (registry.isPublicFloat(holders[i])) {
                publicShares += registry.balanceOf(holders[i]);
            }
        }

        floatBps = (publicShares * 10000) / totalSupply;
    }

    /// @notice Get the required minimum float (bps) for a company based on its market cap tier.
    function getRequiredMinFloat(address shareToken_) public view returns (uint256) {
        uint256 marketCap = companies[shareToken_].marketCapHKD;
        for (uint256 i = 0; i < 3; i++) {
            if (thresholds[i].marketCapHigh == 0 || marketCap < thresholds[i].marketCapHigh) {
                return thresholds[i].minFloatBps;
            }
        }
        return thresholds[2].minFloatBps; // fallback to 15%
    }

    /// @notice Get the current risk level for a company.
    function getFloatRisk(address shareToken_) public view returns (FloatRisk) {
        uint256 currentBps = computePublicFloat(shareToken_);
        uint256 requiredBps = getRequiredMinFloat(shareToken_);

        if (currentBps < requiredBps) {
            return FloatRisk.Breach;
        }
        if (currentBps < requiredBps + WARNING_BUFFER_BPS) {
            return FloatRisk.Warning;
        }
        return FloatRisk.Safe;
    }

    // ─────────────────────────────────────────────────────────────
    // Check and alert
    // ─────────────────────────────────────────────────────────────

    /// @notice Check a single company and emit events if needed.
    ///         Called by frontend keeper or any external party.
    function checkAndAlert(address shareToken_) external {
        require(companies[shareToken_].active, "Not registered");

        uint256 currentBps  = computePublicFloat(shareToken_);
        uint256 requiredBps = getRequiredMinFloat(shareToken_);
        FloatRisk risk      = _deriveRisk(currentBps, requiredBps);

        ListedCompany storage company = companies[shareToken_];
        company.currentFloatBps = currentBps;
        company.risk            = risk;
        company.lastChecked     = block.timestamp;

        emit FloatUpdated(shareToken_, company.ticker, currentBps, requiredBps, risk, block.timestamp);

        if (risk == FloatRisk.Breach) {
            emit FloatBreach(shareToken_, company.ticker, currentBps, requiredBps);
        } else if (risk == FloatRisk.Warning) {
            emit FloatWarning(shareToken_, company.ticker, currentBps, requiredBps);
        }
    }

    /// @notice Check all registered companies at once. Gas-intensive — use off-chain keeper.
    function checkAllCompanies() external {
        for (uint256 i = 0; i < _companyList.length; i++) {
            address token = _companyList[i];
            if (companies[token].active) {
                uint256 currentBps  = computePublicFloat(token);
                uint256 requiredBps = getRequiredMinFloat(token);
                FloatRisk risk      = _deriveRisk(currentBps, requiredBps);

                ListedCompany storage company = companies[token];
                company.currentFloatBps = currentBps;
                company.risk            = risk;
                company.lastChecked     = block.timestamp;

                emit FloatUpdated(token, company.ticker, currentBps, requiredBps, risk, block.timestamp);

                if (risk == FloatRisk.Breach) {
                    emit FloatBreach(token, company.ticker, currentBps, requiredBps);
                } else if (risk == FloatRisk.Warning) {
                    emit FloatWarning(token, company.ticker, currentBps, requiredBps);
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────

    function _deriveRisk(uint256 currentBps_, uint256 requiredBps_) internal pure returns (FloatRisk) {
        if (currentBps_ < requiredBps_) {
            return FloatRisk.Breach;
        }
        if (currentBps_ < requiredBps_ + WARNING_BUFFER_BPS) {
            return FloatRisk.Warning;
        }
        return FloatRisk.Safe;
    }

    // ─────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────

    function getAllCompanies() external view returns (ListedCompany[] memory) {
        ListedCompany[] memory result = new ListedCompany[](_companyList.length);
        for (uint256 i = 0; i < _companyList.length; i++) {
            result[i] = companies[_companyList[i]];
        }
        return result;
    }

    function getCompany(address shareToken_) external view returns (ListedCompany memory) {
        return companies[shareToken_];
    }

    function getCompanyCount() external view returns (uint256) {
        return _companyList.length;
    }

    function getCompanyAddresses() external view returns (address[] memory) {
        return _companyList;
    }

    /// @notice Returns all companies currently in Warning or Breach state.
    function getAtRiskCompanies() external view returns (ListedCompany[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _companyList.length; i++) {
            FloatRisk r = companies[_companyList[i]].risk;
            if (r == FloatRisk.Warning || r == FloatRisk.Breach) count++;
        }

        ListedCompany[] memory result = new ListedCompany[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _companyList.length; i++) {
            ListedCompany memory c = companies[_companyList[i]];
            if (c.risk == FloatRisk.Warning || c.risk == FloatRisk.Breach) {
                result[idx++] = c;
            }
        }
        return result;
    }
}
