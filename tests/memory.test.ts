import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createSimpleMemoryManager } from "../src/memory/index.js";

describe("SimpleMemoryManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores and retrieves a memory", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });

    const id = await memory.store("The project uses TypeScript");
    expect(id).toMatch(/^mem_/);

    const list = await memory.list();
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe("The project uses TypeScript");

    await memory.close();
  });

  it("searches by keyword (FTS5)", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });

    await memory.store("TypeScript is a typed superset of JavaScript");
    await memory.store("Python is great for data science");
    await memory.store("Rust is a systems programming language");

    const results = await memory.search("TypeScript JavaScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].snippet).toContain("TypeScript");

    await memory.close();
  });

  it("deletes a memory", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });

    const id = await memory.store("Temporary data");
    expect(await memory.delete(id)).toBe(true);

    const list = await memory.list();
    expect(list).toHaveLength(0);

    await memory.close();
  });

  it("delete returns false for nonexistent ID", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });
    expect(await memory.delete("nonexistent")).toBe(false);
    await memory.close();
  });

  it("stores metadata", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });

    await memory.store("Test content", { source: "docs", topic: "testing" });
    const list = await memory.list();

    expect(list[0].metadata).toEqual({ source: "docs", topic: "testing" });

    await memory.close();
  });

  it("lists in reverse chronological order", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });

    await memory.store("First");
    await new Promise((r) => setTimeout(r, 10));
    await memory.store("Second");
    await new Promise((r) => setTimeout(r, 10));
    await memory.store("Third");

    const list = await memory.list();
    expect(list[0].content).toBe("Third");
    expect(list[2].content).toBe("First");

    await memory.close();
  });

  it("isolation: separate dbDirs have separate data", async () => {
    const dirA = path.join(tmpDir, "a");
    const dirB = path.join(tmpDir, "b");

    const memA = createSimpleMemoryManager({ dbDir: dirA });
    const memB = createSimpleMemoryManager({ dbDir: dirB });

    await memA.store("Alice data");
    await memB.store("Bob data");

    const listA = await memA.list();
    const listB = await memB.list();

    expect(listA).toHaveLength(1);
    expect(listA[0].content).toBe("Alice data");
    expect(listB).toHaveLength(1);
    expect(listB[0].content).toBe("Bob data");

    const searchA = await memA.search("Bob");
    expect(searchA).toHaveLength(0);

    await memA.close();
    await memB.close();
  });

  it("search respects maxResults", async () => {
    const memory = createSimpleMemoryManager({ dbDir: tmpDir });

    for (let i = 0; i < 10; i++) {
      await memory.store(`Memory number ${i} about testing`);
    }

    const results = await memory.search("testing", { maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);

    await memory.close();
  });
});
