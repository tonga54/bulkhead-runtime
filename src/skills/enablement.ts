import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillRegistry, SkillRegistryEntry } from "./registry.js";
import { atomicWriteFileSync } from "../shared/index.js";

export interface SkillEnablement {
  enable(skillId: string): boolean;
  disable(skillId: string): boolean;
  isEnabled(skillId: string): boolean;
  listEnabled(): SkillRegistryEntry[];
  listEnabledIds(): string[];
}

interface EnablementState {
  enabledSkills: string[];
}

export function createSkillEnablement(
  workspaceDir: string,
  registry: SkillRegistry,
): SkillEnablement {
  const filePath = path.join(workspaceDir, "enabled-skills.json");

  function loadState(): EnablementState {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as EnablementState;
    } catch {
      return { enabledSkills: [] };
    }
  }

  function saveState(state: EnablementState): void {
    atomicWriteFileSync(filePath, JSON.stringify(state, null, 2));
  }

  return {
    enable(skillId) {
      if (!registry.get(skillId)) return false;
      const state = loadState();
      if (state.enabledSkills.includes(skillId)) return true;
      state.enabledSkills.push(skillId);
      saveState(state);
      return true;
    },

    disable(skillId) {
      const state = loadState();
      const idx = state.enabledSkills.indexOf(skillId);
      if (idx === -1) return false;
      state.enabledSkills.splice(idx, 1);
      saveState(state);
      return true;
    },

    isEnabled(skillId) {
      return loadState().enabledSkills.includes(skillId);
    },

    listEnabled() {
      const state = loadState();
      return state.enabledSkills
        .map((id) => registry.get(id))
        .filter((e): e is SkillRegistryEntry => e !== undefined);
    },

    listEnabledIds() {
      return loadState().enabledSkills;
    },
  };
}
