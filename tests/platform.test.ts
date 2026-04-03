import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createPlatform } from "../src/platform/platform.js";

describe("Platform", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "platform-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directory structure on init", () => {
    createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    expect(fs.existsSync(path.join(tmpDir, "workspaces"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "skills"))).toBe(true);
  });

  it("creates and lists workspaces", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    await platform.createWorkspace("alice");
    await platform.createWorkspace("bob");

    const list = await platform.listWorkspaces();
    expect(list.sort()).toEqual(["alice", "bob"]);
  });

  it("checks workspace existence", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    await platform.createWorkspace("alice");

    expect(await platform.workspaceExists("alice")).toBe(true);
    expect(await platform.workspaceExists("bob")).toBe(false);
  });

  it("prevents duplicate workspace creation", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    await platform.createWorkspace("alice");
    await expect(platform.createWorkspace("alice")).rejects.toThrow("already exists");
  });

  it("gets existing workspace", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    const ws1 = await platform.createWorkspace("alice", { model: "gpt-4" });
    await ws1.memory.store("test memory");
    await ws1.destroy();

    const ws2 = await platform.getWorkspace("alice");
    const results = await ws2.memory.search("test");
    expect(results.length).toBeGreaterThan(0);
    await ws2.destroy();
  });

  it("throws when getting nonexistent workspace", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    await expect(platform.getWorkspace("ghost")).rejects.toThrow("does not exist");
  });

  it("deletes workspace", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    const ws = await platform.createWorkspace("temp");
    await ws.destroy();
    await platform.deleteWorkspace("temp");

    expect(await platform.workspaceExists("temp")).toBe(false);
    expect(await platform.listWorkspaces()).toEqual([]);
  });

  it("throws when deleting nonexistent workspace", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    await expect(platform.deleteWorkspace("ghost")).rejects.toThrow("does not exist");
  });

  it("rejects invalid workspace IDs", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    await expect(platform.createWorkspace("../hack")).rejects.toThrow();
    await expect(platform.createWorkspace("a/b")).rejects.toThrow();
    await expect(platform.createWorkspace("")).rejects.toThrow();
  });

  it("workspaces have isolated memory", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    const wsA = await platform.createWorkspace("alice");
    const wsB = await platform.createWorkspace("bob");

    await wsA.memory.store("Alice private note");
    await wsB.memory.store("Bob private note");

    const aliceResults = await wsA.memory.search("private note");
    const bobResults = await wsB.memory.search("private note");

    expect(aliceResults.every((r) => r.snippet.includes("Alice"))).toBe(true);
    expect(bobResults.every((r) => r.snippet.includes("Bob"))).toBe(true);

    await wsA.destroy();
    await wsB.destroy();
  });

  it("workspaces have isolated credentials", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    const wsA = await platform.createWorkspace("alice");
    const wsB = await platform.createWorkspace("bob");

    await wsA.credentials.store("api", { key: "alice-key" });

    expect(await wsA.credentials.resolve("api")).toEqual({ key: "alice-key" });
    expect(await wsB.credentials.resolve("api")).toBeUndefined();

    await wsA.destroy();
    await wsB.destroy();
  });

  it("workspaces have isolated skill enablement", async () => {
    const platform = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });

    const skillDir = path.join(tmpDir, "skills", "search");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Search\n\nSearch.");

    const platform2 = createPlatform({ stateDir: tmpDir, credentialPassphrase: "test-key" });
    const wsA = await platform2.createWorkspace("alice");
    const wsB = await platform2.createWorkspace("bob");

    wsA.skills.enable("search");

    expect(wsA.skills.isEnabled("search")).toBe(true);
    expect(wsB.skills.isEnabled("search")).toBe(false);

    await wsA.destroy();
    await wsB.destroy();
  });
});
