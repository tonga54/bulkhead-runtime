import type {
  HookHandler,
  HookName,
  HookPayload,
} from "./types.js";

export interface HookRunner {
  register<T extends HookPayload>(
    name: HookName,
    handler: HookHandler<T>,
    priority?: number,
  ): void;
  run<T extends HookPayload>(name: HookName, payload: T): Promise<void>;
}

interface RegisteredHook {
  handler: HookHandler;
  priority: number;
}

export function createHookRunner(): HookRunner {
  const hooks = new Map<HookName, RegisteredHook[]>();

  return {
    register<T extends HookPayload>(
      name: HookName,
      handler: HookHandler<T>,
      priority = 0,
    ) {
      if (!hooks.has(name)) hooks.set(name, []);
      hooks.get(name)!.push({ handler: handler as HookHandler, priority });
      hooks.get(name)!.sort((a, b) => b.priority - a.priority);
    },

    async run<T extends HookPayload>(name: HookName, payload: T) {
      const registered = hooks.get(name);
      if (!registered) return;
      for (const { handler } of registered) {
        await handler(payload);
      }
    },
  };
}
