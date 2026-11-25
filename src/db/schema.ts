import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const plans = pgTable('plans', {
  id: text('id').primaryKey(), // 'free' | 'pro'
  name: text('name').notNull(),
  description: text('description').notNull(),
  priceMonthlyCents: integer('price_monthly_cents').notNull().default(0),
  analysesLimit: integer('analyses_limit').notNull().default(10),
  messagesLimit: integer('messages_limit').notNull().default(50),
  kbDocsLimit: integer('kb_docs_limit').notNull().default(5),
  featuresJson: jsonb('features_json').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(), // Firebase UID or local_<uuid>
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull().default('Trader'),
    role: text('role').notNull().default('user'), // 'user' | 'admin'
    planId: text('plan_id')
      .references(() => plans.id)
      .notNull()
      .default('free'),
    emailVerified: boolean('email_verified').notNull().default(false),
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    preferencesJson: jsonb('preferences_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    termsAcceptedAt: timestamp('terms_accepted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('users_email_idx').on(t.email)]
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)]
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    planId: text('plan_id')
      .references(() => plans.id)
      .notNull()
      .default('free'),
    status: text('status').notNull().default('active'), // active | past_due | canceled | trialing
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('subscriptions_stripe_sub_idx').on(t.stripeSubscriptionId)]
);

export const paymentEvents = pgTable('payment_events', {
  id: serial('id').primaryKey(),
  stripeEventId: text('stripe_event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull().default({}),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});

export const usageRecords = pgTable(
  'usage_records',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    periodKey: text('period_key').notNull(), // YYYY-MM
    analysesCount: integer('analyses_count').notNull().default(0),
    messagesCount: integer('messages_count').notNull().default(0),
    tokensUsed: integer('tokens_used').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('usage_user_period_uidx').on(t.userId, t.periodKey)]
);

export const chartUploads = pgTable(
  'chart_uploads',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path').notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('uploads_user_idx').on(t.userId)]
);

export const analyses = pgTable(
  'analyses',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    uploadId: text('upload_id').references(() => chartUploads.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    symbol: text('symbol'),
    market: text('market'),
    exchange: text('exchange'),
    timeframe: text('timeframe'),
    status: text('status').notNull().default('completed'), // processing | completed | insufficient_data | failed
    marketBias: text('market_bias').notNull().default('uncertain'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    isFavorite: boolean('is_favorite').notNull().default(false),
    isDemoFixture: boolean('is_demo_fixture').notNull().default(false),
    tagsJson: jsonb('tags_json').$type<string[]>().notNull().default([]),
    resultJson: jsonb('result_json').$type<Record<string, unknown>>().notNull(),
    tokensUsed: integer('tokens_used').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('analyses_user_created_idx').on(t.userId, t.createdAt),
    index('analyses_symbol_idx').on(t.symbol),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    analysisId: text('analysis_id').references(() => analyses.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('conversations_user_idx').on(t.userId)]
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(), // UUID
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    citationsJson: jsonb('citations_json').$type<Record<string, unknown>[]>().notNull().default([]),
    tokensUsed: integer('tokens_used').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('messages_conv_created_idx').on(t.conversationId, t.createdAt)]
);

export const knowledgeCollections = pgTable(
  'knowledge_collections',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('kb_collections_user_idx').on(t.userId)]
);

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: text('id').primaryKey(), // UUID
    collectionId: text('collection_id')
      .references(() => knowledgeCollections.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    sourceType: text('source_type').notNull().default('markdown'), // txt | markdown | csv | json | pdf | note
    contentHash: text('content_hash').notNull(),
    charCount: integer('char_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    status: text('status').notNull().default('indexed'), // indexing | indexed | failed
    embeddingModel: text('embedding_model').notNull().default('gemini-embedding-2'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('kb_docs_user_idx').on(t.userId)]
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(), // UUID
    documentId: text('document_id')
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embeddingJson: jsonb('embedding_json').$type<number[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('kb_chunks_user_idx').on(t.userId),
    index('kb_chunks_doc_idx').on(t.documentId),
  ]
);

export const savedPrompts = pgTable(
  'saved_prompts',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default('General'),
    content: text('content').notNull(),
    isFavorite: boolean('is_favorite').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('saved_prompts_user_idx').on(t.userId)]
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    symbol: text('symbol').notNull(),
    market: text('market').notNull().default('Crypto'),
    exchange: text('exchange').notNull().default('Binance'),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('watchlist_user_idx').on(t.userId)]
);

export const sharedAnalyses = pgTable(
  'shared_analyses',
  {
    id: text('id').primaryKey(), // UUID
    analysisId: text('analysis_id')
      .references(() => analyses.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    shareToken: text('share_token').notNull().unique(),
    includeImage: boolean('include_image').notNull().default(false),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('shares_token_idx').on(t.shareToken)]
);

export const widgetConfigs = pgTable(
  'widget_configurations',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    allowedDomains: text('allowed_domains').notNull().default('*'),
    theme: text('theme').notNull().default('dark'),
    embedToken: text('embed_token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('widgets_user_idx').on(t.userId)]
);

export const promptTemplates = pgTable('prompt_templates', {
  id: text('id').primaryKey(), // slug
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  systemPrompt: text('system_prompt').notNull(),
  active: boolean('active').notNull().default(true),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('audit_created_idx').on(t.createdAt)]
);

export const contactSubmissions = pgTable('contact_submissions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  topic: text('topic').notNull().default('General'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    symbol: text('symbol').notNull(),
    market: text('market').notNull().default('Crypto'),
    condition: text('condition').notNull().default('above'), // above | below
    targetPrice: doublePrecision('target_price').notNull(),
    note: text('note').notNull().default(''),
    status: text('status').notNull().default('active'), // active | paused | triggered
    lastCheckedPrice: doublePrecision('last_checked_price'),
    lastCheckedAt: timestamp('last_checked_at'),
    triggeredPrice: doublePrecision('triggered_price'),
    triggeredAt: timestamp('triggered_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('price_alerts_user_idx').on(t.userId)]
);

export const portfolioHoldings = pgTable(
  'portfolio_holdings',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    symbol: text('symbol').notNull(),
    market: text('market').notNull().default('Crypto'),
    quantity: doublePrecision('quantity').notNull(),
    avgCost: doublePrecision('avg_cost').notNull(),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('portfolio_holdings_user_idx').on(t.userId)]
);

export const usersRelations = relations(users, ({ many, one }) => ({
  plan: one(plans, { fields: [users.planId], references: [plans.id] }),
  subscription: one(subscriptions, { fields: [users.id], references: [subscriptions.userId] }),
  uploads: many(chartUploads),
  analyses: many(analyses),
  conversations: many(conversations),
  prompts: many(savedPrompts),
  watchlist: many(watchlistItems),
  priceAlerts: many(priceAlerts),
  portfolioHoldings: many(portfolioHoldings),
}));

export const analysesRelations = relations(analyses, ({ one }) => ({
  owner: one(users, { fields: [analyses.userId], references: [users.id] }),
  upload: one(chartUploads, { fields: [analyses.uploadId], references: [chartUploads.id] }),
}));

