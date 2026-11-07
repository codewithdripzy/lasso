import chalk from "chalk";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import readline from "node:readline";
import httpProxy from "http-proxy";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

const PREFERRED_PUBLIC_PORT = 3000; // what the user opens in the browser
const PREFERRED_INTERNAL_PORT = 3055; // where the real `next dev` actually runs

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`Could not find an available port near ${preferredPort}. Stop another development server and try again.`);
}

function forwardNextOutput(stream: NodeJS.ReadableStream, destination: NodeJS.WriteStream) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => {
    if (/^\s*-\s+(?:Local|Network):\s+/i.test(line)) return;
    destination.write(`${line}\n`);
  });
}

function getNetworkAddress(): string | undefined {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return undefined;
}

function injectOverlay(html: string): string {
  const script = '<script src="/__lasso/overlay.js?bridgePort=3056"></script>';
  // Next can stream HTML with different casing/attributes, so looking for the
  // literal string `</head>` is too brittle. Place the script in the head when
  // present; a script at the start of the document also works as a fallback.
  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, `${script}</head>`);
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => `${head}${script}`);
  return `${script}${html}`;
}

function serveOverlayBundle(res: ServerResponse, cwd: string) {
  // Try multiple possible paths for the overlay bundle
  const possiblePaths = [
    resolve(cwd, "node_modules/@lasso-ai/cli/dist/overlay.js"),
    resolve(cwd, "node_modules/lasso/dist/overlay.js"),
    resolve(__dirname, "../../overlay.js"), // When running from Lasso repo
  ];

  let bundlePath: string | undefined;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      bundlePath = path;
      break;
    }
  }

  if (!bundlePath) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Lasso overlay bundle not found. Make sure @lasso-ai/cli is installed.");
    return;
  }

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.end(readFileSync(bundlePath, "utf-8"));
}

export async function startNextServer(cwd: string): Promise<{ nextProcess: ChildProcess; server: http.Server }> {
  const internalPort = await findAvailablePort(PREFERRED_INTERNAL_PORT);
  const publicPort = await findAvailablePort(PREFERRED_PUBLIC_PORT);

  // 1. Spawn the user's own Next dev server on an internal port
  const nextBin = resolve(cwd, "node_modules/.bin", process.platform === "win32" ? "next.cmd" : "next");

  const nextProcess = spawn(nextBin, ["dev", "--port", String(internalPort)], {
    cwd,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (nextProcess.stdout) forwardNextOutput(nextProcess.stdout, process.stdout);
  if (nextProcess.stderr) forwardNextOutput(nextProcess.stderr, process.stderr);

  // 2. Proxy pointing at that internal port
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${internalPort}`,
    selfHandleResponse: true, // needed so we can rewrite HTML before it reaches the browser
    ws: true,
  });

  proxy.on("proxyRes", (proxyRes, req, res) => {
    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks);
      const contentType = proxyRes.headers["content-type"] || "";
      const headers = { ...proxyRes.headers };
      delete headers["content-length"];
      delete headers["content-encoding"];

      res.writeHead(proxyRes.statusCode || 200, headers);

      if (contentType.includes("text/html")) {
        res.end(injectOverlay(body.toString("utf-8")));
      } else {
        res.end(body);
      }
    });
  });

  // 3. Our own HTTP server: serve the real overlay bundle directly,
  //    proxy everything else through to Next
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.split("?", 1)[0] === "/__lasso/overlay.js") {
      serveOverlayBundle(res, cwd);
      return;
    }

    proxy.web(req, res, { headers: { "accept-encoding": "identity" } }, (err) => {
      console.error(chalk.red("Proxy error:"), err.message);
      res.writeHead(502);
      res.end("Connection error. The development server could not be reached. Please try again.");
    });
  });

  // Forward WebSocket upgrades (Next's Fast Refresh) straight through —
  // without this, HMR breaks the moment it's sitting behind a proxy.
  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/__lasso/ws") return; // let attachBridge's own listener handle this one
    proxy.ws(req, socket, head);
  });

  server.listen(publicPort, () => {
    console.log(chalk.green("✓") + " Next.js dev server running with Lasso attached");
    console.log(`- Local:         ${chalk.cyan(`http://localhost:${publicPort}`)}`);
    const networkAddress = getNetworkAddress();
    if (networkAddress) console.log(`- Network:       ${chalk.cyan(`http://${networkAddress}:${publicPort}`)}`);
  });

  return { nextProcess, server };
}
