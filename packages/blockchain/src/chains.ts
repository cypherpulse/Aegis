import {
  createPublicClient,
  http,
  parseAbiItem,
  type Chain,
  type PublicClient,
} from "viem";
import {
  arbitrum,
  base,
  baseSepolia,
  mainnet,
  optimism,
  polygon,
} from "viem/chains";

export type ChainFamily = "evm" | "solana" | "stacks";

export interface ChainInfo {
  key: string;
  name: string;
  chainId: number;
  family: ChainFamily;
  nativeSymbol: string;
  /** Base-unit exponent for the native asset (wei=18, lamports=9, microSTX=6). */
  decimals: number;
  /** Monitor alert default when a protocol sets no override, in base units. */
  defaultThresholdBaseUnits: bigint;
  mainnet: boolean;
  /** viem chain — EVM families only. */
  chain?: Chain;
}

const ONE = (decimals: number): bigint => 10n ** BigInt(decimals);

/** Supported chains. RPC URLs come from CHAIN_RPC_<KEY>, else a public default. */
export const CHAINS: Record<string, ChainInfo> = {
  ethereum: {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    family: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    defaultThresholdBaseUnits: ONE(18),
    mainnet: true,
    chain: mainnet,
  },
  base: {
    key: "base",
    name: "Base",
    chainId: 8453,
    family: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    defaultThresholdBaseUnits: ONE(18),
    mainnet: true,
    chain: base,
  },
  arbitrum: {
    key: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    family: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    defaultThresholdBaseUnits: ONE(18),
    mainnet: true,
    chain: arbitrum,
  },
  optimism: {
    key: "optimism",
    name: "Optimism",
    chainId: 10,
    family: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    defaultThresholdBaseUnits: ONE(18),
    mainnet: true,
    chain: optimism,
  },
  polygon: {
    key: "polygon",
    name: "Polygon",
    chainId: 137,
    family: "evm",
    nativeSymbol: "POL",
    decimals: 18,
    defaultThresholdBaseUnits: ONE(18),
    mainnet: true,
    chain: polygon,
  },
  solana: {
    key: "solana",
    name: "Solana",
    chainId: 501, // synthetic id (Solana has no EVM chainId)
    family: "solana",
    nativeSymbol: "SOL",
    decimals: 9,
    defaultThresholdBaseUnits: ONE(9), // 1 SOL
    mainnet: true,
  },
  stacks: {
    key: "stacks",
    name: "Stacks",
    chainId: 5757, // synthetic id
    family: "stacks",
    nativeSymbol: "STX",
    decimals: 6,
    defaultThresholdBaseUnits: 100n * ONE(6), // 100 STX
    mainnet: true,
  },
  "base-sepolia": {
    key: "base-sepolia",
    name: "Base Sepolia",
    chainId: 84532,
    family: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    defaultThresholdBaseUnits: ONE(18),
    mainnet: false,
    chain: baseSepolia,
  },
};

/** Public RPC used when CHAIN_RPC_<KEY> is unset (non-EVM need a concrete URL). */
const PUBLIC_RPC: Record<string, string> = {
  solana: "https://api.mainnet-beta.solana.com",
  stacks: "https://api.hiro.so",
};

export function listChains(): ChainInfo[] {
  return Object.values(CHAINS);
}

/** Resolve a chain by key, chainId, or display name (case-insensitive). */
export function resolveChain(nameOrId: string | number | undefined): ChainInfo | null {
  if (nameOrId === undefined || nameOrId === null) return null;
  if (typeof nameOrId === "number") {
    return listChains().find((c) => c.chainId === nameOrId) ?? null;
  }
  const s = nameOrId.trim().toLowerCase();
  return (
    listChains().find(
      (c) =>
        c.key === s ||
        c.name.toLowerCase() === s ||
        c.name.toLowerCase().replace(/\s+/g, "-") === s ||
        String(c.chainId) === s,
    ) ?? null
  );
}

