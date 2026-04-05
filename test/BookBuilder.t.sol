// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BookBuilder} from "../contracts/BookBuilder.sol";

contract BookBuilderTest is Test {
    BookBuilder public bb;

    address bookrunner = makeAddr("bookrunner");
    address issuer     = makeAddr("issuer");
    address investor1  = makeAddr("investor1");
    address investor2  = makeAddr("investor2");

    function setUp() public {
        vm.warp(1_000_000); // set a predictable timestamp

        bb = new BookBuilder(
            bookrunner,
            issuer,
            keccak256("TEST_IPO"),
            "TestCo",
            "TST",
            100_000_000,
            8e18,
            10e18,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            block.timestamp + 3 days,
            BookBuilder.Mechanism.A
        );
    }

    // ── Phase management ─────────────────────────────────────────────────────

    function test_InitialPhaseIsSetup() public view {
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Setup));
    }

    function test_BookrunnerCanAdvancePhase() public {
        // Whitelist someone first (required to advance to Commitment)
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);

        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Commitment));
    }

    function test_NonBookrunnerCannotAdvancePhase() public {
        vm.prank(issuer);
        vm.expectRevert();
        bb.advancePhase();
    }

    function test_CannotAdvancePastSetupWithNoInvestors() public {
        vm.prank(bookrunner);
        vm.expectRevert("No investors whitelisted");
        bb.advancePhase();
    }

    function test_AutoAdvanceAfterCommitDeadline() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);

        vm.prank(bookrunner);
        bb.advancePhase(); // Setup → Commitment

        // Warp past commit deadline
        vm.warp(block.timestamp + 1 days + 1);
        bb.checkAndAdvancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Reveal));
    }

    function test_FullPhaseProgression() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);

        // Setup → Commitment
        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Commitment));

        // Commitment → Reveal
        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Reveal));

        // Reveal → PriceDiscovery
        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.PriceDiscovery));

        // PriceDiscovery → Allocation
        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Allocation));

        // Allocation → Settlement
        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Settlement));

        // Settlement → Closed
        vm.prank(bookrunner);
        bb.advancePhase();
        assertEq(uint8(bb.getPhase()), uint8(BookBuilder.Phase.Closed));
    }

    // ── Whitelist ────────────────────────────────────────────────────────────

    function test_BookrunnerCanWhitelistInvestor() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);
        assertTrue(bb.isWhitelisted(investor1));
    }

    function test_CornerStoneWhitelistFlag() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, true, false);
        (, bool isCornerstone,,) = bb.whitelist(investor1);
        assertTrue(isCornerstone);
    }

    function test_ConnectedPersonWhitelistFlag() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, true);
        (,, bool isConnectedPerson,) = bb.whitelist(investor1);
        assertTrue(isConnectedPerson);
    }

    function test_DewhitelistRemovesInvestor() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);
        assertTrue(bb.isWhitelisted(investor1));

        vm.prank(bookrunner);
        bb.dewhitelistInvestor(investor1);
        assertFalse(bb.isWhitelisted(investor1));
    }

    function test_BatchWhitelist() public {
        address[] memory investors = new address[](2);
        bool[]    memory cs        = new bool[](2);
        bool[]    memory cp        = new bool[](2);

        investors[0] = investor1;
        investors[1] = investor2;
        cs[0] = true;  cs[1] = false;
        cp[0] = false; cp[1] = false;

        vm.prank(bookrunner);
        bb.whitelistInvestorsBatch(investors, cs, cp);

        assertTrue(bb.isWhitelisted(investor1));
        assertTrue(bb.isWhitelisted(investor2));
    }

    // ── Offering parameters ──────────────────────────────────────────────────

    function test_OfferingParametersStoredCorrectly() public view {
        BookBuilder.Offering memory o = bb.getOffering();
        assertEq(o.companyName, "TestCo");
        assertEq(o.ticker, "TST");
        assertEq(o.totalShares, 100_000_000);
        assertEq(o.priceRangeLow, 8e18);
        assertEq(o.priceRangeHigh, 10e18);
    }

    function test_TimeUntilNextDeadlineInCommitmentPhase() public {
        vm.prank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);
        vm.prank(bookrunner);
        bb.advancePhase(); // Setup → Commitment

        uint256 remaining = bb.timeUntilNextDeadline();
        assertGt(remaining, 0);
        assertLe(remaining, 1 days);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_WhitelistAnyNonZeroAddress(address addr) public {
        vm.assume(addr != address(0));
        vm.prank(bookrunner);
        bb.whitelistInvestor(addr, false, false);
        assertTrue(bb.isWhitelisted(addr));
    }
}
