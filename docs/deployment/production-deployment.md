# Production Deployment Guide

## Build & Runtime Requirements
- **Node.js**: 22 LTS
- **PostgreSQL**: 16+ / 18+ with `pgvector` extension enabled (`CREATE EXTENSION IF NOT EXISTS vector;`)
- **Port**: `3000` (Express serves both `/api/*` and the compiled `dist/` SPA when `NODE_ENV=production`)

## Required Environment Variables
See `.env.example` for the complete list:
- `GEMINI_API_KEY` — Required for live Gemini 4 Hydrogen chart vision, streaming chat, and Gemini Embedding 2.
- `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` — Cloud SQL / PostgreSQL credentials.
- `JWT_SECRET` — High-entropy random secret (`>= 32 bytes`) for local email/password session signing.
- `APP_URL` — Public HTTPS origin (used for CORS, Stripe Checkout return URLs, and share links).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` — Required for real Stripe Checkout & webhooks (keep test mode keys until approved for production).

## Build & Start Commands
```bash
npm ci
npm run build
NODE_ENV=production npm start
```

## Database Migrations, Backup & Rollback
- Push schema changes via Drizzle (`npx drizzle-kit push --config=src/db/drizzle.config.ts`) or managed Cloud SQL migration jobs.
- Enable automated daily Cloud SQL point-in-time recovery (PITR) backups prior to production traffic.
- Rollback strategy: deploy previous immutable container image tag; apply backward-compatible additive SQL migrations before destructive drops.

## Container Deployment
A multi-stage `Dockerfile` and local `docker-compose.yml` (with `pgvector/pgvector:pg16` reference service) are included in the repository root. Note: Docker daemon is not installed in the build container, so container image builds should be run in CI/CD or Cloud Build.