/** Explicit RPC URL for a chain from env, else the public default (or undefined for EVM). */
export function rpcUrlFor(key: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const v = env[`CHAIN_RPC_${key.toUpperCase().replace(/-/g, "_")}`];
  if (v && v.trim() !== "") return v.trim();
  return PUBLIC_RPC[key]; // undefined for EVM (viem uses its own public RPC)
}

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58, no 0/O/I/l
// c32check principal (SP/SM mainnet, ST/SN testnet), with an optional
// `.contract-name` suffix for contract principals (e.g. SP….my-contract).
const STACKS_ADDRESS = /^S[PMNT][0-9A-HJKMNP-TV-Z]{37,40}(\.[a-zA-Z]([a-zA-Z0-9_-]){0,39})?$/;

/**
 * Validate an address against a chain's family. Unknown chains fall back to a
 * loose non-empty check so unlisted networks are not silently rejected.
 */
export function isValidAddressForChain(chain: string | number | undefined, address: string): boolean {
  const addr = address.trim();
  if (addr === "") return false;
  const info = resolveChain(chain);
  switch (info?.family) {
    case "evm":
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
    case "solana":
      return SOLANA_ADDRESS.test(addr);
    case "stacks":
      return STACKS_ADDRESS.test(addr);
    default:
      return addr.length >= 8; // unknown chain: accept any plausible address
  }
}

const clientCache = new Map<string, PublicClient>();

/** viem client for an EVM chain. Throws for non-EVM families. */
export function getChainClient(key: string): PublicClient {
  const cached = clientCache.get(key);
  if (cached) return cached;
  const info = CHAINS[key];
  if (!info) throw new Error(`Unknown chain: ${key}`);
  if (info.family !== "evm" || !info.chain) {
    throw new Error(`Chain ${key} is not EVM; no viem client`);
  }
  const client = createPublicClient({
    chain: info.chain,
    transport: http(rpcUrlFor(key)),
  }) as PublicClient;
  clientCache.set(key, client);
  return client;
}

// ---- Native balance (family-dispatched) ---------------------------------

async function solanaBalance(key: string, address: string): Promise<bigint> {
  const url = rpcUrlFor(key) ?? PUBLIC_RPC.solana!;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    }),
  });
  if (!res.ok) throw new Error(`Solana RPC ${res.status}`);
  const json = (await res.json()) as { result?: { value?: number }; error?: { message?: string } };
  if (json.error) throw new Error(`Solana RPC: ${json.error.message ?? "error"}`);
  return BigInt(json.result?.value ?? 0); // lamports
}

async function stacksBalance(key: string, address: string): Promise<bigint> {
  const base = rpcUrlFor(key) ?? PUBLIC_RPC.stacks!;
  const res = await fetch(`${base}/extended/v1/address/${address}/balances`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Stacks API ${res.status}`);
  const json = (await res.json()) as { stx?: { balance?: string } };
  return BigInt(json.stx?.balance ?? "0"); // microSTX
}

/** Native-asset balance in base units, for any supported chain family. */
export async function getNativeBalance(key: string, address: string): Promise<bigint> {
  const info = CHAINS[key];
  if (!info) throw new Error(`Unknown chain: ${key}`);
  switch (info.family) {
    case "evm":
      return getChainClient(key).getBalance({ address: address as `0x${string}` });
    case "solana":
      return solanaBalance(key, address);
    case "stacks":
      return stacksBalance(key, address);
  }
}

export async function getLatestBlockNumber(key: string): Promise<bigint> {
  const info = CHAINS[key];
  if (!info) throw new Error(`Unknown chain: ${key}`);
  if (info.family !== "evm") throw new Error(`getLatestBlockNumber unsupported for ${key}`);
  return getChainClient(key).getBlockNumber();
}

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export interface Erc20Transfer {
  from: string;
  to: string;
  value: bigint;
  txHash: string;
  blockNumber: bigint;
}

/** ERC-20 Transfer logs for a contract since `fromBlock` (EVM only). */
export async function getErc20Transfers(
  key: string,
  contract: string,
  fromBlock: bigint,
): Promise<Erc20Transfer[]> {
  const logs = await getChainClient(key).getLogs({
    address: contract as `0x${string}`,
    event: TRANSFER_EVENT,
    fromBlock,
    toBlock: "latest",
  });
  return logs.map((l) => ({
    from: (l.args.from as string) ?? "",
    to: (l.args.to as string) ?? "",
    value: (l.args.value as bigint) ?? 0n,
    txHash: l.transactionHash,
    blockNumber: l.blockNumber,
  }));
}
