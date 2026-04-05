// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ShareRegistry
/// @notice ERC-20 share token with HKEX holder classification.
///         Every holder is tagged as Public, Director, SubstantialHolder,
///         CornerstoneInvestor (with lock-up), or ConnectedPerson.
///         FloatMonitor reads this registry to compute live public float.
contract ShareRegistry is ERC20, AccessControl {
    // ─────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────
    bytes32 public constant BOOKRUNNER_ROLE = keccak256("BOOKRUNNER_ROLE");
    bytes32 public constant MINTER_ROLE     = keccak256("MINTER_ROLE");

    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────
    enum HolderClass {
        Public,              // counts toward public float
        Director,            // does NOT count
        SubstantialHolder,   // >=5% — does NOT count
        CornerstoneInvestor, // locked 6 months — does NOT count during lock-up
        ConnectedPerson      // does NOT count
    }

    struct HolderInfo {
        HolderClass class;
        uint256     lockedUntil; // timestamp; 0 = no lock
        bool        classified;
    }

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────
    mapping(address => HolderInfo) public holderInfo;
    address[] private _holderList;
    mapping(address => bool) private _inHolderList;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────
    event HolderClassified(address indexed holder, HolderClass class, uint256 lockedUntil);
    event HolderReclassified(address indexed holder, HolderClass oldClass, HolderClass newClass);
    event LockExpired(address indexed holder, uint256 timestamp);

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address bookrunner_
    ) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, bookrunner_);
        _grantRole(BOOKRUNNER_ROLE, bookrunner_);
        _grantRole(MINTER_ROLE, bookrunner_);
        _mint(bookrunner_, initialSupply_);
    }

    // ─────────────────────────────────────────────────────────────
    // Classification
    // ─────────────────────────────────────────────────────────────

    /// @notice Classify a holder. Called by bookrunner during IPO setup or post-transfer.
    function classifyHolder(
        address holder_,
        HolderClass class_,
        uint256 lockedUntil_
    ) external onlyRole(BOOKRUNNER_ROLE) {
        HolderClass old = holderInfo[holder_].class;
        holderInfo[holder_] = HolderInfo({
            class:      class_,
            lockedUntil: lockedUntil_,
            classified: true
        });
        if (holderInfo[holder_].classified) {
            emit HolderReclassified(holder_, old, class_);
        } else {
            emit HolderClassified(holder_, class_, lockedUntil_);
        }
    }

    /// @notice Batch classify multiple holders at once (gas-efficient for IPO setup).
    function classifyHoldersBatch(
        address[]     calldata holders_,
        HolderClass[] calldata classes_,
        uint256[]     calldata lockedUntils_
    ) external onlyRole(BOOKRUNNER_ROLE) {
        require(
            holders_.length == classes_.length && classes_.length == lockedUntils_.length,
            "Array length mismatch"
        );
        for (uint256 i = 0; i < holders_.length; i++) {
            holderInfo[holders_[i]] = HolderInfo({
                class:      classes_[i],
                lockedUntil: lockedUntils_[i],
                classified: true
            });
            emit HolderClassified(holders_[i], classes_[i], lockedUntils_[i]);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Mint
    // ─────────────────────────────────────────────────────────────

    function mint(address to_, uint256 amount_) external onlyRole(MINTER_ROLE) {
        _mint(to_, amount_);
    }

    // ─────────────────────────────────────────────────────────────
    // Holder list management (for FloatMonitor iteration)
    // ─────────────────────────────────────────────────────────────

    function _update(address from_, address to_, uint256 amount_) internal override {
        super._update(from_, to_, amount_);
        if (to_ != address(0) && !_inHolderList[to_]) {
            _holderList.push(to_);
            _inHolderList[to_] = true;
            // Default new holders to Public unless classified
            if (!holderInfo[to_].classified) {
                holderInfo[to_] = HolderInfo({
                    class:      HolderClass.Public,
                    lockedUntil: 0,
                    classified: true
                });
            }
        }
    }

    function getAllHolders() external view returns (address[] memory) {
        return _holderList;
    }

    function holderCount() external view returns (uint256) {
        return _holderList.length;
    }

    // ─────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────

    /// @notice Returns true if the holder's shares currently count toward public float.
    function isPublicFloat(address holder_) external view returns (bool) {
        HolderInfo memory info = holderInfo[holder_];
        if (!info.classified) return true; // unclassified = public by default
        if (info.class != HolderClass.Public && info.class != HolderClass.CornerstoneInvestor) {
            return false;
        }
        if (info.class == HolderClass.CornerstoneInvestor) {
            return info.lockedUntil < block.timestamp; // locked = NOT public float
        }
        return true;
    }
}
