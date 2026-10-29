import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import chalk from "chalk";
import prompts from "prompts";
import { initProject, readProjectConfig, readProjectEnv, resolveCollabSession, LASSO_CONFIG_FILE } from "./project";
import { startViteServer } from "./server/vite";
import { startNextServer } from "./server/next";
import { startNuxtServer } from "./server/nuxt";
import { detectFramework } from "./utils/framework";
import { startBridge } from "./bridge";
import type { CreateOptions, CreateResult, Framework, PackageManager } from "../core/interfaces/data";
export type { Framework, PackageManager } from "../core/interfaces/data";

async function detectPackageManager(): Promise<PackageManager> {
  const hasCommand = (cmd: string) => {
    try {
      execSync(cmd, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  if (hasCommand("pnpm --version")) return "pnpm";
  if (hasCommand("yarn --version")) return "yarn";
  return "npm";
}

async function runCreateCommand(projectName: string, framework: Framework, typescript: boolean, packageManager: PackageManager, cwd: string): Promise<{ ok: boolean; error?: string; projectPath?: string }> {
  const projectPath = path.join(cwd, projectName);

  if (fs.existsSync(projectPath)) {
    return { ok: false, error: `Directory "${projectName}" already exists.` };
  }

  console.log(chalk.dim(`Creating ${chalk.cyan(projectName)} with ${chalk.cyan(framework)}...`));

  try {
    let command: string;
    let args: string[];

    if (framework === "next") {
      const tsFlag = typescript ? "--ts" : "--js";
      const pmFlag = packageManager === "pnpm" ? "--use-pnpm" : packageManager === "yarn" ? "--use-yarn" : "--use-npm";
      command = "npx";
      args = ["create-next-app@latest", projectName, tsFlag, "--tailwind", "--eslint", "--app", "--src-dir", "--import-alias", "@/*", "--no-git", pmFlag];
    } else if (framework === "nuxt") {
      command = "npm";
      args = ["create", "nuxt@latest", projectName, "--packageManager", packageManager, "--no-install", "--no-modules"];
    } else if (framework === "react") {
      command = "npm";
      args = ["create", "vite@latest", projectName, "--", "--template", typescript ? "react-ts" : "react"];
    } else if (framework === "vue") {
      command = "npx";
      args = ["create-vue@latest", projectName, ...(typescript ? ["--typescript"] : []), "--no-git", "--no-install"];
    } else if (framework === "svelte") {
      command = "npx";
      args = ["create-svelte@latest", projectName, ...(typescript ? ["--types", "typescript"] : ["--types", "checkjs"]), "--no-eslint", "--no-prettier", "--no-playwright", "--no-vitest", "--template", "skeleton"];
    } else if (framework === "solid") {
      command = "npx";
      args = ["degit", `solidjs/templates/${typescript ? "ts" : "js"}`, projectName];
    } else {
      return { ok: false, error: `Unsupported framework: ${framework}` };
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(command, args, { cwd, stdio: "inherit" });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Command exited with code ${code}`));
      });
    });

    if (framework === "vue" || framework === "svelte" || framework === "nuxt" || framework === "react") {
      console.log(chalk.dim(`Installing dependencies with ${chalk.cyan(packageManager)}...`));
      const installCommand = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm";
      const installArgs = packageManager === "pnpm" ? ["install"] : packageManager === "yarn" ? [] : ["install"];

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(installCommand, installArgs, { cwd: projectPath, stdio: "inherit" });
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Install command exited with code ${code}`));
        });
      });
    }

    return { ok: true, projectPath };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { ok: false, error: `Failed to create project: ${reason}` };
  }
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "darwin" ? [url] : process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: "ignore" });
  browser.once("error", (error) => console.warn(chalk.yellow("!") + ` Could not open a browser automatically: ${error.message}`));
  browser.unref();
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status !== 502 && response.status !== 503) return;
    } catch {
      // The framework server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The dev server did not become ready at ${url}.`);
}

async function startPromptSession(projectPath: string, prompt: string): Promise<void> {
  const framework = detectFramework(projectPath);
  if (framework === "unknown") {
    throw new Error("Lasso could not detect a supported Vite, Next.js, or Nuxt dev server for this project.");
  }

  const projectConfig = readProjectConfig(projectPath);
  const fileEnv = readProjectEnv(projectPath);
  const collabConfig = projectConfig?.id ? await resolveCollabSession(projectPath, fileEnv, projectConfig.id) : null;
  await startBridge(projectPath, collabConfig, undefined, prompt);

  let url: string;
  if (framework === "vite") {
    const server = await startViteServer(projectPath);
    const address = server.httpServer?.address();
    const port = address && typeof address === "object" ? (address as AddressInfo).port : 5173;
    url = `http://localhost:${port}`;
  } else if (framework === "next") {
    const { server } = await startNextServer(projectPath);
    const address = server.address();
    const port = address && typeof address === "object" ? (address as AddressInfo).port : 3000;
    url = `http://localhost:${port}`;
  } else {
    startNuxtServer(projectPath);
    url = "http://localhost:3000";
  }

  await waitForServer(url);
  console.log(chalk.green("✓") + ` Starting your initial Lasso session at ${chalk.cyan(url)}`);
  openBrowser(url);
}

