import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Supported chains for the console, mirroring the backend registry
 * (packages/blockchain/src/chains.ts). Each carries a small inline-SVG brand
 * mark so no external logo assets are needed.
 */
export interface ChainOption {
  /** Value stored on the resource (matches the backend chain name). */
  value: string;
  label: string;
  symbol: string;
  family: "evm" | "solana" | "stacks";
  testnet?: boolean;
  logo: ReactNode;
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
    {children}
  </svg>
);

const EthereumLogo = svg(
  <>
    <circle cx="12" cy="12" r="12" fill="#627EEA" />
    <path d="M12 3.5v6.3l5.2 2.3L12 3.5z" fill="#fff" fillOpacity="0.6" />
    <path d="M12 3.5L6.8 12.1 12 9.8V3.5z" fill="#fff" />
    <path d="M12 16.2v4.3l5.2-7.2L12 16.2z" fill="#fff" fillOpacity="0.6" />
    <path d="M12 20.5v-4.3L6.8 13.3 12 20.5z" fill="#fff" />
    <path d="M12 15.2l5.2-3.1L12 9.8v5.4z" fill="#fff" fillOpacity="0.3" />
    <path d="M6.8 12.1l5.2 3.1V9.8l-5.2 2.3z" fill="#fff" fillOpacity="0.6" />
  </>,
);

const BaseLogo = svg(
  <>
    <circle cx="12" cy="12" r="12" fill="#0052FF" />
    <path
      d="M12 19.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 7.44 8.55H9.6v-2.1h7.5A5.4 5.4 0 1 0 12 17.4h5.1v2.1H12z"
      fill="#fff"
    />
  </>,
);

const ArbitrumLogo = svg(
  <>
    <circle cx="12" cy="12" r="12" fill="#213147" />
    <path d="M12 5.5l4.2 8.7-1.8 1.1L12 9.6l-2.4 5.7-1.8-1.1L12 5.5z" fill="#12AAFF" />
    <path d="M13.4 13.2l1.6 3.3-1.7 1L11 13.2h2.4z" fill="#9DCCED" />
  </>,
);

const OptimismLogo = svg(
  <>
    <circle cx="12" cy="12" r="12" fill="#FF0420" />
    <path
      d="M8.4 15.2c-1.7 0-2.7-1-2.7-2.5 0-.3 0-.6.1-.9.3-1.5 1.2-3 3.4-3 1.7 0 2.7 1 2.7 2.5 0 .3 0 .6-.1.9-.3 1.5-1.2 3-3.4 3zm.2-1.6c.7 0 1.1-.5 1.3-1.4l.1-.7c0-.6-.2-1-.9-1s-1.1.5-1.3 1.4l-.1.7c0 .6.3 1 .9 1zM12.5 15.1l1.1-5.9h2.3c1.3 0 2 .7 1.8 1.9-.2 1.2-1.1 1.9-2.5 1.9h-1l-.4 2.1h-1.3zm2-3.2c.5 0 .9-.2 1-.8.1-.5-.2-.7-.7-.7h-.7l-.3 1.5h.7z"
      fill="#fff"
    />
  </>,
);

const PolygonLogo = svg(
  <>
    <circle cx="12" cy="12" r="12" fill="#8247E5" />
    <path
      d="M15.5 10.3l-2.3-1.3c-.2-.1-.5-.1-.7 0l-2.3 1.3-1.6.9c-.2.1-.5.1-.7 0l-1.6-.9V9.3l1.6-.9c.2-.1.5-.1.7 0l1.6.9v-1L8.4 7.4c-.2-.1-.5-.1-.7 0l-2 1.1c-.2.1-.3.3-.3.5v2.3c0 .2.1.4.3.5l2 1.1c.2.1.5.1.7 0l1.6-.9 2.3-1.3c.2-.1.5-.1.7 0l1.6.9v1l-1.6.9c-.2.1-.5.1-.7 0l-1.6-.9v1l1.4.8c.2.1.5.1.7 0l2-1.1c.2-.1.3-.3.3-.5v-2.3c0-.2-.1-.4-.3-.5z"
      fill="#fff"
    />
  </>,
);

const SolanaLogo = svg(
  <>
    <defs>
      <linearGradient id="sol" x1="2" y1="20" x2="22" y2="4" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9945FF" />
        <stop offset="1" stopColor="#14F195" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="5" fill="#0B0B12" />
    <path d="M7 8.4c.1-.2.3-.2.5-.2h9.1c.3 0 .4.3.2.5l-1.5 1.5c-.1.1-.2.2-.4.2H5.9c-.3 0-.4-.3-.2-.5L7 8.4z" fill="url(#sol)" />
    <path d="M7 13.6c.1-.1.3-.2.5-.2h9.1c.3 0 .4.3.2.5l-1.5 1.5c-.1.1-.2.2-.4.2H5.9c-.3 0-.4-.3-.2-.5L7 13.6z" fill="url(#sol)" />
    <path d="M15.6 11c-.1-.1-.3-.2-.5-.2H6c-.3 0-.4.3-.2.5l1.5 1.5c.1.1.2.2.4.2h9.2c.3 0 .4-.3.2-.5L15.6 11z" fill="url(#sol)" />
  </>,
);

const StacksLogo = svg(
  <>
    <rect width="24" height="24" rx="5" fill="#5546FF" />
    <path d="M8 15.8l1.9-2.9H7.2v-1.4h9.6v1.4h-2.7l1.9 2.9h-1.7L12 12.6l-2.3 3.2H8z" fill="#fff" />
    <path d="M7.2 9.8V8.4h9.6v1.4H7.2z" fill="#fff" fillOpacity="0.7" />
  </>,
);

export const CHAIN_OPTIONS: ChainOption[] = [
  { value: "Ethereum", label: "Ethereum", symbol: "ETH", family: "evm", logo: EthereumLogo },
  { value: "Base", label: "Base", symbol: "ETH", family: "evm", logo: BaseLogo },
  { value: "Arbitrum", label: "Arbitrum", symbol: "ETH", family: "evm", logo: ArbitrumLogo },
  { value: "Optimism", label: "Optimism", symbol: "ETH", family: "evm", logo: OptimismLogo },
  { value: "Polygon", label: "Polygon", symbol: "POL", family: "evm", logo: PolygonLogo },
  { value: "Solana", label: "Solana", symbol: "SOL", family: "solana", logo: SolanaLogo },
  { value: "Stacks", label: "Stacks", symbol: "STX", family: "stacks", logo: StacksLogo },
  {
    value: "Base Sepolia",
    label: "Base Sepolia",
    symbol: "ETH",
    family: "evm",
    testnet: true,
    logo: BaseLogo,
  },
];

const OPTION_BY_VALUE = new Map(CHAIN_OPTIONS.map((o) => [o.value, o]));

export function chainOption(value: string): ChainOption | undefined {
  return OPTION_BY_VALUE.get(value);
}

/** Small logo for a chain value, used in resource lists. */
export function ChainBadge({ value }: { value: string }) {
  const opt = chainOption(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      {opt?.logo}
      <span>{value}</span>
    </span>
  );
}

/** Chain picker with brand logos (Radix Select). */
export function ChainSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label="Chain">
        <SelectValue placeholder="Select chain" />
      </SelectTrigger>
      <SelectContent>
        {CHAIN_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-2">
              {o.logo}
              <span>{o.label}</span>
              {o.testnet ? (
                <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                  testnet
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
