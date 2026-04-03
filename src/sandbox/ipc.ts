import type { Readable, Writable } from "node:stream";
import { IPC_ERROR_CODES, type IpcMessage, type IpcError } from "./types.js";

export interface IpcServer {
  handle(method: string, handler: IpcHandler): void;
  start(): void;
  stop(): void;
}

export interface IpcClient {
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  notify(method: string, params?: unknown): void;
  destroy(): void;
}

export interface IpcPeer {
  handle(method: string, handler: IpcHandler): void;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  notify(method: string, params?: unknown): void;
  start(): void;
  stop(): void;
}

export type IpcHandler = (params: unknown) => Promise<unknown>;

const DELIMITER = "\n";
const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50 MB
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

export interface IpcPeerOptions {
  callTimeoutMs?: number;
}

export function createIpcPeer(
  input: Readable,
  output: Writable,
  options?: IpcPeerOptions,
): IpcPeer {
  const callTimeoutMs = options?.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const handlers = new Map<string, IpcHandler>();
  let nextId = 0;
  let buffer = "";
  let running = false;
  const pending = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();

  function stopPeer(): void {
    running = false;
    input.removeListener("data", onData);
    for (const [, p] of pending) {
      p.reject(new Error("IPC peer stopped"));
    }
    pending.clear();
  }

  function onData(chunk: Buffer): void {
    buffer += chunk.toString("utf-8");
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer = "";
      send({
        jsonrpc: "2.0",
        id: 0,
        error: { code: IPC_ERROR_CODES.INTERNAL_ERROR, message: "IPC buffer overflow: message too large" },
      });
      stopPeer();
      return;
    }
    processBuffer();
  }

  function processBuffer(): void {
    let idx: number;
    while ((idx = buffer.indexOf(DELIMITER)) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) dispatch(line);
    }
  }

  function dispatch(line: string): void {
    let msg: IpcMessage;
    try {
      msg = JSON.parse(line) as IpcMessage;
    } catch {
      send({ jsonrpc: "2.0", id: 0, error: { code: IPC_ERROR_CODES.PARSE_ERROR, message: "Invalid JSON" } });
      return;
    }

    if (msg.method) {
      const handler = handlers.get(msg.method);
      if (!handler) {
        if (msg.id !== undefined) {
          send({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: IPC_ERROR_CODES.METHOD_NOT_FOUND, message: `Unknown method: ${msg.method}` },
          });
        }
      } else {
        executeHandler(msg, handler);
      }
    } else if (msg.id !== undefined) {
      handleResponse(msg);
    }
  }

  async function executeHandler(msg: IpcMessage, handler: IpcHandler): Promise<void> {
    try {
      const result = await handler(msg.params);
      if (msg.id !== undefined) {
        send({ jsonrpc: "2.0", id: msg.id, result });
      }
    } catch (err) {
      if (msg.id !== undefined) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: IPC_ERROR_CODES.INTERNAL_ERROR, message: String(err) },
        });
      }
    }
  }

  function handleResponse(msg: IpcMessage): void {
    const handler = pending.get(msg.id!);
    if (!handler) return;
    pending.delete(msg.id!);

    if (msg.error) {
      handler.reject(new Error(`IPC error ${msg.error.code}: ${msg.error.message}`));
    } else {
      handler.resolve(msg.result);
    }
  }

  function send(msg: IpcMessage): void {
    const line = JSON.stringify(msg) + DELIMITER;
    setImmediate(() => output.write(line));
  }

  return {
    handle(method, handler) {
      handlers.set(method, handler);
    },

    call<T = unknown>(method: string, params?: unknown): Promise<T> {
      nextId = (nextId + 1) % Number.MAX_SAFE_INTEGER;
      const id = nextId;
      send({ jsonrpc: "2.0", id, method, params });
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`IPC call "${method}" (id=${id}) timed out after ${callTimeoutMs}ms`));
        }, callTimeoutMs);
        pending.set(id, {
          resolve: (value: unknown) => { clearTimeout(timer); (resolve as (v: unknown) => void)(value); },
          reject: (err: Error) => { clearTimeout(timer); reject(err); },
        });
      });
    },

    notify(method: string, params?: unknown): void {
      send({ jsonrpc: "2.0", method, params });
    },

    start() {
      if (running) return;
      running = true;
      input.on("data", onData);
    },

    stop() {
      stopPeer();
    },
  };
}

export function createIpcServer(
  input: Readable,
  output: Writable,
): IpcServer {
  const peer = createIpcPeer(input, output);
  return {
    handle: peer.handle,
    start: peer.start,
    stop: peer.stop,
  };
}

export function createIpcClient(
  input: Readable,
  output: Writable,
): IpcClient {
  const peer = createIpcPeer(input, output);
  peer.start();
  return {
    call: peer.call,
    notify: peer.notify,
    destroy: peer.stop,
  };
}
