import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  CheckCircle2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

export interface PriceAlertRecord {
  id: string;
  symbol: string;
  market: string;
  condition: 'above' | 'below';
  targetPrice: number;
  note: string;
  status: 'active' | 'paused' | 'triggered';
  lastCheckedPrice: number | null;
  lastCheckedAt: string | null;
  triggeredPrice: number | null;
  triggeredAt: string | null;
  createdAt: string;
  liveQuote: {
    lastPrice: number;
    change24hPercent: number | null;
    high24h: number | null;
    low24h: number | null;
    fetchedAt: string;
    sourceName: string;
  } | null;
  distancePercent: number | null;
  distanceAmount: number | null;
}

interface PriceAlertsViewProps {
  initialSymbol?: string;
  initialPrice?: number | null;
  onClearInitialSymbol?: () => void;
  onAnalyzeSymbol: (symbol: string) => void;
  onTriggeredCountChange?: (count: number) => void;
}

const QUICK_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

function formatPrice(val: number): string {
  if (val >= 1000) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (val >= 1) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

export function PriceAlertsView({
  initialSymbol,
  initialPrice,
  onClearInitialSymbol,
  onAnalyzeSymbol,
  onTriggeredCountChange,
}: PriceAlertsViewProps) {
  const [alerts, setAlerts] = useState<PriceAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [autoPoll, setAutoPoll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'triggered' | 'paused'>('all');
  const [recentNotice, setRecentNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(initialSymbol || 'BTCUSDT');
  const [market, setMarket] = useState('Crypto');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState(
    initialPrice ? String(Math.round(initialPrice * 1.02 * 100) / 100) : ''
  );
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (initialSymbol) {
      setSymbol(initialSymbol);
      if (initialPrice && initialPrice > 0) {
        setTargetPrice(String(Math.round(initialPrice * 1.02 * 100) / 100));
      }
      onClearInitialSymbol?.();
    }
  }, [initialSymbol, initialPrice, onClearInitialSymbol]);

  const fetchAlerts = useCallback(
    async (fresh = false) => {
      if (fresh) setEvaluating(true);
      setError(null);
      try {
        const res = await apiFetch<{
          alerts: PriceAlertRecord[];
          newlyTriggered: Array<{ symbol: string; condition: string; targetPrice: number; triggeredPrice: number }>;
          checkedAt: string;
        }>(fresh ? '/api/alerts/evaluate' : '/api/alerts', {
          method: fresh ? 'POST' : 'GET',
        });
        setAlerts(res.alerts);
        setLastCheckedAt(res.checkedAt);
        const triggeredTotal = res.alerts.filter((a) => a.status === 'triggered').length;
        onTriggeredCountChange?.(triggeredTotal);
        if (res.newlyTriggered && res.newlyTriggered.length > 0) {
          const first = res.newlyTriggered[0];
          setRecentNotice(
            `Price alert triggered: ${first.symbol} crossed ${first.condition} $${formatPrice(
              first.targetPrice
            )} (live spot $${formatPrice(first.triggeredPrice)}).`
          );
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load price alerts.');
      } finally {
        setLoading(false);
        setEvaluating(false);
      }
    },
    [onTriggeredCountChange]
  );

  useEffect(() => {
    void fetchAlerts(false);
  }, [fetchAlerts]);

  // Real-time 15s polling when autoPoll is enabled
  useEffect(() => {
    if (!autoPoll) return;
    const timer = setInterval(() => {
      void fetchAlerts(true);
    }, 15_000);
    return () => clearInterval(timer);
  }, [autoPoll, fetchAlerts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetNum = Number(targetPrice);
    if (!symbol.trim() || !Number.isFinite(targetNum) || targetNum <= 0) {
      setError('Enter a valid trading symbol and positive target price.');
      return;
    }

    setCreating(true);
    setError(null);
    setRecentNotice(null);
    try {
      const res = await apiFetch<{
        alert: PriceAlertRecord;
        triggeredImmediately: boolean;
      }>('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          market,
          condition,
          targetPrice: targetNum,
          note: note.trim(),
        }),
      });
      setTargetPrice('');
      setNote('');
      if (res.triggeredImmediately) {
        setRecentNotice(
          `${res.alert.symbol} is already ${res.alert.condition} $${formatPrice(
            res.alert.targetPrice
          )} — alert triggered immediately against real-time spot price.`
        );
      }
      await fetchAlerts(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create price alert.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'active' | 'paused') => {
    setError(null);
    try {
      await apiFetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await fetchAlerts(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update alert status.');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
      const next = alerts.filter((a) => a.id !== id);
      setAlerts(next);
      onTriggeredCountChange?.(next.filter((a) => a.status === 'triggered').length);
    } catch (err: any) {
      setError(err.message || 'Failed to delete alert.');
    }
  };

  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const triggeredCount = alerts.filter((a) => a.status === 'triggered').length;
  const pausedCount = alerts.filter((a) => a.status === 'paused').length;

  const filteredAlerts = alerts.filter((a) => (filter === 'all' ? true : a.status === filter));

  return (
    <div className="space-y-6" data-testid="price-alerts-view">
      {/* Live Triggered Banner */}
      {recentNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200"
        >
          <div className="flex items-center gap-2 font-medium">
            <BellRing className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{recentNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecentNotice(null)}
            className="text-[11px] font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Create Alert Card */}
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Create Real-Time Price Alert
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Evaluated server-side against live Binance public spot prices for supported crypto pairs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbol(sym)}
                className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                  symbol.toUpperCase() === sym
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="alert-symbol" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Asset Symbol
            </label>
            <input
              id="alert-symbol"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="BTCUSDT, ETHUSDT"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
          </div>

          <div>
            <label htmlFor="alert-condition" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Trigger Condition
            </label>
            <select
              id="alert-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="above">Price rises above (&ge;)</option>
              <option value="below">Price falls below (&le;)</option>
            </select>
          </div>

          <div>
            <label htmlFor="alert-target" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Target Price (USD)
            </label>
            <input
              id="alert-target"
              type="number"
              step="any"
              min="0.000001"
              required
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="e.g. 60000"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
          </div>

          <div>
            <label htmlFor="alert-note" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Research Note (Optional)
            </label>
            <input
              id="alert-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Breakout / invalidation level"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {creating ? 'Creating...' : 'Set Price Alert'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={autoPoll}
                onChange={(e) => setAutoPoll(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              Auto-check real-time spot prices every 15s
            </label>
            <select
              aria-label="Asset market category"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] dark:border-zinc-800 dark:bg-[#09090B]"
            >
              <option>Crypto</option>
              <option>Forex</option>
              <option>Stocks</option>
              <option>Indices</option>
              <option>Commodities</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            {lastCheckedAt && (
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                Last evaluated: {new Date(lastCheckedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              disabled={evaluating}
              onClick={() => void fetchAlerts(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${evaluating ? 'animate-spin' : ''}`} aria-hidden="true" />
              {evaluating ? 'Checking...' : 'Evaluate Live Prices'}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

      {/* Filter Bar & Summary Counts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter price alerts by status" className="flex flex-wrap gap-2">
          {(
            [
              ['all', `All (${alerts.length})`],
              ['active', `Active (${activeCount})`],
              ['triggered', `Triggered (${triggeredCount})`],
              ['paused', `Paused (${pausedCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111114]">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Evaluating live spot quotes for your price alerts...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            <Bell className="mx-auto mb-2 h-6 w-6 text-zinc-400" aria-hidden="true" />
            No price alerts in this view. Create an alert above to monitor real-time asset thresholds.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Condition & Target</th>
                <th className="px-4 py-3 text-right font-medium">Live Spot Price</th>
                <th className="px-4 py-3 text-right font-medium">Distance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {filteredAlerts.map((alert) => {
                const livePrice = alert.liveQuote?.lastPrice ?? alert.lastCheckedPrice;
                return (
                  <tr key={alert.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onAnalyzeSymbol(alert.symbol)}
                        className="font-mono font-semibold text-zinc-950 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                      >
                        {alert.symbol}
                      </button>
                      <div className="text-[11px] text-zinc-500">
                        {alert.market}
                        {alert.note ? ` · ${alert.note}` : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1 font-medium">
                        {alert.condition === 'above' ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                        )}
                        {alert.condition === 'above' ? 'Above' : 'Below'} ${formatPrice(alert.targetPrice)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {livePrice !== null ? (
                        <div>
                          <div className="text-zinc-950 dark:text-zinc-100">
                            ${formatPrice(livePrice)}
                          </div>
                          {alert.liveQuote?.change24hPercent != null && (
                            <div
                              className={`text-[10px] ${
                                alert.liveQuote.change24hPercent >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {alert.liveQuote.change24hPercent > 0 ? '+' : ''}
                              {alert.liveQuote.change24hPercent}% 24h
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-500">Feed unavailable</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                      {alert.distancePercent !== null
                        ? `${alert.distancePercent > 0 ? '+' : ''}${alert.distancePercent}%`
                        : '—'}
                    </td>

                    <td className="px-4 py-3">
                      {alert.status === 'triggered' ? (
                        <div className="text-emerald-600 dark:text-emerald-400">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Triggered
                          </span>
                          {alert.triggeredPrice !== null && (
                            <div className="font-mono text-[10px] text-zinc-500">
                              at ${formatPrice(alert.triggeredPrice)}
                              {alert.triggeredAt
                                ? ` · ${new Date(alert.triggeredAt).toLocaleTimeString()}`
                                : ''}
                            </div>
                          )}
                        </div>
                      ) : alert.status === 'paused' ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">Paused</span>
                      ) : (
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Monitoring
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2.5">
                        {alert.status === 'triggered' ? (
                          <button
                            type="button"
                            aria-label={`Reset alert for ${alert.symbol}`}
                            onClick={() => void handleUpdateStatus(alert.id, 'active')}
                            className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            Re-arm
                          </button>
                        ) : alert.status === 'active' ? (
                          <button
                            type="button"
                            aria-label={`Pause alert for ${alert.symbol}`}
                            onClick={() => void handleUpdateStatus(alert.id, 'paused')}
                            className="text-zinc-400 hover:text-amber-500"
                            title="Pause alert"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Resume alert for ${alert.symbol}`}
                            onClick={() => void handleUpdateStatus(alert.id, 'active')}
                            className="text-zinc-400 hover:text-emerald-500"
                            title="Resume alert"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Delete alert for ${alert.symbol}`}
                          onClick={() => void handleDelete(alert.id)}
                          className="text-zinc-400 hover:text-red-500"
                          title="Delete alert"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
