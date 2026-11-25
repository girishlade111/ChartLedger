import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { portfolioHoldings, priceAlertHistory, priceAlerts } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import {
  buildAlertHistoryStats,
  buildPortfolioPerformanceSeries,
  buildPortfolioSummary,
  computeAlertOutcomeMetrics,
  evaluatePriceAlert,
  type AlertOutcomeStatus,
  type PriceAlertCondition,
  type PriceAlertStatus,
} from '../../utils/portfolioAndAlerts.ts';
import { fetchCryptoMarketData, fetchRealTimeSpotPrice } from '../marketData.ts';
import { generatePortfolioPdfBuffer } from '../portfolioPdf.ts';
import { buildPortfolioMarketSentiment } from '../../utils/marketSentiment.ts';
import {
  dispatchPriceAlertEmailIfEnabled,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} from '../alertNotifier.ts';

const router = Router();

const marketPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many live quote requests. Please wait briefly.' },
});

async function recordTriggeredAlertHistory(params: {
  userId: number;
  alertId: string;
  symbol: string;
  market: string;
  condition: string;
  targetPrice: number;
  triggeredPrice: number;
  alertNote: string;
  triggeredAt: Date;
}) {
  await db.insert(priceAlertHistory).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    alertId: params.alertId,
    symbol: params.symbol,
    market: params.market,
    condition: params.condition,
    targetPrice: params.targetPrice,
    triggeredPrice: params.triggeredPrice,
    alertNote: params.alertNote,
    outcomeStatus: 'pending_review',
    outcomeNote: '',
    triggeredAt: params.triggeredAt,
  });
}

async function evaluateAndEnrichAlerts(userId: number, bypassCache = false) {
  const rows = await db
    .select()
    .from(priceAlerts)
    .where(eq(priceAlerts.userId, userId))
    .orderBy(desc(priceAlerts.createdAt));

  // Deduplicate real-time quote fetches across symbols
  const uniqueSymbols = Array.from(new Set(rows.map((r) => r.symbol)));
  const quoteMap = new Map<string, Awaited<ReturnType<typeof fetchRealTimeSpotPrice>>>();
  await Promise.all(
    uniqueSymbols.map(async (sym) => {
      const q = await fetchRealTimeSpotPrice(sym, bypassCache);
      quoteMap.set(sym, q);
    })
  );

  const now = new Date();
  const newlyTriggered: Array<{
    id: string;
    symbol: string;
    condition: string;
    targetPrice: number;
    triggeredPrice: number;
    note: string;
  }> = [];

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const quote = quoteMap.get(row.symbol) ?? null;
      const currentPrice = quote?.lastPrice ?? null;
      const evalResult = evaluatePriceAlert(
        {
          condition: row.condition as PriceAlertCondition,
          targetPrice: row.targetPrice,
          status: row.status as PriceAlertStatus,
        },
        currentPrice
      );

      let updatedRow = row;
      if (evalResult.shouldTrigger && currentPrice !== null) {
        const [saved] = await db
          .update(priceAlerts)
          .set({
            status: 'triggered',
            lastCheckedPrice: currentPrice,
            lastCheckedAt: now,
            triggeredPrice: currentPrice,
            triggeredAt: now,
          })
          .where(and(eq(priceAlerts.id, row.id), eq(priceAlerts.userId, userId)))
          .returning();
        if (saved) {
          updatedRow = saved;
          await recordTriggeredAlertHistory({
            userId,
            alertId: saved.id,
            symbol: saved.symbol,
            market: saved.market,
            condition: saved.condition,
            targetPrice: saved.targetPrice,
            triggeredPrice: currentPrice,
            alertNote: saved.note,
            triggeredAt: now,
          });
          await dispatchPriceAlertEmailIfEnabled({
            userId,
            alertId: saved.id,
            symbol: saved.symbol,
            condition: saved.condition,
            targetPrice: saved.targetPrice,
            triggeredPrice: currentPrice,
            note: saved.note,
          });
          newlyTriggered.push({
            id: saved.id,
            symbol: saved.symbol,
            condition: saved.condition,
            targetPrice: saved.targetPrice,
            triggeredPrice: currentPrice,
            note: saved.note,
          });
        }
      } else if (currentPrice !== null) {
        await db
          .update(priceAlerts)
          .set({
            lastCheckedPrice: currentPrice,
            lastCheckedAt: now,
          })
          .where(and(eq(priceAlerts.id, row.id), eq(priceAlerts.userId, userId)));
        updatedRow = { ...row, lastCheckedPrice: currentPrice, lastCheckedAt: now };
      }

      return {
        ...updatedRow,
        liveQuote: quote
          ? {
              lastPrice: quote.lastPrice,
              change24hPercent: quote.change24hPercent,
              high24h: quote.high24h,
              low24h: quote.low24h,
              fetchedAt: quote.fetchedAt,
              sourceName: quote.sourceName,
            }
          : null,
        distancePercent: evalResult.distancePercent,
        distanceAmount: evalResult.distanceAmount,
      };
    })
  );

  return {
    alerts: enriched,
    newlyTriggered,
    checkedAt: now.toISOString(),
  };
}

