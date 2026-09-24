import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { TLD } from "./paths";
import { loadRegistry, type HostRegistry } from "./registry";

const execFileAsync = promisify(execFile);
const LOOPBACK = "127.0.0.1";

function sudoWrite(file: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["tee", file], { stdio: ["pipe", "ignore", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sudo tee exited with code ${code}`));
    });
    child.stdin.end(content);
  });
}

// ---- Minimal DNS responder — answers `*.lasso` → 127.0.0.1 so the local
// domain namespace needs no per-project /etc/hosts entries.

function encodeName(name: string): Buffer {
  const parts = name.replace(/\.$/, "").split(".");
  const chunks: number[] = [];
  for (const part of parts) {
    chunks.push(part.length);
    for (const byte of Buffer.from(part, "ascii")) chunks.push(byte);
  }
  chunks.push(0);
  return Buffer.from(chunks);
}

function parseName(buf: Buffer, offset: number): { name: string; next: number } {
  const labels: string[] = [];
  let i = offset;
  while (true) {
    const len = buf[i];
    if (len === 0) {
      i += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      i += 2;
      return { name: labels.join(".") === "." ? "" : labels.join("."), next: i };
    }
    labels.push(buf.subarray(i + 1, i + 1 + len).toString("ascii"));
    i += 1 + len;
  }
  return { name: labels.join("."), next: i };
}

export function buildDnsResponse(query: Buffer): Buffer | null {
  if (query.length < 12) return null;
  const id = query.subarray(0, 2);
  const qdcount = query.readUInt16BE(4);
  if (qdcount === 0) return null;

  const { name, next } = parseName(query, 12);
  const qtype = query.readUInt16BE(next);
  const raiseRecursion = query[2] & 0x01; // RD flag is byte 2 bit 0

  const isLasso = name.endsWith(`.${TLD}`);
  const rcode = isLasso ? 0 : 3; // NXDOMAIN for anything outside the namespace
  const flags = 0x8000 | (raiseRecursion ? 0x0100 : 0) | 0x0400 | (rcode & 0x0f); // QR|RD|RA|rcode
  const ancount = isLasso && qtype === 1 ? 1 : 0; // one A record when asked for A

  const header = Buffer.alloc(12);
  id.copy(header, 0);
  header.writeUInt16BE(flags, 2);
  header.writeUInt16BE(qdcount, 4);
  header.writeUInt16BE(ancount, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  if (ancount === 0) {
    return Buffer.concat([header, query.subarray(12, next + 4)]);
  }

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0); // pointer to the question name
  answer.writeUInt16BE(1, 2); // Type A
  answer.writeUInt16BE(1, 4); // Class IN
  answer.writeUInt32BE(300, 6); // TTL
  answer.writeUInt16BE(4, 10); // RDLENGTH
  for (const [i, octet] of LOOPBACK.split(".").map(Number).entries()) answer[12 + i] = octet;

  return Buffer.concat([header, query.subarray(12, next + 4), answer]);
}

export interface DnsServerHandle {
  close: () => void;
  port: number;
}

export function startDnsServer(port: number): Promise<DnsServerHandle> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");

    socket.on("message", (message, remote) => {
      const reply = buildDnsResponse(message);
      if (reply) socket.send(reply, remote.port, remote.address);
    });

    socket.on("error", (error) => reject(error));

    socket.bind(port, LOOPBACK, () => {
      const address = socket.address();
      resolve({ close: () => socket.close(), port: address.port });
    });
  });
}

// ---- DomainResolver abstraction — how `.lasso` reaches the DNS server is
// per-OS; the rest of Lasso Host only cares about the interface.

export interface DomainResolver {
  platform: string;
  status: () => Promise<{ installed: boolean; detail: string }>;
  install: (dnsPort: number) => Promise<{ ok: boolean; requiresSudo?: boolean; message: string }>;
  uninstall: (dnsPort: number) => Promise<{ ok: boolean; message: string }>;
}

const MAC_RESOLVER_FILE = "/etc/resolver/lasso";

function macResolverContent(dnsPort: number): string {
  return `nameserver ${LOOPBACK}\nport ${dnsPort}\ntimeout 1\n`;
}

export class MacOSResolver implements DomainResolver {
  readonly platform = "darwin";

  async status() {
    try {
      const content = fs.readFileSync(MAC_RESOLVER_FILE, "utf8");
      const port = content.match(/^port\s+(\d+)/m)?.[1] || "unknown";
      return { installed: content.includes("nameserver"), detail: `/etc/resolver/lasso → 127.0.0.1:${port}` };
    } catch {
      return { installed: false, detail: "`lasso` domain not configured (`/etc/resolver/lasso` missing)" };
    }
  }

  async install(dnsPort: number) {
    try {
      // Writing to /etc/resolver needs the admin password (macOS maps it from
      // the foreground terminal when sudo prompts).
      // The resolver directory is not present on every macOS installation.
      // Create it first so the subsequent sudo tee does not fail with ENOENT.
      await execFileAsync("sudo", ["mkdir", "-p", path.dirname(MAC_RESOLVER_FILE)]);
      await sudoWrite(MAC_RESOLVER_FILE, macResolverContent(dnsPort));
      return { ok: true, message: `Installed /etc/resolver/lasso → 127.0.0.1:${dnsPort}` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "failed";
      return { ok: false, requiresSudo: true, message: `Could not write /etc/resolver/lasso (${reason}). Run "lasso daemon install" from a terminal so you can enter your password.` };
    }
  }

  async uninstall() {
    try {
      await execFileAsync("sudo", ["rm", "-f", MAC_RESOLVER_FILE]);
      return { ok: true, message: "Removed /etc/resolver/lasso." };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "failed";
      return { ok: false, message: `Could not remove /etc/resolver/lasso (${reason}).` };
    }
  }
}

export class LinuxResolver implements DomainResolver {
  readonly platform = "linux";
  private readonly systemdFile = "/etc/systemd/resolved.conf.d/lasso-host.conf";

  async status() {
    return { installed: fs.existsSync(this.systemdFile), detail: fs.existsSync(this.systemdFile) ? `systemd-resolved split-DNS configured for ~.${TLD}` : "`lasso` domain not configured (systemd-resolved split-DNS missing)" };
  }

  async install(dnsPort: number) {
    const body = `[Resolve]\nDNS=${LOOPBACK}#${dnsPort}\nDomains=~${TLD}\n`;
    try {
      await execFileAsync("sudo", ["mkdir", "-p", path.dirname(this.systemdFile)]);
      await sudoWrite(this.systemdFile, body);
      await execFileAsync("sudo", ["systemctl", "try-restart", "systemd-resolved"]).catch(() => undefined);
      return { ok: true, requiresSudo: true, message: `Installed systemd-resolved split-DNS for *.${TLD} → 127.0.0.1:${dnsPort}` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "failed";
      return { ok: false, requiresSudo: true, message: `Could not configure systemd-resolved (${reason}).` };
    }
  }

  async uninstall() {
    try {
      await execFileAsync("sudo", ["rm", "-f", this.systemdFile]);
      await execFileAsync("sudo", ["systemctl", "try-restart", "systemd-resolved"]).catch(() => undefined);
      return { ok: true, message: "Removed systemd-resolved split-DNS configuration." };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "failed";
      return { ok: false, message: `Could not remove systemd-resolved configuration (${reason}).` };
    }
  }
}

const WINDOWS_HOSTS = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
const HOSTS_BLOCK_START = "# --- lasso-host ---";
const HOSTS_BLOCK_END = "# --- end lasso-host ---";

export class WindowsResolver implements DomainResolver {
  readonly platform = "win32";

  async status() {
    const synced = await this.readHostsBlock();
    return { installed: synced.length > 0, detail: synced.length > 0 ? `${synced.length} registered .${TLD} domain(s) in hosts` : "no .lasso domains registered in hosts" };
  }

  async readHostsBlock(): Promise<string[]> {
    try {
      const content = fs.readFileSync(WINDOWS_HOSTS, "utf8");
      const match = content.match(new RegExp(`${HOSTS_BLOCK_START}\\n([\\s\\S]*?)\\n${HOSTS_BLOCK_END}`));
      if (!match) return [];
      return match[1].split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    } catch {
      return [];
    }
  }

  decodeHost(entry: string): string {
    return entry.split(/\s+/)[1] || "";
  }

  async sync(registry: HostRegistry) {
    const lines = [`${HOSTS_BLOCK_START}`];
    for (const domain of Object.keys(registry)) lines.push(`${LOOPBACK} ${domain}`);
    lines.push(`${HOSTS_BLOCK_END}`);
    const block = lines.join("\n");
    const contents = fs.existsSync(WINDOWS_HOSTS) ? fs.readFileSync(WINDOWS_HOSTS, "utf8") : "";
    const next = contents.includes(HOSTS_BLOCK_START) ? contents.replace(new RegExp(`${HOSTS_BLOCK_START}\\n[\\s\\S]*?\\n${HOSTS_BLOCK_END}`), block) : contents.trimEnd() + "\n" + block + "\n";
    try {
      await execFileAsync("net", ["session"]).catch(() => undefined);
      fs.writeFileSync(WINDOWS_HOSTS, next);
      return true;
    } catch {
      return false;
    }
  }

  async install() {
    return { ok: false, message: "Windows has no per-domain DNS configuration. `lasso register` will add each registered domain to the hosts file instead (run from an elevated terminal)." };
  }

  async uninstall() {
    return { ok: true, message: "Remove the '# --- lasso-host ---' block from your hosts file to remove Lasso Host mappings." };
  }
}

let resolverSingleton: DomainResolver | null = null;

export function createDomainResolver(platform = process.platform): DomainResolver {
  if (!resolverSingleton) {
    if (platform === "darwin") resolverSingleton = new MacOSResolver();
    else if (platform === "linux") resolverSingleton = new LinuxResolver();
    else resolverSingleton = new WindowsResolver();
  }
  return resolverSingleton;
}

// Windows keeps hosts entries in sync whenever the registry changes.
export function syncResolverAfterRegister(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(true);
  const resolver = createDomainResolver() as WindowsResolver;
  return resolver.sync(loadRegistry());
}
