import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Framework = "vite" | "next" | "nuxt" | "unknown";

export function detectFramework(cwd: string): Framework {
  const hasFile = (name: string) => existsSync(resolve(cwd, name));
  const pkgPath = resolve(cwd, "package.json");
  let deps: Record<string, string> = {};
  if (hasFile("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // Continue with config-file detection if package.json is malformed.
    }
  }

  if (deps.next || ["next.config.js", "next.config.ts", "next.config.mjs", "next.config.cjs", "next.config.mts"].some(hasFile)) {
    return "next";
  }

  if (deps.nuxt || ["nuxt.config.js", "nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.cjs", "nuxt.config.mts"].some(hasFile)) {
    return "nuxt";
  }

  if (deps.vite || ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs", "vite.config.mts"].some(hasFile)) {
    return "vite";
  }

  return "unknown";
}
