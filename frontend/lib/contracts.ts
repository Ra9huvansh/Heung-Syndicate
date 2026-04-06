// Contract addresses — populated by forge script Deploy.s.sol
export const CONTRACT_ADDRESSES = {
  bookBuilder:    process.env.NEXT_PUBLIC_BOOKBUILDER_ADDRESS    as `0x${string}`,
  orderBook:      process.env.NEXT_PUBLIC_ORDERBOOK_ADDRESS      as `0x${string}`,
  allocation:     process.env.NEXT_PUBLIC_ALLOCATION_ADDRESS     as `0x${string}`,
  shareRegistry:  process.env.NEXT_PUBLIC_SHARE_REGISTRY_ADDRESS as `0x${string}`,
  floatMonitor:   process.env.NEXT_PUBLIC_FLOAT_MONITOR_ADDRESS  as `0x${string}`,
} as const;

// ─── ABIs ────────────────────────────────────────────────────────────────────

export const BOOK_BUILDER_ABI = [
  // Phase
  { name: "getPhase",    type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "uint8" }] },
  { name: "advancePhase", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "checkAndAdvancePhase", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "timeUntilNextDeadline", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  // Offering
  { name: "getOffering", type: "function", stateMutability: "view", inputs: [], outputs: [{
    type: "tuple", components: [
      { name: "offeringId",    type: "bytes32" },
      { name: "companyName",   type: "string"  },
      { name: "ticker",        type: "string"  },
      { name: "totalShares",   type: "uint256" },
      { name: "priceRangeLow", type: "uint256" },
      { name: "priceRangeHigh",type: "uint256" },
      { name: "commitDeadline",type: "uint256" },
      { name: "revealDeadline",type: "uint256" },
      { name: "pricingDeadline",type: "uint256" },
      { name: "mechanism",     type: "uint8"   },
      { name: "active",        type: "bool"    },
    ]
  }]},
  // Whitelist
  { name: "whitelistInvestor",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "investor_", type: "address" }, { name: "isCornerstone_", type: "bool" }, { name: "isConnectedPerson_", type: "bool" }], outputs: [] },
  { name: "dewhitelistInvestor",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "investor_", type: "address" }], outputs: [] },
  { name: "isWhitelisted",        type: "function", stateMutability: "view",       inputs: [{ name: "investor_", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "whitelist",            type: "function", stateMutability: "view",       inputs: [{ name: "", type: "address" }], outputs: [{ name: "whitelisted", type: "bool" }, { name: "isCornerstone", type: "bool" }, { name: "isConnectedPerson", type: "bool" }, { name: "addedAt", type: "uint256" }] },
  { name: "getWhitelistedAddresses", type: "function", stateMutability: "view",    inputs: [], outputs: [{ type: "address[]" }] },
  // Roles
  { name: "BOOKRUNNER_ROLE", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "ISSUER_ROLE",     type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "INVESTOR_ROLE",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "hasRole",         type: "function", stateMutability: "view", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  // Events
  { name: "OfferingCreated", type: "event", inputs: [{ name: "offeringId", type: "bytes32", indexed: true }, { name: "companyName", type: "string", indexed: false }, { name: "ticker", type: "string", indexed: false }, { name: "totalShares", type: "uint256", indexed: false }, { name: "priceRangeLow", type: "uint256", indexed: false }, { name: "priceRangeHigh", type: "uint256", indexed: false }] },
  { name: "PhaseAdvanced",   type: "event", inputs: [{ name: "from", type: "uint8", indexed: true }, { name: "to", type: "uint8", indexed: true }, { name: "timestamp", type: "uint256", indexed: false }] },
  { name: "InvestorWhitelisted", type: "event", inputs: [{ name: "investor", type: "address", indexed: true }, { name: "isCornerstone", type: "bool", indexed: false }, { name: "isConnectedPerson", type: "bool", indexed: false }] },
] as const;

export const ORDER_BOOK_ABI = [
  { name: "commitIOI",          type: "function", stateMutability: "payable",    inputs: [{ name: "commitHash_", type: "bytes32" }], outputs: [] },
  { name: "revealIOI",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "price_", type: "uint256" }, { name: "quantity_", type: "uint256" }, { name: "salt_", type: "bytes32" }, { name: "investorType_", type: "uint8" }, { name: "orderType_", type: "uint8" }], outputs: [] },
  { name: "slashNonRevealers",  type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "withdrawSlashed",    type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "getCommitmentCount", type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getAggregatedDemand",type: "function", stateMutability: "view",       inputs: [], outputs: [{
    type: "tuple", components: [
      { name: "totalShares",     type: "uint256" },
      { name: "totalValue",      type: "uint256" },
      { name: "bidCount",        type: "uint256" },
      { name: "weightedAvgPrice",type: "uint256" },
      { name: "coverageRatio",   type: "uint256" },
      { name: "lastUpdated",     type: "uint256" },
    ]
  }]},
  { name: "iois",               type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [
    { name: "investor",         type: "address" },
    { name: "pricePerShare",    type: "uint256" },
    { name: "quantity",         type: "uint256" },
    { name: "totalValue",       type: "uint256" },
    { name: "commitHash",       type: "bytes32" },
    { name: "commitTimestamp",  type: "uint256" },
    { name: "revealTimestamp",  type: "uint256" },
    { name: "status",           type: "uint8"   },
    { name: "investorType",     type: "uint8"   },
    { name: "orderType",        type: "uint8"   },
    { name: "isCornerstone",    type: "bool"    },
    { name: "isConnectedPerson",type: "bool"    },
  ]},
  { name: "depositAmount",      type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalSlashed",       type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getAllRevealedIOIs", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "tuple[]", components: [
    { name: "investor",         type: "address" },
    { name: "pricePerShare",    type: "uint256" },
    { name: "quantity",         type: "uint256" },
    { name: "totalValue",       type: "uint256" },
    { name: "commitHash",       type: "bytes32" },
    { name: "commitTimestamp",  type: "uint256" },
    { name: "revealTimestamp",  type: "uint256" },
    { name: "status",           type: "uint8"   },
    { name: "investorType",     type: "uint8"   },
    { name: "orderType",        type: "uint8"   },
    { name: "isCornerstone",    type: "bool"    },
    { name: "isConnectedPerson",type: "bool"    },
  ]}]},
  // Events
  { name: "IOICommitted",       type: "event", inputs: [{ name: "investor", type: "address", indexed: true }, { name: "commitHash", type: "bytes32", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
  { name: "IOIRevealed",        type: "event", inputs: [{ name: "investor", type: "address", indexed: true }, { name: "price", type: "uint256", indexed: false }, { name: "quantity", type: "uint256", indexed: false }, { name: "investorType", type: "uint8", indexed: false }, { name: "orderType", type: "uint8", indexed: false }] },
  { name: "AggregatedDemandUpdated", type: "event", inputs: [{ name: "totalShares", type: "uint256", indexed: false }, { name: "totalValue", type: "uint256", indexed: false }, { name: "bidCount", type: "uint256", indexed: false }, { name: "coverageRatio", type: "uint256", indexed: false }] },
  { name: "NonRevealer",        type: "event", inputs: [{ name: "investor", type: "address", indexed: true }, { name: "depositSlashed", type: "uint256", indexed: false }] },
] as const;

export const ALLOCATION_ABI = [
  { name: "setStrikePrice",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "strikePrice_", type: "uint256" }], outputs: [] },
  { name: "computeAllocations", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "claimShares",        type: "function", stateMutability: "nonpayable", inputs: [{ name: "allocatedShares_", type: "uint256" }, { name: "merkleProof_", type: "bytes32[]" }], outputs: [] },
  { name: "strikePrice",        type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "uint256" }] },
  { name: "merkleRoot",         type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "allocationFinalized",type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "bool" }] },
  { name: "allocatedShares",    type: "function", stateMutability: "view",       inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "claimed",            type: "function", stateMutability: "view",       inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "getTrancheSummary",  type: "function", stateMutability: "view",       inputs: [], outputs: [{
    type: "tuple", components: [
      { name: "cornerstoneShares",   type: "uint256" },
      { name: "institutionalShares", type: "uint256" },
      { name: "retailShares",        type: "uint256" },
      { name: "cornerstoneBps",      type: "uint256" },
      { name: "institutionalBps",    type: "uint256" },
      { name: "retailBps",           type: "uint256" },
    ]
  }]},
  { name: "getAllAllocations", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "tuple[]", components: [
    { name: "investor",        type: "address" },
    { name: "allocatedShares", type: "uint256" },
    { name: "tranche",         type: "uint8"   },
    { name: "pricePerShare",   type: "uint256" },
  ]}]},
  // Events
  { name: "StrikePriceSet",     type: "event", inputs: [{ name: "strikePrice", type: "uint256", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
  { name: "AllocationFinalized",type: "event", inputs: [{ name: "merkleRoot", type: "bytes32", indexed: false }, { name: "strikePriceWei", type: "uint256", indexed: false }, { name: "totalAllocatedShares", type: "uint256", indexed: false }] },
  { name: "SharesClaimed",      type: "event", inputs: [{ name: "investor", type: "address", indexed: true }, { name: "shares", type: "uint256", indexed: false }] },
] as const;

export const FLOAT_MONITOR_ABI = [
  { name: "registerCompany",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "shareToken_", type: "address" }, { name: "name_", type: "string" }, { name: "ticker_", type: "string" }, { name: "marketCapHKD_", type: "uint256" }], outputs: [] },
  { name: "updateMarketCap",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "shareToken_", type: "address" }, { name: "marketCapHKD_", type: "uint256" }], outputs: [] },
  { name: "checkAndAlert",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "shareToken_", type: "address" }], outputs: [] },
  { name: "checkAllCompanies",  type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "computePublicFloat", type: "function", stateMutability: "view",       inputs: [{ name: "shareToken_", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getRequiredMinFloat",type: "function", stateMutability: "view",       inputs: [{ name: "shareToken_", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getFloatRisk",       type: "function", stateMutability: "view",       inputs: [{ name: "shareToken_", type: "address" }], outputs: [{ type: "uint8" }] },
  { name: "getAllCompanies",     type: "function", stateMutability: "view",       inputs: [], outputs: [{
    type: "tuple[]", components: [
      { name: "name",           type: "string"  },
      { name: "ticker",         type: "string"  },
      { name: "shareToken",     type: "address" },
      { name: "marketCapHKD",   type: "uint256" },
      { name: "lastChecked",    type: "uint256" },
      { name: "currentFloatBps",type: "uint256" },
      { name: "risk",           type: "uint8"   },
      { name: "active",         type: "bool"    },
    ]
  }]},
  { name: "getAtRiskCompanies", type: "function", stateMutability: "view",       inputs: [], outputs: [{
    type: "tuple[]", components: [
      { name: "name",           type: "string"  },
      { name: "ticker",         type: "string"  },
      { name: "shareToken",     type: "address" },
      { name: "marketCapHKD",   type: "uint256" },
      { name: "lastChecked",    type: "uint256" },
      { name: "currentFloatBps",type: "uint256" },
      { name: "risk",           type: "uint8"   },
      { name: "active",         type: "bool"    },
    ]
  }]},
  // Events
  { name: "FloatUpdated", type: "event", inputs: [{ name: "shareToken", type: "address", indexed: true }, { name: "ticker", type: "string", indexed: false }, { name: "currentFloatBps", type: "uint256", indexed: false }, { name: "requiredMinBps", type: "uint256", indexed: false }, { name: "risk", type: "uint8", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
  { name: "FloatWarning", type: "event", inputs: [{ name: "shareToken", type: "address", indexed: true }, { name: "ticker", type: "string", indexed: false }, { name: "currentFloatBps", type: "uint256", indexed: false }, { name: "requiredMinBps", type: "uint256", indexed: false }] },
  { name: "FloatBreach",  type: "event", inputs: [{ name: "shareToken", type: "address", indexed: true }, { name: "ticker", type: "string", indexed: false }, { name: "currentFloatBps", type: "uint256", indexed: false }, { name: "requiredMinBps", type: "uint256", indexed: false }] },
] as const;
