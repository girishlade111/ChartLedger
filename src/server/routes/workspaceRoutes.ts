import crypto from 'node:crypto';
import { Router } from 'express';
import Stripe from 'stripe';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  analyses,
  auditLogs,
  contactSubmissions,
  conversations,
  knowledgeDocuments,
  paymentEvents,
  plans,
  promptTemplates,
  savedPrompts,
  subscriptions,
  usageRecords,
  users,
  watchlistItems,
  widgetConfigs,
} from '../../db/schema.ts';
import { AuthRequest, requireAdmin, requireAuth } from '../../middleware/auth.ts';
import { getCurrentPeriodKey, mapStripeSubscriptionStatus } from '../../utils/billing.ts';
import { calculateDeterministicIndicators } from '../../utils/indicators.ts';
import { DEFAULT_PROMPT_TEMPLATES } from '../ai/promptRegistry.ts';
import { getRegisteredProviders } from '../ai/providerRegistry.ts';
import { fetchCryptoMarketData, getSampleMarketData } from '../marketData.ts';

const router = Router();

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) return null;
  return new Stripe(key);
}

// Saved Prompts Library
router.get('/api/prompts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(savedPrompts)
      .where(eq(savedPrompts.userId, req.dbUser!.id))
      .orderBy(desc(savedPrompts.isFavorite), desc(savedPrompts.createdAt));
    res.json({ prompts: rows });
  } catch (error) {
    console.error('List prompts error:', error);
    res.status(500).json({ error: 'Failed to load saved prompts.' });
  }
});

router.post('/api/prompts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(2).max(120),
      category: z.string().min(1).max(40).default('General'),
      content: z.string().min(5).max(2000),
      isFavorite: z.boolean().optional().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Prompt title and content are required.' });
      return;
    }

    const [created] = await db
      .insert(savedPrompts)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        ...parsed.data,
      })
      .returning();
    res.status(201).json({ prompt: created });
  } catch (error) {
    console.error('Create prompt error:', error);
    res.status(500).json({ error: 'Failed to create prompt.' });
  }
});

router.patch('/api/prompts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(2).max(120).optional(),
      category: z.string().min(1).max(40).optional(),
      content: z.string().min(5).max(2000).optional(),
      isFavorite: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid prompt update.' });
      return;
    }

    const [updated] = await db
      .update(savedPrompts)
      .set(parsed.data)
      .where(and(eq(savedPrompts.id, req.params.id), eq(savedPrompts.userId, req.dbUser!.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Prompt not found.' });
      return;
    }
    res.json({ prompt: updated });
  } catch (error) {
    console.error('Patch prompt error:', error);
    res.status(500).json({ error: 'Failed to update prompt.' });
  }
});

router.delete('/api/prompts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(savedPrompts)
      .where(and(eq(savedPrompts.id, req.params.id), eq(savedPrompts.userId, req.dbUser!.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete prompt error:', error);
    res.status(500).json({ error: 'Failed to delete prompt.' });
  }
});

// Watchlist & Market Quotes
router.get('/api/watchlist', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, req.dbUser!.id))
      .orderBy(desc(watchlistItems.createdAt));

    const enriched = await Promise.all(
      items.map(async (item) => {
        const live = await fetchCryptoMarketData(item.symbol, '4h');
        return {
          ...item,
          quote: live
            ? {
                lastPrice: live.lastPrice,
                change24hPercent: live.change24hPercent,
                fetchedAt: live.fetchedAt,
                sourceName: live.sourceName,
                freshness: live.freshness,
              }
            : null,
        };
      })
    );

    res.json({ items: enriched });
  } catch (error) {
    console.error('List watchlist error:', error);
    res.status(500).json({ error: 'Failed to load watchlist.' });
  }
});

router.post('/api/watchlist', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      symbol: z.string().min(2).max(24),
      market: z.string().min(2).max(32).default('Crypto'),
      exchange: z.string().max(48).default('Binance'),
      notes: z.string().max(300).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid symbol is required.' });
      return;
    }

    const [created] = await db
      .insert(watchlistItems)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        symbol: parsed.data.symbol.trim().toUpperCase(),
        market: parsed.data.market,
        exchange: parsed.data.exchange,
        notes: parsed.data.notes,
      })
      .returning();

    res.status(201).json({ item: created });
  } catch (error) {
    console.error('Add watchlist error:', error);
    res.status(500).json({ error: 'Failed to add watchlist symbol.' });
  }
});

router.delete('/api/watchlist/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, req.params.id), eq(watchlistItems.userId, req.dbUser!.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete watchlist error:', error);
    res.status(500).json({ error: 'Failed to remove symbol.' });
  }
});

