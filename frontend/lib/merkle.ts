import { MerkleTree } from "merkletreejs";
import { keccak256, encodePacked } from "viem";

export type AllocationEntry = {
  investor: `0x${string}`;
  allocatedShares: bigint;
};

/** Build leaf: keccak256(abi.encodePacked(investor, allocatedShares)) — matches Allocation.sol */
function buildLeaf(investor: `0x${string}`, allocatedShares: bigint): Buffer {
  const hash = keccak256(
    encodePacked(["address", "uint256"], [investor, allocatedShares])
  );
  return Buffer.from(hash.slice(2), "hex");
}

/** Build a Merkle tree from an array of allocation entries. */
export function buildMerkleTree(allocations: AllocationEntry[]): MerkleTree {
  const leaves = allocations.map((a) => buildLeaf(a.investor, a.allocatedShares));
  return new MerkleTree(leaves, (data: Buffer) => {
    const hash = keccak256(`0x${data.toString("hex")}`);
    return Buffer.from(hash.slice(2), "hex");
  }, { sortPairs: true });
}

/** Generate a Merkle proof for a specific investor. Returns hex strings for contract call. */
export function generateProof(
  tree: MerkleTree,
  investor: `0x${string}`,
  allocatedShares: bigint
): `0x${string}`[] {
  const leaf = buildLeaf(investor, allocatedShares);
  const proof = tree.getProof(leaf);
  return proof.map((p) => `0x${p.data.toString("hex")}` as `0x${string}`);
}

/** Verify a proof client-side before submitting the transaction. */
export function verifyProof(
  tree: MerkleTree,
  investor: `0x${string}`,
  allocatedShares: bigint
): boolean {
  const leaf = buildLeaf(investor, allocatedShares);
  const proof = tree.getProof(leaf);
  return tree.verify(proof, leaf, tree.getRoot());
}

/** Compute a single Merkle leaf hash — used for the regulator verification tool. */
export function computeLeaf(investor: `0x${string}`, allocatedShares: bigint): `0x${string}` {
  return keccak256(encodePacked(["address", "uint256"], [investor, allocatedShares]));
}

/** Generate a salt for IOI commitment. Stored in localStorage by the investor. */
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Compute the IOI commit hash: keccak256(abi.encodePacked(price, quantity, salt)) */
export function computeCommitHash(
  priceWei: bigint,
  quantity: bigint,
  salt: `0x${string}`
): `0x${string}` {
  return keccak256(encodePacked(["uint256", "uint256", "bytes32"], [priceWei, quantity, salt]));
}
