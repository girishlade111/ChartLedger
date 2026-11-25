import React, { useCallback, useEffect, useState } from 'react';
import {
  BellPlus,
  Briefcase,
  FileDown,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiDownloadBlob, apiFetch } from '../../lib/api';
import type {
  EnrichedHolding,
  PortfolioPerformanceSeries,
  PortfolioSummary,
} from '../../utils/portfolioAndAlerts';
import { PortfolioPerformanceChart } from '../PortfolioPerformanceChart';

interface PortfolioSummaryResponse {
  summary: PortfolioSummary;
  performance: PortfolioPerformanceSeries;
  fetchedAt: string;
}

interface PortfolioSummaryWidgetProps {
  theme: 'dark' | 'light';
  onSetAlertForSymbol: (symbol: string, livePrice?: number | null) => void;
  onAnalyzeSymbol: (symbol: string) => void;
}

function formatUsd(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatPrice(val: number): string {
  if (val >= 1000) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (val >= 1) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

export function PortfolioSummaryWidget({
  theme,
  onSetAlertForSymbol,
  onAnalyzeSymbol,
}: PortfolioSummaryWidgetProps) {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<PortfolioSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState('Crypto');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editAvgCost, setEditAvgCost] = useState('');

  const loadPortfolio = useCallback(
    async (selectedRange = range, silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await apiFetch<PortfolioSummaryResponse>(
          `/api/portfolio/summary?range=${selectedRange}`
        );
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Unable to load portfolio holdings.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range]
  );

  useEffect(() => {
    void loadPortfolio(range, false);
  }, [range, loadPortfolio]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(quantity);
    const costNum = Number(avgCost);
    if (!symbol.trim() || !Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isFinite(costNum) || costNum <= 0) {
      setError('Enter a valid symbol, positive quantity, and positive average cost.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          market,
          quantity: qtyNum,
          avgCost: costNum,
          notes: notes.trim(),
        }),
      });
      setSymbol('');
      setQuantity('');
      setAvgCost('');
      setNotes('');
      setShowAddForm(false);
      await loadPortfolio(range, true);
    } catch (err: any) {
      setError(err.message || 'Failed to add holding.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (h: EnrichedHolding) => {
    setEditingId(h.id);
    setEditQty(String(h.quantity));
    setEditAvgCost(String(h.avgCost));
  };

  const handleSaveEdit = async (id: string) => {
    const qtyNum = Number(editQty);
    const costNum = Number(editAvgCost);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isFinite(costNum) || costNum <= 0) {
      setError('Quantity and average cost must be positive numbers.');
      return;
    }
    setError(null);
    try {
      await apiFetch(`/api/portfolio/holdings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qtyNum, avgCost: costNum }),
      });
      setEditingId(null);
      await loadPortfolio(range, true);
    } catch (err: any) {
      setError(err.message || 'Failed to update holding.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/portfolio/holdings/${id}`, { method: 'DELETE' });
      await loadPortfolio(range, true);
    } catch (err: any) {
      setError(err.message || 'Failed to delete holding.');
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setError(null);
    setExportNotice(null);
    try {
      const dateStamp = new Date().toISOString().slice(0, 10);
      const { blob, filename } = await apiDownloadBlob(
        `/api/portfolio/export/pdf?range=${range}`,
        `chartledger-portfolio-report-${range}d-${dateStamp}.pdf`
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setExportNotice(`Exported ${filename}`);
    } catch (err: any) {
      setError(err.message || 'Failed to export portfolio PDF report.');
    } finally {
      setExportingPdf(false);
    }
  };

  const summary = data?.summary;
  const performance = data?.performance;
  const pnlPositive = (summary?.totalUnrealizedPnl ?? 0) >= 0;
  const periodPositive = (performance?.periodChangeValue ?? 0) >= 0;

  return (
    <section
      data-testid="portfolio-summary-widget"
      aria-label="Asset holdings and performance summary"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Asset Holdings & Performance
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            Track user-defined positions against real-time spot prices and historical market curves.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range Selector */}
          <div
            role="group"
            aria-label="Portfolio performance timeframe"
            className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-[#09090B]"
          >
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                  range === days
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {days}D
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={exportingPdf || loading}
            aria-label="Export asset holdings and performance as PDF report"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </button>

          <button
            type="button"
            onClick={() => void loadPortfolio(range, true)}
            disabled={refreshing}
            aria-label="Refresh portfolio market data"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            {showAddForm ? (
              <>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Holding
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline Add Holding Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddHolding}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-[#09090B] sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label htmlFor="hold-symbol" className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Asset Symbol
            </label>
            <input
              id="hold-symbol"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="BTCUSDT, ETHUSDT, SOL"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-[#111114]"
            />
          </div>
          <div>
            <label htmlFor="hold-market" className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Market
            </label>
            <select
              id="hold-market"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-[#111114]"
            >
              <option>Crypto</option>
              <option>Stocks</option>
              <option>Indices</option>
              <option>Commodities</option>
              <option>Forex</option>
            </select>
          </div>
          <div>
            <label htmlFor="hold-qty" className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Quantity
            </label>
            <input
              id="hold-qty"
              type="number"
              step="any"
              min="0.000001"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.5"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-[#111114]"
            />
          </div>
          <div>
            <label htmlFor="hold-cost" className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Avg Entry Price (USD)
            </label>
            <input
              id="hold-cost"
              type="number"
              step="any"
              min="0.000001"
              required
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              placeholder="55000"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-[#111114]"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Holding'}
            </button>
          </div>
        </form>
      )}

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
          Loading portfolio valuation & historical performance...
        </div>
      ) : !summary || summary.holdingCount === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 py-10 text-center dark:border-zinc-800">
          <Briefcase className="mx-auto mb-2 h-6 w-6 text-zinc-400" aria-hidden="true" />
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            No asset holdings tracked yet.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add crypto positions like BTCUSDT, ETHUSDT, or SOLUSDT to track real-time valuation and
            historical performance over time.
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add First Holding
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">Total Market Value</div>
              <div className="mt-1 truncate font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50 sm:text-lg">
                {formatUsd(summary.totalCurrentValue)}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {summary.liveCoverageCount}/{summary.holdingCount} live spot feeds
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">Total Cost Basis</div>
              <div className="mt-1 truncate font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50 sm:text-lg">
                {formatUsd(summary.totalCostBasis)}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {summary.holdingCount} {summary.holdingCount === 1 ? 'asset' : 'assets'} tracked
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">Unrealized P&L</div>
              <div
                className={`mt-1 flex items-center gap-1 font-mono text-base font-bold tabular-nums sm:text-lg ${
                  pnlPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {pnlPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                )}
                <span className="truncate">
                  {pnlPositive ? '+' : ''}
                  {formatUsd(summary.totalUnrealizedPnl)}
                </span>
              </div>
              <div
                className={`mt-0.5 font-mono text-[11px] tabular-nums ${
                  pnlPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {pnlPositive ? '+' : ''}
                {summary.totalUnrealizedPnlPercent}% vs cost basis
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
              <div className="text-[11px] text-zinc-500">{range}D Portfolio Change</div>
              <div
                className={`mt-1 truncate font-mono text-base font-bold tabular-nums sm:text-lg ${
                  periodPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {periodPositive ? '+' : ''}
                {performance?.periodChangePercent ?? 0}%
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500">
                {periodPositive ? '+' : ''}
                {formatUsd(performance?.periodChangeValue ?? 0)}
                {summary.weightedChange24hPercent != null &&
                  ` · 24h ${summary.weightedChange24hPercent > 0 ? '+' : ''}${summary.weightedChange24hPercent}%`}
              </div>
            </div>
          </div>

          {/* Performance Over Time Chart */}
          {performance && performance.points.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Portfolio Valuation Curve ({range}D · Binance Public Spot History)
                </span>
                <span className="font-mono tabular-nums">
                  {performance.costBasisFallbackAssets > 0
                    ? `${performance.costBasisFallbackAssets} non-spot asset(s) valued at cost basis`
                    : `Updated ${data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}`}
                </span>
              </div>
              <PortfolioPerformanceChart
                points={performance.points}
                costBasis={summary.totalCostBasis}
                theme={theme}
                height={210}
              />
            </div>
          )}

          {/* Holdings Breakdown Table */}
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-[#0B0B0E]">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Asset</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Avg Cost</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Live Price</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Market Value</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Unrealized P&L</th>
                  <th className="px-3.5 py-2.5 font-medium">Allocation</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {summary.holdings.map((h) => {
                  const rowPos = h.unrealizedPnl >= 0;
                  const isEditing = editingId === h.id;
                  return (
                    <tr key={h.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                      <td className="px-3.5 py-2.5">
                        <button
                          type="button"
                          onClick={() => onAnalyzeSymbol(h.symbol)}
                          className="font-mono font-semibold text-zinc-950 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                        >
                          {h.symbol}
                        </button>
                        <div className="text-[11px] text-zinc-500">{h.market}</div>
                      </td>

                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            aria-label={`Edit quantity for ${h.symbol}`}
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="w-20 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-right font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
                          />
                        ) : (
                          h.quantity
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            aria-label={`Edit average cost for ${h.symbol}`}
                            value={editAvgCost}
                            onChange={(e) => setEditAvgCost(e.target.value)}
                            className="w-24 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-right font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
                          />
                        ) : (
                          `$${formatPrice(h.avgCost)}`
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                        {h.hasLivePrice && h.livePrice !== null ? (
                          <div>
                            <div className="text-zinc-950 dark:text-zinc-100">
                              ${formatPrice(h.livePrice)}
                            </div>
                            {h.change24hPercent != null && (
                              <div
                                className={`text-[10px] ${
                                  h.change24hPercent >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {h.change24hPercent > 0 ? '+' : ''}
                                {h.change24hPercent}% 24h
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Cost basis</span>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-right font-mono font-medium tabular-nums text-zinc-950 dark:text-zinc-100">
                        {formatUsd(h.currentValue)}
                      </td>

                      <td
                        className={`px-3.5 py-2.5 text-right font-mono tabular-nums ${
                          rowPos
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        <div>
                          {rowPos ? '+' : ''}
                          {formatUsd(h.unrealizedPnl)}
                        </div>
                        <div className="text-[10px]">
                          {rowPos ? '+' : ''}
                          {h.unrealizedPnlPercent}%
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.min(100, Math.max(2, h.allocationPercent))}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                            {h.allocationPercent}%
                          </span>
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(h.id)}
                              className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-zinc-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2.5">
                            <button
                              type="button"
                              aria-label={`Set price alert for ${h.symbol}`}
                              onClick={() => onSetAlertForSymbol(h.symbol, h.livePrice)}
                              className="text-zinc-400 hover:text-emerald-500"
                              title="Set Price Alert"
                            >
                              <BellPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit holding ${h.symbol}`}
                              onClick={() => handleStartEdit(h)}
                              className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                              title="Edit Holding"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete holding ${h.symbol}`}
                              onClick={() => void handleDelete(h.id)}
                              className="text-zinc-400 hover:text-red-500"
                              title="Delete Holding"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