router.get('/api/market/quote', requireAuth, async (req: AuthRequest, res) => {
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : 'BTCUSDT';
  const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '4h';
  const live = await fetchCryptoMarketData(symbol, timeframe);
  if (live) {
    res.json({
      marketData: live,
      indicators: calculateDeterministicIndicators(live.candles, 'binance_spot'),
    });
    return;
  }
  const sample = getSampleMarketData('btc_uptrend');
  res.json({
    marketData: sample,
    indicators: calculateDeterministicIndicators(sample.candles, 'synthetic_sample'),
    note: 'External public market feed unavailable for this symbol; returning clearly labeled synthetic sample fixture.',
  });
});

// Embeddable Widget Configs
router.get('/api/widgets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(widgetConfigs)
      .where(eq(widgetConfigs.userId, req.dbUser!.id))
      .orderBy(desc(widgetConfigs.createdAt));
    res.json({ widgets: rows });
  } catch (error) {
    console.error('List widgets error:', error);
    res.status(500).json({ error: 'Failed to load widget configurations.' });
  }
});

router.post('/api/widgets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(80),
      allowedDomains: z.string().max(300).default('*'),
      theme: z.enum(['dark', 'light']).default('dark'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid widget configuration.' });
      return;
    }

    const [created] = await db
      .insert(widgetConfigs)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        name: parsed.data.name.trim(),
        allowedDomains: parsed.data.allowedDomains.trim(),
        theme: parsed.data.theme,
        embedToken: crypto.randomBytes(18).toString('hex'),
      })
      .returning();

    res.status(201).json({ widget: created });
  } catch (error) {
    console.error('Create widget error:', error);
    res.status(500).json({ error: 'Failed to create widget.' });
  }
});

router.delete('/api/widgets/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(widgetConfigs)
      .where(and(eq(widgetConfigs.id, req.params.id), eq(widgetConfigs.userId, req.dbUser!.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete widget error:', error);
    res.status(500).json({ error: 'Failed to delete widget.' });
  }
});

router.get('/api/public/widgets/:token', async (req, res) => {
  try {
    const [widget] = await db
      .select()
      .from(widgetConfigs)
      .where(eq(widgetConfigs.embedToken, req.params.token))
      .limit(1);

    if (!widget) {
      res.status(404).json({ error: 'Widget configuration not found.' });
      return;
    }

    const demo = getSampleMarketData('btc_uptrend');
    res.json({
      widget: { name: widget.name, theme: widget.theme },
      sampleData: demo,
      indicators: calculateDeterministicIndicators(demo.candles, 'widget_sample'),
    });
  } catch (error) {
    console.error('Public widget error:', error);
    res.status(500).json({ error: 'Failed to load embed widget.' });
  }
});

// Billing, Plans, Usage & Stripe Test Mode
router.get('/api/billing/plans', async (_req, res) => {
  try {
    const rows = await db.select().from(plans).where(eq(plans.active, true));
    res.json({
      plans: rows,
      stripeTestModeConfigured: getStripeClient() !== null,
    });
  } catch (error) {
    console.error('List plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
});

router.get('/api/billing/subscription', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    const periodKey = getCurrentPeriodKey();
    const [[sub], [plan], [usage], kbCountRows] = await Promise.all([
      db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1),
      db.select().from(plans).where(eq(plans.id, user.planId)).limit(1),
      db
        .select()
        .from(usageRecords)
        .where(and(eq(usageRecords.userId, user.id), eq(usageRecords.periodKey, periodKey)))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.userId, user.id)),
    ]);

    res.json({
      subscription: sub || { planId: user.planId, status: 'active' },
      plan: plan || {
        id: 'free',
        name: 'Free Research',
        priceMonthlyCents: 0,
        analysesLimit: 15,
        messagesLimit: 75,
        kbDocsLimit: 5,
      },
      usage: {
        periodKey,
        analysesCount: usage?.analysesCount ?? 0,
        messagesCount: usage?.messagesCount ?? 0,
        tokensUsed: usage?.tokensUsed ?? 0,
        kbDocsCount: kbCountRows[0]?.count ?? 0,
      },
      stripeTestModeConfigured: getStripeClient() !== null,
    });
  } catch (error) {
    console.error('Billing status error:', error);
    res.status(500).json({ error: 'Failed to load billing summary.' });
  }
});

