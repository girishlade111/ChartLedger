import type { PortfolioPerformancePoint } from './portfolioAndAlerts';

export type DashboardWidgetId =
  | 'kpi-overview'
  | 'quick-actions'
  | 'portfolio-summary'
  | 'holdings-value-30d'
  | 'market-sentiment'
  | 'recent-analyses';

export const DEFAULT_DASHBOARD_WIDGET_ORDER: DashboardWidgetId[] = [
  'kpi-overview',
  'quick-actions',
  'portfolio-summary',
  'holdings-value-30d',
  'market-sentiment',
  'recent-analyses',
];

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  'kpi-overview': 'Workspace Usage KPIs',
  'quick-actions': 'Quick Research Actions',
  'portfolio-summary': 'Asset Holdings & Performance',
  'holdings-value-30d': '30-Day Holdings Value Trend',
  'market-sentiment': 'Market Sentiment',
  'recent-analyses': 'Recent Chart Analyses',
};

const VALID_WIDGET_SET = new Set<string>(DEFAULT_DASHBOARD_WIDGET_ORDER);

export function normalizeDashboardOrder(raw: unknown): DashboardWidgetId[] {
  const seen = new Set<DashboardWidgetId>();
  const result: DashboardWidgetId[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && VALID_WIDGET_SET.has(item)) {
        const id = item as DashboardWidgetId;
        if (!seen.has(id)) {
          seen.add(id);
          result.push(id);
        }
      }
    }
  }

  for (const fallbackId of DEFAULT_DASHBOARD_WIDGET_ORDER) {
    if (!seen.has(fallbackId)) {
      seen.add(fallbackId);
      result.push(fallbackId);
    }
  }

  return result;
}

export function reorderDashboardWidgets(
  order: DashboardWidgetId[],
  sourceId: DashboardWidgetId,
  targetId: DashboardWidgetId
): DashboardWidgetId[] {
  if (sourceId === targetId) return [...order];
  const fromIdx = order.indexOf(sourceId);
  const toIdx = order.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return [...order];

  const next = [...order];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function moveDashboardWidget(
  order: DashboardWidgetId[],
  id: DashboardWidgetId,
  direction: 'up' | 'down'
): DashboardWidgetId[] {
  const idx = order.indexOf(id);
  if (idx === -1) return [...order];
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= order.length) return [...order];

  const next = [...order];
  const [moved] = next.splice(idx, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

export interface RechartsHoldingValuePoint {
  time: number;
  dateLabel: string;
  fullDate: string;
  value: number;
  costBasis: number;
  returnPercent: number;
}

export interface Holdings30dChartStats {
  points: RechartsHoldingValuePoint[];
  highValue: number;
  lowValue: number;
  startValue: number;
  endValue: number;
  changeValue: number;
  changePercent: number;
  yDomainMin: number;
  yDomainMax: number;
}

export function formatHoldings30dChartData(
  points: PortfolioPerformancePoint[],
  costBasis: number
): Holdings30dChartStats {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);

  const formatted: RechartsHoldingValuePoint[] = sorted.map((p) => {
    const dt = new Date(p.time * 1000);
    return {
      time: p.time,
      dateLabel: dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      fullDate: dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      value: Math.round(p.value * 100) / 100,
      costBasis: Math.round(p.costBasis * 100) / 100,
      returnPercent: p.returnPercent,
    };
  });

  if (formatted.length === 0) {
    return {
      points: [],
      highValue: 0,
      lowValue: 0,
      startValue: 0,
      endValue: 0,
      changeValue: 0,
      changePercent: 0,
      yDomainMin: 0,
      yDomainMax: 100,
    };
  }

  const values = formatted.map((p) => p.value);
  const highValue = Math.max(...values);
  const lowValue = Math.min(...values);
  const startValue = formatted[0].value;
  const endValue = formatted[formatted.length - 1].value;
  const changeValue = Math.round((endValue - startValue) * 100) / 100;
  const changePercent =
    startValue > 0 ? Math.round((changeValue / startValue) * 10000) / 100 : 0;

  const domainCandidates = [...values];
  if (costBasis > 0) domainCandidates.push(costBasis);
  const minCandidate = Math.min(...domainCandidates);
  const maxCandidate = Math.max(...domainCandidates);
  const span = maxCandidate - minCandidate || Math.max(10, maxCandidate * 0.1);
  const yDomainMin = Math.max(0, Math.floor(minCandidate - span * 0.08));
  const yDomainMax = Math.ceil(maxCandidate + span * 0.08);

  return {
    points: formatted,
    highValue,
    lowValue,
    startValue,
    endValue,
    changeValue,
    changePercent,
    yDomainMin,
    yDomainMax,
  };
}
