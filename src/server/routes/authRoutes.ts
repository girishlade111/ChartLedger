import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  analyses,
  auditLogs,
  conversations,
  knowledgeDocuments,
  savedPrompts,
  sessions,
  users,
  watchlistItems,
} from '../../db/schema.ts';
import {
  AuthRequest,
  bootstrapUserDefaults,
  hashToken,
  requireAuth,
  signSessionJwt,
} from '../../middleware/auth.ts';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests. Please try again later.' },
});

const INITIAL_ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'girishlade111@gmail.com'
).toLowerCase();

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
  acceptedTerms: z.boolean().refine((v) => v === true, {
    message: 'You must accept the Terms of Service and Risk Disclosure.',
  }),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration input.' });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const uid = `local_${crypto.randomUUID()}`;
    const role = email === INITIAL_ADMIN_EMAIL ? 'admin' : 'user';
    const displayName = parsed.data.displayName?.trim() || email.split('@')[0];

    const [created] = await db
      .insert(users)
      .values({
        uid,
        email,
        passwordHash,
        displayName,
        role,
        planId: 'free',
        emailVerified: true,
        termsAcceptedAt: new Date(),
      })
      .returning();

    await bootstrapUserDefaults(created.id);

    const token = signSessionJwt(created.id, created.uid);
    await db.insert(sessions).values({
      userId: created.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await db.insert(auditLogs).values({
      actorUserId: created.id,
      action: 'auth.register',
      resourceType: 'user',
      resourceId: String(created.id),
      metadataJson: { method: 'email_password' },
    });

    res.status(201).json({
      token,
      user: {
        id: created.id,
        uid: created.uid,
        email: created.email,
        displayName: created.displayName,
        role: created.role,
        planId: created.planId,
        onboardingCompleted: created.onboardingCompleted,
        preferencesJson: created.preferencesJson,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid email and password.' });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!found || !found.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const ok = await bcrypt.compare(parsed.data.password, found.passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    await bootstrapUserDefaults(found.id);
    const token = signSessionJwt(found.id, found.uid);
    await db.insert(sessions).values({
      userId: found.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({
      token,
      user: {
        id: found.id,
        uid: found.uid,
        email: found.email,
        displayName: found.displayName,
        role: found.role,
        planId: found.planId,
        onboardingCompleted: found.onboardingCompleted,
        preferencesJson: found.preferencesJson,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

router.post('/api/auth/logout', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.sessionTokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, req.sessionTokenHash));
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to sign out.' });
  }
});

router.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const emailSchema = z.object({ email: z.string().email() });
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let devResetToken: string | undefined;

    if (found) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = hashToken(rawToken);
      await db
        .update(users)
        .set({
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        })
        .where(eq(users.id, found.id));

      if (process.env.NODE_ENV !== 'production') {
        devResetToken = rawToken;
      }
    }

    // Generic response prevents account enumeration
    res.json({
      message:
        'If an account exists for that email address, password reset instructions have been prepared.',
      ...(devResetToken ? { devResetToken, devNote: 'Local dev preview token (no SMTP configured).' } : {}),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Unable to process password reset request.' });
  }
});

router.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const schema = z.object({
      token: z.string().min(16),
      newPassword: z.string().min(8).max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reset token or password (minimum 8 characters).' });
      return;
    }

    const tokenHash = hashToken(parsed.data.token.trim());
    const [found] = await db
      .select()
      .from(users)
      .where(and(eq(users.resetTokenHash, tokenHash), gt(users.resetTokenExpiresAt, new Date())))
      .limit(1);

    if (!found) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db
      .update(users)
      .set({
        passwordHash,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, found.id));

    await db.delete(sessions).where(eq(sessions.userId, found.id));
    res.json({ message: 'Password updated successfully. You may now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

router.get('/api/user/profile', requireAuth, async (req: AuthRequest, res) => {
  const user = req.dbUser!;
  res.json({
    id: user.id,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    planId: user.planId,
    emailVerified: user.emailVerified,
    onboardingCompleted: user.onboardingCompleted,
    preferencesJson: user.preferencesJson,
  });
});

router.patch('/api/user/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      displayName: z.string().min(1).max(80).optional(),
      onboardingCompleted: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update payload.' });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName.trim();
    if (parsed.data.onboardingCompleted !== undefined) {
      updates.onboardingCompleted = parsed.data.onboardingCompleted;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.dbUser!.id))
      .returning();

    res.json({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      planId: updated.planId,
      onboardingCompleted: updated.onboardingCompleted,
      preferencesJson: updated.preferencesJson,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

router.patch('/api/user/preferences', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      experience: z.enum(['Beginner', 'Intermediate', 'Experienced']).optional(),
      preferredMarkets: z.array(z.string().max(40)).max(10).optional(),
      preferredTimeframes: z.array(z.string().max(20)).max(10).optional(),
      researchStyle: z.enum(['Scalping', 'Intraday', 'Swing', 'Position / Long-Term']).optional(),
      detailLevel: z.enum(['Concise', 'Balanced', 'Comprehensive']).optional(),
      preferredIndicators: z.array(z.string().max(40)).max(12).optional(),
      language: z.string().max(32).optional(),
      personalizationEnabled: z.boolean().optional(),
      onboardingCompleted: z.boolean().optional(),
      reset: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid preference settings.' });
      return;
    }

    const { onboardingCompleted, reset, ...prefFields } = parsed.data;
    const existingPrefs = (req.dbUser!.preferencesJson || {}) as Record<string, unknown>;
    const nextPrefs = reset
      ? {
          personalizationEnabled: true,
          ...(existingPrefs.notifications ? { notifications: existingPrefs.notifications } : {}),
        }
      : { ...existingPrefs, ...prefFields };

    const updates: Record<string, unknown> = {
      preferencesJson: nextPrefs,
      updatedAt: new Date(),
    };
    if (onboardingCompleted !== undefined) {
      updates.onboardingCompleted = onboardingCompleted;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.dbUser!.id))
      .returning();

    res.json({
      onboardingCompleted: updated.onboardingCompleted,
      preferencesJson: updated.preferencesJson,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to save preferences.' });
  }
});

router.get('/api/user/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [userAnalyses, userConversations, userPrompts, userWatchlist, userDocs] =
      await Promise.all([
        db.select().from(analyses).where(eq(analyses.userId, userId)).orderBy(desc(analyses.createdAt)),
        db.select().from(conversations).where(eq(conversations.userId, userId)),
        db.select().from(savedPrompts).where(eq(savedPrompts.userId, userId)),
        db.select().from(watchlistItems).where(eq(watchlistItems.userId, userId)),
        db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.userId, userId)),
      ]);

    res.setHeader('Content-Disposition', 'attachment; filename="chartledger-account-export.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      account: {
        email: req.dbUser!.email,
        displayName: req.dbUser!.displayName,
        planId: req.dbUser!.planId,
        preferences: req.dbUser!.preferencesJson,
      },
      analyses: userAnalyses,
      conversations: userConversations,
      savedPrompts: userPrompts,
      watchlist: userWatchlist,
      knowledgeDocuments: userDocs,
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export user data.' });
  }
});

router.delete('/api/user/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    await db.insert(auditLogs).values({
      actorUserId: null,
      action: 'account.deleted',
      resourceType: 'user',
      resourceId: String(userId),
      metadataJson: { emailDomain: req.dbUser!.email.split('@')[1] || 'unknown' },
    });
    await db.delete(users).where(eq(users.id, userId));
    res.json({ ok: true, message: 'Your account and associated records have been deleted.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

export default router;