async function computeUserPortfolioData(userId: number, rangeParam: number) {
  const rangeDays = rangeParam === 7 ? 7 : rangeParam === 90 ? 90 : 30;
  const candleTf = rangeDays === 7 ? '4h' : '1d';
  const candleBars = rangeDays === 7 ? 42 : rangeDays; // 42 x 4h = 7 days

  const rows = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.userId, userId))
    .orderBy(desc(portfolioHoldings.createdAt));

  const uniqueSymbols = Array.from(new Set(rows.map((r) => r.symbol)));
  const spotMap = new Map<string, Awaited<ReturnType<typeof fetchRealTimeSpotPrice>>>();
  const ohlcvMap = new Map<string, Awaited<ReturnType<typeof fetchCryptoMarketData>>>();

  await Promise.all(
    uniqueSymbols.map(async (sym) => {
      const [spot, ohlcv] = await Promise.all([
        fetchRealTimeSpotPrice(sym, false),
        fetchCryptoMarketData(sym, candleTf),
      ]);
      spotMap.set(sym, spot);
      ohlcvMap.set(sym, ohlcv);
    })
  );

  const summary = buildPortfolioSummary(
    rows.map((row) => {
      const spot = spotMap.get(row.symbol);
      const ohlcv = ohlcvMap.get(row.symbol);
      return {
        holding: {
          id: row.id,
          symbol: row.symbol,
          market: row.market,
          quantity: row.quantity,
          avgCost: row.avgCost,
          notes: row.notes,
        },
        livePrice: spot?.lastPrice ?? ohlcv?.lastPrice ?? null,
        change24hPercent: spot?.change24hPercent ?? ohlcv?.change24hPercent ?? null,
        sourceName: spot?.sourceName ?? ohlcv?.sourceName ?? null,
        fetchedAt: spot?.fetchedAt ?? ohlcv?.fetchedAt ?? null,
      };
    })
  );

  const performance = buildPortfolioPerformanceSeries(
    rows.map((row) => ({
      holding: {
        id: row.id,
        symbol: row.symbol,
        market: row.market,
        quantity: row.quantity,
        avgCost: row.avgCost,
        notes: row.notes,
      },
      candles: ohlcvMap.get(row.symbol)?.candles ?? null,
    })),
    candleBars
  );

  return {
    rangeDays,
    summary,
    performance: {
      ...performance,
      rangeDays,
    },
    fetchedAt: new Date().toISOString(),
  };
}

// ============================================================================
// REAL-TIME PRICE ALERTS
// ============================================================================

router.get('/api/alerts', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const bypass = req.query.fresh === '1' || req.query.evaluate === 'true';
    const data = await evaluateAndEnrichAlerts(req.dbUser!.id, bypass);
    res.json(data);
  } catch (error) {
    console.error('List alerts error:', error);
    res.status(500).json({ error: 'Failed to load price alerts.' });
  }
});

router.post('/api/alerts/evaluate', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const data = await evaluateAndEnrichAlerts(req.dbUser!.id, true);
    res.json(data);
  } catch (error) {
    console.error('Evaluate alerts error:', error);
    res.status(500).json({ error: 'Failed to evaluate real-time price alerts.' });
  }
});

// ============================================================================
// TRIGGERED ALERT HISTORY LOG & OUTCOMES
// ============================================================================

