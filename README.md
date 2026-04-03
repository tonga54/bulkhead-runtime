# Bulkhead Runtime

**Watertight isolation for multi-tenant AI agents.**

Run 1,000 AI agents on a single Linux server. Each in its own namespace. Each with its own memory, credentials, and filesystem. No Docker. No cloud. One `npm install`.

```typescript
import { createPlatform } from "bulkhead-runtime";

const platform = createPlatform({ stateDir: "/var/bulkhead-runtime" });

const workspace = await platform.createWorkspace("user-42");
const result = await workspace.run({
  message: "Refactor the auth module to use JWT",
});
// Agent runs in an isolated Linux namespace with pivot_root.
// Credentials are AES-256-GCM encrypted, never sent to the agent.
// Memory, sessions, and skills are scoped to this workspace only.
```

---

## Why Bulkhead Runtime

You need to give each user their own AI coding agent. The agent needs real tools — bash, file access, code editing. And User A must *never* see User B's data.

| | Docker per user | E2B (cloud) | **Bulkhead Runtime** |
|---|---|---|---|
| Isolation | Container per user | Cloud VM per session | **Linux namespaces** |
| Credential security | Build it yourself | Not built-in | **AES-256-GCM per tenant** |
| Persistent memory | Build it yourself | Build it yourself | **SQLite + embeddings per tenant** |
| Agent autonomy | Build it yourself | Build it yourself | **Built-in memory tools** |
| Infrastructure | Docker daemon | Cloud API + billing | **One npm package** |
| Embeddable | No | No | **Yes** |
| License | — | Proprietary | **MIT** |

---

## Quick Start

**Linux:**
```bash
npm install bulkhead-runtime
```

**macOS / Windows (development):**
```bash
git clone https://github.com/tonga54/bulkhead-runtime.git
cd bulkhead-runtime
docker compose run dev bash
pnpm test  # 88 tests, all green
```

---

## Single-User Mode

The fastest path. One function to create a runtime, one to run the agent.

```typescript
import { createRuntime } from "bulkhead-runtime";

const runtime = await createRuntime({
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
});

const result = await runtime.run({
  message: "Find all TODO comments in this project and create a summary",
});
```

The agent gets full coding tools (read, write, edit, bash, grep, find, ls) inside a Linux namespace sandbox. It also gets `memory_store` and `memory_search` tools — it decides what to remember.

### Session Continuity

```typescript
await runtime.run({
  message: "Create a REST API for user management",
  sessionId: "api-project",
});

// Later — agent remembers everything from above
await runtime.run({
  message: "Add input validation to the endpoints you created",
  sessionId: "api-project",
});
```

### Autonomous Memory

The agent decides what to persist. Memory survives across sessions.

```typescript
// Session A
await runtime.run({
  message: "My name is Juan, I work in fintech, I prefer TypeScript",
  sessionId: "onboarding",
});

// Session B — different session, but memory persists
const r = await runtime.run({
  message: "Set up a new project for me",
  sessionId: "new-project",
});
// Agent searches memory, finds preferences, scaffolds a TypeScript project
```

Under the hood: hybrid search with vector similarity (cosine) + BM25 keyword matching + MMR diversity re-ranking. 7-language query expansion.

### Subagents

A tool can spawn a child agent. The parent blocks until the child finishes.

```typescript
const result = await runtime.run({
  message: "Review this PR for security and performance",
  tools: [{
    name: "specialist",
    description: "Delegate a subtask to a specialist agent",
    parameters: { /* ... */ },
    async execute(_id, params) {
      const r = await runtime.run({
        message: params.task,
        systemPrompt: `You are a ${params.role} expert.`,
      });
      return { resultForAssistant: r.response };
    },
  }],
});
```

---

## Multi-Tenant Mode

The core of Bulkhead Runtime. Each user gets a fully isolated workspace — private memory, encrypted credentials, independent skills, separate sessions.

```typescript
import { createPlatform } from "bulkhead-runtime";

const platform = createPlatform({
  stateDir: "/var/bulkhead-runtime",
  credentialPassphrase: process.env.CREDENTIAL_KEY,
});

const alice = await platform.createWorkspace("alice", {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
});

const bob = await platform.createWorkspace("bob", {
  provider: "google",
  model: "gemini-2.5-flash",
});
```

### Memory Isolation

Each workspace has its own SQLite database. Zero cross-contamination.

```typescript
await alice.memory.store("Project uses React and TypeScript");
await bob.memory.store("Project uses Vue and Python");

const search = await alice.memory.search("framework");
// Returns "React and TypeScript" — never "Vue and Python"
```

### Encrypted Credentials

AES-256-GCM. PBKDF2 key derivation (100k iterations, SHA-512). Credentials are encrypted at rest and injected only when a skill executes — the agent never sees raw secrets.

```typescript
await alice.credentials.store("github", { token: "ghp_alice_secret" });

// The agent calls skill_execute({ skillId: "github-issues" })
// → Host decrypts credentials
// → Injects as env vars into the skill script
// → Agent never touches the raw token
```

### Skills with Credential Injection

```
skills/
  github-issues/
    SKILL.md         # LLM reads this to understand the skill
    execute.js       # Runs with credentials as env vars
```

