import { describe, expect, it } from "vitest";
import { DockerSandbox, SubprocessSandbox } from "../src/index.js";

const sandbox = new SubprocessSandbox();

describe("SubprocessSandbox", () => {
  it("runs a program and captures stdout + exit 0", async () => {
    const res = await sandbox.run({
      code: `const input = JSON.parse(process.env.SANDBOX_INPUT);
             console.log(JSON.stringify({ doubled: input.n * 2 }));`,
      input: { n: 21 },
      timeoutMs: 15000,
    });
    expect(res.exitCode).toBe(0);
    expect(res.timedOut).toBe(false);
    expect(JSON.parse(res.stdout.trim())).toEqual({ doubled: 42 });
    expect(res.driver).toBe("subprocess");
  });

  it("captures a non-zero exit and stderr", async () => {
    const res = await sandbox.run({
      code: `console.error("boom"); process.exit(3);`,
      timeoutMs: 15000,
    });
    expect(res.exitCode).toBe(3);
    expect(res.stderr).toContain("boom");
  });

  it("kills a program that exceeds the timeout", async () => {
    const res = await sandbox.run({
      code: `setInterval(() => {}, 1000); // never exits`,
      timeoutMs: 300,
    });
    expect(res.timedOut).toBe(true);
    expect(res.exitCode).not.toBe(0);
  });

  it("does not leak host secrets into the sandbox env", async () => {
    process.env.AEGIS_SECRET_PROBE = "top-secret";
    try {
      const res = await sandbox.run({
        code: `console.log(process.env.AEGIS_SECRET_PROBE ?? "ABSENT");`,
        timeoutMs: 15000,
      });
      expect(res.stdout.trim()).toBe("ABSENT");
    } finally {
      delete process.env.AEGIS_SECRET_PROBE;
    }
  });

  it("bounds captured output", async () => {
    const res = await sandbox.run({
      code: `process.stdout.write("x".repeat(1_000_000));`,
      maxOutputBytes: 1024,
      timeoutMs: 15000,
    });
    expect(res.stdout.length).toBeLessThanOrEqual(1024);
  });
});

// Real Docker path — only runs when the daemon + image are available.
const dockerReady = await DockerSandbox.isAvailable().then(
  (a) => a && DockerSandbox.imageExists(),
  () => false,
);

describe("DockerSandbox (real)", () => {
  it.skipIf(!dockerReady)("executes inside a hardened container", async () => {
    const res = await new DockerSandbox().run({
      code: `console.log(JSON.stringify({ ok: true }));`,
    });
    expect(res.driver).toBe("docker");
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout.trim())).toEqual({ ok: true });
  });
});
