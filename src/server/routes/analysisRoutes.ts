import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  analyses,
  chartUploads,
  knowledgeChunks,
  knowledgeDocuments,
  plans,
  promptTemplates,
  sharedAnalyses,
  usageRecords,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, resolveUserFromAuthHeader } from '../../middleware/auth.ts';
import { evaluateQuota, getCurrentPeriodKey } from '../../utils/billing.ts';
import { DemoScenarioId } from '../../utils/indicators.ts';
import { rankChunksHybrid } from '../../utils/rag.ts';
import { resolveConfinedPath, validateChartImageBuffer } from '../../utils/security.ts';
import {
  buildDeterministicFixtureAnalysis,
  runChartAnalysisPipeline,
} from '../ai/chartPipeline.ts';
import { embedTextsWithGemini, normalizeProviderError } from '../ai/providerRegistry.ts';
import { getSampleMarketData } from '../marketData.ts';

const router = Router();
const UPLOADS_DIR = path.resolve(process.cwd(), '.data', 'uploads');

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for chart analysis. Please wait a moment.' },
});

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

// Public safe interactive demo (no auth required, clearly labeled synthetic sample fixture)
router.get('/api/public/demo/:scenario', (req, res) => {
  const allowed: DemoScenarioId[] = ['btc_uptrend', 'eurusd_range', 'spx_pullback'];
  const scenario = allowed.includes(req.params.scenario as DemoScenarioId)
    ? (req.params.scenario as DemoScenarioId)
    : 'btc_uptrend';

  const marketData = getSampleMarketData(scenario);
  const analysis = buildDeterministicFixtureAnalysis(`demo-${scenario}`, marketData, {
    symbol: marketData.symbol,
    timeframe: marketData.timeframe,
    exchange: marketData.exchange,
  });

  res.json({
    isDemoFixture: true,
    label: 'Synthetic Sample Fixture — Demonstration Data Only',
    marketData,
    analysis,
  });
});

