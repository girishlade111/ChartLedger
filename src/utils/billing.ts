export function getCurrentPeriodKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatCents(cents: number, currency = 'USD'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export interface QuotaCheckInput {
  used: number;
  limit: number;
  requested?: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  utilizationPercent: number;
}

export function evaluateQuota({ used, limit, requested = 1 }: QuotaCheckInput): QuotaCheckResult {
  const safeLimit = Math.max(0, limit);
  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, safeLimit - safeUsed);
  const allowed = safeUsed + requested <= safeLimit;
  const utilizationPercent =
    safeLimit === 0 ? 100 : Math.min(100, Math.round((safeUsed / safeLimit) * 100));

  return {
    allowed,
    remaining,
    utilizationPercent,
  };
}

export function mapStripeSubscriptionStatus(
  stripeStatus: string
): 'active' | 'past_due' | 'canceled' | 'trialing' {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'canceled';
  }
}
