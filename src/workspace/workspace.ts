import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Workspace,
  WorkspaceConfig,
  WorkspaceId,
  WorkspaceRunOptions,
} from "./types.js";
import type { AgentRunResult } from "../runtime/index.js";
import { createHookRunner } from "../hooks/index.js";
import { createSimpleMemoryManager } from "../memory/index.js";
import { createEmbeddingProvider } from "../memory/embeddings.js";
import { createSkillEnablement, type SkillEnablement } from "../skills/enablement.js";
import type { SkillRegistry } from "../skills/registry.js";
import { createCredentialStore } from "../credentials/store.js";
import type { CredentialStore } from "../credentials/types.js";
import { createWorkspaceRunner } from "./runner.js";
import { atomicWriteFileSync } from "../shared/index.js";

export interface CreateWorkspaceOptions {
  userId: WorkspaceId;
  stateDir: string;
  config: WorkspaceConfig;
  skillRegistry: SkillRegistry;
}

export function validateWorkspaceId(userId: string): void {
  if (!userId || typeof userId !== "string") {
    throw new Error("Workspace userId must be a non-empty string");
  }
  if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) {
    throw new Error(
      `Invalid workspace userId "${userId}": must not contain path traversal characters`,
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw new Error(
      `Invalid workspace userId "${userId}": must contain only alphanumeric characters, hyphens, and underscores`,
    );
  }
  if (userId.length > 128) {
    throw new Error(
      `Invalid workspace userId "${userId}": must be 128 characters or less`,
    );
  }
}

export async function createWorkspace(
  options: CreateWorkspaceOptions,
): Promise<Workspace> {
  const { userId, stateDir, config, skillRegistry } = options;
  validateWorkspaceId(userId);

  const workspaceDir = path.join(stateDir, "workspaces", userId);
  fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });

  const configPath = path.join(workspaceDir, "config.json");
  if (!fs.existsSync(configPath)) {
    const { credentialPassphrase: _cp, apiKey: _ak, ...persistableConfig } = config;
    if (persistableConfig.memory?.embeddingProvider?.apiKey) {
      const { apiKey: _epk, ...safeEp } = persistableConfig.memory.embeddingProvider;
      persistableConfig.memory = { ...persistableConfig.memory, embeddingProvider: safeEp as typeof persistableConfig.memory.embeddingProvider };
    }
    atomicWriteFileSync(configPath, JSON.stringify(persistableConfig, null, 2));
  }

  const hooks = createHookRunner();

  const memoryDir = path.join(workspaceDir, "memory");
  const embeddingProvider = config.memory?.embeddingProvider
    ? createEmbeddingProvider(config.memory.embeddingProvider)
    : undefined;
  const memory = createSimpleMemoryManager({
    dbDir: memoryDir,
    embeddingProvider,
  });

  const skills = createSkillEnablement(workspaceDir, skillRegistry);

  const credentials = createCredentialStore({
    workspaceDir,
    passphrase: config.credentialPassphrase,
  });

  const run = createWorkspaceRunner({
    userId,
    workspaceDir,
    config,
    hooks,
    memory,
    skills,
    skillRegistry,
    credentials,
  });

  return {
    userId,
    stateDir: workspaceDir,
    memory,
    hooks,
    skills,
    credentials,
    run: (opts: WorkspaceRunOptions): Promise<AgentRunResult> => run(opts),
    async destroy() {
      await memory.close();
    },
  };
}

export function loadWorkspaceConfig(workspaceDir: string): WorkspaceConfig {
  const configPath = path.join(workspaceDir, "config.json");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as WorkspaceConfig;
  } catch {
    return {};
  }
}