// Upload chart screenshot (multipart or base64 clipboard payload)
router.post(
  '/api/uploads',
  requireAuth,
  uploadMiddleware.single('file'),
  async (req: AuthRequest, res) => {
    try {
      await ensureUploadsDir();
      let buffer: Buffer;
      let originalName = 'clipboard-chart.png';
      let declaredMime: string | undefined;

      if (req.file) {
        buffer = req.file.buffer;
        originalName = req.file.originalname || 'chart-upload.png';
        declaredMime = req.file.mimetype;
      } else if (typeof req.body?.imageBase64 === 'string') {
        const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/.exec(
          req.body.imageBase64
        );
        if (!match) {
          res.status(400).json({ error: 'Invalid base64 image payload.' });
          return;
        }
        declaredMime = match[1];
        buffer = Buffer.from(match[2], 'base64');
        originalName = typeof req.body.filename === 'string' ? req.body.filename : 'clipboard-chart.png';
      } else {
        res.status(400).json({ error: 'No chart image file provided.' });
        return;
      }

      const validation = validateChartImageBuffer(new Uint8Array(buffer), declaredMime);
      if (!validation.valid || !validation.mimeType) {
        res.status(400).json({ error: validation.error || 'Invalid chart image.' });
        return;
      }

      const id = crypto.randomUUID();
      const ext =
        validation.mimeType === 'image/png'
          ? 'png'
          : validation.mimeType === 'image/webp'
            ? 'webp'
            : 'jpg';
      const safeFileName = `${id}.${ext}`;
      const absPath = resolveConfinedPath(UPLOADS_DIR, safeFileName);
      await fs.writeFile(absPath, buffer);

      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      const [saved] = await db
        .insert(chartUploads)
        .values({
          id,
          userId: req.dbUser!.id,
          filename: originalName.slice(0, 120),
          mimeType: validation.mimeType,
          sizeBytes: buffer.length,
          width: validation.width ?? null,
          height: validation.height ?? null,
          sha256,
          storagePath: safeFileName,
          metadataJson: {},
        })
        .returning();

      res.status(201).json({
        id: saved.id,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        width: saved.width,
        height: saved.height,
        previewUrl: `/api/uploads/${saved.id}/image`,
        createdAt: saved.createdAt,
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to process chart upload.' });
    }
  }
);

// Private image serving (authenticated owner OR active share token with includeImage=true)
router.get('/api/uploads/:id/image', async (req, res) => {
  try {
    const uploadId = req.params.id;
    const shareToken = typeof req.query.shareToken === 'string' ? req.query.shareToken : null;

    let authorizedUpload: typeof chartUploads.$inferSelect | null = null;

    if (shareToken) {
      const [share] = await db
        .select()
        .from(sharedAnalyses)
        .where(and(eq(sharedAnalyses.shareToken, shareToken), isNull(sharedAnalyses.revokedAt)))
        .limit(1);

      if (share && share.includeImage && (!share.expiresAt || share.expiresAt > new Date())) {
        const [linkedAnalysis] = await db
          .select()
          .from(analyses)
          .where(eq(analyses.id, share.analysisId))
          .limit(1);
        if (linkedAnalysis && linkedAnalysis.uploadId === uploadId) {
          const [up] = await db
            .select()
            .from(chartUploads)
            .where(eq(chartUploads.id, uploadId))
            .limit(1);
          authorizedUpload = up ?? null;
        }
      }
    } else {
      const authHeader =
        req.headers.authorization ||
        (typeof req.query.token === 'string' ? `Bearer ${req.query.token}` : undefined);
      const resolved = await resolveUserFromAuthHeader(authHeader);
      if (resolved) {
        const [up] = await db
          .select()
          .from(chartUploads)
          .where(and(eq(chartUploads.id, uploadId), eq(chartUploads.userId, resolved.user.id)))
          .limit(1);
        authorizedUpload = up ?? null;
      }
    }

    if (!authorizedUpload) {
      res.status(404).json({ error: 'Chart image not found or access denied.' });
      return;
    }

    const absPath = resolveConfinedPath(UPLOADS_DIR, authorizedUpload.storagePath);
    const data = await fs.readFile(absPath);
    res.setHeader('Content-Type', authorizedUpload.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data);
  } catch (error) {
    console.error('Serve image error:', error);
    res.status(404).json({ error: 'Image unavailable.' });
  }
});

router.delete('/api/uploads/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [found] = await db
      .select()
      .from(chartUploads)
      .where(and(eq(chartUploads.id, req.params.id), eq(chartUploads.userId, req.dbUser!.id)))
      .limit(1);

    if (!found) {
      res.status(404).json({ error: 'Upload not found.' });
      return;
    }

    const absPath = resolveConfinedPath(UPLOADS_DIR, found.storagePath);
    await fs.unlink(absPath).catch(() => undefined);
    await db.delete(chartUploads).where(eq(chartUploads.id, found.id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ error: 'Failed to delete upload.' });
  }
});

