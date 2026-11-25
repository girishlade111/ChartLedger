import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { portfolioHoldings, priceAlerts } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import {
  buildPortfolioPerformanceSeries,
  buildPortfolioSummary,
  evaluatePriceAlert,
  type PriceAlertCondition,
  type PriceAlertStatus,
} from '../../utils/portfolioAndAlerts.ts';
import { fetchCryptoMarketData, fetchRealTimeSpotPrice } from '../marketData.ts';

const router = Router();

const marketPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many live quote requests. Please wait briefly.' },
});

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
      res.status(400).json({ error: 'Symbol, condition (above/below), and a positive target price are required.' });
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
// USER-DEFINED PORTFOLIO HOLDINGS & PERFORMANCE OVER TIME
// ============================================================================

router.get('/api/portfolio/summary', requireAuth, marketPollLimiter, async (req: AuthRequest, res) => {
  try {
    const rangeParam = Number(req.query.range || 30);
    const rangeDays = rangeParam === 7 ? 7 : rangeParam === 90 ? 90 : 30;
    const candleTf = rangeDays === 7 ? '4h' : '1d';
    const candleBars = rangeDays === 7 ? 42 : rangeDays; // 42 x 4h = 7 days

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

    res.json({
      summary,
      performance: {
        ...performance,
        rangeDays,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Portfolio summary error:', error);
    res.status(500).json({ error: 'Failed to load portfolio summary.' });
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
      res.status(400).json({ error: 'Symbol, positive quantity, and positive average cost are required.' });
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

export default router;
