import { createRuntime, type AgentRuntime } from "../src/runtime/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

export const PROVIDER = process.env["BULKHEAD_PROVIDER"] ?? "google";
export const MODEL = process.env["BULKHEAD_MODEL"] ?? "gemini-2.5-flash";
export const API_KEY = process.env["GEMINI_API_KEY"] ?? "";

export async function initRuntime(
  overrides?: Parameters<typeof createRuntime>[0],
): Promise<AgentRuntime> {
  return createRuntime({
    provider: PROVIDER,
    model: MODEL,
    skills: { enabled: false },
    ...overrides,
  });
}

export function cleanState() {
  const stateDir = path.join(import.meta.dirname, "..", ".bulkhead-runtime-demo");
  fs.rmSync(stateDir, { recursive: true, force: true });
}