```javascript
// skills/github-issues/execute.js
const params = JSON.parse(await readStdin());
const token = process.env.token;  // Injected from encrypted store
const res = await fetch(`https://api.github.com/repos/${params.repo}/issues`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log(JSON.stringify(await res.json()));
```

Skills are registered globally and enabled per workspace. Credentials travel through the host, never through IPC.

### Lifecycle Hooks

```typescript
workspace.hooks.register("before_tool_call", async ({ toolName, input }) => {
  console.log(`Agent calling ${toolName}`, input);
});

workspace.hooks.register("after_agent_end", async ({ sessionId, result }) => {
  await analytics.track(sessionId, result);
});
```

Six hook points: `session_start`, `session_end`, `before_agent_start`, `after_agent_end`, `before_tool_call`, `after_tool_call`.

---

## Security Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│ Host Process                                                       │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Workspace A   │  │ Workspace B   │  │ Workspace C   │             │
│  │ memory.db     │  │ memory.db     │  │ memory.db     │             │
│  │ creds.enc     │  │ creds.enc     │  │ creds.enc     │             │
│  │ sessions/     │  │ sessions/     │  │ sessions/     │             │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘             │
│          │ JSON-RPC         │ JSON-RPC         │ JSON-RPC           │
│  ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐             │
│  │ Sandbox A     │  │ Sandbox B     │  │ Sandbox C     │             │
│  │ user ns       │  │ user ns       │  │ user ns       │             │
│  │ mount ns      │  │ mount ns      │  │ mount ns      │             │
│  │ pid ns        │  │ pid ns        │  │ pid ns        │             │
│  │ cgroup limits │  │ cgroup limits │  │ cgroup limits │             │
│  └───────────────┘  └───────────────┘  └───────────────┘             │
└───────────────────────────────────────────────────────────────────┘
```

**5 layers of sandbox isolation** — all fail-closed:

1. **User namespace** — unprivileged namespace creation via `unshare`
2. **Mount namespace** — `pivot_root` swaps the filesystem root; old root unmounted and verified
3. **PID namespace** — agent only sees its own processes
4. **Network namespace** (optional) — loopback only
5. **cgroups v2** — memory, CPU, PID limits; sandbox aborts if limits can't be applied

**Defense in depth:**

- **Env allowlist**: sandbox receives only `PATH`, `HOME`, `NODE_ENV`, and the single API key it needs
- **Credential proxy**: secrets decrypted on host, injected into skill execution — never sent over IPC
- **Path traversal protection**: workspace IDs, bind mounts, and project paths validated against a sensitive paths blocklist
- **IPC rate limiting**: 200 calls/sec per method to prevent resource exhaustion
- **IPC buffer limits**: 50 MB max to prevent memory exhaustion

---

## Real-World Patterns

### AI Coding Assistant SaaS

```typescript
app.post("/api/chat", async (req, res) => {
  const workspace = await platform.getWorkspace(req.user.id);
  const result = await workspace.run({
    message: req.body.message,
    sessionId: req.body.conversationId,
  });
  res.json({ response: result.response });
});
```

### Team-Scoped Dev Tools

```typescript
const frontend = await platform.createWorkspace("team-frontend");
const backend = await platform.createWorkspace("team-backend");

frontend.skills.enable("figma-export");
backend.skills.enable("db-migration");

await frontend.credentials.store("figma", { token: "..." });
await backend.credentials.store("database", { url: "postgres://..." });
```

### Document Q&A

```typescript
import { createSimpleMemoryManager, createEmbeddingProvider } from "bulkhead-runtime";

const memory = createSimpleMemoryManager({
  dbDir: "./knowledge",
  embeddingProvider: createEmbeddingProvider({
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
  }),
});

for (const doc of documents) await memory.store(doc.content);
const answers = await memory.search("How does authentication work?");
```

---

## LLM Providers

Any provider supported by [pi-ai](https://github.com/nicepkg/pi-ai):

| Provider | Example |
|---|---|
| Anthropic | `claude-sonnet-4-20250514` |
| Google | `gemini-2.5-flash` |
| OpenAI | `gpt-4o` |
| Groq | `llama-3.3-70b-versatile` |
| Cerebras | `llama-3.3-70b` |
| Mistral | `mistral-large-latest` |
| xAI | `grok-3` |

## Embedding Providers

For semantic memory search. Optional — keyword search works without any API key.

| Provider | Default model | Local |
|---|---|---|
| OpenAI | `text-embedding-3-small` | No |
| Gemini | `gemini-embedding-001` | No |
| Voyage | `voyage-3-lite` | No |
| Mistral | `mistral-embed` | No |
| Ollama | `nomic-embed-text` | **Yes** |

---

## Architecture

```
src/
  platform/          createPlatform() — workspace CRUD, skill registry
  workspace/         createWorkspace() — scoped memory, sessions, runner
  sandbox/           Linux namespace sandbox, cgroups, IPC, proxy tools
  credentials/       AES-256-GCM encrypted store + credential proxy
  skills/            Global skill registry + per-workspace enablement
  runtime/           createRuntime() — single-user mode + memory tools
  memory/            Hybrid search (vector + FTS5 + MMR + temporal decay)
  shared/            Cross-module constants, session helpers, atomic writes
  hooks/             Lifecycle hook runner (6 hook points)
  sessions/          File-based session store with async locking
  config/            Configuration loading + resolution
```

59 TypeScript files. 3 runtime dependencies. Zero external dependencies for sandbox, crypto, or IPC — all Node.js built-ins.

## Requirements

- **Linux** (bare metal, VM, or container with `--privileged`)
- **Node.js 22.12+** (uses `node:sqlite` built-in)
- macOS/Windows: `docker compose run dev`

## License

MIT
