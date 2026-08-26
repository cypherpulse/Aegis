import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";

import { useMe } from "@/hooks/useAuth";
import { aegisApi } from "@/services/api";
import { connectWallet, hasWallet, signMessage } from "@/lib/wallet";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Aegis" }] }),
  component: LoginPage,
});

type Phase = "idle" | "connecting" | "signing";

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const config = useQuery({
    queryKey: ["auth-config"],
    queryFn: () => aegisApi.authConfig(),
    retry: false,
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (me.data?.user) void navigate({ to: "/overview" });
  }, [me.data, navigate]);

  const googleHref = origin
    ? `${aegisApi.googleAuthUrl()}?redirect=${encodeURIComponent(origin)}`
    : aegisApi.googleAuthUrl();

  const loginWithWallet = async () => {
    setError(null);
    try {
      // 1) Connect the wallet (prompts the wallet to authorize this site).
      setPhase("connecting");
      const address = await connectWallet();
      const { message } = await aegisApi.walletNonce(address);
      // 2) Ask the wallet to sign the one-time nonce.
      setPhase("signing");
      const signature = await signMessage(address, message);
      await aegisApi.walletVerify(address, signature);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      void navigate({ to: "/overview" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet sign-in failed.");
    } finally {
      setPhase("idle");
    }
  };

  const label =
    phase === "connecting"
      ? "Connecting wallet…"
      : phase === "signing"
        ? "Awaiting signature…"
        : "Connect Wallet";

  return (
    <div className="aegis-grid flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="Aegis" className="size-7 shrink-0" />
          <span className="font-display text-xl font-bold tracking-tight">AEGIS</span>
        </Link>
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="font-display text-xl font-semibold">Secure access to Aegis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a wallet or continue with Google.
          </p>

          <div className="mt-6 space-y-3">
            {config.data?.google ? (
              <a
                href={googleHref}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Continue with Google
              </a>
            ) : null}
            <button
              onClick={() => void loginWithWallet()}
              disabled={phase !== "idle"}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Wallet className="size-4" />
              {label}
            </button>
          </div>

          {!hasWallet() ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              No browser wallet detected — install MetaMask to use wallet sign-in.
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Wallet auth signs a one-time nonce — connecting alone is not sufficient.
          </p>
        </div>
      </div>
    </div>
  );
}
