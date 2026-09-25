import fs from "node:fs";
import path from "node:path";

const CONFIG_NAMES = ["next.config.ts", "next.config.js", "next.config.mjs", "next.config.cjs"];

export type NextConfigInjectionResult = {
  ok: boolean;
  changed: boolean;
  file?: string;
  reason?: string;
};

function configFile(directory: string): string | null {
  for (const name of CONFIG_NAMES) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Adds the Host domain without replacing existing Next.js configuration. */
export function ensureNextAllowedDevOrigin(directory: string, domain: string): NextConfigInjectionResult {
  const file = configFile(directory);
  if (!file) return { ok: false, changed: false, reason: "No next.config file was found." };

  const source = fs.readFileSync(file, "utf8");
  const quotedDomain = JSON.stringify(domain);
  const existingOrigin = new RegExp(`(?:["']${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"])`);
  if (existingOrigin.test(source)) return { ok: true, changed: false, file };

  const originsProperty = /(allowedDevOrigins\s*:\s*\[)([\s\S]*?)(\])/m;
  const propertyMatch = source.match(originsProperty);
  if (propertyMatch && propertyMatch.index !== undefined) {
    const current = propertyMatch[2].trim();
    const replacement = `${propertyMatch[1]}${current ? `${propertyMatch[2].trimEnd()}, ` : ""}${quotedDomain}${propertyMatch[3]}`;
    const nextSource = source.slice(0, propertyMatch.index) + replacement + source.slice(propertyMatch.index + propertyMatch[0].length);
    fs.writeFileSync(file, nextSource);
    return { ok: true, changed: true, file };
  }

  const objectStart = source.search(/(?:const\s+\w+(?:\s*:\s*[^=]+)?\s*=\s*|module\.exports\s*=\s*|export\s+default\s+)\{/m);
  if (objectStart < 0) {
    return { ok: false, changed: false, file, reason: "The Next config does not expose a plain configuration object." };
  }

  const brace = source.indexOf("{", objectStart);
  const insertion = `\n  allowedDevOrigins: [${quotedDomain}],`;
  fs.writeFileSync(file, source.slice(0, brace + 1) + insertion + source.slice(brace + 1));
  return { ok: true, changed: true, file };
}
