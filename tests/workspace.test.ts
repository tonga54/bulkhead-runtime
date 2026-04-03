import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { validateWorkspaceId, createWorkspace } from "../src/workspace/workspace.js";
import { createSkillRegistry } from "../src/skills/registry.js";

describe("validateWorkspaceId", () => {
  it("accepts valid IDs", () => {
    expect(() => validateWorkspaceId("alice")).not.toThrow();
    expect(() => validateWorkspaceId("user-123")).not.toThrow();
    expect(() => validateWorkspaceId("my_workspace")).not.toThrow();
    expect(() => validateWorkspaceId("ABC")).not.toThrow();
    expect(() => validateWorkspaceId("a")).not.toThrow();
  });

  it("rejects path traversal with dots", () => {
    expect(() => validateWorkspaceId("..")).toThrow("path traversal");
    expect(() => validateWorkspaceId("../etc")).toThrow("path traversal");
    expect(() => validateWorkspaceId("foo/../../bar")).toThrow("path traversal");
  });

  it("rejects slashes", () => {
    expect(() => validateWorkspaceId("hello/world")).toThrow("path traversal");
    expect(() => validateWorkspaceId("a\\b")).toThrow("path traversal");
  });

  it("rejects empty string", () => {
    expect(() => validateWorkspaceId("")).toThrow("non-empty");
  });

  it("rejects special characters", () => {
    expect(() => validateWorkspaceId("hello world")).toThrow("alphanumeric");
    expect(() => validateWorkspaceId("user@domain")).toThrow("alphanumeric");
    expect(() => validateWorkspaceId("user!")).toThrow("alphanumeric");
    expect(() => validateWorkspaceId("café")).toThrow("alphanumeric");
  });

  it("rejects IDs longer than 128 chars", () => {
    expect(() => validateWorkspaceId("a".repeat(129))).toThrow("128 characters");
    expect(() => validateWorkspaceId("a".repeat(128))).not.toThrow();
  });
});

describe("createWorkspace", () => {
  let tmpDir: string;
  let skillsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-test-"));
    skillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates workspace directory structure", async () => {
    const registry = createSkillRegistry(skillsDir);
    const ws = await createWorkspace({
      userId: "alice",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });

    const wsDir = path.join(tmpDir, "workspaces", "alice");
    expect(fs.existsSync(wsDir)).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "config.json"))).toBe(true);
    expect(ws.userId).toBe("alice");

    await ws.destroy();
  });

  it("has isolated memory per workspace", async () => {
    const registry = createSkillRegistry(skillsDir);

    const wsA = await createWorkspace({
      userId: "alice",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });
    const wsB = await createWorkspace({
      userId: "bob",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });

    await wsA.memory.store("Alice secret data");
    await wsB.memory.store("Bob secret data");

    const aliceSearch = await wsA.memory.search("secret");
    const bobSearch = await wsB.memory.search("secret");

    expect(aliceSearch.length).toBe(1);
    expect(aliceSearch[0].snippet).toContain("Alice");
    expect(aliceSearch[0].snippet).not.toContain("Bob");

    expect(bobSearch.length).toBe(1);
    expect(bobSearch[0].snippet).toContain("Bob");
    expect(bobSearch[0].snippet).not.toContain("Alice");

    await wsA.destroy();
    await wsB.destroy();
  });

  it("has isolated credentials per workspace", async () => {
    const registry = createSkillRegistry(skillsDir);

    const wsA = await createWorkspace({
      userId: "alice",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });
    const wsB = await createWorkspace({
      userId: "bob",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });

    await wsA.credentials.store("openai", { apiKey: "alice-key" });

    const aliceKey = await wsA.credentials.resolve("openai");
    const bobKey = await wsB.credentials.resolve("openai");

    expect(aliceKey).toEqual({ apiKey: "alice-key" });
    expect(bobKey).toBeUndefined();

    await wsA.destroy();
    await wsB.destroy();
  });

  it("rejects invalid workspace IDs", async () => {
    const registry = createSkillRegistry(skillsDir);

    await expect(
      createWorkspace({
        userId: "../escape",
        stateDir: tmpDir,
        config: { credentialPassphrase: "test-key" },
        skillRegistry: registry,
      }),
    ).rejects.toThrow("path traversal");
  });

  it("state dirs are physically separate", async () => {
    const registry = createSkillRegistry(skillsDir);

    const wsA = await createWorkspace({
      userId: "alice",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });
    const wsB = await createWorkspace({
      userId: "bob",
      stateDir: tmpDir,
      config: { credentialPassphrase: "test-key" },
      skillRegistry: registry,
    });

    expect(wsA.stateDir).not.toBe(wsB.stateDir);
    expect(wsA.stateDir).toContain("alice");
    expect(wsB.stateDir).toContain("bob");

    await wsA.destroy();
    await wsB.destroy();
  });
});
