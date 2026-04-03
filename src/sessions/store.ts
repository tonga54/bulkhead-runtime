import * as fs from "node:fs";
import * as path from "node:path";
import { atomicWriteFileSync } from "../shared/index.js";

export interface SessionEntry {
  id: string;
  agentId?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SessionStore {
  entries: Record<string, SessionEntry>;
}

export function getSessionStorePath(stateDir: string): string {
  return path.join(stateDir, "sessions.json");
}

export function loadSessionStore(stateDir: string): SessionStore {
  const filePath = getSessionStorePath(stateDir);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionStore;
  } catch {
    return { entries: {} };
  }
}

const sessionStoreLocks = new Map<string, Promise<void>>();

async function withSessionLock<T>(stateDir: string, fn: () => T): Promise<T> {
  const key = path.resolve(stateDir);
  const previous = sessionStoreLocks.get(key) ?? Promise.resolve();
  let release: () => void;
  const currentPromise = new Promise<void>((r) => { release = r; });
  sessionStoreLocks.set(key, currentPromise);

  try {
    await previous;
    return fn();
  } finally {
    release!();
    if (sessionStoreLocks.get(key) === currentPromise) {
      sessionStoreLocks.delete(key);
    }
  }
}

export function saveSessionStore(
  stateDir: string,
  store: SessionStore,
): void {
  const filePath = getSessionStorePath(stateDir);
  atomicWriteFileSync(filePath, JSON.stringify(store, null, 2));
}

export async function getOrCreateSession(
  stateDir: string,
  sessionId: string,
  defaults?: Partial<SessionEntry>,
): Promise<SessionEntry> {
  return withSessionLock(stateDir, () => {
    const store = loadSessionStore(stateDir);
    if (store.entries[sessionId]) {
      return store.entries[sessionId];
    }

    const entry: SessionEntry = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...defaults,
    };
    store.entries[sessionId] = entry;
    saveSessionStore(stateDir, store);
    return entry;
  });
}

export async function updateSession(
  stateDir: string,
  sessionId: string,
  update: Partial<SessionEntry>,
): Promise<void> {
  await withSessionLock(stateDir, () => {
    const store = loadSessionStore(stateDir);
    const existing = store.entries[sessionId];
    if (!existing) return;

    store.entries[sessionId] = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    saveSessionStore(stateDir, store);
  });
}
