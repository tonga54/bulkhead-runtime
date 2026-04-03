import {
  loadSkillsFromDir,
  formatSkillsForPrompt,
  type Skill,
} from "@mariozechner/pi-coding-agent";

export { type Skill };

export interface SkillSnapshot {
  skills: Skill[];
  promptText: string;
}

export function loadWorkspaceSkills(workspaceDir: string): SkillSnapshot {
  const result = loadSkillsFromDir({ dir: workspaceDir, source: "workspace" });
  const skills = result.skills ?? [];
  const promptText = formatSkillsForPrompt(skills);
  return { skills, promptText };
}
