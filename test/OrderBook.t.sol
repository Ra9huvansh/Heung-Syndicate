// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BookBuilder} from "../contracts/BookBuilder.sol";
import {OrderBook} from "../contracts/OrderBook.sol";

contract OrderBookTest is Test {
    BookBuilder public bb;
    OrderBook   public ob;

    address bookrunner = makeAddr("bookrunner");
    address issuer     = makeAddr("issuer");
    address investor1  = makeAddr("investor1");
    address investor2  = makeAddr("investor2");
    address investor3  = makeAddr("investor3"); // non-revealer

    uint256 constant DEPOSIT = 0.001 ether;

    // Investor 1: HK$9.50, 1,000,000 shares
    uint256 constant INV1_PRICE = 95e17; // 9.5 * 1e18
    uint256 constant INV1_QTY   = 1_000_000;
    bytes32 constant INV1_SALT  = keccak256("investor1salt");

    // Investor 2: HK$10.00, 500,000 shares (strike order)
    uint256 constant INV2_PRICE = 10e18;
    uint256 constant INV2_QTY   = 500_000;
    bytes32 constant INV2_SALT  = keccak256("investor2salt");

    function setUp() public {
        vm.warp(1_000_000);
        vm.deal(investor1, 1 ether);
        vm.deal(investor2, 1 ether);
        vm.deal(investor3, 1 ether);

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

        ob = new OrderBook(address(bb), DEPOSIT);

        // Whitelist investors
        vm.startPrank(bookrunner);
        bb.whitelistInvestor(investor1, false, false);
        bb.whitelistInvestor(investor2, false, false);
        bb.whitelistInvestor(investor3, false, false);
        bb.advancePhase(); // Setup → Commitment
        vm.stopPrank();
    }

    // ── Commit phase ─────────────────────────────────────────────────────────

    function test_InvestorCanCommitIOI() public {
        bytes32 hash = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));

        vm.prank(investor1);
        ob.commitIOI{value: DEPOSIT}(hash);

        assertEq(ob.getCommitmentCount(), 1);
    }

    function test_CommitRevertsWithInsufficientDeposit() public {
        bytes32 hash = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));

        vm.prank(investor1);
        vm.expectRevert("Insufficient deposit");
        ob.commitIOI{value: DEPOSIT - 1}(hash);
    }

    function test_CannotCommitTwice() public {
        bytes32 hash = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));

        vm.startPrank(investor1);
        ob.commitIOI{value: DEPOSIT}(hash);
        vm.expectRevert("Already committed");
        ob.commitIOI{value: DEPOSIT}(hash);
        vm.stopPrank();
    }

    function test_CommitHidesDetails() public {
        bytes32 hash = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));

        vm.prank(investor1);
        ob.commitIOI{value: DEPOSIT}(hash);

        // investor2 cannot see investor1's order during commit phase
        vm.prank(investor2);
        vm.expectRevert("Order details hidden during commitment phase");
        ob.getIOI(investor1);
    }

    function test_NonWhitelistedCannotCommit() public {
        address rando = makeAddr("rando");
        vm.deal(rando, 1 ether);
        bytes32 hash = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));

        vm.prank(rando);
        vm.expectRevert("Not whitelisted");
        ob.commitIOI{value: DEPOSIT}(hash);
    }

    // ── Reveal phase ─────────────────────────────────────────────────────────

    function _commitAndAdvanceToReveal() internal {
        bytes32 hash1 = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));
        bytes32 hash2 = keccak256(abi.encodePacked(INV2_PRICE, INV2_QTY, INV2_SALT));
        // investor3 commits but will not reveal
        bytes32 hash3 = keccak256(abi.encodePacked(uint256(9e18), uint256(200_000), bytes32("salt3")));

        vm.prank(investor1); ob.commitIOI{value: DEPOSIT}(hash1);
        vm.prank(investor2); ob.commitIOI{value: DEPOSIT}(hash2);
        vm.prank(investor3); ob.commitIOI{value: DEPOSIT}(hash3);

        vm.prank(bookrunner); bb.advancePhase(); // Commitment → Reveal
    }

    function test_InvestorCanReveal() public {
        _commitAndAdvanceToReveal();
        uint256 balBefore = investor1.balance;

        vm.prank(investor1);
        ob.revealIOI(
            INV1_PRICE,
            INV1_QTY,
            INV1_SALT,
            OrderBook.InvestorType.LongOnly,
            OrderBook.OrderType.Limit
        );

        // Deposit should be returned
        assertEq(investor1.balance, balBefore + DEPOSIT);

        // Aggregated demand should update
        OrderBook.AggregatedDemand memory d = ob.getAggregatedDemand();
        assertEq(d.totalShares, INV1_QTY);
        assertEq(d.bidCount, 1);
        assertGt(d.coverageRatio, 0);
    }

    function test_RevealWithWrongSaltFails() public {
        _commitAndAdvanceToReveal();

        vm.prank(investor1);
        vm.expectRevert("Hash mismatch - invalid reveal");
        ob.revealIOI(
            INV1_PRICE,
            INV1_QTY,
            keccak256("wrongsalt"),
            OrderBook.InvestorType.LongOnly,
            OrderBook.OrderType.Limit
        );
    }

    function test_AggregatedDemandAfterMultipleReveals() public {
        _commitAndAdvanceToReveal();

        vm.prank(investor1);
        ob.revealIOI(INV1_PRICE, INV1_QTY, INV1_SALT, OrderBook.InvestorType.LongOnly, OrderBook.OrderType.Limit);

        vm.prank(investor2);
        ob.revealIOI(INV2_PRICE, INV2_QTY, INV2_SALT, OrderBook.InvestorType.HedgeFund, OrderBook.OrderType.Limit);

        OrderBook.AggregatedDemand memory d = ob.getAggregatedDemand();
        assertEq(d.totalShares, INV1_QTY + INV2_QTY);
        assertEq(d.bidCount, 2);
        assertGt(d.weightedAvgPrice, 0);
    }

    // ── Slash non-revealers ──────────────────────────────────────────────────

    function test_NonRevealersGetSlashed() public {
        _commitAndAdvanceToReveal();

        // Only investor1 reveals
        vm.prank(investor1);
        ob.revealIOI(INV1_PRICE, INV1_QTY, INV1_SALT, OrderBook.InvestorType.LongOnly, OrderBook.OrderType.Limit);

        // Advance to PriceDiscovery
        vm.prank(bookrunner); bb.advancePhase(); // Reveal → PriceDiscovery

        uint256 contractBalBefore = address(ob).balance;

        vm.prank(bookrunner);
        ob.slashNonRevealers();

        // investor2 and investor3 didn't reveal → 2 deposits slashed
        assertEq(ob.totalSlashed(), 2 * DEPOSIT);
        // Contract balance unchanged (slashed funds stay in contract until withdrawn)
        assertEq(address(ob).balance, contractBalBefore);
    }

    function test_BookrunnerCanWithdrawSlashedFunds() public {
        _commitAndAdvanceToReveal();
        vm.prank(bookrunner); bb.advancePhase(); // → PriceDiscovery
        vm.prank(bookrunner); ob.slashNonRevealers();

        uint256 balBefore = bookrunner.balance;
        vm.prank(bookrunner);
        ob.withdrawSlashed();

        assertGt(bookrunner.balance, balBefore);
        assertEq(ob.totalSlashed(), 0);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_CommitAnyNonZeroHash(bytes32 hash) public {
        vm.assume(hash != bytes32(0));
        vm.prank(investor1);
        ob.commitIOI{value: DEPOSIT}(hash);
        assertEq(ob.getCommitmentCount(), 1);
    }

    /// @notice Reveal must always fail if the hash doesn't match — regardless of inputs
    function testFuzz_RevealWithWrongInputsAlwaysFails(
        uint256 price,
        uint256 qty,
        bytes32 salt,
        bytes32 wrongSalt
    ) public {
        vm.assume(salt != wrongSalt);
        vm.assume(price > 0 && qty > 0);

        bytes32 hash = keccak256(abi.encodePacked(price, qty, salt));

        _commitAndAdvanceToReveal();

        // Commit investor1 with correct hash
        // (already committed in helper, override with our fuzz hash)
        // Use a fresh investor instead
        address fuzzyInvestor = makeAddr("fuzzyInvestor");
        vm.deal(fuzzyInvestor, 1 ether);
        vm.prank(bookrunner);
        bb.whitelistInvestor(fuzzyInvestor, false, false);

        // Re-setup: fresh contracts for this fuzz run
        BookBuilder bbF = new BookBuilder(bookrunner, issuer, keccak256("FUZZ_IPO"), "FuzzCo", "FZZ", 100_000_000, 8e18, 10e18, block.timestamp + 1 days, block.timestamp + 2 days, block.timestamp + 3 days, BookBuilder.Mechanism.A);
        OrderBook obF = new OrderBook(address(bbF), DEPOSIT);
        vm.startPrank(bookrunner);
        bbF.whitelistInvestor(fuzzyInvestor, false, false);
        bbF.advancePhase(); // → Commitment
        vm.stopPrank();

        vm.prank(fuzzyInvestor);
        obF.commitIOI{value: DEPOSIT}(hash);

        vm.prank(bookrunner);
        bbF.advancePhase(); // → Reveal

        // Reveal with wrong salt — must always revert
        vm.prank(fuzzyInvestor);
        vm.expectRevert("Hash mismatch - invalid reveal");
        obF.revealIOI(price, qty, wrongSalt, OrderBook.InvestorType.LongOnly, OrderBook.OrderType.Limit);
    }

    /// @notice Deposit overpayment is accepted but exact deposit is also accepted
    function testFuzz_CommitAcceptsDepositAtOrAboveMinimum(uint256 extra) public {
        vm.assume(extra <= 10 ether);
        bytes32 hash = keccak256(abi.encodePacked(INV1_PRICE, INV1_QTY, INV1_SALT));
        vm.deal(investor1, DEPOSIT + extra);
        vm.prank(investor1);
        ob.commitIOI{value: DEPOSIT + extra}(hash);
        assertEq(ob.getCommitmentCount(), 1);
    }

    /// @notice Coverage ratio must always be > 0 after at least one reveal
    function testFuzz_CoverageRatioPositiveAfterReveal(uint256 price, uint256 qty) public {
        vm.assume(price >= 8e18 && price <= 10e18);
        vm.assume(qty >= 1 && qty <= 10_000_000);

        bytes32 salt = keccak256("fuzzsalt");
        bytes32 hash = keccak256(abi.encodePacked(price, qty, salt));

        BookBuilder bbF = new BookBuilder(bookrunner, issuer, keccak256("FUZZ2"), "FuzzCo", "FZZ", 100_000_000, 8e18, 10e18, block.timestamp + 1 days, block.timestamp + 2 days, block.timestamp + 3 days, BookBuilder.Mechanism.A);
        OrderBook obF = new OrderBook(address(bbF), DEPOSIT);

        address fi = makeAddr("fi");
        vm.deal(fi, 1 ether);

        vm.startPrank(bookrunner);
        bbF.whitelistInvestor(fi, false, false);
        bbF.advancePhase();
        vm.stopPrank();

        vm.prank(fi);
        obF.commitIOI{value: DEPOSIT}(hash);

        vm.prank(bookrunner);
        bbF.advancePhase();

        vm.prank(fi);
        obF.revealIOI(price, qty, salt, OrderBook.InvestorType.LongOnly, OrderBook.OrderType.Limit);

        OrderBook.AggregatedDemand memory d = obF.getAggregatedDemand();
        assertGt(d.coverageRatio, 0);
        assertEq(d.bidCount, 1);
        assertEq(d.totalShares, qty);
    }
}
