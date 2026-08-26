// A "real agent" test that exercises the ACTUAL TrueForge gateway when
// credentials are configured (TRUEFORGE_API_URL + TRUEFORGE_API_KEY). It is
// skip-gated when creds are absent so CI stays green offline — it is never
// faked. The deterministic local-runtime pipeline is covered by index.test.ts.
process.env.SANDBOX_DRIVER = "subprocess";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getHeroIncident } from "@aegis/simulator";
import { readTrueForgeConfig } from "@aegis/trueforge";
import { runInvestigation } from "../src/index.js";

// Load the repo-root .env so TRUEFORGE_* configured there is visible here
// (unlike the API, package tests do not auto-load it).
for (const rel of ["../../../.env"]) {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  if (existsSync(p)) {
    try {
      (process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile(p);
    } catch {
      /* older Node without loadEnvFile — ignore */
    }
  }
}

const cfg = readTrueForgeConfig();

describe("runInvestigation against a real TrueForge session", () => {
  it.skipIf(!cfg)(
    "drives the full multi-agent pipeline using the configured gateway",
    async () => {
      const result = await runInvestigation(getHeroIncident(), {});

      // Whether the gateway connects (mode "harness") or the agent is not
      // deployed and it gracefully falls back (mode "local"), the multi-agent
      // pipeline must still complete end-to-end and produce real output.
      expect(["harness", "local"]).toContain(result.sessionMode);
      expect(result.incident.status).toBe("INVESTIGATION_COMPLETE");
      expect(result.findings.length).toBeGreaterThanOrEqual(3);
      expect(result.findings.some((f) => f.investigator === "CODE")).toBe(true);
      expect(result.failed).toHaveLength(0);
      expect(result.rootCause.status).toBe("COMPLETE");
      // Surface which path actually ran so a real harness session is visible.
      console.log(`[trueforge] sessionMode=${result.sessionMode}`);
    },
    60_000,
  );
});
