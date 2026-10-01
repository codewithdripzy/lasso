import fs from "node:fs";
import path from "node:path";
import { exec, execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import prompts from "prompts";
import { initProject, readProjectEnv, LASSO_CONFIG_FILE } from "./project";
import { startViteServer } from "./server/vite";
import { startNextServer } from "./server/next";

const execAsync = promisify(exec);

export type Framework = "next" | "react" | "vue" | "svelte" | "solid";
export type PackageManager = "pnpm" | "npm" | "yarn";

interface CreateOptions {
    name?: string;
    framework?: Framework;
    typescript?: boolean;
    packageManager?: PackageManager;
    prompt?: string;
}

interface CreateResult {
    ok: boolean;
    error?: string;
    projectPath?: string;
}

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

function getFrameworkCommand(framework: Framework, typescript: boolean, packageManager: PackageManager): string {
    const tsFlag = typescript ? "--typescript" : "--js";
    const baseCommands: Record<Framework, string> = {
        next: `npx create-next-app@latest`,
        react: `npx create-react-app@latest`,
        vue: `npx create-vite@latest`,
        svelte: `npx create-svelte@latest`,
        solid: `npx degit solidjs/templates/js`,
    };

    let command = baseCommands[framework];

    if (framework === "next") {
        command += ` ${tsFlag} --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git`;
    } else if (framework === "react") {
        command += ` ${typescript ? "--template typescript" : ""}`;
    } else if (framework === "vue") {
        command += ` ${typescript ? "--template vue-ts" : "--template vanilla"}`;
    } else if (framework === "svelte") {
        command += ` ${typescript ? "--template skeleton" : "--template skeleton"}`;
    }

    return command;
}

async function runCreateCommand(
    projectName: string,
    framework: Framework,
    typescript: boolean,
    packageManager: PackageManager,
    cwd: string
): Promise<{ ok: boolean; error?: string; projectPath?: string }> {
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
            command = "npx";
            args = ["create-next-app@latest", projectName, tsFlag, "--tailwind", "--eslint", "--app", "--src-dir", "--import-alias", "@/*", "--no-git"];
        } else if (framework === "react") {
            command = "npx";
            args = ["create-react-app@latest", projectName, ...(typescript ? ["--template", "typescript"] : [])];
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

        if (framework === "vue" || framework === "svelte") {
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
        const response = await prompts({
            type: "select",
            name: "packageManager",
            message: "Package manager:",
            choices: [
                { title: "pnpm", value: "pnpm" },
                { title: "npm", value: "npm" },
                { title: "yarn", value: "yarn" },
            ],
            initial: detected,
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
        console.log(chalk.dim(`✦ Lasso will build: ${chalk.cyan(options.prompt)}`));
        console.log(chalk.dim(`  Open your app and press ${chalk.cyan("⌘K")} to track progress.`));
    }

    console.log("");
    console.log(chalk.bold("Your app is ready!"));
    console.log("");
    console.log(chalk.dim(`Next steps:`));
    console.log(chalk.dim(`  cd ${chalk.cyan(name)}`));
    console.log(chalk.dim(`  ${chalk.cyan("lasso dev")}`));
    if (options.prompt) {
        console.log(chalk.dim(`  Then use ${chalk.cyan("⌘K")} to trigger one-shot mode`));
    }
    console.log("");
    console.log(chalk.dim(`Your app will be available at ${chalk.cyan("http://localhost:3000")}`));

    return { ok: true, projectPath };
}
