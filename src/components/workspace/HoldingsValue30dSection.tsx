import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  LineChart as LineChartIcon,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../../lib/api';
import { buildHoldings30dTrendCsv, triggerCsvDownload } from '../../utils/csvExport';
import type {
  PortfolioPerformanceSeries,
  PortfolioSummary,
} from '../../utils/portfolioAndAlerts';
import {
  formatHoldings30dChartData,
  type RechartsHoldingValuePoint,
} from '../../utils/dashboardLayout';

interface Portfolio30dResponse {
  summary: PortfolioSummary;
  performance: PortfolioPerformanceSeries;
  fetchedAt: string;
}

interface HoldingsValue30dSectionProps {
  theme: 'dark' | 'light';
  refreshTrigger?: number;
}

function formatUsd(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatAxisUsd(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
  return `$${Math.round(val)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RechartsHoldingValuePoint }>;
  theme: 'dark' | 'light';
}

function HoldingsTooltip({ active, payload, theme }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  const retPos = pt.returnPercent >= 0;

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs shadow-lg ${
        theme === 'dark'
          ? 'border-zinc-700 bg-[#141418] text-zinc-100'
          : 'border-zinc-200 bg-white text-zinc-900'
      }`}
    >
      <div className="font-mono text-[11px] text-zinc-500">{pt.fullDate} (UTC)</div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-zinc-500">Total Value</span>
        <span className="font-mono font-semibold tabular-nums">{formatUsd(pt.value)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-zinc-500">Cost Basis</span>
        <span className="font-mono tabular-nums text-zinc-500">{formatUsd(pt.costBasis)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-zinc-500">vs Cost Basis</span>
        <span
          className={`font-mono font-medium tabular-nums ${
            retPos ? 'text-emerald-500' : 'text-red-500'
          }`}
        >
          {retPos ? '+' : ''}
          {pt.returnPercent}%
        </span>
      </div>
    </div>
  );
}

export function HoldingsValue30dSection({
  theme,
  refreshTrigger = 0,
}: HoldingsValue30dSectionProps) {
  const [data, setData] = useState<Portfolio30dResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load30d = useCallback(async (silent = false, forceFresh = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const freshParam = forceFresh ? '&fresh=1' : '';
      const res = await apiFetch<Portfolio30dResponse>(
        `/api/portfolio/summary?range=30${freshParam}`
      );
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Unable to load 30-day holdings history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load30d(refreshTrigger > 0, false);
  }, [refreshTrigger, load30d]);

  const chartStats = useMemo(() => {
    if (!data?.performance) return null;
    return formatHoldings30dChartData(
      data.performance.points,
      data.summary.totalCostBasis
    );
  }, [data]);

  const handleDownloadCsv = () => {
    if (!data || !chartStats || chartStats.points.length === 0) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `chartledger-holdings-30d-trend-${dateStamp}.csv`;
    const csv = buildHoldings30dTrendCsv(chartStats.points, data.summary.totalCostBasis);
    triggerCsvDownload(csv, filename);
    setExportNotice(`Downloaded ${filename}`);
  };

  const isDark = theme === 'dark';
  const periodPositive = (chartStats?.changeValue ?? 0) >= 0;
  const lineColor = periodPositive ? '#10B981' : '#EF4444';
  const gridColor = isDark ? '#27272A' : '#E4E4E7';
  const axisTickColor = isDark ? '#A1A1AA' : '#52525B';

  return (
    <section
      data-testid="holdings-value-30d-section"
      aria-label="30-Day Holdings Total Value Line Chart"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LineChartIcon
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              30-Day Holdings Value Trend
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            Interactive daily valuation line chart of your total active asset holdings over the
            past 30 days.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={loading || !chartStats || chartStats.points.length === 0}
            aria-label="Download 30-Day Holdings Value Trend as CSV"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download as CSV
          </button>

          <button
            type="button"
            onClick={() => void load30d(true, true)}
            disabled={refreshing}
            aria-label="Refresh 30-day holdings chart"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {exportNotice && (
        <p role="status" className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {exportNotice}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-zinc-500">
          Loading 30-day portfolio valuation history...
        </div>
      ) : !data || data.summary.holdingCount === 0 || !chartStats || chartStats.points.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 py-10 text-center dark:border-zinc-800">
          <LineChartIcon className="mx-auto mb-2 h-6 w-6 text-zinc-400" aria-hidden="true" />
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            No holdings history available for the 30-day trend yet.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add asset positions in Asset Holdings & Performance to plot your 30-day total value
            curve.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Compact 30D Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">Latest Total Value</div>
              <div className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                {formatUsd(chartStats.endValue)}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">30D Net Change</div>
              <div
                className={`mt-0.5 flex items-center gap-1 truncate font-mono text-sm font-bold tabular-nums ${
                  periodPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {periodPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {periodPositive ? '+' : ''}
                  {chartStats.changePercent}%
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">30D Peak Value</div>
              <div className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                {formatUsd(chartStats.highValue)}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">30D Low Value</div>
              <div className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                {formatUsd(chartStats.lowValue)}
              </div>
            </div>
          </div>

          {/* Interactive Recharts Line Chart */}
          <div
            data-testid="holdings-value-30d-chart"
            className="h-[260px] w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-[#09090B]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartStats.points}
                margin={{ top: 12, right: 24, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                  minTickGap={24}
                  padding={{ left: 6, right: 12 }}
                />
                <YAxis
                  domain={[chartStats.yDomainMin, chartStats.yDomainMax]}
                  tickFormatter={formatAxisUsd}
                  tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={62}
                />
                <Tooltip content={<HoldingsTooltip theme={theme} />} />
                {data.summary.totalCostBasis > 0 && (
                  <ReferenceLine
                    y={data.summary.totalCostBasis}
                    stroke="#71717A"
                    strokeDasharray="4 4"
                    label={{
                      value: `Cost Basis ${formatAxisUsd(data.summary.totalCostBasis)}`,
                      position: 'insideTopRight',
                      fill: axisTickColor,
                      fontSize: 10,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Total Holdings Value"
                  stroke={lineColor}
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 5, fill: lineColor, stroke: isDark ? '#09090B' : '#FFFFFF', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>
              30-day daily closing valuation ({chartStats.points.length} data points) · Hover any
              point to inspect exact date & return vs cost basis.
            </span>
            <span className="font-mono tabular-nums">
              {periodPositive ? '+' : ''}
              {formatUsd(chartStats.changeValue)} over 30D
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