// Create & run structured chart analysis
router.post('/api/analyses', requireAuth, analysisLimiter, async (req: AuthRequest, res) => {
  try {
    const bodySchema = z.object({
      uploadId: z.string().uuid().optional().nullable(),
      title: z.string().max(140).optional(),
      symbol: z.string().max(32).optional(),
      market: z.string().max(32).optional(),
      exchange: z.string().max(48).optional(),
      timeframe: z.string().max(16).optional(),
      chartPlatform: z.string().max(48).optional(),
      captureTime: z.string().max(64).optional(),
      notes: z.string().max(1000).optional(),
      objective: z.string().max(300).optional(),
      demoScenario: z.enum(['btc_uptrend', 'eurusd_range', 'spx_pullback']).optional(),
      useKnowledgeBase: z.boolean().optional(),
      useMockProvider: z.boolean().optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid analysis parameters.' });
      return;
    }

    const user = req.dbUser!;
    const periodKey = getCurrentPeriodKey();

    // Enforce backend plan quota atomically
    const [plan] = await db.select().from(plans).where(eq(plans.id, user.planId)).limit(1);
    const analysesLimit = plan?.analysesLimit ?? 15;

    const [usage] = await db
      .select()
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, user.id), eq(usageRecords.periodKey, periodKey)))
      .limit(1);

    const quota = evaluateQuota({ used: usage?.analysesCount ?? 0, limit: analysesLimit });
    if (!quota.allowed) {
      res.status(429).json({
        error: `Monthly chart analysis quota reached (${analysesLimit} on ${plan?.name || user.planId}). Upgrade to Pro Desk for higher quotas.`,
        code: 'QUOTA_EXCEEDED',
      });
      return;
    }

    // Load uploaded image if supplied
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (parsed.data.uploadId) {
      const [uploadRow] = await db
        .select()
        .from(chartUploads)
        .where(and(eq(chartUploads.id, parsed.data.uploadId), eq(chartUploads.userId, user.id)))
        .limit(1);

      if (!uploadRow) {
        res.status(404).json({ error: 'Referenced chart upload not found.' });
        return;
      }

      const absPath = resolveConfinedPath(UPLOADS_DIR, uploadRow.storagePath);
      const buf = await fs.readFile(absPath);
      imageBase64 = buf.toString('base64');
      imageMimeType = uploadRow.mimeType;
    } else if (!parsed.data.demoScenario) {
      res.status(400).json({
        error: 'Upload a chart screenshot or select a sample fixture scenario to analyze.',
      });
      return;
    }

    // Optional per-user RAG knowledge-base grounding
    let ragContext: Array<{ documentTitle: string; content: string }> = [];
    if (parsed.data.useKnowledgeBase) {
      const userChunks = await db
        .select({
          id: knowledgeChunks.id,
          documentId: knowledgeChunks.documentId,
          documentTitle: knowledgeDocuments.title,
          chunkIndex: knowledgeChunks.chunkIndex,
          content: knowledgeChunks.content,
          embedding: knowledgeChunks.embeddingJson,
        })
        .from(knowledgeChunks)
        .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
        .where(eq(knowledgeChunks.userId, user.id))
        .limit(150);

      if (userChunks.length > 0) {
        const queryStr = [parsed.data.symbol, parsed.data.market, parsed.data.timeframe, parsed.data.notes]
          .filter(Boolean)
          .join(' ') || 'chart technical analysis support resistance risk';
        const [queryEmb] = await embedTextsWithGemini([queryStr]);
        const ranked = rankChunksHybrid(queryStr, queryEmb || null, userChunks, 3);
        ragContext = ranked.map((r) => ({ documentTitle: r.documentTitle, content: r.content }));
      }
    }

    // Load active admin prompt override if present
    const [promptRow] = await db
      .select()
      .from(promptTemplates)
      .where(and(eq(promptTemplates.id, 'chart_analysis_master'), eq(promptTemplates.active, true)))
      .limit(1);

    const analysisId = crypto.randomUUID();
    const output = await runChartAnalysisPipeline({
      analysisId,
      imageBase64,
      imageMimeType,
      metadata: parsed.data,
      preferences: user.preferencesJson as any,
      ragContext,
      systemPromptOverride: promptRow?.systemPrompt,
    });

    const title =
      parsed.data.title?.trim() ||
      `${output.result.chart.symbol || parsed.data.symbol || 'Chart'} ${
        output.result.chart.timeframe || parsed.data.timeframe || ''
      } Research`.trim();

    const [stored] = await db
      .insert(analyses)
      .values({
        id: analysisId,
        userId: user.id,
        uploadId: parsed.data.uploadId ?? null,
        title,
        symbol: output.result.chart.symbol || parsed.data.symbol || null,
        market: output.result.chart.market || parsed.data.market || null,
        exchange: output.result.chart.exchange || parsed.data.exchange || null,
        timeframe: output.result.chart.timeframe || parsed.data.timeframe || null,
        status: output.result.status,
        marketBias: output.result.summary.marketBias,
        provider: output.provider,
        model: output.model,
        isDemoFixture: output.isDemoFixture,
        tagsJson: [
          output.result.chart.market || parsed.data.market || 'Research',
          output.result.summary.marketBias,
        ],
        resultJson: output.result as unknown as Record<string, unknown>,
        tokensUsed: output.tokensUsed,
      })
      .returning();

    // Reconcile usage atomically
    await db
      .insert(usageRecords)
      .values({
        userId: user.id,
        periodKey,
        analysesCount: 1,
        messagesCount: 0,
        tokensUsed: output.tokensUsed,
      })
      .onConflictDoUpdate({
        target: [usageRecords.userId, usageRecords.periodKey],
        set: {
          analysesCount: sql`${usageRecords.analysesCount} + 1`,
          tokensUsed: sql`${usageRecords.tokensUsed} + ${output.tokensUsed}`,
          updatedAt: new Date(),
        },
      });

    res.status(201).json({
      analysis: stored,
      validationWarnings: output.validationWarnings,
      marketData: output.marketData,
    });
  } catch (error) {
    console.error('Create analysis error:', error);
    const norm = normalizeProviderError(error);
    res.status(norm.statusCode).json({
      error: norm.message,
    });
  }
});

