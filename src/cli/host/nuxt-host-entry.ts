import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import httpProxy from "http-proxy";
import { startBridge } from "../bridge";

const [cwd, publicPortArg, bridgePortArg, bridgeAlreadyRunningArg] = process.argv.slice(2);
const publicPort = Number(publicPortArg) || 3000;
const bridgePort = Number(bridgePortArg) || 3056;
const bridgeAlreadyRunning = bridgeAlreadyRunningArg === "external-bridge";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate Nuxt port."));
      socket.close(() => resolve(address.port));
    });
  });
}

function waitForNuxt(port: number, child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error(`Nuxt did not become ready on port ${port} within 60 seconds.`)), 60_000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onExit = (code: number | null) => finish(new Error(`Nuxt exited before becoming ready${code === null ? "" : ` with code ${code}`}.`));
    child.once("exit", onExit);

    const check = () => {
      if (settled) return;
      const request = http.get({ hostname: "127.0.0.1", port, path: "/", headers: { connection: "close" } }, (response) => {
        response.resume();
        response.once("end", () => finish());
      });
      request.setTimeout(1500, () => request.destroy());
      request.once("error", () => {
        if (!settled) setTimeout(check, 300);
      });
    };
    check();
  });
}

void (async () => {
  if (!bridgeAlreadyRunning) await startBridge(cwd, null, bridgePort);

  const nuxtPort = await freePort();
  const nuxtBin = path.join(cwd, "node_modules", ".bin", "nuxt");
  if (!fs.existsSync(nuxtBin)) throw new Error("Nuxt is not installed in this project. Run your package manager's install command.");

  const nuxt = spawn(nuxtBin, ["dev", "--port", String(nuxtPort), "--host", "127.0.0.1"], {
    cwd,
    env: { ...process.env, PORT: String(nuxtPort), NUXT_PORT: String(nuxtPort), NUXT_HOST: "127.0.0.1" },
    stdio: "inherit",
  });
  const proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${nuxtPort}`, changeOrigin: true, selfHandleResponse: true, ws: true });
  const bundlePath = path.resolve(__dirname, "../../overlay.js");

  proxy.on("proxyRes", (proxyRes, _req, res) => {
    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk as Buffer));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks);
      const contentType = String(proxyRes.headers["content-type"] || "");
      const headers = { ...proxyRes.headers };
      delete headers["content-length"];
      delete headers["content-encoding"];
      res.writeHead(proxyRes.statusCode || 200, headers);
      if (contentType.includes("text/html")) {
        res.end(body.toString("utf8").replace("</head>", `<script src="/__lasso/overlay.js?bridgePort=${bridgePort}"></script></head>`));
      } else {
        res.end(body);
      }
    });
  });

  const server = http.createServer((req, res) => {
    if (req.url?.split("?", 1)[0] === "/__lasso/overlay.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(fs.readFileSync(bundlePath, "utf8"));
      return;
    }
    proxy.web(req, res, { headers: { "accept-encoding": "identity" } }, (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`Nuxt is still starting: ${error.message}`);
      }
    });
  });
  server.on("upgrade", (req, socket, head) => proxy.ws(req, socket, head));

  try {
    await waitForNuxt(nuxtPort, nuxt);
  } catch (error) {
    nuxt.kill("SIGTERM");
    throw error;
  }

  server.listen(publicPort, "127.0.0.1");
  console.log(`[lasso] Nuxt with Lasso overlay is available at http://localhost:${publicPort}`);

  const shutdown = () => {
    nuxt.kill("SIGTERM");
    proxy.close();
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
})();
