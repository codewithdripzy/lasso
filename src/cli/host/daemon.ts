import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import httpProxy from "http-proxy";
import { loadRegistry, saveRegistry, registerProject, unregisterDomain, validateDomain, type HostRegistry } from "./registry";
import { startProjectRuntime, type ProjectRuntime } from "./runtime";
import { startDnsServer, createDomainResolver, syncResolverAfterRegister, type DomainResolver, type DnsServerHandle } from "./dns";
import { PID_FILE, LOG_FILE, domainOf, isLassoDomain } from "./paths";
import { ensureHostCertificate, hostCertificateStatus, TLS_CERT_FILE, TLS_KEY_FILE } from "./certificates";

export const SERVICE_NAME = "lasso-host";

export interface HostRuntimeOptions {
  proxyPort: number;
  httpsPort: number;
  dnsPort: number;
  version?: string;
}

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: Record<string, unknown>) => void | Promise<void>;

function writeJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
  });
}

function logline(message: string): void {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // best-effort
  }
}

export class LassoHost {
  private readonly server: http.Server;
  private readonly secureServer: https.Server;
  private dnsHandle: DnsServerHandle | null = null;
  private readonly resolver: DomainResolver;
  private readonly registry: HostRegistry;
  private readonly cleanupOnStart = new Set<string>();
  private readonly running = new Map<string, ProjectRuntime>();
  private readonly starting = new Map<string, Promise<ProjectRuntime | null>>();
  private readonly crashLog = new Map<string, number[]>();
  private readonly proxies = new Map<number, httpProxy>();

