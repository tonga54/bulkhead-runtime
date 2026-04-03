export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_PROVIDER = "anthropic";

export const LINUX_REQUIRED_MESSAGE =
  "Bulkhead Runtime requires Linux. " +
  "For local development on macOS/Windows, use the provided Dockerfile: docker compose run dev";

export function buildProviderEnvKey(provider: string): string {
  return `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

export const PROTECTED_SYSTEM_ENV_KEYS = new Set([
  "PATH", "HOME", "NODE_ENV", "LANG", "TZ", "NODE_PATH",
]);
