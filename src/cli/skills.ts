import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { SkillCatalogEntry, SkillDocument } from "../core/interfaces/skills";

const MAX_SKILL_BYTES = 64 * 1024;
const SKILL_ROOTS = ["skills", ".agents/skills", ".claude/skills", ".codex/skills", ".cursor/skills"];
const USER_SKILLS_ROOT = path.join(os.homedir(), ".lasso", "skills");
const BUILTIN_SKILL_PATH = path.resolve(__dirname, "../../skills/ui-design-craft/SKILL.md");
const BUILTIN_UI_SKILL_ID = crypto
  .createHash("sha1")
  .update(`builtin:${path.resolve(BUILTIN_SKILL_PATH)}`)
  .digest("hex")
  .slice(0, 16);

function parseSkill(filePath: string, source: SkillDocument["source"]): SkillDocument | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return null;
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) return null;
    const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const name = frontmatter?.[1].match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() || path.basename(path.dirname(filePath));
    const description =
      frontmatter?.[1].match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ||
      content
        .replace(/^---[\s\S]*?---\s*/, "")
        .split("\n")
        .find((line) => line.trim())
        ?.replace(/^#+\s*/, "") ||
      "Project instructions";
    const relative = path.relative(process.cwd(), filePath);
    const id = crypto
      .createHash("sha1")
      .update(`${source}:${path.resolve(filePath)}`)
      .digest("hex")
      .slice(0, 16);
    return { id, name: name.slice(0, 100), description: description.slice(0, 240), source, path: relative, content };
  } catch {
    return null;
  }
}

function walkSkills(root: string, source: SkillDocument["source"], depth = 0): SkillDocument[] {
  if (depth > 4 || !fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: SkillDocument[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
      const skill = parseSkill(entryPath, source);
      if (skill) found.push(skill);
    } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
      found.push(...walkSkills(entryPath, source, depth + 1));
    }
  }
  return found;
}

export function discoverSkills(projectPath: string): SkillDocument[] {
  const builtinSkill = parseSkill(BUILTIN_SKILL_PATH, "builtin");
  const skills = [...(builtinSkill ? [builtinSkill] : []), ...SKILL_ROOTS.flatMap((root) => walkSkills(path.join(projectPath, root), "project")), ...walkSkills(USER_SKILLS_ROOT, "user")];
  const seen = new Set<string>();
  return skills.filter((skill) => {
    if (seen.has(skill.id)) return false;
    seen.add(skill.id);
    return true;
  });
}

export function saveUploadedSkill(name: string, content: string): void {
  const safeName = name
    .trim()
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!safeName) throw new Error("Choose a valid skill name.");
  if (typeof content !== "string" || !content.trim() || Buffer.byteLength(content, "utf8") > MAX_SKILL_BYTES) {
    throw new Error("Skill files must contain text and be no larger than 64 KB.");
  }
  const skillDir = path.join(USER_SKILLS_ROOT, safeName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content.trim() + "\n", { encoding: "utf8", mode: 0o600 });
}

export function toSkillCatalog(skills: SkillDocument[]): SkillCatalogEntry[] {
  return skills.map(({ id, name, description, source }) => ({ id, name, description, source }));
}

function isUiDesignTask(prompt: string): boolean {
  return /\b(ui|ux|frontend|front[- ]end|web page|webpage|screen|dashboard|layout|component|design system|visual design|interface|css|style|styling|tailwind|responsive|button|modal|dialog|form|navigation|navbar|sidebar|hero section|card|typography|spacing|color|theme|make it look|looks? (?:better|weird|off|wrong|bad)|visually)\b/i.test(
    prompt
  );
}

export function selectedSkillInstructions(projectPath: string, ids: unknown, prompt = "", hasSelection = false): Array<Pick<SkillDocument, "name" | "description" | "content">> {
  const selected = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  const includeUiSkill = hasSelection || isUiDesignTask(prompt) || selected.has(BUILTIN_UI_SKILL_ID);
  return discoverSkills(projectPath)
    .filter((skill) => (skill.source === "builtin" ? includeUiSkill : selected.has(skill.id)))
    .map(({ name, description, content }) => ({ name, description, content }));
}
