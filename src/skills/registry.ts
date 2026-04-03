import {
  loadSkillsFromDir,
  formatSkillsForPrompt,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

export interface SkillRegistryEntry {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface SkillRegistry {
  list(): SkillRegistryEntry[];
  get(skillId: string): SkillRegistryEntry | undefined;
  register(skillPath: string): SkillRegistryEntry;
  unregister(skillId: string): boolean;
  loadSkills(skillIds?: string[]): { skills: Skill[]; promptText: string };
}

export function createSkillRegistry(skillsDir: string): SkillRegistry {
  fs.mkdirSync(skillsDir, { recursive: true });
  const entries = new Map<string, SkillRegistryEntry>();

  scanSkillsDir();

  function scanSkillsDir(): void {
    try {
      const dirs = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue;
        const skillPath = path.join(skillsDir, dirent.name);
        const skillMd = path.join(skillPath, "SKILL.md");
        if (!fs.existsSync(skillMd)) continue;

        const content = fs.readFileSync(skillMd, "utf-8");
        const name = extractSkillName(content, dirent.name);
        const description = extractSkillDescription(content);

        entries.set(dirent.name, {
          id: dirent.name,
          name,
          description,
          path: skillPath,
        });
      }
    } catch {
      // skills dir may not exist yet
    }
  }

  function extractSkillName(content: string, fallback: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() ?? fallback;
  }

  function extractSkillDescription(content: string): string {
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        return trimmed.slice(0, 200);
      }
    }
    return "";
  }

  return {
    list() {
      return Array.from(entries.values());
    },

    get(skillId) {
      return entries.get(skillId);
    },

    register(skillPath) {
      const id = path.basename(skillPath);
      const targetDir = path.join(skillsDir, id);

      if (skillPath !== targetDir) {
        fs.cpSync(skillPath, targetDir, { recursive: true });
      }

      const skillMd = path.join(targetDir, "SKILL.md");
      const content = fs.existsSync(skillMd)
        ? fs.readFileSync(skillMd, "utf-8")
        : "";
      const name = extractSkillName(content, id);
      const description = extractSkillDescription(content);

      const entry: SkillRegistryEntry = { id, name, description, path: targetDir };
      entries.set(id, entry);
      return entry;
    },

    unregister(skillId) {
      if (!entries.has(skillId)) return false;
      const entry = entries.get(skillId)!;
      try {
        fs.rmSync(entry.path, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      entries.delete(skillId);
      return true;
    },

    loadSkills(skillIds) {
      const dirsToLoad = skillIds
        ? skillIds
            .map((id) => entries.get(id))
            .filter((e): e is SkillRegistryEntry => e !== undefined)
            .map((e) => e.path)
        : Array.from(entries.values()).map((e) => e.path);

      const allSkills: Skill[] = [];
      for (const dir of dirsToLoad) {
        try {
          const result = loadSkillsFromDir({ dir, source: "platform" });
          if (result.skills) allSkills.push(...result.skills);
        } catch {
          // skip broken skills
        }
      }

      const promptText = formatSkillsForPrompt(allSkills);
      return { skills: allSkills, promptText };
    },
  };
}
