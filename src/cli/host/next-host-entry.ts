import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import httpProxy from "http-proxy";
import { startBridge } from "../bridge";

const [cwd, publicPortArg, bridgePortArg] = process.argv.slice(2);
const publicPort = Number(publicPortArg) || 3000;
const bridgePort = Number(bridgePortArg) || 3056;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate Next.js port."));
      socket.close(() => resolve(address.port));
    });
  });
}

function waitForNext(nextPort: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get({
        hostname: "127.0.0.1",
        port: nextPort,
        path: "/",
        headers: { connection: "close" },
      }, (response) => {
        response.resume();
        response.once("end", resolve);
      });

      request.once("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Next.js did not become ready on port ${nextPort} within ${timeoutMs / 1000}s.`));
          return;
        }
        setTimeout(check, 250);
      });
    };

    check();
  });
}

void (async () => {
  const nextPort = await freePort();
  const nextBin = path.join(cwd, "node_modules", ".bin", "next");
  if (!fs.existsSync(nextBin)) throw new Error("Next.js is not installed in this project.");

  const bridge = startBridge(cwd, null, bridgePort);
  const nextProcess = spawn(nextBin, ["dev", "--port", String(nextPort), "--hostname", "127.0.0.1"], {
    cwd,
    env: { ...process.env, PORT: String(nextPort) },
    stdio: "inherit",
  });
  const proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${nextPort}`, selfHandleResponse: true, ws: true });
  const bundlePath = path.resolve(__dirname, "../../overlay.js");

  proxy.on("proxyRes", (proxyRes, _req, res) => {
    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk as Buffer));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const contentType = String(proxyRes.headers["content-type"] || "");
      const headers = { ...proxyRes.headers };
      delete headers["content-length"];
      res.writeHead(proxyRes.statusCode || 200, headers);
      res.end(contentType.includes("text/html")
        ? body.replace("</head>", `<script src="/__lasso/overlay.js?bridgePort=${bridgePort}"></script></head>`)
        : body);
    });
  });

  const server = http.createServer((req, res) => {
    if (req.url?.split("?", 1)[0] === "/__lasso/overlay.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(fs.readFileSync(bundlePath, "utf8"));
      return;
    }
    proxy.web(req, res, {}, (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`Next.js is still starting: ${error.message}`);
      }
    });
  });

  server.on("upgrade", (req, socket, head) => proxy.ws(req, socket, head));

  try {
    await waitForNext(nextPort);
  } catch (error) {
    bridge.close();
    nextProcess.kill("SIGTERM");
    throw error;
  }

  server.listen(publicPort, "127.0.0.1");

  const shutdown = () => {
    bridge.close();
    nextProcess.kill("SIGTERM");
    proxy.close();
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  nextProcess.once("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
})();
