// Human-readable descriptions for the SSE event catalog (Part VI timeline copy).

import { INVESTIGATOR_LABEL } from "./pipeline";
import { readNumber, readString, type StoredEvent } from "@/types/events";

export function actorLabel(actor: string): string {
  if (actor in INVESTIGATOR_LABEL) return INVESTIGATOR_LABEL[actor] as string;
  const key = actor.replace(/-investigator$/, "");
  return INVESTIGATOR_LABEL[key] ?? actor;
}

export function describeEvent(event: StoredEvent): string {
  const p = event.payload;
  const who = actorLabel(event.actor);
  const tool = readString(p, "tool");
  const duration = readNumber(p, "durationMs");

  switch (event.type) {
    case "incident.created":
      return `Incident registered — ${readString(p, "type") ?? "incident"} · ${readString(p, "severity") ?? "severity unknown"}`;
    case "investigation.started":
      return `Investigation started on ${readString(p, "chain") ?? "chain"}`;
    case "session.created":
      return `TrueForge session created in ${readString(p, "mode")?.toUpperCase() ?? "UNKNOWN"} mode${
        readString(p, "reason") ? ` — ${readString(p, "reason")}` : ""
      }`;
    case "commander.started":
      return `Incident Commander dispatched investigators`;
    case "investigator.started":
      return `${who} started`;
    case "investigator.tool_called":
      return `${who} called \`${tool ?? "tool"}\``;
    case "investigator.tool_completed":
      return `${who} received \`${tool ?? "tool"}\`${duration !== undefined ? ` in ${duration}ms` : ""}`;
    case "investigator.completed":
      return `${who} completed — ${readString(p, "status") ?? "done"} · confidence ${formatConfidence(readNumber(p, "confidence"))}`;
    case "investigator.failed":
      return `${who} failed — ${readString(p, "error") ?? "unknown error"}`;
    case "approval.requested":
      return `Approval requested for sensitive tool \`${tool ?? "tool"}\`${
        readString(p, "reason") ? ` — ${readString(p, "reason")}` : ""
      }`;
    case "approval.granted":
      return `Approval granted for \`${tool ?? "tool"}\`${p["auto"] === true ? " (auto — read-only)" : ""}`;
    case "approval.denied":
      return `Approval denied for \`${tool ?? "tool"}\` — tool blocked`;
    case "approval.timeout":
      return `Approval timed out for \`${tool ?? "tool"}\` — tool blocked`;
    case "evidence.fusion_started":
      return `Evidence fusion started across ${readNumber(p, "findingCount") ?? "?"} findings`;
    case "evidence.fusion_completed":
      return `Fusion hypothesis — ${readString(p, "hypothesis") ?? "n/a"} · confidence ${formatConfidence(readNumber(p, "confidence"))}`;
    case "code_investigator.started":
      return `Code Investigator started`;
    case "code_investigator.tool_called":
      return `Code Investigator called \`${tool ?? "tool"}\``;
    case "code_investigator.tool_completed":
      return `Code Investigator received \`${tool ?? "tool"}\`${duration !== undefined ? ` in ${duration}ms` : ""}`;
    case "code_investigator.completed":
      return `Code analysis complete — confidence ${formatConfidence(readNumber(p, "confidence"))}`;
    case "code_investigator.failed":
      return `Code Investigator failed — ${readString(p, "error") ?? "unknown error"}`;
    case "sandbox.started":
      return `Sandbox execution started — driver ${readString(p, "driver") ?? "unknown"}`;
    case "sandbox.completed":
      return `Sandbox validated the analysis${duration !== undefined ? ` in ${duration}ms` : ""}`;
    case "sandbox.failed":
      return `Sandbox failed — exit code ${readNumber(p, "exitCode") ?? "?"}`;
    case "sandbox.timeout":
      return `Sandbox timed out`;
    case "root_cause.started":
      return `Root cause synthesis started`;
    case "root_cause.completed":
      return `Root cause — ${readString(p, "title") ?? "identified"} · confidence ${formatConfidence(readNumber(p, "confidence"))}`;
    case "investigation.completed":
      return `Investigation ${readString(p, "status") ?? "completed"}`;
    case "investigation.failed":
      return `Investigation failed — ${readString(p, "error") ?? "unknown error"}`;
    default:
      return `${who} emitted ${event.type as string}`;
  }
}

export function formatConfidence(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(11, 23) + "Z";
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").slice(0, 19) + "Z";
}
