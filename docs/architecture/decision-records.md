# Architectural Decision Records (ADRs)

## ADR-001: Single Express + Vite Full-Stack Runtime (`server.ts`)
- **Decision**: Serve React 19 via Vite middleware in development and `dist/` static build in production from a unified Express server on port `3000`.
- **Rationale**: Matches the container runtime requirement (single port `3000`), eliminates CORS friction between SPA and `/api/*`, and keeps all API keys (`GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `SQL_PASSWORD`) strictly server-side.

## ADR-002: Cloud SQL PostgreSQL 18 + `pgvector` with Drizzle ORM
- **Decision**: Use managed Cloud SQL PostgreSQL (`asia-southeast1`) with `pgvector` and strongly-typed Drizzle schemas.
- **Rationale**: Guarantees ACID transactions, foreign-key cascade deletes, unique idempotency constraints (`payment_events.providerEventId`, `usage_periods`), and strict per-user relational isolation.

## ADR-003: Dual Authentication (Firebase Google Sign-In + DB-Backed JWT Sessions)
- **Decision**: Support both Firebase Google Sign-In (verified via `firebase-admin`) and Email/Password (`bcryptjs` + HS256 JWT backed by revocable PostgreSQL `sessions` rows).
- **Rationale**: Allows instant local E2E testing without external OAuth popups while providing production-grade Google SSO. Tokens stay in JS memory (never `localStorage`) to reduce XSS exfiltration risk.

## ADR-004: Structured 8-Stage Chart Analysis with Deterministic Indicators
- **Decision**: Separate vision extraction from deterministic OHLCV math (`technicalindicators`) and enforce a versioned Zod v1.0 schema + Stage 8 financial-safety validator.
- **Rationale**: Prevents hallucinated indicator math from static screenshots and guarantees every output includes explicit limitations, conditional scenarios, and non-advisory disclaimers.

## ADR-005: Transparent Stripe Test-Mode Architecture with Local Fallback Simulator
- **Decision**: Implement real Stripe Checkout + raw-body HMAC webhook signature verification + idempotent event ledger, and provide a clearly labeled Local Test-Mode Webhook Simulator only when `STRIPE_SECRET_KEY` is unset.
- **Rationale**: Never fakes live payments, refuses forged webhooks when Stripe is active, and still enables complete end-to-end entitlement and quota testing in credential-free local environments.
