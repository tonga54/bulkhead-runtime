export interface HookPayload {
  [key: string]: unknown;
}

export type HookHandler<T extends HookPayload = HookPayload> = (
  payload: T,
) => void | Promise<void>;

export interface HookDefinition<T extends HookPayload = HookPayload> {
  name: string;
  handler: HookHandler<T>;
  priority?: number;
}

export interface BeforeAgentStartPayload extends HookPayload {
  sessionId: string;
  message: string;
  model: string;
}

export interface AfterAgentEndPayload extends HookPayload {
  sessionId: string;
  result: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface BeforeToolCallPayload extends HookPayload {
  toolName: string;
  input: Record<string, unknown>;
}

export interface AfterToolCallPayload extends HookPayload {
  toolName: string;
  input: Record<string, unknown>;
  result: unknown;
}

export interface SessionStartPayload extends HookPayload {
  sessionId: string;
}

export interface SessionEndPayload extends HookPayload {
  sessionId: string;
}

export type HookName =
  | "before_agent_start"
  | "after_agent_end"
  | "before_tool_call"
  | "after_tool_call"
  | "session_start"
  | "session_end";
