import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOST_DIR = process.env.LASSO_HOST_DIR || path.join(os.homedir(), ".lasso", "host");
export const REGISTRY_FILE = path.join(HOST_DIR, "registry.json");
export const PID_FILE = path.join(HOST_DIR, "daemon.pid");
export const LOG_FILE = path.join(HOST_DIR, "daemon.log");

export const DEFAULT_PROXY_PORT = Number(process.env.LASSO_HOST_PORT) || 4377;
export const DEFAULT_DNS_PORT = Number(process.env.LASSO_DNS_PORT) || 5358;

export const TLD = "lasso";

export function hostProxyPort(env: Record<string, string>): number {
  return Number(process.env.LASSO_HOST_PORT || env.LASSO_HOST_PORT) || DEFAULT_PROXY_PORT;
}

export function hostDnsPort(env: Record<string, string>): number {
  return Number(process.env.LASSO_DNS_PORT || env.LASSO_DNS_PORT) || DEFAULT_DNS_PORT;
}

export function domainOf(hostname: string): string {
  return hostname.replace(/:\d+$/, "").toLowerCase();
}

export function isLassoDomain(hostname: string): boolean {
  return domainOf(hostname).endsWith(`.${TLD}`);
}

export function attachHostPort(url: string, port: number): string {
  try {
    const parsed = new URL(url);
    parsed.port = String(port);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function ensureHostDir(): string {
  fs.mkdirSync(HOST_DIR, { recursive: true });
  return HOST_DIR;
}