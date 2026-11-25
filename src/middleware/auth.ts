import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  knowledgeCollections,
  savedPrompts,
  sessions,
  subscriptions,
  users,
} from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DEFAULT_USER_PROMPTS } from '../server/ai/promptRegistry.ts';

const JWT_SECRET =
  process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16
    ? process.env.AUTH_SECRET
    : crypto.randomBytes(32).toString('hex');

const INITIAL_ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'girishlade111@gmail.com'
).toLowerCase();

export interface DbUserRecord {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: string;
  planId: string;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  preferencesJson: Record<string, unknown>;
}

export interface AuthRequest extends Request {
  dbUser?: DbUserRecord;
  sessionTokenHash?: string;
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function signSessionJwt(userId: number, uid: string): string {
  return jwt.sign({ sub: String(userId), uid }, JWT_SECRET, { expiresIn: '7d' });
}

export async function bootstrapUserDefaults(userId: number): Promise<void> {
  try {
    const existingSub = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (existingSub.length === 0) {
      await db
        .insert(subscriptions)
        .values({
          userId,
          planId: 'free',
          status: 'active',
        })
        .onConflictDoNothing();
    }

    const existingPrompts = await db
      .select({ id: savedPrompts.id })
      .from(savedPrompts)
      .where(eq(savedPrompts.userId, userId))
      .limit(1);

    if (existingPrompts.length === 0) {
      await db.insert(savedPrompts).values(
        DEFAULT_USER_PROMPTS.map((p) => ({
          id: crypto.randomUUID(),
          userId,
          title: p.title,
          category: p.category,
          content: p.content,
          isFavorite: false,
        }))
      );
    }

    const existingCols = await db
      .select({ id: knowledgeCollections.id })
      .from(knowledgeCollections)
      .where(eq(knowledgeCollections.userId, userId))
      .limit(1);

    if (existingCols.length === 0) {
      await db.insert(knowledgeCollections).values({
        id: crypto.randomUUID(),
        userId,
        name: 'Trading Playbooks & Notes',
        description: 'Default private collection for personal strategy checklists and technical notes.',
      });
    }
  } catch (err) {
    console.error('Bootstrap defaults error:', err);
  }
}

export async function upsertFirebaseUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<DbUserRecord> {
  const normalizedEmail = email.toLowerCase();
  const isAdmin = normalizedEmail === INITIAL_ADMIN_EMAIL;

  try {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingByEmail.length > 0) {
      const existing = existingByEmail[0];
      if (existing.uid !== uid) {
        const updated = await db
          .update(users)
          .set({
            uid,
            emailVerified: true,
            role: isAdmin ? 'admin' : existing.role,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning();
        await bootstrapUserDefaults(updated[0].id);
        return updated[0];
      }
      await bootstrapUserDefaults(existing.id);
      return existing;
    }

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        displayName: displayName || normalizedEmail.split('@')[0] || 'Trader',
        role: isAdmin ? 'admin' : 'user',
        planId: 'free',
        emailVerified: true,
        termsAcceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    await bootstrapUserDefaults(inserted[0].id);
    return inserted[0];
  } catch (error) {
    console.error('Failed to sync Firebase user to PostgreSQL:', error);
    throw new Error('Authentication synchronization failed.', { cause: error });
  }
}

export async function resolveUserFromAuthHeader(
  authHeader?: string
): Promise<{ user: DbUserRecord; tokenHash?: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // 1. Try local JWT session (email/password login)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string; uid?: string };
    if (payload.sub) {
      const tokenHash = hashToken(token);
      const validSession = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
        .limit(1);

      if (validSession.length > 0) {
        const found = await db
          .select()
          .from(users)
          .where(eq(users.id, validSession[0].userId))
          .limit(1);
        if (found.length > 0) {
          return { user: found[0], tokenHash };
        }
      }
    }
  } catch {
    // Not a local session JWT; proceed to Firebase ID token verification
  }

  // 2. Verify Firebase ID Token (Google Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid && decoded.email) {
      const user = await upsertFirebaseUser(decoded.uid, decoded.email, decoded.name);
      return { user };
    }
  } catch {
    return null;
  }

  return null;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const resolved = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!resolved) {
      res.status(401).json({ error: 'Unauthorized: Please sign in to continue.' });
      return;
    }
    req.dbUser = resolved.user;
    req.sessionTokenHash = resolved.tokenHash;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication verification failed.' });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.dbUser || req.dbUser.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Administrator access required.' });
    return;
  }
  next();
}
