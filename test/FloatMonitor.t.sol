// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {FloatMonitor} from "../contracts/FloatMonitor.sol";
import {ShareRegistry} from "../contracts/ShareRegistry.sol";

contract FloatMonitorTest is Test {
    FloatMonitor   public fm;
    ShareRegistry  public registry;

    address admin      = makeAddr("admin");
    address director   = makeAddr("director");
    address investor1  = makeAddr("investor1");  // public
    address investor2  = makeAddr("investor2");  // public
    address cornerstone = makeAddr("cornerstone"); // locked

    uint256 constant TOTAL_SUPPLY = 100_000_000 * 1e18;
    // Market cap tiers in HKD (18 decimals)
    uint256 constant MARKET_CAP_SMALL  = 1_000_000_000 * 1e18;  // HK$1B → 25% min
    uint256 constant MARKET_CAP_MEDIUM = 5_000_000_000 * 1e18;  // HK$5B → 20% min
    uint256 constant MARKET_CAP_LARGE  = 15_000_000_000 * 1e18; // HK$15B → 15% min

    function setUp() public {
        vm.warp(1_000_000);

        registry = new ShareRegistry("TestCo", "TST", TOTAL_SUPPLY, admin);
        fm       = new FloatMonitor(admin);

        // Register company
        vm.prank(admin);
        fm.registerCompany(address(registry), "TestCo", "TST", MARKET_CAP_SMALL);

        // Distribute shares:
        // admin starts with all shares. Distribute to holders.
        vm.startPrank(admin);

        // Director: 10M shares (10%)
        registry.transfer(director, 10_000_000 * 1e18);
        registry.classifyHolder(director, ShareRegistry.HolderClass.Director, 0);

        // Cornerstone: 30M shares (30%), locked 6 months
        registry.transfer(cornerstone, 30_000_000 * 1e18);
        registry.classifyHolder(cornerstone, ShareRegistry.HolderClass.CornerstoneInvestor, block.timestamp + 180 days);

        // Public investor1: 35M shares
        registry.transfer(investor1, 35_000_000 * 1e18);
        // investor1 auto-classified as Public on transfer

        // Public investor2: 5M shares
        registry.transfer(investor2, 5_000_000 * 1e18);
        // investor2 auto-classified as Public on transfer

        // admin retains 20M (will classify as SubstantialHolder)
        registry.classifyHolder(admin, ShareRegistry.HolderClass.SubstantialHolder, 0);

        vm.stopPrank();
    }

    // ── Float computation ─────────────────────────────────────────────────────

    function test_PublicFloatComputedCorrectly() public view {
        // Public shares: investor1 (35M) + investor2 (5M) = 40M out of 100M = 40%
        uint256 floatBps = fm.computePublicFloat(address(registry));
        assertEq(floatBps, 4000); // 40%
    }

    function test_FloatIsAboveThresholdForSmallCap() public {
        // HK$1B market cap → 25% min required. We have 40% → Safe
        FloatMonitor.FloatRisk risk = fm.getFloatRisk(address(registry));
        assertEq(uint8(risk), uint8(FloatMonitor.FloatRisk.Safe));
    }

    // ── Threshold tiers ───────────────────────────────────────────────────────

    function test_RequiredMinFloatSmallCap() public {
        vm.prank(admin);
        fm.updateMarketCap(address(registry), MARKET_CAP_SMALL);
        assertEq(fm.getRequiredMinFloat(address(registry)), 2500); // 25%
    }

    function test_RequiredMinFloatMediumCap() public {
        vm.prank(admin);
        fm.updateMarketCap(address(registry), MARKET_CAP_MEDIUM);
        assertEq(fm.getRequiredMinFloat(address(registry)), 2000); // 20%
    }

    function test_RequiredMinFloatLargeCap() public {
        vm.prank(admin);
        fm.updateMarketCap(address(registry), MARKET_CAP_LARGE);
        assertEq(fm.getRequiredMinFloat(address(registry)), 1500); // 15%
    }

    // ── Warning / Breach ──────────────────────────────────────────────────────

    function test_WarningWhenWithin2PercentOfThreshold() public {
        // Transfer most public shares to a new substantial holder → float drops to ~26%
        // Required 25%, warning buffer = 2%, so 25-27% range is Warning
        address whale = makeAddr("whale");
        vm.prank(investor1);
        registry.transfer(whale, 14_000_000 * 1e18); // investor1: 35M → 21M public

        vm.prank(admin);
        registry.classifyHolder(whale, ShareRegistry.HolderClass.SubstantialHolder, 0);

        // Now public: investor1 (21M) + investor2 (5M) = 26M = 26% → Warning (between 25% and 27%)
        FloatMonitor.FloatRisk risk = fm.getFloatRisk(address(registry));
        assertEq(uint8(risk), uint8(FloatMonitor.FloatRisk.Warning));
    }

    function test_BreachWhenBelowThreshold() public {
        // Classify most public shares as non-public to cause breach
        vm.prank(admin);
        registry.classifyHolder(investor1, ShareRegistry.HolderClass.SubstantialHolder, 0);
        // Now public: only investor2 (5M) = 5% → Breach (< 25%)

        FloatMonitor.FloatRisk risk = fm.getFloatRisk(address(registry));
        assertEq(uint8(risk), uint8(FloatMonitor.FloatRisk.Breach));
    }

    function test_CheckAndAlertEmitsBreachEvent() public {
        vm.prank(admin);
        registry.classifyHolder(investor1, ShareRegistry.HolderClass.SubstantialHolder, 0);

        vm.expectEmit(true, false, false, false);
        emit FloatMonitor.FloatBreach(address(registry), "TST", 0, 0);

        fm.checkAndAlert(address(registry));
    }

    function test_CornerstoneLockupReleaseIncreasesFloat() public {
        // Cornerstone locked 180 days. After lock expires, shares count as public float.
        // Current float = 40% (cornerstone locked, doesn't count)

        // Warp past lock-up
        vm.warp(block.timestamp + 181 days);

        // Recheck: cornerstone (30M) is now public → float = 40% + 30% = 70%
        uint256 floatBps = fm.computePublicFloat(address(registry));
        assertEq(floatBps, 7000); // 70%
    }

    // ── Multi-company ─────────────────────────────────────────────────────────

    function test_GetAtRiskCompanies() public {
        // Cause a breach
        vm.prank(admin);
        registry.classifyHolder(investor1, ShareRegistry.HolderClass.SubstantialHolder, 0);

        fm.checkAndAlert(address(registry));

        FloatMonitor.ListedCompany[] memory atRisk = fm.getAtRiskCompanies();
        assertEq(atRisk.length, 1);
        assertEq(atRisk[0].ticker, "TST");
    }

    function test_GetAllCompanies() public view {
        FloatMonitor.ListedCompany[] memory all = fm.getAllCompanies();
        assertEq(all.length, 1);
        assertEq(all[0].name, "TestCo");
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_FloatBpsNeverExceeds10000(uint256 publicAmount) public {
        vm.assume(publicAmount <= TOTAL_SUPPLY);
        // Give investor1 a specific amount of public shares
        uint256 investor1Current = registry.balanceOf(investor1);
        if (publicAmount > investor1Current) {
            vm.prank(admin);
            // can't give more than admin holds, so bound it
            return;
        }
        uint256 floatBps = fm.computePublicFloat(address(registry));
        assertLe(floatBps, 10000);
    }
}
