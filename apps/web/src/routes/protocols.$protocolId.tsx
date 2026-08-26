import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Archive, ArrowLeft, Copy, KeyRound, Play, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SeverityBadge } from "@/components/common";
import {
  useArchiveProtocol,
  useContracts,
  useCreateContract,
  useCreateIntegrationKey,
  useCreateTreasury,
  useDeleteContract,
  useDeleteIntegrationKey,
  useDeleteProtocol,
  useDeleteTreasury,
  useIntegrationKeys,
  useInvestigateContract,
  useMonitoring,
  useProtocol,
  useReportIncident,
  useTreasury,
  useUpdateMonitoring,
} from "@/hooks/useProtocols";
import { API_BASE_URL, aegisApi } from "@/services/api";
import { cn } from "@/lib/utils";
import { ChainBadge, ChainSelect } from "@/lib/chains";
import type { Severity } from "@/types/api";

export const Route = createFileRoute("/protocols/$protocolId")({
  head: () => ({ meta: [{ title: "Protocol — Aegis" }] }),
  component: ProtocolDashboard,
});

type Tab = "contracts" | "treasury" | "monitoring" | "integration" | "report";
const TABS: { id: Tab; label: string }[] = [
  { id: "contracts", label: "Contracts" },
  { id: "treasury", label: "Treasury" },
  { id: "monitoring", label: "Monitoring" },
  { id: "integration", label: "Integration" },
  { id: "report", label: "Report Incident" },
];

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function ProtocolDashboard() {
  const { protocolId } = Route.useParams();
  const navigate = useNavigate();
  const protocol = useProtocol(protocolId);
  const archive = useArchiveProtocol(protocolId);
  const del = useDeleteProtocol();
  const [tab, setTab] = useState<Tab>("contracts");
  const isArchived = protocol.data?.status === "ARCHIVED";

  if (protocol.isError) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border py-16 text-center">
          <h1 className="font-display text-lg font-semibold">Protocol not found</h1>
          <Link
            to="/protocols"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
          >
            <ArrowLeft className="size-4" /> Back to Protocols
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/protocols"
        className="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Protocols
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            {protocol.data?.name ?? "Protocol"}
            {isArchived ? (
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Archived
              </span>
            ) : null}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {protocol.data?.slug} · {protocol.data?.primaryChain ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => archive.mutate()}
            disabled={archive.isPending || isArchived}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <Archive className="size-4" /> {isArchived ? "Archived" : "Archive"}
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Permanently delete this protocol? Its contracts, treasury, keys and monitoring config will be removed. This cannot be undone.",
                )
              ) {
                del.mutate(protocolId, {
                  onSuccess: () => void navigate({ to: "/protocols" }),
                });
              }
            }}
            disabled={del.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "contracts" && <ContractsTab protocolId={protocolId} />}
        {tab === "treasury" && <TreasuryTab protocolId={protocolId} />}
        {tab === "monitoring" && <MonitoringTab protocolId={protocolId} />}
        {tab === "integration" && <IntegrationTab protocolId={protocolId} />}
        {tab === "report" && <ReportTab protocolId={protocolId} />}
      </div>
    </AppShell>
  );
}

function ContractsTab({ protocolId }: { protocolId: string }) {
  const navigate = useNavigate();
  const contracts = useContracts(protocolId);
  const create = useCreateContract(protocolId);
  const del = useDeleteContract(protocolId);
  const investigate = useInvestigateContract(protocolId);
  const [name, setName] = useState("");
  const [chain, setChain] = useState("Ethereum");
  const [address, setAddress] = useState("");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
        <input
          className={inputCls}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ChainSelect value={chain} onChange={setChain} className={inputCls} />
        <input
          className={cn(inputCls, "font-mono")}
          placeholder="0x… / address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          onClick={() =>
            create.mutate(
              { name, chain, address },
              {
                onSuccess: () => {
                  setName("");
                  setAddress("");
                },
              },
            )
          }
          disabled={create.isPending || !name || !address}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          Add contract
        </button>
      </div>
      {create.isError ? <p className="text-xs text-destructive">{errMsg(create.error)}</p> : null}
      {investigate.isError ? (
        <p className="text-xs text-destructive">{errMsg(investigate.error)}</p>
      ) : null}
      <ResourceList
        empty="No contracts yet."
        items={(contracts.data?.items ?? []).map((c) => ({
          id: c.id,
          primary: c.name,
          secondary: c.address,
          logo: <ChainBadge value={c.chain} />,
          action: (
            <button
              onClick={() =>
                investigate.mutate(c.id, {
                  onSuccess: (res) =>
                    void navigate({
                      to: "/incidents/$incidentId",
                      params: { incidentId: res.incidentId },
                    }),
                })
              }
              disabled={investigate.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              <Play className="size-3" /> Investigate
            </button>
          ),
          onDelete: () => del.mutate(c.id),
        }))}
      />
    </div>
  );
}

