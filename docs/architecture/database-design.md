# Database Architecture & Entity Relationships

ChartLedger uses **PostgreSQL 18.6** on Cloud SQL (`ai-studio-916a043b`, region `asia-southeast1`) with the `pgvector` (`0.8.5`) extension enabled and **Drizzle ORM** (`src/db/schema.ts`).

## Entity Groups (20 Tables)

### Identity, Sessions & Preferences
1. `users`: `id` (UUID PK), `email` (unique), `passwordHash`, `firebaseUid` (unique), `displayName`, `role` (`user` | `admin`), `emailVerified`, timestamps.
2. `sessions`: `id` (UUID PK), `userId` (FK -> `users.id`, cascade), `tokenHash` (unique), `expiresAt`, `revokedAt`.
3. `password_reset_tokens`: `id`, `userId` (FK), `tokenHash` (unique), `expiresAt`, `usedAt`.
4. `user_preferences`: `userId` (PK/FK -> `users.id`), explicit onboarding & research style settings, inferred history summary JSONB, `personalizationEnabled`, `theme`.

### Billing, Plans & Usage Accounting
5. `plans`: `id` (`free`, `pro`), `name`, `priceCents` (minor currency units), `monthlyAnalysisLimit`, `monthlyMessageLimit`, `kbDocLimit`, `stripePriceId`, `featuresJson`.
6. `subscriptions`: `id`, `userId` (FK), `planId` (FK -> `plans.id`), `status`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodEnd`, `cancelAtPeriodEnd`.
7. `payment_events`: `id`, `providerEventId` (unique for webhook idempotency), `eventType`, `payloadJson`, `processedAt`.
8. `usage_periods`: `id`, `userId` (FK), `periodKey` (`YYYY-MM`, unique with `userId`), `analysesUsed`, `messagesUsed`, `tokensUsed`, `estimatedCostMicros`.

### Chart Uploads & 8-Stage Analyses
9. `chart_uploads`: `id`, `userId` (FK), `storageKey`, `originalFilename`, `mimeType`, `byteSize`, `width`, `height`, `sha256`.
10. `analyses`: `id`, `userId` (FK), `uploadId` (FK nullable), `title`, `symbol`, `marketCategory`, `timeframe`, `status`, `isFavorite`, `tagsJson`, `provider`, `modelName`, `promptVersionId`, `resultJson` (Zod v1.0 schema), `isDemoFixture`.
11. `shared_analyses`: `id`, `analysisId` (FK), `userId` (FK), `shareToken` (unique opaque random hex), `includeImage`, `expiresAt`, `revokedAt`.

### Research Chat & Saved Prompts
12. `conversations`: `id`, `userId` (FK), `analysisId` (FK nullable), `title`, `createdAt`, `updatedAt`.
13. `messages`: `id`, `conversationId` (FK -> `conversations.id`, cascade), `userId` (FK), `role`, `content`, `citationsJson`, `tokenCount`.
14. `saved_prompts`: `id`, `userId` (FK), `title`, `category`, `content`, `isFavorite`, `isDefault`.

### Tenant-Isolated Knowledge Base (RAG)
15. `knowledge_collections`: `id`, `userId` (FK), `name`, `description`.
16. `knowledge_documents`: `id`, `collectionId` (FK), `userId` (FK), `title`, `sourceType`, `mimeType`, `sha256`, `status`, `chunkCount`, `byteSize`.
17. `knowledge_chunks`: `id`, `documentId` (FK), `collectionId` (FK), `userId` (FK), `chunkIndex`, `content`, `embeddingModel`, `embeddingJson`.

### Watchlist, Widgets, Prompts & Governance
18. `watchlist_items`: `id`, `userId` (FK), `symbol`, `marketCategory`, `exchange`, `notes`.
19. `widget_configurations`: `id`, `userId` (FK), `embedToken` (unique), `title`, `symbol`, `timeframe`, `theme`, `allowedDomainsJson`.
20. `prompt_versions` & `audit_logs` & `contact_messages`: System prompt governance, RBAC audit trail, and public contact submissions. (Schema defines 20 core tables pushed via `cloudsql.UpdateSchema`.)

## Multi-Tenant Isolation Guarantees
- Every user-owned table carries `userId` referencing `users.id` with `ON DELETE CASCADE`.
- Every read, update, delete, and RAG retrieval query scopes `WHERE user_id = req.user.id`.
- Cross-tenant resource lookups return `404 Not Found` rather than leaking existence.
