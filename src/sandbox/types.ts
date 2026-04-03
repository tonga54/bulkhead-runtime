export interface SandboxConfig {
  memoryLimitMb?: number;
  cpuWeight?: number;
  pidsLimit?: number;
  networkIsolation?: boolean;
  timeoutMs?: number;
  mountBinds?: MountBind[];
}

export interface MountBind {
  source: string;
  target: string;
  readonly: boolean;
}

export interface SandboxCapabilities {
  hasUserNamespace: boolean;
  hasPidNamespace: boolean;
  hasMountNamespace: boolean;
  hasNetNamespace: boolean;
  hasCgroupV2: boolean;
  hasSeccomp: boolean;
  hasUnshare: boolean;
  platform: "linux";
}

export interface SandboxProcess {
  pid: number;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(): void;
  waitForExit(): Promise<number>;
}

export interface SandboxManager {
  capabilities(): Promise<SandboxCapabilities>;
  spawn(options: SandboxSpawnOptions): Promise<SandboxProcess>;
}

export interface SandboxSpawnOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  config: SandboxConfig;
  /** Env keys to preserve after credential sanitization (e.g. the LLM provider API key) */
  protectedKeys?: string[];
  onStderr?: (data: string) => void;
}

export interface IpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: IpcError;
}

export interface IpcError {
  code: number;
  message: string;
  data?: unknown;
}

export const IPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