function TreasuryTab({ protocolId }: { protocolId: string }) {
  const treasury = useTreasury(protocolId);
  const create = useCreateTreasury(protocolId);
  const del = useDeleteTreasury(protocolId);
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("Ethereum");
  const [label, setLabel] = useState("");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
        <input
          className={cn(inputCls, "font-mono")}
          placeholder="0x… / address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <ChainSelect value={chain} onChange={setChain} className={inputCls} />
        <input
          className={inputCls}
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          onClick={() =>
            create.mutate(
              { address, chain, label: label || undefined },
              {
                onSuccess: () => {
                  setAddress("");
                  setLabel("");
                },
              },
            )
          }
          disabled={create.isPending || !address}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          Add address
        </button>
      </div>
      {create.isError ? <p className="text-xs text-destructive">{errMsg(create.error)}</p> : null}
      <ResourceList
        empty="No treasury addresses yet."
        items={(treasury.data?.items ?? []).map((t) => ({
          id: t.id,
          primary: t.label || t.address,
          secondary: t.address,
          logo: <ChainBadge value={t.chain} />,
          onDelete: () => del.mutate(t.id),
        }))}
      />
    </div>
  );
}

function MonitoringTab({ protocolId }: { protocolId: string }) {
  const monitoring = useMonitoring(protocolId);
  const update = useUpdateMonitoring(protocolId);
  const m = monitoring.data;
  const rows: {
    key: "contractMonitoring" | "treasuryMonitoring" | "applicationMonitoring";
    label: string;
  }[] = [
    { key: "contractMonitoring", label: "Contract monitoring" },
    { key: "treasuryMonitoring", label: "Treasury monitoring" },
    { key: "applicationMonitoring", label: "Application monitoring" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
        >
          <span className="text-sm">{r.label}</span>
          <button
            onClick={() => m && update.mutate({ [r.key]: !m[r.key] })}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              m?.[r.key] ? "bg-primary" : "bg-muted",
            )}
            aria-pressed={m?.[r.key] ?? false}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-background transition-transform",
                m?.[r.key] ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function IntegrationTab({ protocolId }: { protocolId: string }) {
  const keys = useIntegrationKeys(protocolId);
  const create = useCreateIntegrationKey(protocolId);
  const del = useDeleteIntegrationKey(protocolId);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const endpoint = `${API_BASE_URL}/api/v1/protocols/${protocolId}/incidents`;
  const example = `curl -X POST ${endpoint} \\
  -H "x-api-key: <YOUR_KEY>" \\
  -H "content-type: application/json" \\
  -d '{"title":"Payout failures","description":"Treasury balance low","severity":"CRITICAL","chain":"Base Sepolia"}'`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-display text-sm font-semibold">Send incidents to Aegis</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your protocol can submit security events directly with an integration key.
        </p>
        <CodeBlock label="Endpoint" code={`POST ${endpoint}`} />
        <CodeBlock label="Example request" code={example} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h3 className="font-display text-sm font-semibold">Integration keys</h3>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className={inputCls}
            placeholder="Key name (e.g. CI)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={() =>
              create.mutate(name || "default", {
                onSuccess: (k) => {
                  setSecret(k.secret);
                  setName("");
                },
              })
            }
            disabled={create.isPending}
            className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Generate
          </button>
        </div>
        {secret ? (
          <div className="mt-3 rounded-md border border-primary/40 bg-primary/[0.06] p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
              Shown once — copy it now
            </p>
            <CopyRow value={secret} mono />
          </div>
        ) : null}
        <div className="mt-4 space-y-2">
          {(keys.data?.items ?? []).map((k) => (
            <div
              key={k.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2"
            >
              <span className="text-sm">{k.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{k.keyPrefix}…</span>
              {k.revokedAt ? (
                <span className="font-mono text-[10px] text-destructive">revoked</span>
              ) : null}
              <button
                onClick={() => del.mutate(k.id)}
                className="ml-auto text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportTab({ protocolId }: { protocolId: string }) {
  const navigate = useNavigate();
  const report = useReportIncident(protocolId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("HIGH");
  const [chain, setChain] = useState("Ethereum");
  const [starting, setStarting] = useState(false);

  const submit = () => {
    report.mutate(
      { title, description, severity, chain },
      {
        onSuccess: async (res) => {
          setStarting(true);
          try {
            await aegisApi.investigate(res.incidentId);
          } finally {
            void navigate({ to: "/incidents/$incidentId", params: { incidentId: res.incidentId } });
          }
        },
      },
    );
  };

  return (
    <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-5">
      <h3 className="font-display text-sm font-semibold">Report an incident</h3>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Title
        </span>
        <input
          className={cn(inputCls, "mt-1")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Description
        </span>
        <textarea
          className={cn(inputCls, "mt-1 min-h-20")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Severity
          </span>
          <select
            className={cn(inputCls, "mt-1")}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
          >
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as Severity[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Chain
          </span>
          <ChainSelect value={chain} onChange={setChain} className={cn(inputCls, "mt-1")} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SeverityBadge severity={severity} />
        <button
          onClick={submit}
          disabled={report.isPending || starting || !title || !description}
          className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {report.isPending || starting ? "Starting investigation…" : "Report & investigate"}
        </button>
      </div>
      {report.isError ? <p className="text-xs text-destructive">{errMsg(report.error)}</p> : null}
    </div>
  );
}

// ---- small helpers ----
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Request failed.";
}

function ResourceList({
  items,
  empty,
}: {
  items: {
    id: string;
    primary: string;
    secondary: string;
    onDelete: () => void;
    action?: ReactNode;
    logo?: ReactNode;
  }[];
  empty: string;
}) {
  if (items.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          {it.logo ? <span className="shrink-0">{it.logo}</span> : null}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{it.primary}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {it.secondary}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {it.action}
            <button
              onClick={it.onDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
        {code}
      </pre>
    </div>
  );
}

function CopyRow({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code
        className={cn(
          "min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 text-xs",
          mono && "font-mono",
        )}
      >
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
    >
      <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
    </button>
  );
}
