// Minimal EIP-1193 wallet access for signed-message auth. No extra deps.

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function hasWallet(): boolean {
  return getProvider() !== null;
}

export async function connectWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error("No Ethereum wallet found. Install MetaMask or a compatible wallet.");
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("No account authorized.");
  return address;
}

export async function signMessage(address: string, message: string): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("No Ethereum wallet found.");
  return (await provider.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
}
