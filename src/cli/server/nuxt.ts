import chalk from "chalk";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const PUBLIC_PORT = 3000;
const BRIDGE_PORT = 3056;

export function startNuxtServer(cwd: string): ChildProcess {
  const entry = path.resolve(__dirname, "../host/nuxt-host-entry.js");
  const child = spawn(process.execPath, [entry, cwd, String(PUBLIC_PORT), String(BRIDGE_PORT), "external-bridge"], {
    cwd,
    stdio: "inherit",
  });
  child.once("spawn", () => {
    console.log(chalk.green("✓") + " Nuxt dev server starting with Lasso attached");
    console.log(`  ${chalk.cyan(`http://localhost:${PUBLIC_PORT}`)}`);
  });
  child.once("error", (error) => console.error(chalk.red("Nuxt startup failed:"), error.message));
  return child;
}
