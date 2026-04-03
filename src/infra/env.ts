// Extracted from OpenClaw src/infra/env.ts
import { parseBooleanValue } from "../utils/boolean.js";

export function isTruthyEnvValue(value?: string): boolean {
  return parseBooleanValue(value) === true;
}
