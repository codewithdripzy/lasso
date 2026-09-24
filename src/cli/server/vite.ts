import chalk from "chalk";
import path from "node:path";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { type ViteDevServer } from "vite";
import { createRequire } from "node:module";

// const PLACEHOLDER_OVERLAY_JS = `
// console.log("[lasso] overlay placeholder loaded");
// alert("Lasso overlay injected successfully!");
// `;

function lassoInjectPlugin(bridgePort = 3056) {
  return {
    name: "lasso-inject",
    transformIndexHtml(html: string) {
      return html.replace("</head>", `<script src="/__lasso/overlay.js?bridgePort=${bridgePort}"></script></head>`);
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/__lasso/overlay.js", (req, res) => {
        const bundlePath = resolve(process.cwd(), "node_modules/lasso/dist/overlay.js");
        res.setHeader("Content-Type", "application/javascript");
        res.end(readFileSync(bundlePath, "utf-8"));
      });
    }
  };
}

export async function startViteServer(cwd: string) {
  // Anchor resolution to the TARGET project, not Lasso's own file location —
  // works from a CJS-compiled file, unlike import.meta.url.
  const require = createRequire(path.join(cwd, "package.json"));

  // Still only used to FIND the path.
  const viteEntry = require.resolve("vite");

  // Still must LOAD via dynamic import — Vite ships ESM-only,
  // and require() can't load an ESM-only package regardless of
  // how correctly it resolved the path.
  const { createServer } = await import(pathToFileURL(viteEntry).href);

  const server = await createServer({
    root: cwd,
    server: { open: false },
    plugins: [lassoInjectPlugin()],
  });

  await server.listen();
  console.log(chalk.green("✓") + " Vite dev server running with Lasso attached");
  server.printUrls();

  return server;
}