router.post('/api/billing/checkout', requireAuth, async (req: AuthRequest, res) => {
  try {
    const stripe = getStripeClient();
    const user = req.dbUser!;
    const priceId = process.env.STRIPE_PRO_PRICE_ID;

    if (!stripe || !priceId) {
      res.json({
        mode: 'local_test_fixture',
        message:
          'Stripe test credentials (STRIPE_SECRET_KEY & STRIPE_PRO_PRICE_ID) are not configured in environment. Use the clearly labeled Local Webhook Simulator below to verify entitlement state transitions.',
      });
      return;
    }

    const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: String(user.id), targetPlanId: 'pro' },
      success_url: `${origin}/?view=billing&checkout=pending_webhook`,
      cancel_url: `${origin}/?view=billing&checkout=canceled`,
    });

    res.json({ mode: 'stripe_test', checkoutUrl: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to initialize Stripe test checkout.' });
  }
});

// Explicitly labeled local test-mode webhook fixture (only allowed when Stripe test key is NOT set)
router.post('/api/billing/simulate-test-webhook', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (getStripeClient() !== null) {
      res.status(403).json({
        error: 'Local webhook simulation is disabled when live Stripe test credentials are active.',
      });
      return;
    }

    const schema = z.object({
      action: z.enum(['upgrade_pro', 'downgrade_free']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid simulation action.' });
      return;
    }

    const user = req.dbUser!;
    const eventId = `evt_local_sim_${crypto.randomUUID()}`;
    const targetPlan = parsed.data.action === 'upgrade_pro' ? 'pro' : 'free';

    await db.insert(paymentEvents).values({
      stripeEventId: eventId,
      eventType:
        targetPlan === 'pro'
          ? 'local_fixture.subscription.upgraded'
          : 'local_fixture.subscription.canceled',
      payloadJson: { userId: user.id, targetPlan, simulated: true },
    });

    await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        planId: targetPlan,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          planId: targetPlan,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      });

    await db
      .update(users)
      .set({ planId: targetPlan, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await db.insert(auditLogs).values({
      actorUserId: user.id,
      action: `billing.local_test_sim.${targetPlan}`,
      resourceType: 'subscription',
      resourceId: eventId,
      metadataJson: { simulated: true },
    });

    res.json({
      ok: true,
      simulated: true,
      eventId,
      planId: targetPlan,
      note: 'Updated via local Stripe test-mode webhook fixture (no real payment processed).',
    });
  } catch (error) {
    console.error('Simulate webhook error:', error);
    res.status(500).json({ error: 'Failed to process test-mode webhook fixture.' });
  }
});

// Real Stripe webhook handler (raw body mounted in server.ts)
export async function handleStripeWebhook(req: any, res: any): Promise<void> {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];

  if (!stripe || !secret || typeof sig !== 'string') {
    res.status(400).json({ error: 'Stripe webhook signature verification not configured or missing header.' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Invalid Stripe signature:', err);
    res.status(400).json({ error: 'Invalid webhook signature.' });
    return;
  }

  // Idempotent event check
  const existing = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(eq(paymentEvents.stripeEventId, event.id))
    .limit(1);

  if (existing.length > 0) {
    res.json({ received: true, duplicate: true });
    return;
  }

  await db.insert(paymentEvents).values({
    stripeEventId: event.id,
    eventType: event.type,
    payloadJson: { id: event.id, type: event.type },
  });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = Number(session.metadata?.userId);
    if (Number.isInteger(userId) && userId > 0) {
      await db
        .insert(subscriptions)
        .values({
          userId,
          planId: 'pro',
          status: 'active',
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === 'string' ? session.subscription : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            planId: 'pro',
            status: 'active',
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripeSubscriptionId:
              typeof session.subscription === 'string' ? session.subscription : null,
            updatedAt: new Date(),
          },
        });
      await db.update(users).set({ planId: 'pro', updatedAt: new Date() }).where(eq(users.id, userId));
    }
  } else if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const mappedStatus = mapStripeSubscriptionStatus(sub.status);
    const nextPlan = mappedStatus === 'active' || mappedStatus === 'trialing' ? 'pro' : 'free';

    const updatedSubs = await db
      .update(subscriptions)
      .set({ planId: nextPlan, status: mappedStatus, updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .returning({ userId: subscriptions.userId });

    if (updatedSubs[0]) {
      await db
        .update(users)
        .set({ planId: nextPlan, updatedAt: new Date() })
        .where(eq(users.id, updatedSubs[0].userId));
    }
  }

  res.json({ received: true });
}

// Public Contact Form
router.post('/api/public/contact', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(100),
      email: z.string().email().max(255),
      topic: z.string().min(2).max(60).default('General'),
      message: z.string().min(10).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all contact fields (message min 10 chars).' });
      return;
    }

    await db.insert(contactSubmissions).values(parsed.data);
    res.status(201).json({ ok: true, message: 'Thank you. Your inquiry has been recorded.' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to submit message.' });
  }
});

