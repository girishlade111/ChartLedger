# ChartLedger API Reference

All endpoints are served under `/api` on port `3000`. Authenticated routes require `Authorization: Bearer <token>` (local DB-backed JWT or Firebase ID token).

## System & Public
- `GET /api/health` — Returns service health, DB connectivity check, AI provider status, and Stripe configuration status.
- `GET /api/public/demo/:fixtureId` — Returns deterministic sample OHLCV (`btc_uptrend`, `eurusd_range`, `spx_pullback`) and structured demo analysis.
- `GET /api/public/shares/:token` — Read-only shared analysis report (excludes PII; includes chart image only if explicitly enabled).
- `GET /api/public/widgets/:embedToken` — Read-only embeddable widget configuration & latest sample/spot candles.
- `POST /api/contact` — Rate-limited public contact/support message submission.

## Authentication & User Account
- `POST /api/auth/register` — Email/password registration (`bcryptjs` + PostgreSQL session).
- `POST /api/auth/login` — Email/password login (rate-limited, anti-enumeration error messages).
- `POST /api/auth/logout` — Revokes current PostgreSQL session row.
- `POST /api/auth/forgot-password` — Generates one-time password reset token (generic response to prevent email enumeration).
- `POST /api/auth/reset-password` — Resets password using valid token and revokes active sessions.
- `GET /api/user/profile` | `PATCH /api/user/profile` — Read/update display name and profile metadata.
- `GET /api/user/preferences` | `PATCH /api/user/preferences` — Explicit & inferred research preferences, personalization toggle, theme.
- `GET /api/user/export` — Exports all user-owned records as downloadable JSON.
- `DELETE /api/user/account` — Permanently deletes user account and cascades all tenant data.

## Chart Uploads & Analyses
- `POST /api/uploads` — Multipart or base64 PNG/JPEG/WebP upload with magic-byte signature, size, and pixel dimension guards.
- `GET /api/uploads/:id/file` — Authenticated private file retrieval (owner-scoped).
- `DELETE /api/uploads/:id` — Deletes upload record and file on disk.
- `POST /api/analyses` — Runs 8-stage pipeline (vision or deterministic fixture), enforces monthly quota, persists structured result.
- `GET /api/analyses` | `GET /api/analyses/:id` | `PATCH /api/analyses/:id` | `DELETE /api/analyses/:id` — Owner-scoped CRUD, rename, favorite, tags.
- `POST /api/analyses/:id/share` | `DELETE /api/shares/:id` — Create/revoke opaque read-only share links.

## Streaming Research Chat & Knowledge Base (RAG)
- `GET /api/conversations` | `POST /api/conversations` | `GET /api/conversations/:id` | `PATCH /api/conversations/:id` | `DELETE /api/conversations/:id`
- `POST /api/conversations/:id/stream` — SSE streaming assistant turn with optional attached analysis and tenant-isolated RAG citations.
- `GET /api/knowledge/collections` | `POST /api/knowledge/collections` | `DELETE /api/knowledge/collections/:id`
- `GET /api/knowledge/documents` | `POST /api/knowledge/documents` | `DELETE /api/knowledge/documents/:id`
- `POST /api/knowledge/search` — Per-user hybrid vector + lexical retrieval (`WHERE user_id = req.user.id`).

## Saved Prompts, Watchlist, Billing & Widgets
- `GET /api/prompts` | `POST /api/prompts` | `PATCH /api/prompts/:id` | `DELETE /api/prompts/:id`
- `GET /api/watchlist` | `POST /api/watchlist` | `DELETE /api/watchlist/:id` | `GET /api/market/quote/:symbol`
- `GET /api/widgets` | `POST /api/widgets` | `DELETE /api/widgets/:id`
- `GET /api/billing/plans` | `GET /api/billing/subscription` | `POST /api/billing/checkout` | `POST /api/billing/portal`
- `POST /api/webhooks/stripe` — Raw-body HMAC signature-verified Stripe webhook handler with `payment_events` idempotency.
- `POST /api/billing/simulate-webhook` — Local test-mode simulator (enabled ONLY when `STRIPE_SECRET_KEY` is unset).

## Administration (RBAC `role === 'admin'`)
- `GET /api/admin/overview` | `GET /api/admin/users` | `GET /api/admin/prompts` | `POST /api/admin/prompts` | `POST /api/admin/prompts/:id/activate` | `GET /api/admin/audit-logs`
