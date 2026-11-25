# Threat Model & Security Controls

| Threat | Vector | Implemented Mitigation |
|---|---|---|
| Credential Exposure | Leaking API keys or DB secrets to client bundle | All secrets (`GEMINI_API_KEY`, `SQL_PASSWORD`, `STRIPE_SECRET_KEY`, `JWT_SECRET`) read strictly server-side in `server.ts` / `src/server/*`. |
| Broken Access Control / IDOR | User B reading/mutating User A's analyses, uploads, chats, or KB chunks | Every query filters explicitly by `eq(table.userId, req.user.id)`. Cross-tenant queries return `404`. Admin routes enforce `requireAdmin` (`403`). |
| Malicious File Upload / Decompression Bomb | Spoofed MIME types, SVG/XSS payloads, giant dimensions, path traversal | Server-side magic-byte inspection (`PNG`, `JPEG`, `WebP` only), binary header dimension limit (`<= 6000x6000`, `<= 25MP`), 10 MB size cap, UUID storage keys confined via `assertConfinedPath`. |
| Prompt Injection | Malicious instructions embedded inside chart images, user notes, or RAG docs | Delimited untrusted-content wrappers (`wrapUntrustedData`) + system prompt separation + Stage 8 financial safety & schema validator. |
| Forged Billing Webhooks / Replay | Client spoofing upgrade or replaying Stripe events | Raw-body `stripe.webhooks.constructEvent` signature verification + unique `providerEventId` idempotency table (`payment_events`). No client-side success callback grants entitlements. |
| XSS & Clickjacking | Malicious Markdown/HTML or unauthorized framing | `react-markdown` with raw HTML disabled, Helmet security headers (`frame-ancestors 'self'` on app pages; embed route explicitly scoped). |
| Brute Force & Enumeration | Password guessing or account discovery | `express-rate-limit` on auth/API routes, `bcryptjs` hashing, generic login/forgot-password responses. |
| SSRF (Future URL Ingestion) | Internal IP / cloud metadata URL fetches | `validateExternalUrl` blocks private RFC1918, loopback, link-local (`169.254.169.254`), and non-HTTP(S) schemes (`src/utils/security.ts`). |
