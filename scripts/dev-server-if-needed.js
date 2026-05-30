import { spawn } from "node:child_process";

const statusUrl = process.env.API_STATUS_URL || "http://localhost:4000/status";

async function apiIsRunning() {
  try {
    const response = await fetch(statusUrl);
    if (!response.ok) return false;
    const body = await response.json().catch(() => ({}));
    return body.status === "ok";
  } catch {
    return false;
  }
}

if (await apiIsRunning()) {
  console.log(
    `Gree API already running at ${statusUrl}. Skipping duplicate server start.`,
  );
} else {
  await new Promise((resolve) => {
    const child = spawn("npm", ["--workspace", "server", "run", "dev"], {
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      process.exitCode = code ?? 0;
      resolve();
    });
  });
}
