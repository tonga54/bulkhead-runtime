import {
  createAgentSession,
  SessionManager,
  codingTools,
  type AgentSessionEvent,
  type AgentSessionEventListener,
  type CreateAgentSessionOptions,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { createHookRunner, type HookRunner } from "../hooks/index.js";
import { createSimpleMemoryManager, type SimpleMemoryManager } from "../memory/index.js";
import { createEmbeddingProvider } from "../memory/embeddings.js";
import {
  getOrCreateSession,
  updateSession,
} from "../sessions/index.js";
import { loadWorkspaceSkills, type SkillSnapshot } from "../skills/index.js";
import {
  loadConfig,
  resolveStateDir,
  type AgentRuntimeConfig,
} from "../config/index.js";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  LINUX_REQUIRED_MESSAGE,
  buildProviderEnvKey,
  resolveSessionManager,
  extractAssistantResponse,
} from "../shared/index.js";
import { createMemoryTools } from "./memory-tools.js";
import * as path from "node:path";
import * as fs from "node:fs";

export interface AgentRunOptions {
  message: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  workspaceDir?: string;
  systemPrompt?: string;
  configPath?: string;
  tools?: ToolDefinition[];
  onEvent?: AgentSessionEventListener;
}

export interface AgentRunResult {
  response: string;
  sessionId: string;
}

export interface AgentRuntime {
  run(options: AgentRunOptions): Promise<AgentRunResult>;
  hooks: HookRunner;
  memory: SimpleMemoryManager;
  config: AgentRuntimeConfig;
}

function assertLinux(): void {
  if (process.platform !== "linux") {
    throw new Error(LINUX_REQUIRED_MESSAGE);
  }
}

export async function createRuntime(
  overrides?: Partial<AgentRuntimeConfig>,
): Promise<AgentRuntime> {
  assertLinux();
  const fileConfig = loadConfig(overrides?.stateDir);
  const config: AgentRuntimeConfig = { ...fileConfig, ...overrides };
  const stateDir = resolveStateDir(config);
  const hooks = createHookRunner();
  const memoryDir = config.memory?.dir ?? path.join(stateDir, "memory");

  // Create embedding provider from config if available
  const embeddingProvider = config.memory?.embeddingProvider
    ? createEmbeddingProvider(config.memory.embeddingProvider)
    : undefined;
  const memory = createSimpleMemoryManager({ dbDir: memoryDir, embeddingProvider });

  fs.mkdirSync(stateDir, { recursive: true });

  async function run(options: AgentRunOptions): Promise<AgentRunResult> {
    const sessionId = options.sessionId ?? `session_${Date.now()}`;
    const modelId = options.model ?? config.model ?? DEFAULT_MODEL;
    const provider =
      (options.provider ?? config.provider ?? DEFAULT_PROVIDER) as Parameters<
        typeof getModel
      >[0];
    const envKey = buildProviderEnvKey(provider);
    const apiKey =
      options.apiKey ?? config.apiKey ?? process.env[envKey] ?? "";
    const workspaceDir =
      options.workspaceDir ?? config.workspaceDir ?? process.cwd();

    const sessionsDir = path.join(stateDir, "sessions", sessionId);
    fs.mkdirSync(sessionsDir, { recursive: true });

    await getOrCreateSession(stateDir, sessionId, { model: modelId });

    await hooks.run("session_start", { sessionId });
    await hooks.run("before_agent_start", {
      sessionId,
      message: options.message,
      model: modelId,
    });

    let skillsPrompt = "";
    if (config.skills?.enabled !== false) {
      try {
        const snapshot: SkillSnapshot = loadWorkspaceSkills(workspaceDir);
        skillsPrompt = snapshot.promptText;
      } catch {
        // skills loading is optional
      }
    }

    const systemPrompt = [
      options.systemPrompt ?? config.systemPrompt ?? "",
      skillsPrompt,
    ]
      .filter(Boolean)
      .join("\n\n");

    const model = getModel(provider, modelId as never);

    const previousEnvValue = process.env[envKey];
    if (apiKey) {
      process.env[envKey] = apiKey;
    }

    try {
      const sessionManager = resolveSessionManager(
        SessionManager, workspaceDir, sessionsDir,
      );

      const memoryTools = config.memory?.enabled !== false
        ? createMemoryTools(memory) as unknown as ToolDefinition[]
        : [];

      const sessionOpts: CreateAgentSessionOptions = {
        cwd: workspaceDir,
        model,
        tools: [...codingTools],
        customTools: [...memoryTools, ...(options.tools ?? [])],
        sessionManager,
      };

      const { session } = await createAgentSession(sessionOpts);

      const pendingToolArgs = new Map<string, Record<string, unknown>>();
      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        options.onEvent?.(event);
        if (event.type === "tool_execution_start") {
          pendingToolArgs.set(event.toolCallId, (event.args as Record<string, unknown>) ?? {});
          hooks.run("before_tool_call", {
            toolName: event.toolName,
            input: (event.args as Record<string, unknown>) ?? {},
          }).catch(() => {});
        }
        if (event.type === "tool_execution_end") {
          const input = pendingToolArgs.get(event.toolCallId) ?? {};
          pendingToolArgs.delete(event.toolCallId);
          hooks.run("after_tool_call", {
            toolName: event.toolName,
            input,
            result: event.result,
          }).catch(() => {});
        }
      });

      try {
        await session.sendUserMessage(options.message);
      } finally {
        unsubscribe();
      }

      const responseText = extractAssistantResponse(session.messages);

      await hooks.run("after_agent_end", {
        sessionId,
        result: responseText,
      });
      await hooks.run("session_end", { sessionId });

      await updateSession(stateDir, sessionId, { model: modelId });

      return { response: responseText, sessionId };
    } finally {
      if (previousEnvValue === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = previousEnvValue;
      }
    }
  }

  return { run, hooks, memory, config };
}
