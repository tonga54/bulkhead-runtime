import type { SimpleMemoryManager } from "../memory/index.js";

const MAX_QUERY_LENGTH = 10_000;
const MAX_CONTENT_LENGTH = 1_000_000;

interface ToolResult {
  resultForAssistant: string;
}

interface ToolDef {
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
  ): Promise<ToolResult>;
}

export function createMemoryTools(memory: SimpleMemoryManager): ToolDef[] {
  return [
    {
      name: "memory_search",
      label: "Memory Search",
      description:
        "Search your memory for relevant information. Returns matching memories ranked by relevance.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
      async execute(_toolCallId, params) {
        const query = params.query;
        if (typeof query !== "string" || query.length === 0) {
          return { resultForAssistant: "Error: query must be a non-empty string" };
        }
        if (query.length > MAX_QUERY_LENGTH) {
          return { resultForAssistant: `Error: query exceeds maximum length (${MAX_QUERY_LENGTH})` };
        }
        const maxResults = typeof params.maxResults === "number"
          ? Math.min(Math.max(1, Math.floor(params.maxResults)), 100)
          : 5;
        const results = await memory.search(query, { maxResults });
        return { resultForAssistant: JSON.stringify(results, null, 2) };
      },
    },
    {
      name: "memory_store",
      label: "Memory Store",
      description:
        "Store information in your memory for future reference. Use this to remember important facts, " +
        "user preferences, and context that should persist across conversations.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
        },
        required: ["content"],
      },
      async execute(_toolCallId, params) {
        const content = params.content;
        if (typeof content !== "string" || content.length === 0) {
          return { resultForAssistant: "Error: content must be a non-empty string" };
        }
        if (content.length > MAX_CONTENT_LENGTH) {
          return { resultForAssistant: `Error: content exceeds maximum length (${MAX_CONTENT_LENGTH})` };
        }
        const id = await memory.store(content);
        return { resultForAssistant: JSON.stringify({ id }) };
      },
    },
  ];
}
