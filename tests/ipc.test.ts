import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { createIpcPeer } from "../src/sandbox/ipc.js";

function createPipePair() {
  const aToB = new PassThrough();
  const bToA = new PassThrough();
  const peerA = createIpcPeer(bToA, aToB);
  const peerB = createIpcPeer(aToB, bToA);
  return { peerA, peerB };
}

describe("IpcPeer", () => {
  it("handles request-response", async () => {
    const { peerA, peerB } = createPipePair();

    peerB.handle("add", async (params) => {
      const { a, b } = params as { a: number; b: number };
      return a + b;
    });

    peerA.start();
    peerB.start();

    const result = await peerA.call<number>("add", { a: 3, b: 4 });
    expect(result).toBe(7);

    peerA.stop();
    peerB.stop();
  });

  it("handles bidirectional calls", async () => {
    const { peerA, peerB } = createPipePair();

    peerA.handle("greet", async (params) => {
      const { name } = params as { name: string };
      return `Hello, ${name}!`;
    });

    peerB.handle("multiply", async (params) => {
      const { x, y } = params as { x: number; y: number };
      return x * y;
    });

    peerA.start();
    peerB.start();

    const greeting = await peerB.call<string>("greet", { name: "Alice" });
    const product = await peerA.call<number>("multiply", { x: 5, y: 6 });

    expect(greeting).toBe("Hello, Alice!");
    expect(product).toBe(30);

    peerA.stop();
    peerB.stop();
  });

  it("returns error for unknown method", async () => {
    const { peerA, peerB } = createPipePair();
    peerA.start();
    peerB.start();

    const result = await Promise.race([
      peerA.call("nonexistent").then(
        () => "resolved",
        (err) => `rejected: ${err.message}`,
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("timeout"), 2000),
      ),
    ]);

    expect(result).toContain("rejected");
    expect(result).toContain("Unknown method");

    peerA.stop();
    peerB.stop();
  });

  it("returns error when handler throws", async () => {
    const { peerA, peerB } = createPipePair();

    peerB.handle("fail", async () => {
      throw new Error("intentional error");
    });

    peerA.start();
    peerB.start();

    await expect(peerA.call("fail")).rejects.toThrow("intentional error");

    peerA.stop();
    peerB.stop();
  });

  it("handles multiple concurrent calls", async () => {
    const { peerA, peerB } = createPipePair();

    peerB.handle("delay", async (params) => {
      const { ms, value } = params as { ms: number; value: string };
      await new Promise((r) => setTimeout(r, ms));
      return value;
    });

    peerA.start();
    peerB.start();

    const [r1, r2, r3] = await Promise.all([
      peerA.call<string>("delay", { ms: 30, value: "first" }),
      peerA.call<string>("delay", { ms: 10, value: "second" }),
      peerA.call<string>("delay", { ms: 20, value: "third" }),
    ]);

    expect(r1).toBe("first");
    expect(r2).toBe("second");
    expect(r3).toBe("third");

    peerA.stop();
    peerB.stop();
  });

  it("handles complex objects", async () => {
    const { peerA, peerB } = createPipePair();

    peerB.handle("echo", async (params) => params);

    peerA.start();
    peerB.start();

    const complex = {
      nested: { array: [1, 2, 3], obj: { key: "value" } },
      nullVal: null,
      bool: true,
      num: 42.5,
    };

    const result = await peerA.call("echo", complex);
    expect(result).toEqual(complex);

    peerA.stop();
    peerB.stop();
  });
});
