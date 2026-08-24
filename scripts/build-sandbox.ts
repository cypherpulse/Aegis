/** Build the hardened sandbox Docker image (spec §17). Requires a running Docker daemon. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const image = process.env.SANDBOX_IMAGE ?? "aegis-sandbox:latest";
const context = fileURLToPath(new URL("../infra/sandbox", import.meta.url));

const child = spawn("docker", ["build", "-t", image, context], {
  stdio: "inherit",
});
child.on("error", (err) => {
  console.error("docker build failed to start:", err.message);
  process.exitCode = 1;
});
child.on("close", (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) console.log(`Built ${image}`);
});
