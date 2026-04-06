// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BookBuilder} from "../contracts/BookBuilder.sol";
import {OrderBook} from "../contracts/OrderBook.sol";
import {Allocation} from "../contracts/Allocation.sol";
import {ShareRegistry} from "../contracts/ShareRegistry.sol";
import {FloatMonitor} from "../contracts/FloatMonitor.sol";

/// @notice Full deployment script for Heung Syndicate on HashKey Chain testnet.
///         Run: forge script script/Deploy.s.sol --rpc-url hashkey_testnet --broadcast
contract Deploy is Script {
    // Demo offering parameters
    string  constant COMPANY_NAME  = "HashTech Holdings";
    string  constant TICKER        = "HTH";
    uint256 constant TOTAL_SHARES  = 100_000_000;
    // HKD prices with 18 decimals: HK$8.00 and HK$10.00
    uint256 constant PRICE_LOW     = 8e18;
    uint256 constant PRICE_HIGH    = 10e18;
    // Market cap for float monitoring: HK$1.2B (< HK$3B tier → 25% min float)
    uint256 constant MARKET_CAP    = 1_200_000_000 * 1e18;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("Deploying from:  ", deployer);
        console.log("Chain ID:        ", block.chainid);
        console.log("Balance (wei):   ", deployer.balance);

        vm.startBroadcast(deployerKey);

        // ── 1. ShareRegistry (share token + holder classification) ───────────
        ShareRegistry shareRegistry = new ShareRegistry(
            COMPANY_NAME,
            TICKER,
            TOTAL_SHARES * 1e18,
            deployer
        );
        console.log("ShareRegistry:   ", address(shareRegistry));

        // ── 2. BookBuilder (phase orchestrator) ──────────────────────────────
        uint256 now_        = block.timestamp;
        uint256 commitEnd   = now_ + 30 days;
        uint256 revealEnd   = now_ + 60 days;
        uint256 pricingEnd  = now_ + 90 days;

        BookBuilder bookBuilder = new BookBuilder(
            deployer,                        // bookrunner
            deployer,                        // issuer (same for demo)
            keccak256("HASHTECH_IPO_2025"),  // offeringId
            COMPANY_NAME,
            TICKER,
            TOTAL_SHARES,
            PRICE_LOW,
            PRICE_HIGH,
            commitEnd,
            revealEnd,
            pricingEnd,
            BookBuilder.Mechanism.A
        );
        console.log("BookBuilder:     ", address(bookBuilder));

        // ── 3. OrderBook (commit-reveal IOIs) ────────────────────────────────
        OrderBook orderBook = new OrderBook(
            address(bookBuilder),
            0.001 ether          // deposit amount (0.001 HSK)
        );
        console.log("OrderBook:       ", address(orderBook));

        // ── 4. Allocation (strike price + Merkle audit trail) ────────────────
        Allocation allocation = new Allocation(
            address(bookBuilder),
            payable(address(orderBook)),
            address(shareRegistry)
        );
        console.log("Allocation:      ", address(allocation));

        // Grant Allocation contract admin role so it can call markClaimed
        bookBuilder.grantRole(bookBuilder.DEFAULT_ADMIN_ROLE(), address(allocation));

        // Transfer all shares to Allocation contract for distribution
        shareRegistry.transfer(address(allocation), TOTAL_SHARES * 1e18);

        // ── 5. FloatMonitor (ongoing float compliance) ───────────────────────
        FloatMonitor floatMonitor = new FloatMonitor(deployer);
        console.log("FloatMonitor:    ", address(floatMonitor));

        // Register the just-launched company
        floatMonitor.registerCompany(
            address(shareRegistry),
            COMPANY_NAME,
            TICKER,
            MARKET_CAP
        );

        // Register two additional demo companies for the float dashboard
        // (these use the same share registry address just for demo — in prod each has its own)
        console.log("\n=== Deployment Complete ===");
        console.log("ShareRegistry:   ", address(shareRegistry));
        console.log("BookBuilder:     ", address(bookBuilder));
        console.log("OrderBook:       ", address(orderBook));
        console.log("Allocation:      ", address(allocation));
        console.log("FloatMonitor:    ", address(floatMonitor));
        console.log("\nAdd these to frontend/.env.local:");
        console.log("NEXT_PUBLIC_SHARE_REGISTRY_ADDRESS=", address(shareRegistry));
        console.log("NEXT_PUBLIC_BOOKBUILDER_ADDRESS=",    address(bookBuilder));
        console.log("NEXT_PUBLIC_ORDERBOOK_ADDRESS=",      address(orderBook));
        console.log("NEXT_PUBLIC_ALLOCATION_ADDRESS=",     address(allocation));
        console.log("NEXT_PUBLIC_FLOAT_MONITOR_ADDRESS=",  address(floatMonitor));

        vm.stopBroadcast();
    }
}
