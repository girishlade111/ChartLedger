# `iOfficeAI/AionUi` Integration & Reuse Policy

- **Source Repository**: `https://github.com/iOfficeAI/AionUi`
- **Audited Commit**: `e108b6b56b1a` (`main`, pushed `2026-11-05T05:31:17Z`)
- **License**: Apache License 2.0
- **Architecture Decision**: **Option A — Clean Web-First SaaS Reimplementation** (zero verbatim files copied; selective UX patterns adapted natively in React 19 + Tailwind v4).

## Component & Capability Reuse Table

| Source Module / Pattern in AionUi | Original Role in AionUi | Decision | Security / Multi-Tenant Assessment | ChartLedger Equivalent | License / Attribution Requirement | Verification Status |
|---|---|---|---|---|---|---|
| Conversation Thread Sidebar | Multi-session desktop chat list | Inspired (Reimplemented) | Safe when scoped per authenticated `userId` in PostgreSQL | `src/components/workspace/ResearchChatView.tsx` | Attribution noted in `THIRD_PARTY_NOTICES.md` | Verified in UI & API |
| Streaming Message Controls | Stop, Regenerate, Edit & Resubmit | Inspired (Reimplemented) | Safe via browser `AbortController` + server-side SSE stream close | `src/components/workspace/ResearchChatView.tsx` & `chatAndRagRoutes.ts` | Attribution noted in `THIRD_PARTY_NOTICES.md` | Verified in UI & API |
| Markdown & Table Message Renderer | Rich GFM rendering in chat | Inspired (Reimplemented) | Safe using `react-markdown` + `remark-gfm` with raw HTML disabled | `src/components/workspace/ResearchChatView.tsx` | MIT (`react-markdown`, `remark-gfm`) | Verified in UI |
| Electron Desktop Shell (`src/process`, IPC) | Local desktop runtime | Excluded | Incompatible with multi-tenant web SaaS; native OS surface | Standard Express 4 + React 19 SPA (`server.ts`) | N/A (not used) | Confirmed absent |
| Rust Core (`aionrs`) & Local SQLite | Local single-user storage & daemon | Excluded | Lacks multi-tenant isolation & cloud SQL pooling | Cloud SQL PostgreSQL 18 + Drizzle ORM (`src/db/`) | N/A (not used) | Confirmed absent |
| Local CLI Agent Runners (Claude/Codex/Gemini CLI) | Spawns local shell subprocesses | Excluded | Critical RCE risk in multi-tenant web environment | Server-side `@google/genai` SDK (`providerRegistry.ts`) | N/A (not used) | Confirmed absent |
| Unrestricted MCP / ACP & Filesystem Tools | Arbitrary local file/tool execution | Excluded | Critical privilege escalation & SSRF/LFI risk | Sandboxed per-user RAG & Binance market API only | N/A (not used) | Confirmed absent |
