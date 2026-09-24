import fs from "node:fs";
import path from "node:path";
import { HOST_DIR, REGISTRY_FILE, TLD } from "./paths";

export interface HostProject {
  projectId: string;
  directory: string;
  registeredAt: string;
}

export type HostRegistry = Record<string, HostProject>;

export const DOMAIN_RE = new RegExp(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?\\.${TLD}$`);

export function ensureRegistryDir(): string {
  fs.mkdirSync(HOST_DIR, { recursive: true });
  return HOST_DIR;
}

export function loadRegistry(): HostRegistry {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as HostRegistry;
  } catch {
    // no registry yet
  }
  return {};
}

export function saveRegistry(registry: HostRegistry): void {
  ensureRegistryDir();
  const temp = `${REGISTRY_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(registry, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temp, REGISTRY_FILE);
}

export function findByDirectory(registry: HostRegistry, directory: string): { domain: string; project: HostProject } | null {
  const resolved = path.resolve(directory);
  for (const [domain, project] of Object.entries(registry)) {
    if (path.resolve(project.directory) === resolved) return { domain, project };
  }
  return null;
}

export interface RegisterInput {
  domain: string;
  directory: string;
  projectId?: string;
  registry: HostRegistry;
}

/**
 * Registers (or re-registers) a domain → directory mapping. Never duplicates:
 * an existing entry for the same domain is replaced, and any other domain
 * pointing at the same directory is dropped first.
 */
export function registerProject(input: RegisterInput): HostRegistry {
  const { domain, directory, projectId, registry } = input;
  const next: HostRegistry = {};

  for (const [existingDomain, project] of Object.entries(registry)) {
    if (existingDomain === domain) continue;
    if (path.resolve(project.directory) === path.resolve(directory)) continue;
    next[existingDomain] = project;
  }

  next[domain] = {
    projectId: projectId || "",
    directory: path.resolve(directory),
    registeredAt: new Date().toISOString(),
  };

  return next;
}

export function unregisterDomain(registry: HostRegistry, domain: string): HostRegistry {
  const next = { ...registry };
  delete next[domain];
  return next;
}

export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "app";
}

export function defaultDomainForDirectory(directory: string): string {
  return `${slugifyProjectName(path.basename(directory))}.${TLD}`;
}

export function generateUniqueDomain(directory: string, registry: HostRegistry): string {
  const base = defaultDomainForDirectory(directory);
  if (!registry[base]) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base.slice(0, -(TLD.length + 1))}-${i}.${TLD}`;
    if (!registry[candidate]) return candidate;
  }
  return `${base.slice(0, -(TLD.length + 1))}-${Date.now().toString(36)}.${TLD}`;
}

export function validateDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}