import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { hostAlive, readDaemonPid, isProcessAlive } from "./client";
import { createDomainResolver, type DomainResolver } from "./dns";
import { LOG_FILE, hostProxyPort, hostDnsPort } from "./paths";

const AGENT_LABEL = "com.lasso.host";
const LAUNCH_AGENT_FILE = path.join(os.homedir(), "Library", "LaunchAgents", `${AGENT_LABEL}.plist`);

function cliEntry(): string | null {
  const entry = process.argv[1];
  return entry && entry.endsWith(".js") ? entry : null;
}

export function spawnDaemon(env: Record<string, string>): Promise<{ ok: boolean; alreadyRunning?: boolean; pid?: number; error?: string }> {
  const port = hostProxyPort(env);
  const dnsPort = hostDnsPort(env);
  return hostAlive(port).then(async (health) => {
    if (health) return { ok: true, alreadyRunning: true };
    const entry = cliEntry();
    if (!entry) return { ok: false, error: "Could not resolve the Lasso CLI entry point. Run this from the installed CLI." };
    const child = spawn(process.execPath, [entry, "_host"], {
      detached: true,
      stdio: "ignore",
      cwd: os.homedir(),
      env: { ...process.env, LASSO_HOST_PORT: String(port), LASSO_DNS_PORT: String(dnsPort) },
    });
    const pid = child.pid;
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    if (await hostAlive(port)) return { ok: true, pid };
    return { ok: false, error: `Lasso Host did not come up on port ${port}. Check ${LOG_FILE}.` };
  });
}

function launchAgentPlist(entry: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${entry}</string>
    <string>_host</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
`;
}

export function isAutoStartInstalled(): boolean {
  if (process.platform !== "darwin") return false;
  return fs.existsSync(LAUNCH_AGENT_FILE);
}

function launchctl(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("launchctl", args);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve(out.trim()));
  });
}

const uid = os.userInfo().uid;

export async function enableAutoStart(): Promise<{ ok: boolean; error?: string }> {
  const entry = cliEntry();
  if (!entry) return { ok: false, error: "Could not resolve the Lasso CLI entry point. Run this from the installed CLI." };
  if (process.platform !== "darwin") {
    return { ok: true, error: undefined };
  }
  try {
    fs.mkdirSync(path.dirname(LAUNCH_AGENT_FILE), { recursive: true });
    fs.writeFileSync(LAUNCH_AGENT_FILE, launchAgentPlist(entry), { mode: 0o644 });
    await launchctl(["bootstrap", `gui/${uid}`, LAUNCH_AGENT_FILE]);
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "failed";
    return { ok: false, error: `Could not install the launch agent (${reason}).` };
  }
}

export async function disableAutoStart(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== "darwin") return { ok: true };
  try {
    await launchctl(["bootout", `gui/${uid}/${AGENT_LABEL}`]);
    fs.rmSync(LAUNCH_AGENT_FILE, { force: true });
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "failed";
    return { ok: false, error: `Could not remove the launch agent (${reason}).` };
  }
}

export interface DaemonStatusReport {
  running: boolean;
  pid?: number | null;
  health: Awaited<ReturnType<typeof hostAlive>>;
  autoStart: boolean;
  resolver: Awaited<ReturnType<DomainResolver["status"]>>;
}

export async function daemonStatus(env: Record<string, string>): Promise<DaemonStatusReport> {
  const port = hostProxyPort(env);
  const pid = readDaemonPid();
  const health = await hostAlive(port);
  const running = Boolean(health);
  return {
    running,
    pid: running ? (health?.pid ?? pid) : null,
    health,
    autoStart: isAutoStartInstalled(),
    resolver: await createDomainResolver().status(),
  };
}

export async function stopDaemon(env: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const port = hostProxyPort(env);
  const health = await hostAlive(port);
  if (health && typeof health.pid === "number") {
    try {
      process.kill(health.pid, "SIGTERM");
    } catch (error) {
      return { ok: false, error: `Could not stop Lasso Host: ${error instanceof Error ? error.message : String(error)}` };
    }
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (!(await hostAlive(port))) return { ok: true };
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return { ok: false, error: "Lasso Host did not stop in time." };
  }
  const pid = readDaemonPid();
  if (pid && isProcessAlive(pid)) {
    process.kill(pid, "SIGTERM");
    return { ok: true };
  }
  return { ok: true, error: undefined };
}

export function daemonPortMessage(env: Record<string, string>): string {
  return `http://<project>.lasso:${hostProxyPort(env)}`;
}

export function yesOrNo(promptText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(promptText, (answer: string) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}