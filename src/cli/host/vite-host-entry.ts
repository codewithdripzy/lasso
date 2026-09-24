import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { startBridge } from "../bridge";

const [cwd, portArg, bridgePortArg] = process.argv.slice(2);
const port = Number(portArg) || 5173;
const bridgePort = Number(bridgePortArg) || 3056;

function lassoOverlayPlugin() {
  const bundlePath = path.resolve(__dirname, "../../overlay.js");
  return {
    name: "lasso-inject",
    transformIndexHtml(html: string) {
      return html.replace("</head>", `<script src="/__lasso/overlay.js?bridgePort=${bridgePort}"></script></head>`);
    },
    configureServer(server: any) {
      server.middlewares.use("/__lasso/overlay.js", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(fs.readFileSync(bundlePath, "utf8"));
      });
    },
  };
}

void (async () => {
  const bridge = startBridge(cwd, null, bridgePort);
  const require = createRequire(path.join(cwd, "package.json"));
  const viteEntry = require.resolve("vite");
  const { createServer } = await import(pathToFileURL(viteEntry).href);

  const server = await createServer({
    root: cwd,
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      allowedHosts: [
        ".lasso",
        "lasso",
        "localhost",
        "127.0.0.1",
        ...(process.env.LASSO_HOST_ALLOWED_HOSTS ? process.env.LASSO_HOST_ALLOWED_HOSTS.split(",") : []),
      ],
    },
    plugins: [lassoOverlayPlugin()],
  });

  await server.listen();
  process.on("SIGTERM", () => {
    bridge.close();
    void server.close().then(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    bridge.close();
    void server.close().then(() => process.exit(0));
  });
})();
