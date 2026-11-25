import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { auditLogs, users } from '../db/schema.ts';

export interface NotificationSettings {
  emailAlertsEnabled: boolean;
  recipientEmail: string;
  includeResearchNotes: boolean;
  deliveryMode: 'instant' | 'digest';
}

export interface NotificationDispatchRecord {
  id: number;
  symbol: string;
  condition: string;
  targetPrice: number;
  triggeredPrice: number;
  recipientEmail: string;
  channelStatus: 'sent_resend' | 'recorded_local';
  createdAt: string;
}

export function extractNotificationSettings(
  preferencesJson: Record<string, unknown> | null | undefined,
  fallbackEmail: string
): NotificationSettings {
  const raw =
    preferencesJson &&
    typeof preferencesJson === 'object' &&
    preferencesJson.notifications &&
    typeof preferencesJson.notifications === 'object'
      ? (preferencesJson.notifications as Record<string, unknown>)
      : {};

  return {
    emailAlertsEnabled: raw.emailAlertsEnabled === true,
    recipientEmail:
      typeof raw.recipientEmail === 'string' && raw.recipientEmail.trim().length > 0
        ? raw.recipientEmail.trim()
        : fallbackEmail,
    includeResearchNotes: raw.includeResearchNotes !== false,
    deliveryMode: raw.deliveryMode === 'digest' ? 'digest' : 'instant',
  };
}

export async function getUserNotificationSettings(userId: number): Promise<{
  settings: NotificationSettings;
  smtpConfigured: boolean;
  recentDispatches: NotificationDispatchRecord[];
}> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) {
    throw new Error('User not found');
  }

  const settings = extractNotificationSettings(userRow.preferencesJson, userRow.email);
  const logs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, userId),
        eq(auditLogs.action, 'price_alert.email_notification')
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  const recentDispatches: NotificationDispatchRecord[] = logs.map((row) => {
    const meta = (row.metadataJson || {}) as Record<string, any>;
    return {
      id: row.id,
      symbol: String(meta.symbol || ''),
      condition: String(meta.condition || 'above'),
      targetPrice: Number(meta.targetPrice || 0),
      triggeredPrice: Number(meta.triggeredPrice || 0),
      recipientEmail: String(meta.recipientEmail || userRow.email),
      channelStatus: meta.channelStatus === 'sent_resend' ? 'sent_resend' : 'recorded_local',
      createdAt: row.createdAt.toISOString(),
    };
  });

  return {
    settings,
    smtpConfigured: Boolean(process.env.RESEND_API_KEY),
    recentDispatches,
  };
}

export async function updateUserNotificationSettings(
  userId: number,
  patch: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) {
    throw new Error('User not found');
  }

  const current = extractNotificationSettings(userRow.preferencesJson, userRow.email);
  const nextSettings: NotificationSettings = {
    emailAlertsEnabled:
      patch.emailAlertsEnabled !== undefined
        ? patch.emailAlertsEnabled
        : current.emailAlertsEnabled,
    recipientEmail:
      patch.recipientEmail !== undefined && patch.recipientEmail.trim().length > 0
        ? patch.recipientEmail.trim()
        : current.recipientEmail,
    includeResearchNotes:
      patch.includeResearchNotes !== undefined
        ? patch.includeResearchNotes
        : current.includeResearchNotes,
    deliveryMode:
      patch.deliveryMode !== undefined ? patch.deliveryMode : current.deliveryMode,
  };

  const mergedPrefs: Record<string, unknown> = {
    ...(userRow.preferencesJson || {}),
    notifications: nextSettings,
  };

  await db
    .update(users)
    .set({
      preferencesJson: mergedPrefs,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return nextSettings;
}

export async function dispatchPriceAlertEmailIfEnabled(params: {
  userId: number;
  alertId: string;
  symbol: string;
  condition: string;
  targetPrice: number;
  triggeredPrice: number;
  note: string;
}): Promise<{ dispatched: boolean; channelStatus?: 'sent_resend' | 'recorded_local' }> {
  const [userRow] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!userRow) return { dispatched: false };

  const settings = extractNotificationSettings(userRow.preferencesJson, userRow.email);
  if (!settings.emailAlertsEnabled) {
    return { dispatched: false };
  }

  let channelStatus: 'sent_resend' | 'recorded_local' = 'recorded_local';
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const fromAddr = process.env.ALERT_FROM_EMAIL || 'alerts@chartledger.app';
      const subject = `ChartLedger Price Alert: ${params.symbol} crossed ${params.condition} $${params.targetPrice}`;
      const bodyLines = [
        `Asset: ${params.symbol}`,
        `Condition: Price ${params.condition === 'above' ? 'rose above' : 'fell below'} $${params.targetPrice}`,
        `Triggered Spot Price: $${params.triggeredPrice}`,
        settings.includeResearchNotes && params.note ? `Research Note: ${params.note}` : null,
        '',
        'Educational & Informational Notice: Automated alert notification only, not investment advice.',
      ].filter(Boolean);

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [settings.recipientEmail],
          subject,
          text: bodyLines.join('\n'),
        }),
      });
      if (resp.ok) {
        channelStatus = 'sent_resend';
      }
    } catch (err) {
      console.error('Resend email dispatch fallback to local audit log:', err);
    }
  }

  await db.insert(auditLogs).values({
    actorUserId: params.userId,
    action: 'price_alert.email_notification',
    resourceType: 'price_alert',
    resourceId: params.alertId,
    metadataJson: {
      symbol: params.symbol,
      condition: params.condition,
      targetPrice: params.targetPrice,
      triggeredPrice: params.triggeredPrice,
      recipientEmail: settings.recipientEmail,
      deliveryMode: settings.deliveryMode,
      includeResearchNotes: settings.includeResearchNotes,
      channelStatus,
    },
  });

  return { dispatched: true, channelStatus };
}
