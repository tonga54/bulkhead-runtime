import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface AgentRuntimeConfig {
  model?: string;
  provider?: string;
  apiKey?: string;
  stateDir?: string;
  workspaceDir?: string;
  systemPrompt?: string;
  skills?: { enabled?: boolean; dirs?: string[] };
  memory?: {
    enabled?: boolean;
    dir?: string;
    embeddingProvider?: {
      provider: "openai" | "gemini" | "voyage" | "mistral" | "ollama";
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };
  };
  hooks?: { dirs?: string[] };
}

export function getDefaultStateDir(): string {
  return path.join(os.homedir(), ".bulkhead-runtime");
}

export function loadConfig(configPath?: string): AgentRuntimeConfig {
  const resolved =
    configPath ??
    process.env["BULKHEAD_CONFIG_PATH"] ??
    path.join(getDefaultStateDir(), "bulkhead-runtime.json");

  try {
    const raw = fs.readFileSync(resolved, "utf-8");
    return JSON.parse(raw) as AgentRuntimeConfig;
  } catch {
    return {};
  }
}

export function resolveStateDir(config: AgentRuntimeConfig): string {
  return (
    config.stateDir ??
    process.env["BULKHEAD_STATE_DIR"] ??
    getDefaultStateDir()
  );
}
