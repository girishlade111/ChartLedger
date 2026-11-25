# ChartLedger — AI Financial Chart Research Platform

ChartLedger is an independently developed, full-stack financial chart analysis SaaS application built with **React 19, TypeScript, Tailwind CSS v4, Express, Cloud SQL PostgreSQL 18 + pgvector (Drizzle ORM), Firebase Auth, Google Gemini (`gemini-4-hydrogen` & `gemini-embedding-2`), TradingView Lightweight Charts, and Stripe test mode**.

> **Important Financial Disclaimer**: ChartLedger provides educational and technical chart research only. It does **not** provide personalized financial advice, brokerage services, trade execution, or guaranteed market predictions.

## Core Capabilities
- **8-Stage Financial Chart Analysis Pipeline**: Drag/drop, browse, or paste (`Ctrl+V`) PNG/JPEG/WebP charts (or load labeled synthetic fixtures) for structured Zod-validated interpretation, market structure, deterministic OHLCV indicators (`technicalindicators`), patterns, conditional Bullish/Bearish/Neutral scenarios, risk analysis, and Stage 8 safety validation.
- **Streaming AI Research Chat (SSE)**: Multi-thread workspace with attached analysis context, Stop/Regenerate/Edit controls, GFM Markdown tables, saved prompts, and isolated RAG citations.
- **Tenant-Isolated Knowledge Base (RAG)**: Per-user collections, document chunking, `gemini-embedding-2` vectors in PostgreSQL, and hybrid vector + lexical search.
- **Live Spot Market Data & Watchlist**: Binance public spot API integration with caching and clear attribution alongside labeled synthetic demo charts.
- **Auth, Personalization, Billing & RBAC Admin**: Dual auth (Firebase Google Sign-In + Email/Password), skippable onboarding preferences, usage quotas, Stripe test-mode Checkout + raw-body HMAC webhooks (with clearly labeled local test-mode webhook simulator when Stripe keys are unset), shareable read-only links, iframe widgets, JSON data export, account deletion, and Admin console.

## Local Development
```bash
npm install
npm test            # Pure logic unit tests (node:test via tsx)
npm run build       # Production Vite bundle
npm run dev         # Starts Express + Vite on http://localhost:3000
```

## Documentation Map
- `research/` — Public research inventory, AionUi audit, REA discovery, feature comparison matrix.
- `docs/architecture/` — System architecture, 20-table database design, AionUi reuse table, ADRs.
- `docs/ai/chart-analysis-pipeline.md` — 8-stage pipeline & safety constraints.
- `docs/api/api-reference.md` — REST & SSE API reference.
- `docs/security/threat-model.md` & `docs/compliance/pre-launch-checklist.md`
- `docs/deployment/production-deployment.md`, `Dockerfile`, `docker-compose.yml`
