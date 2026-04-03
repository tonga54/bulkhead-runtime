// Re-exports from OpenClaw's memory module
export type {
  MemorySource,
  MemorySearchResult,
  MemorySearchManager,
  MemoryEmbeddingProbeResult,
  MemorySyncProgressUpdate,
  MemoryProviderStatus,
} from "./types.js";

export type { EmbeddingProvider } from "./embeddings.js";

export {
  cosineSimilarity,
  chunkMarkdown,
  listMemoryFiles,
  hashText,
  buildFileEntry,
  isMemoryPath,
  parseEmbedding,
  type MemoryFileEntry,
  type MemoryChunk,
} from "./internal.js";

export { searchVector, searchKeyword } from "./manager-search.js";
export { mergeHybridResults } from "./hybrid.js";
export { mmrRerank, applyMMRToHybridResults } from "./mmr.js";
export {
  applyTemporalDecayToHybridResults,
  applyTemporalDecayToScore,
  calculateTemporalDecayMultiplier,
} from "./temporal-decay.js";
export { extractKeywords } from "./query-expansion.js";
export { buildFtsQuery, bm25RankToScore } from "./hybrid.js";
export { requireNodeSqlite } from "./sqlite.js";

// Simple memory store for consumers that want store/search/delete/list
// without the full OpenClaw MemoryIndexManager infrastructure.
export { createSimpleMemoryManager, type SimpleMemoryManager } from "./simple-manager.js";
