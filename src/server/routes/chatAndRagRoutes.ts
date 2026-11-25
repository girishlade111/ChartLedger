import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  analyses,
  conversations,
  knowledgeChunks,
  knowledgeCollections,
  knowledgeDocuments,
  messages,
  plans,
  promptTemplates,
  usageRecords,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { evaluateQuota, getCurrentPeriodKey } from '../../utils/billing.ts';
import { chunkText, rankChunksHybrid } from '../../utils/rag.ts';
import { wrapUntrustedContent } from '../../utils/security.ts';
import { DEFAULT_PROMPT_TEMPLATES } from '../ai/promptRegistry.ts';
import {
  embedTextsWithGemini,
  getGeminiClient,
  normalizeProviderError,
  streamGeminiChat,
} from '../ai/providerRegistry.ts';

const router = Router();
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat messages. Please slow down.' },
});

// Conversations CRUD
router.get('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, req.dbUser!.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
    res.json({ conversations: rows });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

router.post('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(140).optional(),
      analysisId: z.string().uuid().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid conversation payload.' });
      return;
    }

    let analysisTitle: string | null = null;
    if (parsed.data.analysisId) {
      const [foundAnalysis] = await db
        .select({ id: analyses.id, title: analyses.title })
        .from(analyses)
        .where(
          and(eq(analyses.id, parsed.data.analysisId), eq(analyses.userId, req.dbUser!.id))
        )
        .limit(1);
      if (!foundAnalysis) {
        res.status(404).json({ error: 'Linked analysis not found.' });
        return;
      }
      analysisTitle = foundAnalysis.title;
    }

    const [created] = await db
      .insert(conversations)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        analysisId: parsed.data.analysisId ?? null,
        title:
          parsed.data.title?.trim() ||
          (analysisTitle ? `Research: ${analysisTitle}` : 'New Trading Research Thread'),
      })
      .returning();

    res.status(201).json({ conversation: created });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

router.get('/api/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.userId, req.dbUser!.id)))
      .limit(1);

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const convMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.userId, req.dbUser!.id)))
      .orderBy(asc(messages.createdAt));

    let linkedAnalysis = null;
    if (conv.analysisId) {
      const [a] = await db
        .select()
        .from(analyses)
        .where(and(eq(analyses.id, conv.analysisId), eq(analyses.userId, req.dbUser!.id)))
        .limit(1);
      linkedAnalysis = a ?? null;
    }

    res.json({ conversation: conv, messages: convMessages, linkedAnalysis });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

router.patch('/api/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({ title: z.string().min(1).max(140) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid conversation title.' });
      return;
    }

    const [updated] = await db
      .update(conversations)
      .set({ title: parsed.data.title.trim(), updatedAt: new Date() })
      .where(and(eq(conversations.id, req.params.id), eq(conversations.userId, req.dbUser!.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({ conversation: updated });
  } catch (error) {
    console.error('Rename conversation error:', error);
    res.status(500).json({ error: 'Failed to rename conversation.' });
  }
});