router.get('/api/alerts/history', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const bypass = req.query.fresh === '1';
    const rows = await db
      .select()
      .from(priceAlertHistory)
      .where(eq(priceAlertHistory.userId, req.dbUser!.id))
      .orderBy(desc(priceAlertHistory.triggeredAt));

    const uniqueSymbols = Array.from(new Set(rows.map((r) => r.symbol)));
    const quoteMap = new Map<string, Awaited<ReturnType<typeof fetchRealTimeSpotPrice>>>();
    await Promise.all(
      uniqueSymbols.map(async (sym) => {
        const q = await fetchRealTimeSpotPrice(sym, bypass);
        quoteMap.set(sym, q);
      })
    );

    const enriched = rows.map((row) => {
      const quote = quoteMap.get(row.symbol) ?? null;
      const metrics = computeAlertOutcomeMetrics(
        row.condition as PriceAlertCondition,
        row.targetPrice,
        row.triggeredPrice,
        quote?.lastPrice ?? null
      );
      return {
        id: row.id,
        alertId: row.alertId,
        symbol: row.symbol,
        market: row.market,
        condition: row.condition as PriceAlertCondition,
        targetPrice: row.targetPrice,
        triggeredPrice: row.triggeredPrice,
        alertNote: row.alertNote,
        outcomeStatus: row.outcomeStatus as AlertOutcomeStatus,
        outcomeNote: row.outcomeNote,
        triggeredAt: row.triggeredAt.toISOString(),
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        metrics,
      };
    });

    const stats = buildAlertHistoryStats(enriched);
    res.json({
      history: enriched,
      stats,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('List alert history error:', error);
    res.status(500).json({ error: 'Failed to load alert history.' });
  }
});

router.patch('/api/alerts/history/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      outcomeStatus: z
        .enum(['pending_review', 'actioned', 'confirmed_move', 'false_breakout', 'ignored'])
        .optional(),
      outcomeNote: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid alert history outcome update.' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.outcomeStatus !== undefined) {
      updates.outcomeStatus = parsed.data.outcomeStatus;
      updates.reviewedAt = parsed.data.outcomeStatus === 'pending_review' ? null : new Date();
    }
    if (parsed.data.outcomeNote !== undefined) {
      updates.outcomeNote = parsed.data.outcomeNote.trim();
      if (!updates.reviewedAt && parsed.data.outcomeNote.trim().length > 0) {
        updates.reviewedAt = new Date();
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields provided to update.' });
      return;
    }

    const [updated] = await db
      .update(priceAlertHistory)
      .set(updates)
      .where(
        and(eq(priceAlertHistory.id, req.params.id), eq(priceAlertHistory.userId, req.dbUser!.id))
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Alert history entry not found.' });
      return;
    }

    res.json({ entry: updated });
  } catch (error) {
    console.error('Update alert history error:', error);
    res.status(500).json({ error: 'Failed to update alert history outcome.' });
  }
});

router.delete('/api/alerts/history/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(priceAlertHistory)
      .where(
        and(eq(priceAlertHistory.id, req.params.id), eq(priceAlertHistory.userId, req.dbUser!.id))
      )
      .returning({ id: priceAlertHistory.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Alert history entry not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete alert history error:', error);
    res.status(500).json({ error: 'Failed to delete alert history entry.' });
  }
});

router.post('/api/alerts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(2).max(24),
      market: z.string().trim().min(2).max(32).default('Crypto'),
      condition: z.enum(['above', 'below']),
      targetPrice: z.coerce.number().positive().finite().max(1e12),
      note: z.string().max(240).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Symbol, condition (above/below), and a positive target price are required.' });
      return;
    }

    const symbol = parsed.data.symbol.toUpperCase();
    const quote = await fetchRealTimeSpotPrice(symbol, true);
    const currentPrice = quote?.lastPrice ?? null;
    const evalRes = evaluatePriceAlert(
      {
        condition: parsed.data.condition,
        targetPrice: parsed.data.targetPrice,
        status: 'active',
      },
      currentPrice
    );

    const now = new Date();
    const initialStatus: PriceAlertStatus = evalRes.shouldTrigger ? 'triggered' : 'active';

    const [created] = await db
      .insert(priceAlerts)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        symbol,
        market: parsed.data.market,
        condition: parsed.data.condition,
        targetPrice: parsed.data.targetPrice,
        note: parsed.data.note.trim(),
        status: initialStatus,
        lastCheckedPrice: currentPrice,
        lastCheckedAt: currentPrice !== null ? now : null,
        triggeredPrice: evalRes.shouldTrigger ? currentPrice : null,
        triggeredAt: evalRes.shouldTrigger ? now : null,
      })
      .returning();

    if (evalRes.shouldTrigger && currentPrice !== null && created) {
      await recordTriggeredAlertHistory({
        userId: req.dbUser!.id,
        alertId: created.id,
        symbol: created.symbol,
        market: created.market,
        condition: created.condition,
        targetPrice: created.targetPrice,
        triggeredPrice: currentPrice,
        alertNote: created.note,
        triggeredAt: now,
      });
      await dispatchPriceAlertEmailIfEnabled({
        userId: req.dbUser!.id,
        alertId: created.id,
        symbol: created.symbol,
        condition: created.condition,
        targetPrice: created.targetPrice,
        triggeredPrice: currentPrice,
        note: created.note,
      });
    }

    res.status(201).json({
      alert: {
        ...created,
        liveQuote: quote
          ? {
              lastPrice: quote.lastPrice,
              change24hPercent: quote.change24hPercent,
              high24h: quote.high24h,
              low24h: quote.low24h,
              fetchedAt: quote.fetchedAt,
              sourceName: quote.sourceName,
            }
          : null,
        distancePercent: evalRes.distancePercent,
        distanceAmount: evalRes.distanceAmount,
      },
      triggeredImmediately: evalRes.shouldTrigger,
    });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create price alert.' });
  }
});

