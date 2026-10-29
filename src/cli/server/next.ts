import chalk from "chalk";
import http from "node:http";
import httpProxy from "http-proxy";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

const PUBLIC_PORT = 3000; // what the user opens in the browser
const INTERNAL_PORT = 3055; // where the real `next dev` actually runs

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
  // 1. Spawn the user's own Next dev server on an internal port
  const nextBin = resolve(cwd, "node_modules/.bin/next");

  const nextProcess = spawn(nextBin, ["dev", "--port", String(INTERNAL_PORT)], {
    cwd,
    stdio: "inherit",
  });

  // 2. Proxy pointing at that internal port
  const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${INTERNAL_PORT}`,
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
        res.end(body.toString("utf-8").replace("</head>", `<script src="/__lasso/overlay.js?bridgePort=3056"></script></head>`));
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
      res.end("Bad gateway — is the Next.js dev server still starting up?");
    });
  });

  // Forward WebSocket upgrades (Next's Fast Refresh) straight through —
  // without this, HMR breaks the moment it's sitting behind a proxy.
  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/__lasso/ws") return; // let attachBridge's own listener handle this one
    proxy.ws(req, socket, head);
  });

  server.listen(PUBLIC_PORT, () => {
    console.log(chalk.green("✓") + " Next.js dev server running with Lasso attached");
    console.log(`  ${chalk.cyan(`http://localhost:${PUBLIC_PORT}`)}`);
  });

  return { nextProcess, server };
}
