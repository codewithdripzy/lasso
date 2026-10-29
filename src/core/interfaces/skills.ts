export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "project" | "user";
}

export interface SkillDocument extends SkillCatalogEntry {
  path: string;
  content: string;
}
