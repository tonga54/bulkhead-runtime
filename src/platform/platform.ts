import * as fs from "node:fs";
import * as path from "node:path";
import type { Platform, PlatformConfig } from "./types.js";
import type { WorkspaceConfig } from "../workspace/types.js";
import {
  createWorkspace,
  validateWorkspaceId,
  loadWorkspaceConfig,
} from "../workspace/workspace.js";
import { createSkillRegistry } from "../skills/registry.js";

const PLATFORM_SENSITIVE_PATHS = new Set([
  "/", "/root", "/proc", "/sys", "/dev", "/boot", "/run",
  "/tmp", "/var", "/etc", "/bin", "/sbin", "/usr", "/lib",
]);

export function createPlatform(config: PlatformConfig): Platform {
  const { stateDir } = config;
  const resolvedStateDir = path.resolve(stateDir);
  if (PLATFORM_SENSITIVE_PATHS.has(resolvedStateDir)) {
    throw new Error(`stateDir "${stateDir}" references a sensitive system path`);
  }
  const skillsDir = config.skillsDir ?? path.join(stateDir, "skills");
  const workspacesDir = path.join(stateDir, "workspaces");

  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(skillsDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(workspacesDir, { recursive: true, mode: 0o700 });

  const skills = createSkillRegistry(skillsDir);

  return {
    stateDir,
    skills,

    async createWorkspace(userId, wsConfig) {
      validateWorkspaceId(userId);
      const wsDir = path.join(workspacesDir, userId);
      try {
        fs.mkdirSync(wsDir, { mode: 0o700 });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(`Workspace "${userId}" already exists`);
        }
        throw err;
      }

      const mergedConfig: WorkspaceConfig = {
        credentialPassphrase: config.credentialPassphrase,
        ...wsConfig,
      };
      return createWorkspace({
        userId,
        stateDir,
        config: mergedConfig,
        skillRegistry: skills,
      });
    },

    async getWorkspace(userId) {
      validateWorkspaceId(userId);
      const wsDir = path.join(workspacesDir, userId);
      if (!fs.existsSync(wsDir)) {
        throw new Error(`Workspace "${userId}" does not exist`);
      }

      const wsConfig = loadWorkspaceConfig(wsDir);
      if (!wsConfig.credentialPassphrase && config.credentialPassphrase) {
        wsConfig.credentialPassphrase = config.credentialPassphrase;
      }
      return createWorkspace({
        userId,
        stateDir,
        config: wsConfig,
        skillRegistry: skills,
      });
    },

    async listWorkspaces() {
      try {
        const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
        return entries
          .filter((e) => e.isDirectory())
          .filter((e) => fs.existsSync(path.join(workspacesDir, e.name, "config.json")))
          .map((e) => e.name);
      } catch {
        return [];
      }
    },

    async deleteWorkspace(userId) {
      validateWorkspaceId(userId);
      const wsDir = path.join(workspacesDir, userId);
      if (!fs.existsSync(wsDir)) {
        throw new Error(`Workspace "${userId}" does not exist`);
      }
      fs.rmSync(wsDir, { recursive: true, force: true });
    },

    async workspaceExists(userId) {
      validateWorkspaceId(userId);
      const wsDir = path.join(workspacesDir, userId);
      return fs.existsSync(wsDir);
    },
  };
}
