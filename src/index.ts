// Platform (Multi-Tenant)
export {
  createPlatform,
  type Platform,
  type PlatformConfig,
} from "./platform/index.js";

// Workspace
export {
  createWorkspace,
  validateWorkspaceId,
  loadWorkspaceConfig,
  type Workspace,
  type WorkspaceConfig,
  type WorkspaceId,
  type WorkspaceRunOptions,
  type CreateWorkspaceOptions,
} from "./workspace/index.js";

// Agent Runtime (single-user, kept for backward compatibility)
export {
  createRuntime,
  type AgentRuntime,
  type AgentRunOptions,
  type AgentRunResult,
} from "./runtime/index.js";

export {
  createHookRunner,
  type HookRunner,
  type HookName,
  type HookHandler,
  type HookPayload,
  type BeforeAgentStartPayload,
  type AfterAgentEndPayload,
  type BeforeToolCallPayload,
  type AfterToolCallPayload,
  type SessionStartPayload,
  type SessionEndPayload,
} from "./hooks/index.js";

// Memory (OpenClaw)
export {
  createSimpleMemoryManager,
  type SimpleMemoryManager,
} from "./memory/index.js";
export {
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingProviderId,
  type CreateEmbeddingProviderOptions,
} from "./memory/embeddings.js";
export type {
  MemorySearchResult,
  MemorySearchManager,
} from "./memory/types.js";

// Sessions
export {
  loadSessionStore,
  saveSessionStore,
  getOrCreateSession,
  updateSession,
  type SessionEntry,
  type SessionStore,
} from "./sessions/index.js";

// Skills
export {
  loadWorkspaceSkills,
  type Skill,
  type SkillSnapshot,
  createSkillRegistry,
  type SkillRegistry,
  type SkillRegistryEntry,
  createSkillEnablement,
  type SkillEnablement,
} from "./skills/index.js";

// Credentials
export {
  createCredentialStore,
  createCredentialProxy,
  type CredentialStore,
  type CredentialProxy,
  type CredentialEntry,
  type CreateCredentialStoreOptions,
} from "./credentials/index.js";

// Sandbox
export {
  createSandboxManager,
  createIpcServer,
  createIpcClient,
  detectCapabilities,
  buildDefaultProfile,
  buildRestrictedProfile,
  type SandboxConfig,
  type SandboxCapabilities,
  type SandboxManager,
  type SandboxProcess,
  type SandboxSpawnOptions,
  type IpcServer,
  type IpcClient,
  type IpcMessage,
  type MountBind,
} from "./sandbox/index.js";

// Config
export {
  loadConfig,
  resolveStateDir,
  type AgentRuntimeConfig,
} from "./config/index.js";

// Re-export key types from the underlying SDK
export type {
  AgentSessionEvent,
  ToolDefinition,
  Skill as PiSkill,
} from "@mariozechner/pi-coding-agent";
