import * as fs from "node:fs";

interface SessionManagerFactory<T> {
  continueRecent(workspaceDir: string, sessionsDir: string): T;
  create(workspaceDir: string, sessionsDir: string): T;
}

export function resolveSessionManager<T>(
  SessionManager: SessionManagerFactory<T>,
  workspaceDir: string,
  sessionsDir: string,
): T {
  const hasExisting = (() => {
    try {
      return fs.readdirSync(sessionsDir).some((f) => f.endsWith(".jsonl"));
    } catch {
      return false;
    }
  })();

  if (hasExisting) {
    try {
      return SessionManager.continueRecent(workspaceDir, sessionsDir);
    } catch {
      return SessionManager.create(workspaceDir, sessionsDir);
    }
  }

  return SessionManager.create(workspaceDir, sessionsDir);
}

export function extractAssistantResponse(
  messages: readonly { role: string }[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role: string; content?: unknown };
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      return (msg.content as Array<{ type: string; text?: string }>)
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
    }
  }
  return "";
}