export async function createProject(options: CreateOptions): Promise<CreateResult> {
  const cwd = process.cwd();

  let { name, framework, typescript, packageManager } = options;

  if (!name) {
    const response = await prompts({
      type: "text",
      name: "name",
      message: "Project name:",
      initial: "my-app",
      validate: (value: string) => {
        if (!value.trim()) return "Project name is required";
        if (!/^[a-z0-9-]+$/.test(value)) return "Project name must contain only lowercase letters, numbers, and hyphens";
        return true;
      },
    });
    name = response.name;
  }

  if (!name) {
    return { ok: false, error: "Project name is required" };
  }

  if (!framework) {
    const response = await prompts({
      type: "select",
      name: "framework",
      message: "Choose a framework:",
      choices: [
        { title: "Next.js", value: "next" },
        { title: "Nuxt", value: "nuxt" },
        { title: "React", value: "react" },
        { title: "Vue", value: "vue" },
        { title: "Svelte", value: "svelte" },
        { title: "Solid", value: "solid" },
      ],
    });
    framework = response.framework as Framework;
  }

  if (!framework) {
    return { ok: false, error: "Framework selection is required" };
  }

  if (typescript === undefined) {
    const response = await prompts({
      type: "select",
      name: "typescript",
      message: "Use TypeScript?",
      choices: [
        { title: "Yes", value: true },
        { title: "No", value: false },
      ],
    });
    typescript = response.typescript;
  }

  if (typescript === undefined) {
    typescript = true;
  }

  if (!packageManager) {
    const detected = await detectPackageManager();
    const choices = [
      { title: "pnpm", value: "pnpm" },
      { title: "npm", value: "npm" },
      { title: "yarn", value: "yarn" },
    ];
    const response = await prompts({
      type: "select",
      name: "packageManager",
      message: "Package manager:",
      choices,
      initial: Math.max(
        0,
        choices.findIndex((c) => c.value === detected)
      ),
    });
    packageManager = response.packageManager as PackageManager;
  }

  if (!packageManager) {
    packageManager = "npm";
  }

  const createResult = await runCreateCommand(name, framework, typescript, packageManager, cwd);

  if (!createResult.ok) {
    return createResult;
  }

  const projectPath = createResult.projectPath!;

  console.log(chalk.green("✓") + " Created application");

  console.log(chalk.green("✓") + " Installed dependencies");

  const fileEnv = readProjectEnv(projectPath);
  const initResult = await initProject(projectPath, fileEnv);

  if (!initResult.ok) {
    console.error(chalk.yellow("!") + ` Could not initialize Lasso: ${initResult.error}`);
    console.log(chalk.dim(`Run ${chalk.cyan("lasso init")} in the project directory to complete setup.`));
    return { ok: true, projectPath };
  }

  console.log(chalk.green("✓") + " Connected Lasso");
  console.log(chalk.green("✓") + " Registered project");

  // Ask if user wants to describe their app for one-shot building
  if (!options.prompt) {
    const describeResponse = await prompts({
      type: "select",
      name: "describe",
      message: "Do you want to describe your app for Lasso to build initial features?",
      choices: [
        { title: "Yes, describe my app", value: true },
        { title: "No, I'll start from scratch", value: false },
      ],
    });

    if (describeResponse.describe) {
      const promptResponse = await prompts({
        type: "text",
        name: "appPrompt",
        message: "Describe what you're building (e.g., A SaaS dashboard for managing customer invoices with billing and analytics):",
        validate: (value: string) => {
          if (!value.trim()) return "Please describe your app";
          return true;
        },
      });

      if (promptResponse.appPrompt) {
        options.prompt = promptResponse.appPrompt;
      }
    }
  }

  if (options.prompt) {
    console.log("");
    console.log(chalk.dim(`✦ Starting an initial Lasso session: ${chalk.cyan(options.prompt)}`));
    try {
      await startPromptSession(projectPath, options.prompt);
      return { ok: true, projectPath };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      return { ok: false, projectPath, error: `Project created, but the initial Lasso session could not start: ${reason}` };
    }
  }

  console.log("");
  console.log(chalk.bold("Your app is ready!"));
  console.log("");
  console.log(chalk.dim(`Next steps:`));
  console.log(chalk.dim(`  cd ${chalk.cyan(name)}`));
  console.log(chalk.dim(`  ${chalk.cyan("lasso dev")}`));
  console.log("");
  console.log(chalk.dim(`Your app will be available at ${chalk.cyan("http://localhost:3000")}`));

  return { ok: true, projectPath };
}