// Provider Capabilities
router.get('/api/providers', requireAuth, (_req, res) => {
  res.json({ providers: getRegisteredProviders() });
});

// Administration Endpoints (Strict RBAC + Audit Logged)
router.get('/api/admin/overview', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const [
      [userCount],
      [analysisCount],
      [convCount],
      [docCount],
      [proCount],
      [tokenSum],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(analyses),
      db.select({ count: sql<number>`count(*)::int` }).from(conversations),
      db.select({ count: sql<number>`count(*)::int` }).from(knowledgeDocuments),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.planId, 'pro')),
      db.select({ total: sql<number>`coalesce(sum(${analyses.tokensUsed}), 0)::int` }).from(analyses),
    ]);

    await db.insert(auditLogs).values({
      actorUserId: req.dbUser!.id,
      action: 'admin.view_overview',
      resourceType: 'system',
      metadataJson: {},
    });

    res.json({
      metrics: {
        registeredUsers: userCount?.count ?? 0,
        proSubscribers: proCount?.count ?? 0,
        totalAnalyses: analysisCount?.count ?? 0,
        totalConversations: convCount?.count ?? 0,
        indexedKnowledgeDocs: docCount?.count ?? 0,
        totalAnalysisTokens: tokenSum?.total ?? 0,
      },
      providers: getRegisteredProviders(),
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

router.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        planId: users.planId,
        onboardingCompleted: users.onboardingCompleted,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(100);
    res.json({ users: rows });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

router.get('/api/admin/analyses', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: analyses.id,
        userId: analyses.userId,
        title: analyses.title,
        symbol: analyses.symbol,
        timeframe: analyses.timeframe,
        status: analyses.status,
        marketBias: analyses.marketBias,
        provider: analyses.provider,
        model: analyses.model,
        tokensUsed: analyses.tokensUsed,
        createdAt: analyses.createdAt,
      })
      .from(analyses)
      .orderBy(desc(analyses.createdAt))
      .limit(100);
    res.json({ analyses: rows });
  } catch (error) {
    console.error('Admin analyses error:', error);
    res.status(500).json({ error: 'Failed to load analyses.' });
  }
});

router.get('/api/admin/prompts', requireAuth, requireAdmin, async (_req, res) => {
  try {
    let rows = await db.select().from(promptTemplates);
    if (rows.length === 0) {
      await db
        .insert(promptTemplates)
        .values(
          DEFAULT_PROMPT_TEMPLATES.map((p) => ({
            id: p.id,
            name: p.name,
            version: p.version,
            systemPrompt: p.systemPrompt,
            active: true,
            updatedBy: 'system',
          }))
        )
        .onConflictDoNothing();
      rows = await db.select().from(promptTemplates);
    }
    res.json({ templates: rows });
  } catch (error) {
    console.error('Admin prompts error:', error);
    res.status(500).json({ error: 'Failed to load prompt templates.' });
  }
});

router.put('/api/admin/prompts/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      systemPrompt: z.string().min(40).max(8000),
      active: z.boolean().optional().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'System prompt must be between 40 and 8,000 characters.' });
      return;
    }

    const [updated] = await db
      .update(promptTemplates)
      .set({
        systemPrompt: parsed.data.systemPrompt,
        active: parsed.data.active,
        version: sql`${promptTemplates.version} + 1`,
        updatedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(promptTemplates.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Prompt template not found.' });
      return;
    }

    await db.insert(auditLogs).values({
      actorUserId: req.dbUser!.id,
      action: 'admin.update_prompt_template',
      resourceType: 'prompt_template',
      resourceId: updated.id,
      metadataJson: { version: updated.version },
    });

    res.json({ template: updated });
  } catch (error) {
    console.error('Update prompt template error:', error);
    res.status(500).json({ error: 'Failed to update prompt template.' });
  }
});

router.patch('/api/admin/plans/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      priceMonthlyCents: z.number().int().min(0).max(1000000).optional(),
      analysesLimit: z.number().int().min(1).max(100000).optional(),
      messagesLimit: z.number().int().min(1).max(100000).optional(),
      kbDocsLimit: z.number().int().min(1).max(10000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid plan limits.' });
      return;
    }

    const [updated] = await db
      .update(plans)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(plans.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }

    await db.insert(auditLogs).values({
      actorUserId: req.dbUser!.id,
      action: 'admin.update_plan',
      resourceType: 'plan',
      resourceId: updated.id,
      metadataJson: parsed.data,
    });

    res.json({ plan: updated });
  } catch (error) {
    console.error('Admin update plan error:', error);
    res.status(500).json({ error: 'Failed to update plan.' });
  }
});

router.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    res.json({ logs: rows });
  } catch (error) {
    console.error('Admin audit logs error:', error);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

export default router;
