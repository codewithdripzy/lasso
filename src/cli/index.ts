#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { startBridge } from "./bridge";
import { startViteServer } from "./server/vite"
import { startNextServer } from "./server/next";
import { detectFramework } from "./utils/framework";

const program = new Command();

program.name("lasso").description("Select UI in your running app, describe a change, AI edits the real source.").version("0.1.0");

// prettier-ignore
program.command("dev", { isDefault: true }).description("Start your dev server with the Lasso overlay attached").action(async () => {
    const cwd = process.cwd();
    const framework = detectFramework(cwd);

    startBridge(cwd);

    switch (framework) {
      case "vite":
        console.log(chalk.green("✓") + " Detected: Vite");
        await startViteServer(cwd);
        break;
      case "next":
        console.log(chalk.green("✓") + " Detected: Next.js");
        await startNextServer(cwd);
        break;
      default:
        console.log(chalk.yellow("!") + " Couldn't detect a supported framework (Vite or Next.js) in this directory.");
        process.exit(1);
    }
});

program.parse();
