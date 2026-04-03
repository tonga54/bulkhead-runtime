import { createRuntime, type AgentRuntime } from "../src/runtime/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

const keyPath = path.join(import.meta.dirname, "..", "gemini_api_key");
const apiKey = fs.readFileSync(keyPath, "utf-8").trim();
process.env["GEMINI_API_KEY"] = apiKey;

export const PROVIDER = "google";
export const MODEL = "gemini-2.5-flash";
export const API_KEY = apiKey;

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
