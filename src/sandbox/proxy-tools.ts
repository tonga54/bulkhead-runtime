import type { IpcPeer } from "./ipc.js";

interface ProxyToolResult {
  resultForAssistant: string;
}

interface ProxyToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ): Promise<ProxyToolResult>;
}

export function createProxyTools(peer: IpcPeer): ProxyToolDef[] {
  return [
    {
      name: "memory_search",
      label: "Memory Search",
      description:
        "Search your memory for relevant information. Returns matching memories ranked by relevance.",
      parameters: {
        type: "Object",
        properties: {
          query: { type: "String" },
          maxResults: { type: "Number" },
        },
        required: ["query"],
      },
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const results = await peer.call("memory.search", {
          query: params.query,
          maxResults: params.maxResults ?? 5,
        });
        return { resultForAssistant: JSON.stringify(results, null, 2) };
      },
    },
    {
      name: "memory_store",
      label: "Memory Store",
      description:
        "Store information in your memory for future reference. Use this to remember important facts.",
      parameters: {
        type: "Object",
        properties: {
          content: { type: "String" },
        },
        required: ["content"],
      },
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const result = await peer.call("memory.store", {
          content: params.content,
        });
        return { resultForAssistant: JSON.stringify(result) };
      },
    },
    {
      name: "skill_execute",
      label: "Execute Skill",
      description:
        "Execute an enabled skill. Credentials are injected automatically by the platform.",
      parameters: {
        type: "Object",
        properties: {
          skillId: { type: "String" },
          params: { type: "Object" },
        },
        required: ["skillId"],
      },
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const result = await peer.call("skill.execute", {
          skillId: params.skillId,
          params: params.params,
        });
        return { resultForAssistant: JSON.stringify(result) };
      },
    },
  ];
}