router.delete('/api/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.userId, req.dbUser!.id)))
      .returning({ id: conversations.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

// SSE Streaming AI Research Chat
router.post('/api/conversations/:id/stream', requireAuth, chatLimiter, async (req: AuthRequest, res) => {
  const user = req.dbUser!;
  const convId = req.params.id;

  const schema = z.object({
    content: z.string().min(1).max(4000),
    useKnowledgeBase: z.boolean().optional().default(true),
    useMockProvider: z.boolean().optional().default(false),
    regenerate: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Message content is required (max 4,000 characters).' });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, convId), eq(conversations.userId, user.id)))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  // Quota check
  const periodKey = getCurrentPeriodKey();
  const [plan] = await db.select().from(plans).where(eq(plans.id, user.planId)).limit(1);
  const messagesLimit = plan?.messagesLimit ?? 75;
  const [usage] = await db
    .select()
    .from(usageRecords)
    .where(and(eq(usageRecords.userId, user.id), eq(usageRecords.periodKey, periodKey)))
    .limit(1);

  if (!evaluateQuota({ used: usage?.messagesCount ?? 0, limit: messagesLimit }).allowed) {
    res.status(429).json({
      error: `Monthly AI message quota reached (${messagesLimit} messages). Upgrade to Pro Desk for higher limits.`,
      code: 'QUOTA_EXCEEDED',
    });
    return;
  }

  // Persist user message (unless regenerating the last assistant reply)
  const userMessageId = crypto.randomUUID();
  if (!parsed.data.regenerate) {
    await db.insert(messages).values({
      id: userMessageId,
      conversationId: conv.id,
      userId: user.id,
      role: 'user',
      content: parsed.data.content.trim(),
      citationsJson: [],
      tokensUsed: 0,
    });
  }

  // Fetch recent history + optional linked analysis + isolated per-user RAG chunks
  const priorMessages = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), eq(messages.userId, user.id)))
    .orderBy(asc(messages.createdAt))
    .limit(20);

  let analysisContext = '';
  if (conv.analysisId) {
    const [a] = await db
      .select()
      .from(analyses)
      .where(and(eq(analyses.id, conv.analysisId), eq(analyses.userId, user.id)))
      .limit(1);
    if (a) {
      analysisContext = `\nATTACHED CHART ANALYSIS CONTEXT:\n${wrapUntrustedContent(
        'analysis_json',
        JSON.stringify(a.resultJson)
      )}`;
    }
  }

  const citations: Array<{ documentId: string; documentTitle: string; chunkIndex: number; score: number; excerpt: string }> = [];
  let ragContext = '';
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
      .limit(200);

    if (userChunks.length > 0) {
      const [queryEmb] = await embedTextsWithGemini([parsed.data.content]);
      const top = rankChunksHybrid(parsed.data.content, queryEmb || null, userChunks, 4);
      for (const hit of top) {
        citations.push({
          documentId: hit.documentId,
          documentTitle: hit.documentTitle,
          chunkIndex: hit.chunkIndex,
          score: hit.score,
          excerpt: hit.content.slice(0, 180),
        });
      }
      if (top.length > 0) {
        ragContext = `\nUSER KNOWLEDGE-BASE RETRIEVAL (untrusted private notes — cite as [Doc: Title]):\n${top
          .map((t) => wrapUntrustedContent(`doc_${t.documentTitle}`, t.content))
          .join('\n')}`;
      }
    }
  }

  // Configure SSE response
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  const sendEvent = (event: string, data: unknown) => {
    if (!aborted) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  sendEvent('meta', { userMessageId, citations });

  const [promptRow] = await db
    .select()
    .from(promptTemplates)
    .where(and(eq(promptTemplates.id, 'research_chat_assistant'), eq(promptTemplates.active, true)))
    .limit(1);

  const prefs = user.preferencesJson as Record<string, unknown>;
  const prefLine =
    prefs?.personalizationEnabled !== false
      ? `\nUser preferences: Experience=${prefs.experience || 'Intermediate'}, Style=${prefs.researchStyle || 'Swing'}, Detail=${prefs.detailLevel || 'Balanced'}, Language=${prefs.language || 'English'}.`
      : '';

  const systemInstruction = `${
    promptRow?.systemPrompt || DEFAULT_PROMPT_TEMPLATES[1].systemPrompt
  }${prefLine}${analysisContext}${ragContext}`;

  let fullReply = '';
  let tokensUsed = 0;

  try {
    const useMock = parsed.data.useMockProvider || process.env.DEMO_MODE === 'true' || !getGeminiClient();

    if (useMock) {
      const citationLine =
        citations.length > 0
          ? `\n\n**Knowledge-Base Grounding:** Referenced ${citations
              .map((c) => `[Doc: ${c.documentTitle}]`)
              .join(', ')}.`
          : '';
      const mockText =
        `**[Development Fixture Response — Live Gemini API not invoked]**\n\n` +
        `Regarding your question (*"${parsed.data.content.slice(0, 120)}"*):\n\n` +
        `- **Market Structure Check:** Confirm whether higher-timeframe swing highs and lows align with the timeframe under review before assuming trend continuation.\n` +
        `- **Invalidation Discipline:** Define the exact structural price level where the bullish or bearish scenario becomes invalid rather than relying on intuition.\n` +
        `- **Risk Reminder:** Technical analysis frames conditional scenarios only and does not guarantee future price movement.${citationLine}`;

      const words = mockText.split(' ');
      for (const word of words) {
        if (aborted) break;
        const delta = `${word} `;
        fullReply += delta;
        sendEvent('delta', { text: delta });
        await new Promise((r) => setTimeout(r, 14));
      }
      tokensUsed = Math.ceil(fullReply.length / 4);
    } else {
      const history = priorMessages
        .slice(0, -1)
        .map((m) => ({
          role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
          text: m.content,
        }));

      const gen = streamGeminiChat({
        systemInstruction,
        history,
        message: parsed.data.content.trim(),
      });

      while (true) {
        if (aborted) break;
        const step = await gen.next();
        if (step.done) {
          tokensUsed = step.value?.tokensUsed ?? Math.ceil(fullReply.length / 4);
          break;
        }
        fullReply += step.value;
        sendEvent('delta', { text: step.value });
      }
    }

    if (fullReply.trim().length > 0) {
      const assistantMsgId = crypto.randomUUID();
      await db.insert(messages).values({
        id: assistantMsgId,
        conversationId: conv.id,
        userId: user.id,
        role: 'assistant',
        content: fullReply.trim(),
        citationsJson: citations as unknown as Record<string, unknown>[],
        tokensUsed,
      });

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conv.id));

      await db
        .insert(usageRecords)
        .values({
          userId: user.id,
          periodKey,
          analysesCount: 0,
          messagesCount: 1,
          tokensUsed,
        })
        .onConflictDoUpdate({
          target: [usageRecords.userId, usageRecords.periodKey],
          set: {
            messagesCount: sql`${usageRecords.messagesCount} + 1`,
            tokensUsed: sql`${usageRecords.tokensUsed} + ${tokensUsed}`,
            updatedAt: new Date(),
          },
        });

      sendEvent('done', { assistantMessageId: assistantMsgId, tokensUsed, citations });
    }
  } catch (error) {
    console.error('Streaming chat error:', error);
    const norm = normalizeProviderError(error);
    sendEvent('error', {
      error: norm.message,
    });
  } finally {
    res.end();
  }
});