  constructor(private readonly opts: HostRuntimeOptions) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
    this.secureServer = https.createServer({}, (req, res) => this.handleRequest(req, res));
    this.secureServer.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
    this.resolver = createDomainResolver();
    this.registry = loadRegistry();
    for (const domain of Object.keys(this.registry)) this.cleanupOnStart.add(domain);
    this.log(`host starting (version ${opts.version || "unknown"})`);
  }

  private log(message: string): void {
    logline(message);
  }

  // ---- helpers ------------------------------------------------------

  projectView(domain: string) {
    const project = this.registry[domain];
    if (!project) return null;
    const runtime = this.running.get(domain);
    return {
      domain,
      directory: project.directory,
      projectId: project.projectId,
      status: runtime?.ready ? "running" : "stopped",
      port: runtime?.port ?? null,
      pid: runtime?.pid ?? null,
    };
  }

  private projectList(): Array<Record<string, unknown>> {
    return Object.keys(this.registry).map((domain) => this.projectView(domain) as Record<string, unknown>);
  }

  private commitRegistry(registry: HostRegistry): void {
    for (const key of Object.keys(this.registry)) delete this.registry[key];
    Object.assign(this.registry, registry);
    saveRegistry(this.registry);
  }

  private proxyFor(port: number): httpProxy {
    let proxy = this.proxies.get(port);
    if (!proxy) {
      proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${port}`, ws: true });
      proxy.on("error", () => {
        // forwarded per-request below
      });
      this.proxies.set(port, proxy);
    }
    return proxy;
  }

  private async ensureRunning(domain: string): Promise<ProjectRuntime | null> {
    const existing = this.running.get(domain);
    if (existing) return existing;

    const pending = this.starting.get(domain);
    if (pending) return pending;

    const project = this.registry[domain];
    if (!project) return null;

    const crashes = (this.crashLog.get(domain) || []).filter((t) => Date.now() - t < 5 * 60_000);
    if (crashes.length >= 3) {
      throw new Error(`${domain} kept crashing on startup; not auto-restarting. Fix the project or run "lasso daemon restart".`);
    }
    this.crashLog.set(domain, crashes);

    const startup = (async () => {
      const result = await startProjectRuntime(project.directory, { cleanupExisting: this.cleanupOnStart.delete(domain) });
      if (!result.ok || !result.runtime) {
        this.crashLog.set(domain, [...crashes, Date.now()]);
        throw new Error(result.error || `Could not start ${domain}.`);
      }

      const runtime = result.runtime;
      this.crashLog.delete(domain);
      this.running.set(domain, runtime);
      runtime.child.on("exit", (code, signal) => {
        if (this.running.get(domain) === runtime) {
          this.running.delete(domain);
          this.log(`project ${domain} exited (code=${code} signal=${signal})`);
        }
      });

      return runtime;
    })();

    this.starting.set(domain, startup);
    try {
      return await startup;
    } finally {
      if (this.starting.get(domain) === startup) this.starting.delete(domain);
    }
  }

  // ---- control surface ---------------------------------------------

  private routes(): Array<{ route: string; handler: Handler }> {
    return [
      { route: "GET /_host/health", handler: (_req, res) => this.health(res) },
      { route: "GET /_host/registry", handler: (_req, res) => writeJson(res, 200, { ok: true, projects: this.projectList() }) },
      {
        route: "POST /_host/register",
        handler: async (req, res) => {
          const body = await readBody(req);
          const domain = String(body.domain || "").trim().toLowerCase();
          const directory = String(body.directory || "").trim();
          const projectId = String(body.projectId || "").trim();

          if (!validateDomain(domain)) return writeJson(res, 400, { ok: false, error: `"${domain}" is not a valid .lasso domain.` });
          if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
            return writeJson(res, 400, { ok: false, error: "The project directory does not exist or is not a directory." });
          }

          for (const [existingDomain, project] of Object.entries(this.registry)) {
            if (path.resolve(project.directory) === path.resolve(directory) && existingDomain !== domain) {
              this.running.get(existingDomain)?.child.kill("SIGTERM");
              this.running.delete(existingDomain);
            }
          }

          const next = registerProject({ domain, directory, projectId, registry: this.registry });
          this.commitRegistry(next);
          await syncResolverAfterRegister();
          this.log(`registered ${domain} → ${directory}`);
          writeJson(res, 200, { ok: true, domain, directory: path.resolve(directory), projects: Object.keys(next).length });
        },
      },
      {
        route: "POST /_host/unregister",
        handler: async (req, res) => {
          const body = await readBody(req);
          const domain = String(body.domain || "").trim().toLowerCase();
          if (!domain) return writeJson(res, 400, { ok: false, error: "A domain is required." });
          const had = domain in this.registry;
          this.running.get(domain)?.child.kill("SIGTERM");
          this.running.delete(domain);
          this.commitRegistry(unregisterDomain(this.registry, domain));
          await syncResolverAfterRegister();
          this.log(`unregistered ${domain}`);
          writeJson(res, 200, { ok: true, domain, removed: had });
        },
      },
      {
        route: "POST /_host/stop",
        handler: async (req, res) => {
          const body = await readBody(req);
          const domain = String(body.domain || "").trim().toLowerCase();
          const runtime = this.running.get(domain);
          if (!runtime) return writeJson(res, 200, { ok: true, domain, status: "stopped" });
          runtime.child.kill("SIGTERM");
          this.running.delete(domain);
          this.log(`stopped ${domain}`);
          writeJson(res, 200, { ok: true, domain, status: "stopped" });
        },
      },
      {
        route: "POST /_host/restart",
        handler: async (_req, res) => {
          const stopped: string[] = [];
          this.crashLog.clear();
          for (const [domain, runtime] of this.running) {
            runtime.child.kill("SIGTERM");
            this.running.delete(domain);
            this.cleanupOnStart.add(domain);
            this.crashLog.delete(domain);
            stopped.push(domain);
            this.log(`stopped ${domain} for restart`);
          }
          writeJson(res, 200, { ok: true, stopped });
        },
      },
      {
        route: "POST /_host/restart-project",
        handler: async (req, res) => {
          const body = await readBody(req);
          const domain = String(body.domain || "").trim().toLowerCase();
          if (!domain) return writeJson(res, 400, { ok: false, error: "A project domain is required." });
          const runtime = this.running.get(domain);
          this.cleanupOnStart.add(domain);
          this.crashLog.delete(domain);
          if (runtime) {
            runtime.child.kill("SIGTERM");
            this.running.delete(domain);
            this.log(`stopped ${domain} for bridge restart`);
          }
          writeJson(res, 200, { ok: true, domain, status: "stopped" });
        },
      },
    ];
  }

  private health(res: http.ServerResponse): void {
    writeJson(res, 200, {
      ok: true,
      service: SERVICE_NAME,
      version: this.opts.version || "unknown",
      pid: process.pid,
      dnsPort: this.dnsHandle?.port ?? null,
      proxyPort: this.opts.proxyPort,
      httpsPort: this.opts.httpsPort,
      https: hostCertificateStatus().present,
      running: this.running.size,
      registered: Object.keys(this.registry).length,
      projects: this.projectList(),
    });
  }

  // ---- request handling --------------------------------------------

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || "/";

    const route = this.routes().find((r) => r.route === `${req.method} ${url}`);
    if (route) {
      void Promise.resolve(route.handler(req, res, {})).catch((error) => {
        this.log(line(error));
        writeJson(res, 500, { ok: false, error: line(error) });
      });
      return;
    }

    const isControl = url.startsWith("/_host/");
    if (isControl) {
      writeJson(res, 404, { ok: false, error: "Unknown Lasso Host control endpoint." });
      return;
    }

    const hostname = domainOf(req.headers.host || "");
    if (!isLassoDomain(hostname)) {
      writeJson(res, 404, { ok: false, error: "Lasso Host only proxies *.lasso domains.", host: req.headers.host });
      return;
    }

    void this.proxyToProject(hostname, req, res);
  }

  private async proxyToProject(hostname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let runtime: ProjectRuntime;
    try {
      const started = await this.ensureRunning(hostname);
      if (!started) {
        writeJson(res, 404, { ok: false, domain: hostname, error: `No Lasso project is registered for ${hostname}. Run "lasso init" in the project first.` });
        return;
      }
      runtime = started;
    } catch (error) {
      const message = line(error);
      this.log(`request for ${hostname} failed: ${message}`);
      writeJson(res, 503, { ok: false, domain: hostname, error: message });
      return;
    }

    this.proxyFor(runtime.port).web(req, res, {}, (error) => {
      this.log(`proxy error for ${hostname}: ${line(error)}`);
      if (!res.headersSent) writeJson(res, 502, { ok: false, error: "The project's dev server is not responding." });
      else res.destroy();
    });
  }

  private handleUpgrade(req: http.IncomingMessage, socket: import("node:stream").Duplex, head: Buffer): void {
    const hostname = domainOf(req.headers.host || "");
    if (!isLassoDomain(hostname)) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    void (async () => {
      let runtime: ProjectRuntime;
      try {
        const started = await this.ensureRunning(hostname);
        if (!started) throw new Error("not registered");
        runtime = started;
      } catch {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      this.proxyFor(runtime.port).ws(req, socket, head, {}, (error: Error) => {
        this.log(`ws proxy error for ${hostname}: ${line(error)}`);
        socket.destroy();
      });
    })();
  }

  // ---- lifecycle ---------------------------------------------------

  async start(): Promise<{ error?: string }> {
    try {
      this.dnsHandle = await startDnsServer(this.opts.dnsPort);
      this.log(`dns server listening on 127.0.0.1:${this.opts.dnsPort}`);
    } catch (error) {
      this.dnsHandle = null;
      this.log(`dns server failed to start on ${this.opts.dnsPort}: ${line(error)}`);
    }

    const certificate = ensureHostCertificate();
    if (!certificate.ok) this.log(`https certificate unavailable: ${certificate.error}`);
    else {
      this.secureServer.setSecureContext({ key: fs.readFileSync(TLS_KEY_FILE), cert: fs.readFileSync(TLS_CERT_FILE) });
      this.log(`https certificate ready${certificate.trusted ? " (trusted by mkcert)" : " (local trust may be required)"}`);
    }

    return await new Promise((resolve) => {
      this.server.once("error", (error) => {
        resolve({ error: (error as NodeJS.ErrnoException).code === "EADDRINUSE" ? `Lasso Host is already running on port ${this.opts.proxyPort}.` : line(error) });
      });
      this.server.listen(this.opts.proxyPort, "127.0.0.1", () => {
        fs.writeFileSync(PID_FILE, String(process.pid), { encoding: "utf8" });
        this.log(`proxy listening on 127.0.0.1:${this.opts.proxyPort}`);
        if (!certificate.ok) return resolve({});
        this.secureServer.once("error", (error) => { this.log(`https proxy failed: ${line(error)}`); resolve({}); });
        this.secureServer.listen(this.opts.httpsPort, "127.0.0.1", () => {
          this.log(`https proxy listening on 127.0.0.1:${this.opts.httpsPort}`);
          resolve({});
        });
      });
    });
  }

  async stop(): Promise<void> {
    for (const [, runtime] of this.running) runtime.child.kill("SIGTERM");
    this.running.clear();
    for (const proxy of this.proxies.values()) proxy.close();
    this.proxies.clear();
    this.server.close();
    this.secureServer.close();
    this.dnsHandle?.close();
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      // already gone
    }
  }

  resolverStatus() {
    return this.resolver.status();
  }
}

function line(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let host: LassoHost | null = null;

export function getHost(): LassoHost | null {
  return host;
}

export function startHost(opts: HostRuntimeOptions): Promise<{ error?: string }> {
  host = new LassoHost(opts);
  return host.start();
}

export function waitForShutdown(): void {
  const shutdown = () => {
    void host?.stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
