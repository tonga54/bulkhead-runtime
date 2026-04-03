import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import { createIpcPeer } from "./ipc.js";
import { createProxyTools } from "./proxy-tools.js";
import {
  resolveSessionManager,
  extractAssistantResponse,
} from "../shared/index.js";

export interface WorkerConfig {
  workspaceDir: string;
  sessionsDir: string;
  sessionId: string;
  message: string;
  model: string;
  provider: string;
  systemPrompt?: string;
  enableCodingTools: boolean;
}

export async function startWorker(): Promise<void> {
  // Capture a direct reference to stdout.write BEFORE overriding, so the
  // IPC peer can still write JSON-RPC messages to the real stdout fd.
  const rawStdoutWrite = process.stdout.write.bind(process.stdout);
  const ipcOutputStream = new Writable({
    write(chunk, encoding, callback) {
      rawStdoutWrite(chunk, encoding as BufferEncoding, callback);
    },
  });

  // Redirect ALL stdout/console output to stderr so that libraries or SDK
  // code using process.stdout.write() directly can't corrupt the IPC channel.
  (process.stdout as { write: typeof process.stdout.write }).write = function (
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void,
  ): boolean {
    return (process.stderr.write as Function).call(
      process.stderr,
      chunk,
      encodingOrCallback as BufferEncoding,
      callback,
    );
  } as typeof process.stdout.write;

  const stderrWrite = (msg: string) => { process.stderr.write(msg + "\n"); };
  console.log = (...args: unknown[]) => stderrWrite(args.map(String).join(" "));
  console.info = console.log;
  console.warn = console.log;
  console.error = console.log;
  console.debug = console.log;

  const config = readWorkerConfig();
  if (!config) {
    process.exit(1);
  }

  const peer = createIpcPeer(process.stdin, ipcOutputStream);

  peer.handle("agent.run", async (params) => {
    const runParams = (params ?? {}) as Partial<WorkerConfig>;
    const message = runParams.message ?? config.message;
    const model = runParams.model ?? config.model;
    const provider = runParams.provider ?? config.provider;
    const systemPrompt = runParams.systemPrompt ?? config.systemPrompt;
    const sessionId = runParams.sessionId ?? config.sessionId;

    try {
      const {
        createAgentSession,
        SessionManager,
        codingTools,
      } = await import("@mariozechner/pi-coding-agent");
      const { getModel } = await import("@mariozechner/pi-ai");

      const resolvedModel = getModel(
        provider as Parameters<typeof getModel>[0],
        model as never,
      );

      fs.mkdirSync(config.sessionsDir, { recursive: true });
      const sessionManager = resolveSessionManager(
        SessionManager, config.workspaceDir, config.sessionsDir,
      );

      const proxyTools = createProxyTools(peer);

      const tools = config.enableCodingTools
        ? [...codingTools]
        : [];

      const { session } = await createAgentSession({
        cwd: config.workspaceDir,
        model: resolvedModel,
        tools,
        customTools: proxyTools as unknown as import("@mariozechner/pi-coding-agent").ToolDefinition[],
        sessionManager,
      });

      const pendingToolArgs = new Map<string, Record<string, unknown>>();
      const unsubscribe = session.subscribe((event) => {
        if (event.type === "tool_execution_start") {
          pendingToolArgs.set(event.toolCallId, (event.args as Record<string, unknown>) ?? {});
          peer.notify("hooks.before_tool_call", {
            toolName: event.toolName,
            input: (event.args as Record<string, unknown>) ?? {},
          });
        }
        if (event.type === "tool_execution_end") {
          const input = pendingToolArgs.get(event.toolCallId) ?? {};
          pendingToolArgs.delete(event.toolCallId);
          peer.notify("hooks.after_tool_call", {
            toolName: event.toolName,
            input,
            result: event.result,
          });
        }
      });

      try {
        await session.sendUserMessage(message);
      } finally {
        unsubscribe();
      }

      const responseText = extractAssistantResponse(session.messages);
      return { response: responseText, sessionId };
    } catch (err) {
      return { error: String(err) };
    }
  });

  peer.start();

  process.on("SIGTERM", () => {
    peer.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    peer.stop();
    process.exit(0);
  });
}

function readWorkerConfig(): WorkerConfig | null {
  const configJson = process.env["SANDBOX_WORKER_CONFIG"];
  if (!configJson) {
    process.stderr.write("SANDBOX_WORKER_CONFIG env var not set\n");
    return null;
  }

  try {
    return JSON.parse(configJson) as WorkerConfig;
  } catch {
    process.stderr.write("Failed to parse SANDBOX_WORKER_CONFIG\n");
    return null;
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  const normalize = (p: string) => p.replace(/\.ts$/, ".js");
  const thisPath = normalize(fileURLToPath(import.meta.url));
  const argResolved = normalize(path.resolve(process.argv[1]));
  return thisPath === argResolved;
})();

if (isDirectRun) {
  startWorker().catch((err) => {
    process.stderr.write(`Worker failed: ${err}\n`);
    process.exit(1);
  });
}