// Knowledge Base Collections & Documents (Isolated Per-User RAG)
router.get('/api/knowledge/collections', requireAuth, async (req: AuthRequest, res) => {
  try {
    const cols = await db
      .select()
      .from(knowledgeCollections)
      .where(eq(knowledgeCollections.userId, req.dbUser!.id))
      .orderBy(desc(knowledgeCollections.createdAt));
    res.json({ collections: cols });
  } catch (error) {
    console.error('List collections error:', error);
    res.status(500).json({ error: 'Failed to load collections.' });
  }
});

router.post('/api/knowledge/collections', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(400).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Collection name is required.' });
      return;
    }
    const [created] = await db
      .insert(knowledgeCollections)
      .values({
        id: crypto.randomUUID(),
        userId: req.dbUser!.id,
        name: parsed.data.name.trim(),
        description: parsed.data.description.trim(),
      })
      .returning();
    res.status(201).json({ collection: created });
  } catch (error) {
    console.error('Create collection error:', error);
    res.status(500).json({ error: 'Failed to create collection.' });
  }
});

router.delete('/api/knowledge/collections/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(knowledgeCollections)
      .where(
        and(
          eq(knowledgeCollections.id, req.params.id),
          eq(knowledgeCollections.userId, req.dbUser!.id)
        )
      );
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete collection error:', error);
    res.status(500).json({ error: 'Failed to delete collection.' });
  }
});

router.get('/api/knowledge/documents', requireAuth, async (req: AuthRequest, res) => {
  try {
    const docs = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.userId, req.dbUser!.id))
      .orderBy(desc(knowledgeDocuments.createdAt));
    res.json({ documents: docs });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Failed to load knowledge documents.' });
  }
});