router.patch('/api/alerts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      status: z.enum(['active', 'paused']).optional(),
      targetPrice: z.coerce.number().positive().finite().max(1e12).optional(),
      condition: z.enum(['above', 'below']).optional(),
      note: z.string().max(240).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid price alert update.' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      if (parsed.data.status === 'active') {
        updates.triggeredAt = null;
        updates.triggeredPrice = null;
      }
    }
    if (parsed.data.targetPrice !== undefined) updates.targetPrice = parsed.data.targetPrice;
    if (parsed.data.condition !== undefined) updates.condition = parsed.data.condition;
    if (parsed.data.note !== undefined) updates.note = parsed.data.note.trim();

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields provided to update.' });
      return;
    }

    const [updated] = await db
      .update(priceAlerts)
      .set(updates)
      .where(and(eq(priceAlerts.id, req.params.id), eq(priceAlerts.userId, req.dbUser!.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Price alert not found.' });
      return;
    }

    res.json({ alert: updated });
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ error: 'Failed to update price alert.' });
  }
});

router.delete('/api/alerts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(priceAlerts)
      .where(and(eq(priceAlerts.id, req.params.id), eq(priceAlerts.userId, req.dbUser!.id)))
      .returning({ id: priceAlerts.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Price alert not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({ error: 'Failed to delete price alert.' });
  }
});

// ============================================================================
// USER-DEFINED PORTFOLIO HOLDINGS, PERFORMANCE OVER TIME & PDF REPORT EXPORT
// ============================================================================

router.get('/api/portfolio/summary', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const data = await computeUserPortfolioData(req.dbUser!.id, Number(req.query.range || 30));
    res.json({
      summary: data.summary,
      performance: data.performance,
      fetchedAt: data.fetchedAt,
    });
  } catch (error) {
    console.error('Portfolio summary error:', error);
    res.status(500).json({ error: 'Failed to load portfolio summary.' });
  }
});

