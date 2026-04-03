export interface CredentialEntry {
  skillId: string;
  data: Record<string, string>;
}

export interface CredentialStore {
  store(skillId: string, credentials: Record<string, string>): Promise<void>;
  resolve(skillId: string): Promise<Record<string, string> | undefined>;
  delete(skillId: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export interface CredentialProxy {
  injectCredentials(
    skillId: string,
    env: Record<string, string>,
  ): Promise<Record<string, string>>;
}
