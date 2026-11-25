import type { RechartsHoldingValuePoint } from './dashboardLayout';
import type { PortfolioMarketSentiment } from './marketSentiment';
import type { PortfolioSummary } from './portfolioAndAlerts';

/**
 * Escapes a single CSV value per RFC 4180 while mitigating spreadsheet formula
 * injection (CSV injection) on untrusted string fields.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  let str = String(value);
  // Mitigate spreadsheet formula execution for untrusted text beginning with =, +, -, @, tab, or CR
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvString(
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

export function buildPortfolioHoldingsCsv(summary: PortfolioSummary): string {
  const headers = [
    'Symbol',
    'Market',
    'Quantity',
    'Avg Cost (USD)',
    'Live Price (USD)',
    '24h Change (%)',
    'Cost Basis (USD)',
    'Current Value (USD)',
    'Unrealized PnL (USD)',
    'Unrealized PnL (%)',
    'Allocation (%)',
    'Price Source',
    'Notes',
  ];

  const rows: Array<Array<unknown>> = summary.holdings.map((h) => [
    h.symbol,
    h.market,
    h.quantity,
    h.avgCost,
    h.livePrice ?? '',
    h.change24hPercent ?? '',
    h.costBasis,
    h.currentValue,
    h.unrealizedPnl,
    h.unrealizedPnlPercent,
    h.allocationPercent,
    h.sourceName ?? 'Entry Price Fallback',
    h.notes || '',
  ]);

  if (summary.holdings.length > 0) {
    rows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      summary.weightedChange24hPercent ?? '',
      summary.totalCostBasis,
      summary.totalCurrentValue,
      summary.totalUnrealizedPnl,
      summary.totalUnrealizedPnlPercent,
      100,
      `${summary.liveCoverageCount}/${summary.holdingCount} Live Feeds`,
      '',
    ]);
  }

  return buildCsvString(headers, rows);
}

export function buildHoldings30dTrendCsv(
  points: RechartsHoldingValuePoint[],
  costBasis: number
): string {
  const headers = [
    'Date (UTC)',
    'Unix Timestamp',
    'Total Holdings Value (USD)',
    'Total Cost Basis (USD)',
    'Net vs Cost Basis (USD)',
    'Net vs Cost Basis (%)',
  ];

  const rows: Array<Array<unknown>> = points.map((pt) => {
    const netUsd = Math.round((pt.value - costBasis) * 100) / 100;
    const netPct =
      costBasis > 0 ? Math.round(((pt.value - costBasis) / costBasis) * 10000) / 100 : 0;
    return [pt.fullDate, pt.time, pt.value, costBasis, netUsd, netPct];
  });

  return buildCsvString(headers, rows);
}

export function buildMarketSentimentCsv(
  sentiment: PortfolioMarketSentiment,
  timeframe: string
): string {
  const headers = [
    'Symbol',
    'Market',
    'Timeframe',
    'Portfolio Weight (%)',
    'Position Value (USD)',
    'Sentiment Score (0-100)',
    'Sentiment Label',
    'Bullish Signals',
    'Neutral Signals',
    'Bearish Signals',
    'Signal Summary',
  ];

  const rows: Array<Array<unknown>> = sentiment.assets.map((asset) => {
    const signalSummary = asset.signals
      .map((s) => `${s.name}: ${s.reading} (${s.vote})`)
      .join('; ');

    return [
      asset.symbol,
      asset.market,
      timeframe.toUpperCase(),
      asset.weightPercent,
      asset.currentValue,
      asset.score ?? '',
      asset.label,
      asset.bullishCount,
      asset.neutralCount,
      asset.bearishCount,
      signalSummary || asset.reason || 'Insufficient OHLCV history',
    ];
  });

  if (sentiment.assets.length > 0) {
    const totalPositionValue =
      Math.round(sentiment.assets.reduce((acc, a) => acc + a.currentValue, 0) * 100) / 100;
    rows.push([
      'PORTFOLIO WEIGHTED',
      '',
      timeframe.toUpperCase(),
      100,
      totalPositionValue,
      sentiment.overallScore ?? '',
      sentiment.overallLabel,
      sentiment.bullishSignals,
      sentiment.neutralSignals,
      sentiment.bearishSignals,
      `${sentiment.scoredHoldingsCount}/${sentiment.totalHoldingsCount} holdings scored`,
    ]);
  }

  return buildCsvString(headers, rows);
}

export interface RecentAnalysisCsvRow {
  title: string;
  symbol?: string | null;
  timeframe?: string | null;
  marketBias?: string | null;
  isFavorite?: boolean;
  createdAt: string;
}

export function buildRecentAnalysesCsv(analyses: RecentAnalysisCsvRow[]): string {
  const headers = ['Title', 'Symbol', 'Timeframe', 'Market Bias', 'Favorite', 'Created At (UTC)'];
  const rows = analyses.map((rec) => [
    rec.title,
    rec.symbol || 'Unspecified',
    rec.timeframe || 'Unspecified',
    rec.marketBias || 'neutral',
    Boolean(rec.isFavorite),
    rec.createdAt,
  ]);
  return buildCsvString(headers, rows);
}

export interface WorkspaceKpisCsvInput {
  planName: string;
  analysesCount: number;
  analysesLimit: number;
  messagesCount: number;
  messagesLimit: number;
  savedFavoritesCount: number;
  kbDocsCount: number;
  kbDocsLimit: number;
  exportedAtIso: string;
}

export function buildWorkspaceKpisCsv(input: WorkspaceKpisCsvInput): string {
  const headers = ['Metric', 'Current Value', 'Plan Limit', 'Plan', 'Exported At (UTC)'];
  const rows: Array<Array<unknown>> = [
    ['Analyses This Month', input.analysesCount, input.analysesLimit, input.planName, input.exportedAtIso],
    ['AI Chat Messages', input.messagesCount, input.messagesLimit, input.planName, input.exportedAtIso],
    ['Saved Favorites', input.savedFavoritesCount, 'Unlimited', input.planName, input.exportedAtIso],
    ['Indexed Knowledge Docs', input.kbDocsCount, input.kbDocsLimit, input.planName, input.exportedAtIso],
  ];
  return buildCsvString(headers, rows);
}

export function triggerCsvDownload(csvContent: string, filename: string): void {
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