router.get('/api/analyses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(analyses)
      .where(eq(analyses.userId, req.dbUser!.id))
      .orderBy(desc(analyses.createdAt))
      .limit(100);

    res.json({ analyses: rows });
  } catch (error) {
    console.error('List analyses error:', error);
    res.status(500).json({ error: 'Failed to load analysis history.' });
  }
});

router.get('/api/analyses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [row] = await db
      .select()
      .from(analyses)
      .where(and(eq(analyses.id, req.params.id), eq(analyses.userId, req.dbUser!.id)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Analysis not found.' });
      return;
    }

    const shares = await db
      .select()
      .from(sharedAnalyses)
      .where(
        and(
          eq(sharedAnalyses.analysisId, row.id),
          eq(sharedAnalyses.userId, req.dbUser!.id),
          isNull(sharedAnalyses.revokedAt)
        )
      );

    res.json({ analysis: row, shares });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis.' });
  }
});

router.patch('/api/analyses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(140).optional(),
      isFavorite: z.boolean().optional(),
      tagsJson: z.array(z.string().max(32)).max(8).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update payload.' });
      return;
    }

    const [updated] = await db
      .update(analyses)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(analyses.id, req.params.id), eq(analyses.userId, req.dbUser!.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Analysis not found.' });
      return;
    }

    res.json({ analysis: updated });
  } catch (error) {
    console.error('Patch analysis error:', error);
    res.status(500).json({ error: 'Failed to update analysis.' });
  }
});

router.delete('/api/analyses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(analyses)
      .where(and(eq(analyses.id, req.params.id), eq(analyses.userId, req.dbUser!.id)))
      .returning({ id: analyses.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Analysis not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete analysis error:', error);
    res.status(500).json({ error: 'Failed to delete analysis.' });
  }
});

// Shareable analysis links (opaque token, private image excluded by default)
router.post('/api/analyses/:id/share', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [row] = await db
      .select()
      .from(analyses)
      .where(and(eq(analyses.id, req.params.id), eq(analyses.userId, req.dbUser!.id)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Analysis not found.' });
      return;
    }

    const schema = z.object({
      includeImage: z.boolean().optional().default(false),
      expiresInDays: z.number().int().min(1).max(90).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid share options.' });
      return;
    }

    const shareToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [created] = await db
      .insert(sharedAnalyses)
      .values({
        id: crypto.randomUUID(),
        analysisId: row.id,
        userId: req.dbUser!.id,
        shareToken,
        includeImage: parsed.data.includeImage,
        expiresAt,
      })
      .returning();

    res.status(201).json({ share: created });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to create share link.' });
  }
});

router.delete('/api/shares/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await db
      .update(sharedAnalyses)
      .set({ revokedAt: new Date() })
      .where(and(eq(sharedAnalyses.id, req.params.id), eq(sharedAnalyses.userId, req.dbUser!.id)))
      .returning({ id: sharedAnalyses.id });

    if (updated.length === 0) {
      res.status(404).json({ error: 'Share link not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Revoke share error:', error);
    res.status(500).json({ error: 'Failed to revoke share link.' });
  }
});

router.get('/api/public/shares/:token', async (req, res) => {
  try {
    const [share] = await db
      .select()
      .from(sharedAnalyses)
      .where(and(eq(sharedAnalyses.shareToken, req.params.token), isNull(sharedAnalyses.revokedAt)))
      .limit(1);

    if (!share || (share.expiresAt && share.expiresAt < new Date())) {
      res.status(404).json({ error: 'Shared analysis link is invalid, revoked, or expired.' });
      return;
    }

    const [row] = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, share.analysisId))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Analysis no longer exists.' });
      return;
    }

    res.json({
      title: row.title,
      symbol: row.symbol,
      market: row.market,
      timeframe: row.timeframe,
      marketBias: row.marketBias,
      isDemoFixture: row.isDemoFixture,
      createdAt: row.createdAt,
      resultJson: row.resultJson,
      imageUrl:
        share.includeImage && row.uploadId
          ? `/api/uploads/${row.uploadId}/image?shareToken=${encodeURIComponent(share.shareToken)}`
          : null,
    });
  } catch (error) {
    console.error('Public share error:', error);
    res.status(500).json({ error: 'Failed to load shared analysis.' });
  }
});

export default router;
