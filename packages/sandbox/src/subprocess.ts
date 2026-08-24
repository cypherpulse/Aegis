import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_OUTPUT,
  DEFAULT_TIMEOUT_MS,
  type SandboxDriver,
  type SandboxRequest,
  type SandboxResult,
} from "./types.js";

/**
 * Fallback isolation: run the untrusted program as a separate Node process with
 * no shell, a cleaned environment (no secrets), a throwaway temp workspace, a
 * hard timeout with kill, and bounded output. Never uses eval/Function/exec on
 * the host (spec §18).
 *
 * Boundary note: this provides process, timeout, and resource-ish isolation and
 * a scrubbed env, but NOT network-namespace or filesystem-namespace isolation —
 * use the Docker driver for that. The generated analysis programs do not use the
 * network.
 */
export class SubprocessSandbox implements SandboxDriver {
  readonly name = "subprocess" as const;

  async run(req: SandboxRequest): Promise<SandboxResult> {
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOut = req.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const started = Date.now();
    const dir = await mkdtemp(join(tmpdir(), "aegis-sbx-"));
    const programPath = join(dir, "program.mjs");

    try {
      await writeFile(programPath, req.code, "utf8");

      // Minimal, secret-free environment. On Windows the Node runtime needs a
      // couple of system vars just to start; we pass only those.
      const env: NodeJS.ProcessEnv = {
        SANDBOX_INPUT: JSON.stringify(req.input ?? null),
        NODE_OPTIONS: "--disallow-code-generation-from-strings",
      };
      if (process.platform === "win32") {
        if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
        env.TEMP = dir;
        env.TMP = dir;
      }

      const child = spawn(process.execPath, [programPath], {
        cwd: dir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const cap = (buf: string, chunk: Buffer): string =>
        buf.length >= maxOut ? buf : (buf + chunk.toString("utf8")).slice(0, maxOut);

      child.stdout.on("data", (c: Buffer) => (stdout = cap(stdout, c)));
      child.stderr.on("data", (c: Buffer) => (stderr = cap(stderr, c)));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      const exitCode = await new Promise<number | null>((resolve) => {
        child.on("error", () => resolve(null));
        child.on("close", (code) => resolve(code));
      });
      clearTimeout(timer);

      return {
        stdout,
        stderr,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        driver: "subprocess",
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
