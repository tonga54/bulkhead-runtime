/**
 * Demo: Multi-tenant platform
 *
 * Shows:
 * - Platform creation with global skill registry
 * - Workspace CRUD (create, get, list, delete)
 * - Memory isolation between workspaces (Alice vs Bob)
 * - Skill enablement per workspace
 * - Credential store isolation (encrypted, per workspace)
 * - Path traversal protection on workspace IDs
 * - Workspace config persistence
 *
 * Run: npx tsx demos/demo-platform.ts
 */
import { createPlatform } from "../src/platform/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

const stateDir = path.join(import.meta.dirname, "..", ".platform-demo");
fs.rmSync(stateDir, { recursive: true, force: true });

async function main() {
  console.log("=== Multi-Tenant Platform Demo ===\n");

  // --- Platform ---
  const platform = createPlatform({ stateDir });

  // --- Workspace CRUD ---
  console.log("--- Workspace CRUD ---");

  const wsAlice = await platform.createWorkspace("alice", {
    model: "gemini-2.5-flash",
    provider: "google",
  });
  const wsBob = await platform.createWorkspace("bob", {
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
  });

  console.log("Created workspaces:", await platform.listWorkspaces());
  console.log("Alice exists?", await platform.workspaceExists("alice"));
  console.log("Charlie exists?", await platform.workspaceExists("charlie"));
  console.log("Alice dir:", wsAlice.stateDir);
  console.log("Bob dir:", wsBob.stateDir);

  // --- Memory isolation ---
  console.log("\n--- Memory Isolation ---");

  await wsAlice.memory.store("Alice works at Acme Corp as CTO");
  await wsAlice.memory.store("Alice's favorite color is blue");
  await wsAlice.memory.store("Alice's project uses React and TypeScript");

  await wsBob.memory.store("Bob is a freelance designer");
  await wsBob.memory.store("Bob's favorite color is red");
  await wsBob.memory.store("Bob uses Figma and Sketch");

  const aliceResults = await wsAlice.memory.search("favorite color");
  const bobResults = await wsBob.memory.search("favorite color");

  console.log("Alice search 'favorite color':", aliceResults.map((r) => r.snippet));
  console.log("Bob search 'favorite color':", bobResults.map((r) => r.snippet));

  const aliceSeesBob = aliceResults.some((r) => r.snippet.includes("Bob"));
  const bobSeesAlice = bobResults.some((r) => r.snippet.includes("Alice"));
  console.log("Cross-contamination Alice→Bob?", aliceSeesBob, "(should be false)");
  console.log("Cross-contamination Bob→Alice?", bobSeesAlice, "(should be false)");

  console.log("Alice total memories:", (await wsAlice.memory.list()).length);
  console.log("Bob total memories:", (await wsBob.memory.list()).length);

  // --- Skill enablement ---
  console.log("\n--- Skill Enablement ---");

  console.log("Alice enabled skills:", wsAlice.skills.listEnabledIds());
  console.log("Bob enabled skills:", wsBob.skills.listEnabledIds());
  console.log("Global skills available:", platform.skills.list().length);

  // --- Credential isolation ---
  console.log("\n--- Credential Isolation ---");

  await wsAlice.credentials.store("openai", { apiKey: "sk-alice-key-123" });
  await wsAlice.credentials.store("anthropic", { apiKey: "sk-ant-alice-456" });
  await wsBob.credentials.store("openai", { apiKey: "sk-bob-key-789" });

  const aliceCreds = await wsAlice.credentials.list();
  const bobCreds = await wsBob.credentials.list();
  console.log("Alice credentials:", aliceCreds);
  console.log("Bob credentials:", bobCreds);

  const aliceOpenai = await wsAlice.credentials.resolve("openai");
  const bobOpenai = await wsBob.credentials.resolve("openai");
  console.log("Alice's OpenAI key starts with:", aliceOpenai?.apiKey?.slice(0, 12) + "...");
  console.log("Bob's OpenAI key starts with:", bobOpenai?.apiKey?.slice(0, 10) + "...");
  console.log("Same key?", aliceOpenai?.apiKey === bobOpenai?.apiKey, "(should be false)");

  // Bob cannot resolve Alice's anthropic credential
  const bobAnthro = await wsBob.credentials.resolve("anthropic");
  console.log("Bob sees Alice's Anthropic key?", bobAnthro !== undefined, "(should be false)");

  // --- Hooks per workspace ---
  console.log("\n--- Hooks (per workspace) ---");

  wsAlice.hooks.register("session_start", async (p) => {
    console.log(`  [Alice hook] session_start: ${p.sessionId}`);
  });
  wsBob.hooks.register("session_start", async (p) => {
    console.log(`  [Bob hook] session_start: ${p.sessionId}`);
  });

  // --- Path traversal protection ---
  console.log("\n--- Security: Path Traversal ---");

  const attacks = ["../escape", "hello/world", "..\\windows", "a".repeat(200), ""];
  for (const id of attacks) {
    try {
      await platform.createWorkspace(id);
      console.log(`  "${id.slice(0, 30)}": ALLOWED (unexpected!)`);
    } catch (err) {
      console.log(`  "${id.slice(0, 30)}...": blocked ✓`);
    }
  }

  // --- Get existing workspace ---
  console.log("\n--- Get Existing Workspace ---");

  const wsAlice2 = await platform.getWorkspace("alice");
  console.log("Retrieved Alice workspace:", wsAlice2.userId);
  const aliceMemories2 = await wsAlice2.memory.search("Acme Corp");
  console.log("Alice memories accessible after re-get:", aliceMemories2.length > 0);

  // --- Cleanup ---
  console.log("\n--- Cleanup ---");

  await wsAlice.destroy();
  await wsAlice2.destroy();
  await wsBob.destroy();
  await platform.deleteWorkspace("alice");
  await platform.deleteWorkspace("bob");
  console.log("Workspaces after cleanup:", await platform.listWorkspaces());

  fs.rmSync(stateDir, { recursive: true, force: true });
  console.log("\nDemo complete.");
}

main().catch(console.error);
