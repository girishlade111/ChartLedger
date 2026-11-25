import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ClipboardList,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type {
  AlertHistoryStats,
  AlertOutcomeStatus,
  EnrichedAlertHistoryEntry,
} from '../../utils/portfolioAndAlerts';

interface AlertHistoryResponse {
  history: EnrichedAlertHistoryEntry[];
  stats: AlertHistoryStats;
  checkedAt: string;
}

interface AlertHistoryViewProps {
  onAnalyzeSymbol: (symbol: string) => void;
  onGoToAlerts: () => void;
}

const OUTCOME_OPTIONS: Array<{ value: AlertOutcomeStatus; label: string }> = [
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'confirmed_move', label: 'Confirmed Move' },
  { value: 'false_breakout', label: 'False Breakout' },
  { value: 'ignored', label: 'Ignored' },
];

function formatPrice(val: number): string {
  if (val >= 1000) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (val >= 1) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function outcomeTone(status: AlertOutcomeStatus): string {
  switch (status) {
    case 'actioned':
    case 'confirmed_move':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'false_breakout':
      return 'text-red-600 dark:text-red-400';
    case 'ignored':
      return 'text-zinc-500';
    default:
      return 'text-amber-600 dark:text-amber-400';
  }
}

export function AlertHistoryView({ onAnalyzeSymbol, onGoToAlerts }: AlertHistoryViewProps) {
  const [history, setHistory] = useState<EnrichedAlertHistoryEntry[]>([]);
  const [stats, setStats] = useState<AlertHistoryStats | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | AlertOutcomeStatus>('all');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const loadHistory = useCallback(async (fresh = false) => {
    if (fresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AlertHistoryResponse>(
        fresh ? '/api/alerts/history?fresh=1' : '/api/alerts/history'
      );
      setHistory(res.history);
      setStats(res.stats);
      setCheckedAt(res.checkedAt);
    } catch (err: any) {
      setError(err.message || 'Failed to load alert history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(false);
  }, [loadHistory]);

  const handleOutcomeStatusChange = async (id: string, outcomeStatus: AlertOutcomeStatus) => {
    setSavingId(id);
    setError(null);
    try {
      await apiFetch(`/api/alerts/history/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ outcomeStatus }),
      });
      await loadHistory(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save outcome status.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveOutcomeNote = async (id: string) => {
    setSavingId(id);
    setError(null);
    try {
      await apiFetch(`/api/alerts/history/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ outcomeNote: noteDraft }),
      });
      setEditingNoteId(null);
      setNoteDraft('');
      await loadHistory(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save outcome note.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/alerts/history/${id}`, { method: 'DELETE' });
      await loadHistory(true);
    } catch (err: any) {
      setError(err.message || 'Failed to delete alert history entry.');
    }
  };

  const normalizedQuery = query.trim().toUpperCase();
  const filtered = history.filter((entry) => {
    if (statusFilter !== 'all' && entry.outcomeStatus !== statusFilter) return false;
    if (
      normalizedQuery &&
      !entry.symbol.toUpperCase().includes(normalizedQuery) &&
      !entry.alertNote.toUpperCase().includes(normalizedQuery) &&
      !entry.outcomeNote.toUpperCase().includes(normalizedQuery)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" data-testid="alert-history-view">
      {/* Header & Summary KPIs */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Triggered Alert History & Outcomes
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Audit every triggered price alert, compare post-trigger spot movement, and record
              execution outcomes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {checkedAt && (
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                Spot synced {new Date(checkedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadHistory(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh Outcomes
            </button>
            <button
              type="button"
              onClick={onGoToAlerts}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              Manage Alerts
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
            <div className="text-[11px] text-zinc-500">Total Triggered</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
              {stats?.totalTriggered ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">Persistent event log</div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
            <div className="text-[11px] text-zinc-500">Follow-Through Rate</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
              {stats?.followThroughRatePercent != null
                ? `${stats.followThroughRatePercent}%`
                : '—'}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {stats?.evaluableFollowThroughCount
                ? `${stats.favorableFollowThroughCount}/${stats.evaluableFollowThroughCount} directional moves`
                : 'Awaiting price movement'}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
            <div className="text-[11px] text-zinc-500">Outcomes Logged</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {stats?.reviewedCount ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {stats?.actionedCount ?? 0} actioned · {stats?.falseBreakoutCount ?? 0} false breaks
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
            <div className="text-[11px] text-zinc-500">Pending Review</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {stats?.pendingReviewCount ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">Ready for outcome notes</div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter alert history by outcome"
          className="flex flex-wrap gap-1.5"
        >
          {(
            [
              ['all', `All (${history.length})`],
              ...OUTCOME_OPTIONS.map((o) => [
                o.value,
                `${o.label} (${history.filter((h) => h.outcomeStatus === o.value).length})`,
              ]),
            ] as Array<['all' | AlertOutcomeStatus, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={statusFilter === key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === key
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search alert history by symbol or note"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by symbol or note..."
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs dark:border-zinc-800 dark:bg-[#111114]"
          />
        </div>
      </div>

      {/* Alert History Log Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111114]">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Loading triggered price alert history and live post-trigger prices...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            <ClipboardList className="mx-auto mb-2 h-6 w-6 text-zinc-400" aria-hidden="true" />
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              {history.length === 0
                ? 'No triggered price alerts recorded yet.'
                : 'No alert history entries match the current filter.'}
            </p>
            <p className="mt-1 text-zinc-500">
              {history.length === 0
                ? 'Whenever an active price alert crosses its threshold, the event and subsequent market outcome are logged here automatically.'
                : 'Try switching outcome filters or clearing your search query.'}
            </p>
            {history.length === 0 && (
              <button
                type="button"
                onClick={onGoToAlerts}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                Go to Price Alerts
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-[#0B0B0E]">
              <tr>
                <th className="px-4 py-3 font-medium">Asset & Triggered</th>
                <th className="px-4 py-3 font-medium">Threshold & Trigger Price</th>
                <th className="px-4 py-3 text-right font-medium">Post-Trigger Move</th>
                <th className="px-4 py-3 font-medium">Outcome & Notes</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {filtered.map((entry) => {
                const isEditingNote = editingNoteId === entry.id;
                const movePct = entry.metrics.postTriggerMovePercent;
                const ft = entry.metrics.followThrough;

                return (
                  <tr key={entry.id} className="align-top hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onAnalyzeSymbol(entry.symbol)}
                        className="font-mono font-semibold text-zinc-950 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                      >
                        {entry.symbol}
                      </button>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {entry.market} · {new Date(entry.triggeredAt).toLocaleString()}
                      </div>
                      {entry.alertNote && (
                        <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          Alert note: {entry.alertNote}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono tabular-nums">
                      <div className="inline-flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100">
                        {entry.condition === 'above' ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                        )}
                        {entry.condition === 'above' ? 'Above' : 'Below'} $
                        {formatPrice(entry.targetPrice)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        Triggered at{' '}
                        <span className="text-zinc-900 dark:text-zinc-200">
                          ${formatPrice(entry.triggeredPrice)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {entry.metrics.currentPrice !== null && movePct !== null ? (
                        <div>
                          <div className="text-zinc-900 dark:text-zinc-100">
                            Now ${formatPrice(entry.metrics.currentPrice)}
                          </div>
                          <div
                            className={`mt-0.5 inline-flex items-center justify-end gap-1 text-[11px] font-medium ${
                              ft === 'favorable'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : ft === 'reversed'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-zinc-500'
                            }`}
                          >
                            {ft === 'favorable' ? (
                              <TrendingUp className="h-3 w-3" aria-hidden="true" />
                            ) : ft === 'reversed' ? (
                              <TrendingDown className="h-3 w-3" aria-hidden="true" />
                            ) : null}
                            {movePct > 0 ? '+' : ''}
                            {movePct}% ·{' '}
                            {ft === 'favorable'
                              ? 'Follow-through'
                              : ft === 'reversed'
                                ? 'Reversed'
                                : 'Flat'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-500">Spot unavailable</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <select
                          aria-label={`Outcome status for ${entry.symbol}`}
                          disabled={savingId === entry.id}
                          value={entry.outcomeStatus}
                          onChange={(e) =>
                            void handleOutcomeStatusChange(
                              entry.id,
                              e.target.value as AlertOutcomeStatus
                            )
                          }
                          className={`w-40 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium dark:border-zinc-700 dark:bg-[#09090B] ${outcomeTone(
                            entry.outcomeStatus
                          )}`}
                        >
                          {OUTCOME_OPTIONS.map((opt) => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              className="text-zinc-900 dark:text-zinc-100"
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        {isEditingNote ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              aria-label={`Outcome note for ${entry.symbol}`}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Log execution or chart outcome..."
                              className="w-56 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
                            />
                            <button
                              type="button"
                              aria-label="Save outcome note"
                              disabled={savingId === entry.id}
                              onClick={() => void handleSaveOutcomeNote(entry.id)}
                              className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-500"
                              title="Save note"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel editing note"
                              onClick={() => {
                                setEditingNoteId(null);
                                setNoteDraft('');
                              }}
                              className="rounded border border-zinc-300 p-1 text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-100"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <span className="max-w-xs truncate">
                              {entry.outcomeNote || 'No outcome note recorded'}
                            </span>
                            <button
                              type="button"
                              aria-label={`Edit outcome note for ${entry.symbol}`}
                              onClick={() => {
                                setEditingNoteId(entry.id);
                                setNoteDraft(entry.outcomeNote);
                              }}
                              className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              {entry.outcomeNote ? 'Edit' : 'Add note'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label={`Delete alert history entry for ${entry.symbol}`}
                        onClick={() => void handleDeleteEntry(entry.id)}
                        className="text-zinc-400 hover:text-red-500"
                        title="Delete log entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
