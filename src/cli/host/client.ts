import fs from "node:fs";
import path from "node:path";
import { fetchWithTimeout } from "../auth";
import { loadRegistry, saveRegistry, registerProject, unregisterDomain, type HostProject } from "./registry";
import { syncResolverAfterRegister } from "./dns";
import { PID_FILE } from "./paths";

export interface HostHealth {
  ok?: boolean;
  service?: string;
  version?: string;
  pid?: number;
  proxyPort?: number | null;
  dnsPort?: number | null;
  running?: number;
  registered?: number;
  projects?: Array<Record<string, unknown>>;
}

export async function hostAlive(port: number): Promise<HostHealth | null> {
  try {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}/_host/health`, {}, 2500);
    if (!response.ok) return null;
    return (await response.json()) as HostHealth;
  } catch {
    return null;
  }
}

export function readDaemonPid(): number | null {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface RegisterResult {
  ok: boolean;
  domain: string;
  directory: string;
  replaced?: boolean;
  viaHost?: boolean;
  error?: string;
}

export async function registerWithHost(domain: string, directory: string, projectId: string, port: number): Promise<RegisterResult> {
  const health = await hostAlive(port);
  if (health) {
    try {
      const response = await fetchWithTimeout(`http://127.0.0.1:${port}/_host/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, directory, projectId }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; replaced?: boolean };
      if (!response.ok || !body.ok) return { ok: false, domain, directory, error: body.error || "The host rejected the registration." };
      return { ok: true, domain, directory: path.resolve(directory), replaced: Boolean(body.replaced), viaHost: true };
    } catch {
      // fall through to a direct registry write
    }
  }

  try {
    const current = loadRegistry();
    const next = registerProject({ domain, directory, projectId, registry: current });
    saveRegistry(next);
    await syncResolverAfterRegister();
    return { ok: true, domain, directory: path.resolve(directory), replaced: Boolean(current[domain] && current[domain].directory !== path.resolve(directory)) };
  } catch (error) {
    return { ok: false, domain, directory, error: error instanceof Error ? error.message : "Could not write the Lasso Host registry." };
  }
}

export async function unregisterFromHost(domain: string, port: number): Promise<{ ok: boolean; removed?: boolean; error?: string }> {
  const health = await hostAlive(port);
  if (health) {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}/_host/unregister`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const body = (await response.json()) as { ok?: boolean; removed?: boolean; error?: string };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "The host rejected the unregister." };
    return { ok: true, removed: Boolean(body.removed) };
  }
  const had = domain in loadRegistry();
  saveRegistry(unregisterDomain(loadRegistry(), domain));
  await syncResolverAfterRegister();
  return { ok: true, removed: had };
}

export interface ProjectWithStatus extends HostProject {
  domain: string;
  status: "running" | "stopped";
  port: number | null;
  pid: number | null;
}

export async function listHostProjects(port: number): Promise<{ health: HostHealth | null; projects: ProjectWithStatus[] }> {
  const health = await hostAlive(port);
  if (health?.projects) {
    const projects = health.projects as Array<Record<string, unknown>>;
    return {
      health,
      projects: projects.map((p) => ({
        projectId: String(p.projectId || ""),
        directory: String(p.directory || ""),
        registeredAt: "",
        domain: String(p.domain || ""),
        status: p.status === "running" ? "running" : "stopped",
        port: typeof p.port === "number" ? p.port : null,
        pid: typeof p.pid === "number" ? p.pid : null,
      })),
    };
  }
  const registry = loadRegistry();
  return {
    health,
    projects: Object.entries(registry).map(([domain, project]) => ({ ...project, domain, status: "stopped" as const, port: null, pid: null })),
  };
}

export async function stopHostProject(domain: string, port: number): Promise<{ ok: boolean; error?: string }> {
  const health = await hostAlive(port);
  if (!health) return { ok: false, error: "Lasso Host is not running." };
  const response = await fetchWithTimeout(`http://127.0.0.1:${port}/_host/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domain }),
  });
  const body = (await response.json()) as { ok?: boolean; status?: string; error?: string };
  if (!response.ok || !body.ok) return { ok: false, error: body.error || "The host rejected the stop request." };
  return { ok: true };
}

export async function restartHost(port: number): Promise<{ ok: boolean; error?: string }> {
  const health = await hostAlive(port);
  if (!health) return { ok: false, error: "Lasso Host is not running." };
  const response = await fetchWithTimeout(`http://127.0.0.1:${port}/_host/restart`, { method: "POST" });
  if (!response.ok) return { ok: false, error: "The host rejected the restart request." };
  return { ok: true };
}