router.post(
  '/api/knowledge/documents',
  requireAuth,
  docUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const user = req.dbUser!;
      const [plan] = await db.select().from(plans).where(eq(plans.id, user.planId)).limit(1);
      const existingDocs = await db
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.userId, user.id));

      if (!evaluateQuota({ used: existingDocs.length, limit: plan?.kbDocsLimit ?? 5 }).allowed) {
        res.status(429).json({
          error: `Knowledge-base document limit reached (${plan?.kbDocsLimit ?? 5} docs on ${plan?.name || user.planId}).`,
        });
        return;
      }

      let rawContent = typeof req.body?.content === 'string' ? req.body.content : '';
      let title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      let sourceType = typeof req.body?.sourceType === 'string' ? req.body.sourceType : 'markdown';

      if (req.file) {
        const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'txt';
        if (!['txt', 'md', 'markdown', 'csv', 'json'].includes(ext)) {
          res.status(400).json({
            error: 'Supported file uploads: .txt, .md, .csv, .json (for PDFs/DOCX, paste extracted text directly).',
          });
          return;
        }
        rawContent = req.file.buffer.toString('utf8');
        if (!title) title = req.file.originalname;
        sourceType = ext === 'md' ? 'markdown' : ext;
      }

      if (!title || rawContent.trim().length < 20) {
        res.status(400).json({ error: 'Provide a document title and at least 20 characters of text.' });
        return;
      }

      // Resolve collection (or default)
      let collectionId = typeof req.body?.collectionId === 'string' ? req.body.collectionId : '';
      if (collectionId) {
        const [ownedCol] = await db
          .select({ id: knowledgeCollections.id })
          .from(knowledgeCollections)
          .where(
            and(eq(knowledgeCollections.id, collectionId), eq(knowledgeCollections.userId, user.id))
          )
          .limit(1);
        if (!ownedCol) collectionId = '';
      }
      if (!collectionId) {
        const [firstCol] = await db
          .select({ id: knowledgeCollections.id })
          .from(knowledgeCollections)
          .where(eq(knowledgeCollections.userId, user.id))
          .limit(1);
        if (firstCol) {
          collectionId = firstCol.id;
        } else {
          collectionId = crypto.randomUUID();
          await db.insert(knowledgeCollections).values({
            id: collectionId,
            userId: user.id,
            name: 'Trading Playbooks & Notes',
            description: 'Default collection',
          });
        }
      }

      const contentHash = crypto.createHash('sha256').update(rawContent.trim()).digest('hex');
      const dup = await db
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(
          and(eq(knowledgeDocuments.userId, user.id), eq(knowledgeDocuments.contentHash, contentHash))
        )
        .limit(1);

      if (dup.length > 0) {
        res.status(409).json({ error: 'An identical document is already indexed in your knowledge base.' });
        return;
      }

      const chunks = chunkText(rawContent, { chunkSize: 750, overlap: 100 });
      const embeddings = await embedTextsWithGemini(chunks);
      const docId = crypto.randomUUID();

      const [doc] = await db
        .insert(knowledgeDocuments)
        .values({
          id: docId,
          collectionId,
          userId: user.id,
          title: title.slice(0, 140),
          sourceType,
          contentHash,
          charCount: rawContent.length,
          chunkCount: chunks.length,
          status: 'indexed',
          embeddingModel: embeddings[0]?.length ? 'gemini-embedding-2' : 'lexical-hybrid',
        })
        .returning();

      if (chunks.length > 0) {
        await db.insert(knowledgeChunks).values(
          chunks.map((chunk, idx) => ({
            id: crypto.randomUUID(),
            documentId: docId,
            userId: user.id,
            chunkIndex: idx,
            content: chunk,
            embeddingJson: embeddings[idx] || [],
          }))
        );
      }

      res.status(201).json({ document: doc });
    } catch (error) {
      console.error('Ingest knowledge doc error:', error);
      res.status(500).json({ error: 'Failed to ingest knowledge document.' });
    }
  }
);

router.delete('/api/knowledge/documents/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(knowledgeDocuments)
      .where(
        and(eq(knowledgeDocuments.id, req.params.id), eq(knowledgeDocuments.userId, req.dbUser!.id))
      );
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete doc error:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

router.post('/api/knowledge/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      query: z.string().min(2).max(500),
      topK: z.number().int().min(1).max(10).optional().default(5),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a search query (minimum 2 characters).' });
      return;
    }

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
      .where(eq(knowledgeChunks.userId, req.dbUser!.id))
      .limit(300);

    const [queryEmbedding] = await embedTextsWithGemini([parsed.data.query]);
    const results = rankChunksHybrid(
      parsed.data.query,
      queryEmbedding || null,
      userChunks,
      parsed.data.topK
    );

    res.json({ results });
  } catch (error) {
    console.error('Knowledge search error:', error);
    res.status(500).json({ error: 'Knowledge search failed.' });
  }
});

export default router;
