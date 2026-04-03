import type { SimpleMemoryManager } from "../memory/index.js";
import type { HookRunner } from "../hooks/index.js";
import type { AgentRunOptions, AgentRunResult } from "../runtime/index.js";
import type { SkillEnablement } from "../skills/enablement.js";
import type { CredentialStore } from "../credentials/types.js";

export type WorkspaceId = string;

export interface WorkspaceConfig {
  model?: string;
  provider?: string;
  apiKey?: string;
  systemPrompt?: string;
  credentialPassphrase?: string;
  skills?: { enabled?: boolean };
  memory?: {
    enabled?: boolean;
    embeddingProvider?: {
      provider: "openai" | "gemini" | "voyage" | "mistral" | "ollama";
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };
  };
}

export interface Workspace {
  readonly userId: WorkspaceId;
  readonly stateDir: string;
  readonly memory: SimpleMemoryManager;
  readonly hooks: HookRunner;
  readonly skills: SkillEnablement;
  readonly credentials: CredentialStore;

  run(options: WorkspaceRunOptions): Promise<AgentRunResult>;
  destroy(): Promise<void>;
}

export type WorkspaceRunOptions = Omit<AgentRunOptions, "configPath">;
