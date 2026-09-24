import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { detectFramework } from "../utils/framework";
import { LOG_FILE } from "./paths";

export type RuntimeStatus = "starting" | "running" | "failed" | "crashed";

export interface ProjectRuntime {
  pid: number;
  port: number;
  framework: string;
  startedAt: number;
  ready: boolean;
  child: ChildProcess;
}

const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 500;

export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function localBin(directory: string, name: string): string | null {
  const bin = path.join(directory, "node_modules", ".bin", name);
  return fs.existsSync(bin) ? bin : null;
}

function log(directory: string, message: string): void {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${path.basename(directory)}: ${message}\n`);
  } catch {
    // logging is best-effort
  }
}

function spawnCommand(directory: string, port: number): { command: string; args: string[]; framework: string } | null {
  const framework = detectFramework(directory);
  if (framework === "vite") {
    // Launch Vite programmatically with .lasso allowlisted (Vite rejects unknown
    // Host headers by default) while keeping it isolated in its own process.
    const entry = path.join(__dirname, "vite-host-entry.js");
    if (fs.existsSync(entry)) return { command: process.execPath, args: [entry, directory, String(port)], framework };
  }
  if (framework === "next") {
    const bin = localBin(directory, "next");
    if (bin) return { command: bin, args: ["dev", "--port", String(port)], framework };
  }

  // No explicit NPM script should be invoked blindly; only framework dev bins
  // are trusted to accept --port, so an unknown framework cannot be auto-started.
  return null;
}

export function isReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const request = httpRequest(port);
    request.on("response", (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

function httpRequest(port: number): http.ClientRequest {
  return http.request({ host: "127.0.0.1", port, path: "/", method: "GET", headers: { connection: "close" } });
}

async function waitUntilReady(port: number): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isReady(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  return false;
}

export interface StartRuntimeResult {
  ok: boolean;
  error?: string;
  runtime?: ProjectRuntime;
}

/**
 * Starts the project's development server on a free port and waits until it
 * answers HTTP before returning. Reuses Lasso's existing framework detection —
 * the Host never guesses a package manager or hardcodes a runtime.
 */
export async function startProjectRuntime(directory: string): Promise<StartRuntimeResult> {
  const port = await pickFreePort();
  const plan = spawnCommand(directory, port);
  if (!plan) {
    return { ok: false, error: `${path.basename(directory)} is not a Vite or Next.js project, so Lasso Host can't start it automatically. Run its dev server yourself.` };
  }

  const child = spawn(plan.command, plan.args, {
    cwd: directory,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  const runtime: ProjectRuntime = {
    pid: child.pid || 0,
    port,
    framework: plan.framework,
    startedAt: Date.now(),
    ready: false,
    child,
  };

  log(directory, `starting ${plan.framework} dev server on ${port} (pid ${child.pid})`);

  child.on("error", (error) => {
    log(directory, `spawn error: ${error.message}`);
  });

  if (child.pid === undefined) {
    return { ok: false, error: `Could not start the project runtime for ${path.basename(directory)}.` };
  }

  const ready = await waitUntilReady(port);
  if (!ready) {
    child.kill("SIGTERM");
    log(directory, "dev server did not become ready; stopping it");
    return { ok: false, error: `${path.basename(directory)}'s dev server did not become ready within ${READY_TIMEOUT_MS / 1000}s. Check its logs.` };
  }

  runtime.ready = true;
  log(directory, `dev server ready on ${port}`);
  return { ok: true, runtime };
}