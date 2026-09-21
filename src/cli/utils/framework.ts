import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Framework = "vite" | "next" | "unknown";

export function detectFramework(cwd: string): Framework {
  const hasFile = (name: string) => existsSync(resolve(cwd, name));

  if (hasFile("next.config.js") || hasFile("next.config.ts") || hasFile("next.config.mjs")) {
    return "next";
  }

  if (hasFile("vite.config.ts") || hasFile("vite.config.js") || hasFile("vite.config.mjs")) {
    return "vite";
  }

  // Fallback: check package.json deps in case there's no config file
  // (e.g. a Vite project relying purely on defaults).
  const pkgPath = resolve(cwd, "package.json");

  if (hasFile("package.json")) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) return "next";
    if (deps.vite) return "vite";
  }

  return "unknown";
}
