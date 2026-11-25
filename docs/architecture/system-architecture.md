# ChartLedger System Architecture

## High-Level Topology
ChartLedger is a full-stack TypeScript SaaS application served from a single Express + Vite Node.js server (`server.ts`, port `3000`):

- **Frontend (React 19 + Vite 8 + Tailwind CSS v4)**:
  - Public marketing & educational site (`PublicSite.tsx`) with interactive synthetic demo using TradingView Lightweight Charts (`CandlestickChart.tsx`).
  - Dual authentication (`AuthViews.tsx`, `AuthContext.tsx`): Firebase Google Sign-In + Email/Password backed by PostgreSQL sessions.
  - Research workspace (`WorkspaceShell.tsx`): Overview, New Chart Analysis, Streaming Research Chat, Analysis History & Side-by-Side Compare, Watchlist, Knowledge Base (RAG), Saved Prompts, Usage/Billing & Embed Widgets, Settings/Export/Delete, and RBAC Admin Console.
- **Backend (Express 4 + TypeScript)**:
  - REST API under `/api/*` + SSE streaming endpoint `/api/conversations/:id/stream`.
  - Security middleware: Helmet CSP/headers, strict CORS, express-rate-limit, magic-byte file verification, path confinement, raw-body Stripe webhook route mounted before `express.json()`.
  - Dual auth middleware (`src/middleware/auth.ts`) verifying either DB-backed HS256 JWT sessions or Firebase Admin ID tokens.
- **Persistence (Cloud SQL PostgreSQL 18.6 + `pgvector` 0.8.5)**:
  - Managed via Drizzle ORM (`src/db/schema.ts`, 20 tables) and `pg.Pool` Object Method (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`).
- **AI & Data Services**:
  - Vision & Chat: `@google/genai` server-side client (`gemini-4-hydrogen`), guarded by prompt injection delimiters and Stage 8 Zod/safety validation.
  - Embeddings: `gemini-embedding-2` stored alongside chunks for per-tenant hybrid vector + lexical retrieval.
  - Market Data: Binance public spot REST API (`/api/v3/klines`, `/api/v3/ticker/24hr`) with caching and explicit attribution + deterministic local synthetic fixtures.
  - Billing: Stripe test-mode SDK (`stripe`) + idempotent `payment_events` ledger + clearly labeled local test-mode webhook simulator when Stripe keys are unset.
