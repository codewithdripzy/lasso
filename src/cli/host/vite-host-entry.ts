import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [cwd, portArg] = process.argv.slice(2);
const port = Number(portArg) || 5173;

void (async () => {
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
  });

  await server.listen();
  process.on("SIGTERM", () => {
    void server.close().then(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    void server.close().then(() => process.exit(0));
  });
})();