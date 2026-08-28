import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Boxes, Plus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { useCreateProtocol, useProtocols } from "@/hooks/useProtocols";
import { formatDateTime } from "@/lib/event-copy";
import { ChainSelect } from "@/lib/chains";
import type { Protocol } from "@/types/api";

export const Route = createFileRoute("/protocols/")({
  head: () => ({ meta: [{ title: "Protocols — Aegis" }] }),
  component: ProtocolsPage,
});

function ProtocolsPage() {
  const navigate = useNavigate();
  const protocols = useProtocols();
  const create = useCreateProtocol();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [primaryChain, setPrimaryChain] = useState("Ethereum");

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), primaryChain },
      {
        onSuccess: (p) => navigate({ to: "/protocols/$protocolId", params: { protocolId: p.id } }),
      },
    );
  };

  const items = protocols.data?.items ?? [];

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Protocols</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Register a protocol to monitor its contracts, treasury, and incidents.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> New Protocol
        </button>
      </div>

      {open ? (
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-sm font-semibold">Create protocol</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aegis Demo Protocol"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Primary chain
              </span>
              <ChainSelect
                value={primaryChain}
                onChange={setPrimaryChain}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          {create.isError ? (
            <p className="mt-3 text-xs text-destructive">
              {create.error instanceof Error ? create.error.message : "Could not create protocol."}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              onClick={submit}
              disabled={create.isPending || !name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {create.isPending ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {protocols.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-border bg-card/40"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Boxes className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-display text-lg font-semibold">No protocols yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first protocol to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProtocolCard
              key={p.id}
              protocol={p}
              onOpen={() =>
                navigate({ to: "/protocols/$protocolId", params: { protocolId: p.id } })
              }
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ProtocolCard({ protocol, onOpen }: { protocol: Protocol; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between">
        <h3 className="font-display text-base font-semibold">{protocol.name}</h3>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{protocol.slug}</p>
      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{protocol.primaryChain ?? "—"}</span>
        <span>{formatDateTime(protocol.createdAt)}</span>
      </div>
    </button>
  );
}
