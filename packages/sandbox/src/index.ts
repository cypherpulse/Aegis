import { DockerSandbox } from "./docker.js";
import { SubprocessSandbox } from "./subprocess.js";
import type { SandboxDriver } from "./types.js";

export * from "./types.js";
export { SubprocessSandbox } from "./subprocess.js";
export { DockerSandbox, SANDBOX_IMAGE } from "./docker.js";

export interface CreateSandboxOptions {
  /** Force a driver. Defaults to env SANDBOX_DRIVER, else auto (docker→subprocess). */
  prefer?: "docker" | "subprocess";
}

/**
 * Select a sandbox driver: Docker when the daemon and image are available,
 * otherwise the subprocess fallback. Logs which boundary is active so runs are
 * never silently downgraded.
 */
export async function createSandbox(
  opts: CreateSandboxOptions = {},
): Promise<SandboxDriver> {
  const prefer = opts.prefer ?? (process.env.SANDBOX_DRIVER as CreateSandboxOptions["prefer"]);
  if (prefer !== "subprocess") {
    if ((await DockerSandbox.isAvailable()) && (await DockerSandbox.imageExists())) {
      return new DockerSandbox();
    }
    if (prefer === "docker") {
      console.warn(
        "[sandbox] Docker requested but unavailable or image missing; " +
          "falling back to the subprocess sandbox.",
      );
    }
  }
  return new SubprocessSandbox();
}
