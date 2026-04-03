import type { CredentialStore, CredentialProxy } from "./types.js";

export function createCredentialProxy(
  store: CredentialStore,
): CredentialProxy {
  return {
    async injectCredentials(skillId, env) {
      const creds = await store.resolve(skillId);
      if (!creds) return env;
      return { ...env, ...creds };
    },
  };
}
