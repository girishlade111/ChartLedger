# Open-Source Audit: `iOfficeAI/AionUi`

- **Repository**: `https://github.com/iOfficeAI/AionUi`
- **Audited Branch / Commit**: `main` @ `e108b6b56b1a` (pushed `2026-11-05T05:31:17Z`)
- **License**: `Apache-2.0` (permissive; requires license & notice retention if source files are copied or modified)

## Architectural Assessment
`AionUi` is a local-first **Electron desktop application** paired with a Rust core (`aionrs`), local SQLite persistence, and multi-agent CLI/MCP/ACP orchestration designed to drive local developer agents (shell execution, local filesystem read/write, browser tools, MCP servers).

## Security & Multi-Tenant Risk Evaluation
Directly embedding `AionUi` into a multi-tenant web SaaS introduces severe risks:
1. **Desktop Runtime Mismatch**: Electron IPC, native file dialogs, and local SQLite cannot run safely in a shared multi-tenant HTTP server.
2. **Remote Code Execution / Privilege Escalation**: Local CLI agent bridges, arbitrary shell execution, filesystem tools, and unrestricted MCP server invocation are unsafe for untrusted SaaS end-users.
3. **Cross-Tenant Isolation**: Single-user local state lacks per-tenant database foreign keys, RBAC, and isolated vector storage.

## Decision: Option A (Clean Web-First Reimplementation with Selective UX Inspiration)
- **Zero code copied verbatim** from `iOfficeAI/AionUi`.
- **Selectively inspired UX concepts** re-implemented cleanly in React 19 + TypeScript + Tailwind v4:
  - Collapsible multi-thread conversation sidebar with rename/delete and search.
  - Streaming response lifecycle controls (Stop generation via `AbortController`, Regenerate last assistant reply, Edit & resubmit user message).
  - Clean Markdown + GFM table rendering (`react-markdown` + `remark-gfm`) with inline source citation chips.
- **Explicitly Excluded**: Electron shell, Rust `aionrs` daemon, SQLite store, local CLI agent runners, filesystem/shell tools, and unrestricted MCP/ACP plugins.
- **Attribution**: Recorded in `THIRD_PARTY_NOTICES.md` and `docs/architecture/aionui-integration.md`.
