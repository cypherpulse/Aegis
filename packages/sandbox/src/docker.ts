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

export const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "aegis-sandbox:latest";

function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; maxOut?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const maxOut = opts.maxOut ?? DEFAULT_MAX_OUTPUT;
    const cap = (b: string, c: Buffer) =>
      b.length >= maxOut ? b : (b + c.toString("utf8")).slice(0, maxOut);
    child.stdout.on("data", (c: Buffer) => (stdout = cap(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = cap(stderr, c)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, opts.timeoutMs);
    }
    child.on("error", () => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: null, timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}

/**
 * Docker-isolated execution (preferred): a throwaway, network-less, read-only,
 * non-root, resource-limited container. No project mount, no secrets (spec §18).
 */
export class DockerSandbox implements SandboxDriver {
  readonly name = "docker" as const;

  static async isAvailable(): Promise<boolean> {
    const r = await run("docker", ["info"], { timeoutMs: 5000 });
    return r.code === 0;
  }

  static async imageExists(): Promise<boolean> {
    const r = await run("docker", ["image", "inspect", SANDBOX_IMAGE], {
      timeoutMs: 5000,
    });
    return r.code === 0;
  }

  async run(req: SandboxRequest): Promise<SandboxResult> {
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    const dir = await mkdtemp(join(tmpdir(), "aegis-sbx-"));
    const name = `aegis-sbx-${Math.random().toString(36).slice(2, 10)}`;
    try {
      await writeFile(join(dir, "program.mjs"), req.code, "utf8");
      const args = [
        "run",
        "--rm",
        "--name",
        name,
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/work:rw,size=32m",
        "-v",
        `${dir}:/src:ro`,
        "-w",
        "/work",
        "-e",
        `SANDBOX_INPUT=${JSON.stringify(req.input ?? null)}`,
        "-e",
        "NODE_OPTIONS=--disallow-code-generation-from-strings",
        "--memory",
        "256m",
        "--memory-swap",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "1000:1000",
        SANDBOX_IMAGE,
        "node",
        "/src/program.mjs",
      ];
      const r = await run("docker", args, {
        timeoutMs: timeoutMs + 4000,
        maxOut: req.maxOutputBytes ?? DEFAULT_MAX_OUTPUT,
      });
      if (r.timedOut) {
        await run("docker", ["kill", name], { timeoutMs: 5000 }).catch(() => {});
      }
      return {
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode: r.code,
        timedOut: r.timedOut,
        durationMs: Date.now() - started,
        driver: "docker",
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
