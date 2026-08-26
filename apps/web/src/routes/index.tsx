import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Boxes,
  Code2,
  Cpu,
  Network,
  Play,
  Shield,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";

import { useCreateIncident } from "@/hooks/useIncidents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Landing,
});

const PIPELINE = [
  "Incident detected",
  "TrueForge session",
  "Incident Commander",
  "Blockchain · Treasury · Application",
  "Evidence Fusion",
  "Code Investigator",
  "Sandbox",
  "Root Cause",
];

function Landing() {
  const navigate = useNavigate();
  const create = useCreateIncident();

  const launch = () => {
    create.mutate(
      {},
      {
        onSuccess: (res) =>
          void navigate({ to: "/incidents/$incidentId", params: { incidentId: res.incidentId } }),
        onError: () => void navigate({ to: "/incidents" }),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Aegis" className="size-6 shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight">AEGIS</span>
          </div>
          <Link
            to="/incidents"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Open Console <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="aegis-grid border-b border-border">
        <div className="mx-auto grid w-full max-w-[1200px] gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="flex flex-col justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-primary">
              AI Incident Response Infrastructure
            </p>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Detect.
              <br />
              Investigate.
              <br />
              Respond.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
              AI-powered incident response infrastructure for blockchain protocols. Aegis uses
              TrueForge-powered agents to investigate across on-chain activity, treasury,
              application, and code — validating hypotheses in a sandbox to produce evidence-backed
              root causes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start Monitoring
              </Link>
              <button
                onClick={launch}
                disabled={create.isPending}
                className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
              >
                <Play className="size-4" /> Run Investigation Demo
              </button>
            </div>
            <p className="mt-4 font-mono text-[11px] text-muted-foreground">
              INVESTIGATE → CORRELATE → VALIDATE → EXPLAIN → APPROVE
            </p>
          </div>

          {/* Animated pipeline */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-sm space-y-2.5">
              {PIPELINE.map((label, i) => (
                <div key={label} className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-4 py-2.5",
                      i === 0
                        ? "border-primary/50 bg-primary/[0.08] aegis-glow"
                        : "border-border bg-card/50",
                    )}
                  >
                    <span
                      className="size-1.5 rounded-full bg-primary aegis-pulse"
                      style={{ animationDelay: `${i * 0.16}s` }}
                    />
                    <span className="text-xs font-medium text-foreground/90">{label}</span>
                  </div>
                  {i < PIPELINE.length - 1 ? <div className="h-3 w-px bg-border" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why */}
      <section id="how" className="border-b border-border">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-20">
          <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight">
            Blockchain incidents move faster than humans can investigate them.
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Pillar icon={Boxes} title="On-chain" copy="Transactions reveal what happened." />
            <Pillar icon={Wallet} title="Treasury" copy="Balances reveal what moved." />
            <Pillar
              icon={Activity}
              title="Application"
              copy="Logs reveal what the system experienced."
            />
            <Pillar icon={Code2} title="Code" copy="Code reveals why it happened." />
          </div>
          <p className="mt-8 font-display text-lg text-muted-foreground">
            One investigation. <span className="text-foreground">One evidence graph.</span>
          </p>
        </div>
      </section>

      {/* TrueForge */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
              Powered by TrueForge
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
              An agent that can actually act.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              TrueForge is the agent harness at the core of Aegis. It runs the session, routes the
              investigators to real MCP tools, executes analysis in an isolated sandbox, and stops
              at a human approval boundary.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2.5">
            {[
              { icon: Cpu, t: "Agent harness", d: "Sessions, turns, streaming events" },
              { icon: Network, t: "MCP tools", d: "Read-only, schema-validated" },
              { icon: Shield, t: "Investigators", d: "Blockchain · Treasury · Application · Code" },
              { icon: ShieldCheck, t: "Human approval", d: "Irreversible actions stop here" },
            ].map((row) => (
              <div
                key={row.t}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <row.icon className="size-4 text-primary" />
                <span className="text-sm font-semibold">{row.t}</span>
                <span className="ml-auto text-xs text-muted-foreground">{row.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-20">
          <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight">
            Investigation can be autonomous. Irreversible action isn't.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Safety
              step="01"
              icon={Network}
              title="Read"
              copy="Analyze blockchain, treasury, application, and code evidence."
            />
            <Safety
              step="02"
              icon={Target}
              title="Execute safely"
              copy="Validate generated analysis inside an isolated sandbox."
            />
            <Safety
              step="03"
              icon={ShieldCheck}
              title="Stop"
              copy="Pause when an irreversible action requires human approval."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto w-full max-w-[1200px] px-6 py-24 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight">
            An incident happens once.
            <br />
            Your investigation shouldn't start from zero.
          </h2>
          <button
            onClick={launch}
            disabled={create.isPending}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Play className="size-4" /> Launch Aegis
          </button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-6 font-mono text-[11px] text-muted-foreground">
          <span>AEGIS · AI incident response</span>
          <span>Read-only · Human-approved · TrueForge</span>
        </div>
      </footer>
    </div>
  );
}

function Pillar({ icon: Icon, title, copy }: { icon: typeof Boxes; title: string; copy: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Icon className="size-5 text-primary" />
      <h3 className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1 text-sm text-foreground/90">{copy}</p>
    </div>
  );
}

function Safety({
  step,
  icon: Icon,
  title,
  copy,
}: {
  step: string;
  icon: typeof Boxes;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <Icon className="size-5 text-primary" />
        <span className="font-mono text-xs text-muted-foreground">{step}</span>
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}
