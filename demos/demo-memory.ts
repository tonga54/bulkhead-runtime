/**
 * Demo: Memory system with Gemini embeddings + hybrid search
 *
 * Shows:
 * - Store memories with vector embeddings (Gemini)
 * - Hybrid search (vector similarity + keyword FTS)
 * - Semantic search finds related concepts, not just exact matches
 * - FTS-only fallback when no embedding provider
 * - Delete and list operations
 *
 * Run: npx tsx demos/demo-memory.ts
 */
import * as fs from "node:fs";
import { createSimpleMemoryManager } from "../src/memory/index.js";
import { createEmbeddingProvider } from "../src/memory/embeddings.js";
import { API_KEY } from "./_shared.js";

const DB_DIR = ".demo-memory-db";

async function main() {
  fs.rmSync(DB_DIR, { recursive: true, force: true });

  const embeddingProvider = createEmbeddingProvider({ provider: "gemini", apiKey: API_KEY });
  const memory = createSimpleMemoryManager({ dbDir: DB_DIR, embeddingProvider });

  console.log(`Embedding provider: ${embeddingProvider.id} (${embeddingProvider.model})\n`);

  // --- Store ---
  console.log("=== Storing memories ===\n");

  const memories = [
    { text: "The project uses TypeScript with Node.js version 22 or higher.", meta: { topic: "stack" } },
    { text: "The API rate limit is 100 requests per minute per user.", meta: { topic: "limits" } },
    { text: "Users prefer dark mode and compact layouts in the UI.", meta: { topic: "preferences" } },
    { text: "Deploy to production every Friday at 3pm using the CI/CD pipeline.", meta: { topic: "process" } },
    { text: "The database is PostgreSQL 16 hosted on AWS RDS.", meta: { topic: "stack" } },
    { text: "Authentication uses JWT tokens with a 24-hour expiration.", meta: { topic: "auth" } },
    { text: "The frontend is built with React 19 and Tailwind CSS.", meta: { topic: "stack" } },
    { text: "Error logs are stored in CloudWatch with 30-day retention.", meta: { topic: "monitoring" } },
  ];

  for (const m of memories) {
    const id = await memory.store(m.text, { source: "docs", ...m.meta });
    console.log(`  [${id}] ${m.text.slice(0, 60)}...`);
  }

  // --- Semantic search ---
  console.log("\n=== Semantic search (finds concepts, not just keywords) ===\n");

  const queries = [
    "What tech stack are we using?",
    "How do users log in?",
    "When do we ship new releases?",
    "What are the throttling limits?",
    "Where do we store error information?",
  ];

  for (const q of queries) {
    const results = await memory.search(q, { maxResults: 3 });
    console.log(`  Q: "${q}"`);
    for (const r of results) console.log(`    [${r.score.toFixed(3)}] ${r.snippet}`);
    console.log();
  }

  // --- Keyword search ---
  console.log("=== Keyword search (exact match via FTS5) ===\n");

  for (const q of ["PostgreSQL", "JWT", "Tailwind"]) {
    const results = await memory.search(q, { maxResults: 2 });
    console.log(`  Q: "${q}"`);
    for (const r of results) console.log(`    [${r.score.toFixed(3)}] ${r.snippet}`);
    console.log();
  }

  // --- List and delete ---
  console.log("=== List & delete ===\n");
  const all = await memory.list();
  console.log(`  Total: ${all.length} memories`);

  const first = all[0];
  await memory.delete(first.id);
  console.log(`  Deleted: ${first.id}`);
  console.log(`  Remaining: ${(await memory.list()).length} memories\n`);

  // --- FTS-only mode ---
  console.log("=== FTS-only mode (no embeddings) ===\n");
  const ftsOnly = createSimpleMemoryManager({ dbDir: DB_DIR });
  const ftsResults = await ftsOnly.search("TypeScript Node", { maxResults: 2 });
  console.log(`  Q: "TypeScript Node"`);
  for (const r of ftsResults) console.log(`    [${r.score.toFixed(3)}] ${r.snippet}`);
  await ftsOnly.close();

  await memory.close();
  fs.rmSync(DB_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