router.get('/api/portfolio/export/pdf', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const data = await computeUserPortfolioData(req.dbUser!.id, Number(req.query.range || 30));
    const pdfBuffer = await generatePortfolioPdfBuffer({
      ownerName: req.dbUser!.displayName || 'Trader',
      ownerEmail: req.dbUser!.email,
      rangeDays: data.rangeDays,
      generatedAt: data.fetchedAt,
      summary: data.summary,
      performance: data.performance,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `chartledger-portfolio-report-${data.rangeDays}d-${dateStamp}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Portfolio PDF export error:', error);
    res.status(500).json({ error: 'Failed to generate portfolio PDF report.' });
  }
});

router.post('/api/portfolio/holdings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(2).max(24),
      market: z.string().trim().min(2).max(32).default('Crypto'),
      quantity: z.coerce.number().positive().finite().max(1e12),
      avgCost: z.coerce.number().positive().finite().max(1e12),
      notes: z.string().max(240).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Symbol, positive quantity, and positive average cost are required.' });
      return;
    }

    const [created] = await db
      .insert(portfolioHoldings)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        symbol: parsed.data.symbol.toUpperCase(),
        market: parsed.data.market,
        quantity: parsed.data.quantity,
        avgCost: parsed.data.avgCost,
        notes: parsed.data.notes.trim(),
      })
      .returning();

    res.status(201).json({ holding: created });
  } catch (error) {
    console.error('Create holding error:', error);
    res.status(500).json({ error: 'Failed to save asset holding.' });
  }
});

router.patch('/api/portfolio/holdings/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      quantity: z.coerce.number().positive().finite().max(1e12).optional(),
      avgCost: z.coerce.number().positive().finite().max(1e12).optional(),
      market: z.string().trim().min(2).max(32).optional(),
      notes: z.string().max(240).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid holding update values.' });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.quantity !== undefined) updates.quantity = parsed.data.quantity;
    if (parsed.data.avgCost !== undefined) updates.avgCost = parsed.data.avgCost;
    if (parsed.data.market !== undefined) updates.market = parsed.data.market;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes.trim();

    const [updated] = await db
      .update(portfolioHoldings)
      .set(updates)
      .where(
        and(eq(portfolioHoldings.id, req.params.id), eq(portfolioHoldings.userId, req.dbUser!.id))
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Asset holding not found.' });
      return;
    }
    res.json({ holding: updated });
  } catch (error) {
    console.error('Update holding error:', error);
    res.status(500).json({ error: 'Failed to update asset holding.' });
  }
});

router.delete('/api/portfolio/holdings/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(portfolioHoldings)
      .where(
        and(eq(portfolioHoldings.id, req.params.id), eq(portfolioHoldings.userId, req.dbUser!.id))
      )
      .returning({ id: portfolioHoldings.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Asset holding not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete holding error:', error);
    res.status(500).json({ error: 'Failed to delete asset holding.' });
  }
});

// ============================================================================
// MARKET SENTIMENT (DETERMINISTIC TECHNICAL INDICATOR SCORE FOR ACTIVE HOLDINGS)
// ============================================================================

router.get('/api/portfolio/sentiment', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const tfParam = String(req.query.timeframe || '4h').toLowerCase();
    const timeframe = tfParam === '1d' ? '1d' : '4h';

    const rows = await db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.userId, req.dbUser!.id))
      .orderBy(desc(portfolioHoldings.createdAt));

    const uniqueSymbols = Array.from(new Set(rows.map((r) => r.symbol)));
    const spotMap = new Map<string, Awaited<ReturnType<typeof fetchRealTimeSpotPrice>>>();
    const ohlcvMap = new Map<string, Awaited<ReturnType<typeof fetchCryptoMarketData>>>();

    await Promise.all(
      uniqueSymbols.map(async (sym) => {
        const [spot, ohlcv] = await Promise.all([
          fetchRealTimeSpotPrice(sym, false),
          fetchCryptoMarketData(sym, timeframe),
        ]);
        spotMap.set(sym, spot);
        ohlcvMap.set(sym, ohlcv);
      })
    );

    // Aggregate quantities per symbol so duplicate entries combine cleanly
    const bySymbol = new Map<
      string,
      { symbol: string; market: string; currentValue: number; candles: any }
    >();
    for (const row of rows) {
      const spot = spotMap.get(row.symbol);
      const ohlcv = ohlcvMap.get(row.symbol);
      const effectivePrice = spot?.lastPrice ?? ohlcv?.lastPrice ?? row.avgCost;
      const val = Math.max(0, row.quantity * effectivePrice);
      const existing = bySymbol.get(row.symbol);
      if (existing) {
        existing.currentValue += val;
      } else {
        bySymbol.set(row.symbol, {
          symbol: row.symbol,
          market: row.market,
          currentValue: val,
          candles: ohlcv?.candles ?? null,
        });
      }
    }

    const sentiment = buildPortfolioMarketSentiment(Array.from(bySymbol.values()));
    res.json({
      sentiment,
      timeframe,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Portfolio sentiment error:', error);
    res.status(500).json({ error: 'Failed to compute portfolio market sentiment.' });
  }
});

// ============================================================================
// NOTIFICATION SETTINGS (EMAIL NOTIFICATIONS FOR TRIGGERED PRICE ALERTS)
// ============================================================================

router.get('/api/notifications/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getUserNotificationSettings(req.dbUser!.id);
    res.json(data);
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ error: 'Failed to load notification settings.' });
  }
});

router.patch('/api/notifications/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      emailAlertsEnabled: z.boolean().optional(),
      recipientEmail: z.string().trim().email().max(160).optional(),
      includeResearchNotes: z.boolean().optional(),
      deliveryMode: z.enum(['instant', 'digest']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid notification settings. Please provide a valid email address.' });
      return;
    }

    const updated = await updateUserNotificationSettings(req.dbUser!.id, parsed.data);
    const full = await getUserNotificationSettings(req.dbUser!.id);
    res.json({
      ...full,
      settings: updated,
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Failed to save notification settings.' });
  }
});

export default router;
