import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Plus, Star, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { AnalysisResult } from '../../utils/analysisSchema';
import { AnalysisResultView } from '../AnalysisResultView';

interface AnalysisRecord {
  id: string;
  uploadId: string | null;
  title: string;
  symbol: string | null;
  market: string | null;
  timeframe: string | null;
  status: string;
  marketBias: string;
  isFavorite: boolean;
  isDemoFixture: boolean;
  resultJson: AnalysisResult;
  createdAt: string;
}

interface HistoryViewProps {
  analyses: AnalysisRecord[];
  favoritesOnly?: boolean;
  theme: 'dark' | 'light';
  onRefresh: () => Promise<void>;
  onOpenChat: (analysisId: string, prompt?: string) => void;
}

export function AnalysisHistoryView({
  analyses,
  favoritesOnly = false,
  theme,
  onRefresh,
  onOpenChat,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [marketFilter, setMarketFilter] = useState('all');
  const [biasFilter, setBiasFilter] = useState('all');
  const [selected, setSelected] = useState<AnalysisRecord | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const filtered = analyses.filter((a) => {
    if (favoritesOnly && !a.isFavorite) return false;
    if (marketFilter !== 'all' && (a.market || '').toLowerCase() !== marketFilter.toLowerCase()) {
      return false;
    }
    if (biasFilter !== 'all' && a.marketBias !== biasFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        (a.symbol || '').toLowerCase().includes(q) ||
        (a.timeframe || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleToggleFav = async (rec: AnalysisRecord) => {
    await apiFetch(`/api/analyses/${rec.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isFavorite: !rec.isFavorite }),
    });
    await onRefresh();
    if (selected?.id === rec.id) {
      setSelected({ ...rec, isFavorite: !rec.isFavorite });
    }
  };

  const handleRename = async (rec: AnalysisRecord, newTitle: string) => {
    await apiFetch(`/api/analyses/${rec.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: newTitle }),
    });
    await onRefresh();
    if (selected?.id === rec.id) {
      setSelected({ ...rec, title: newTitle });
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/analyses/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    setCompareIds((prev) => prev.filter((c) => c !== id));
    await onRefresh();
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  if (showCompare && compareIds.length === 2) {
    const pair = compareIds
      .map((id) => analyses.find((a) => a.id === id))
      .filter(Boolean) as AnalysisRecord[];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Side-by-Side Analysis Comparison</h2>
          <button
            type="button"
            onClick={() => setShowCompare(false)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
          >
            Back to History
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {pair.map((rec) => (
            <div
              key={rec.id}
              className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
            >
              <div className="text-xs text-zinc-500">
                {rec.symbol || 'Chart'} · {rec.timeframe || 'TF'} ·{' '}
                <span className="font-mono">{new Date(rec.createdAt).toLocaleString()}</span>
              </div>
              <h3 className="font-display text-base font-semibold">{rec.title}</h3>
              <div className="text-xs font-semibold capitalize">
                Observed Bias: {rec.marketBias}
              </div>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {rec.resultJson.summary.overview}
              </p>
              <div className="border-t border-zinc-200 pt-2.5 text-xs dark:border-zinc-800">
                <div className="font-semibold">Market Structure</div>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  {rec.resultJson.marketStructure.trend}
                </p>
              </div>
              <div className="border-t border-zinc-200 pt-2.5 text-xs dark:border-zinc-800">
                <div className="font-semibold">Key Price Zones</div>
                {rec.resultJson.priceLevels.map((lvl, i) => (
                  <div key={i} className="mt-1 flex justify-between font-mono tabular-nums">
                    <span className="capitalize">{lvl.type}</span>
                    <span>
                      {lvl.lowerBound ?? '—'} – {lvl.upperBound ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium dark:border-zinc-700 dark:bg-[#111114]"
        >
          ← Back to History
        </button>
        <AnalysisResultView
          recordId={selected.id}
          title={selected.title}
          uploadId={selected.uploadId}
          isFavorite={selected.isFavorite}
          isDemoFixture={selected.isDemoFixture}
          result={selected.resultJson}
          theme={theme}
          onToggleFavorite={() => handleToggleFav(selected)}
          onRename={(t) => handleRename(selected, t)}
          onDelete={() => handleDelete(selected.id)}
          onOpenChat={onOpenChat}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or title..."
            aria-label="Search analysis history"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#111114]"
          />
          <select
            aria-label="Filter by market"
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#111114]"
          >
            <option value="all">All Markets</option>
            <option value="Crypto">Crypto</option>
            <option value="Forex">Forex</option>
            <option value="Stocks">Stocks</option>
            <option value="Indices">Indices</option>
            <option value="Commodities">Commodities</option>
          </select>
          <select
            aria-label="Filter by bias"
            value={biasFilter}
            onChange={(e) => setBiasFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#111114]"
          >
            <option value="all">All Biases</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
            <option value="uncertain">Uncertain</option>
          </select>
        </div>

        {compareIds.length === 2 && (
          <button
            type="button"
            onClick={() => setShowCompare(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Compare Selected (2)
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-[#111114]">
          {favoritesOnly
            ? 'No saved favorite analyses yet. Star any analysis report to bookmark it here.'
            : 'No analyses match your current filters.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111114]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Compare</th>
                <th className="px-4 py-3 font-medium">Title & Symbol</th>
                <th className="px-4 py-3 font-medium">Timeframe</th>
                <th className="px-4 py-3 font-medium">Bias</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {filtered.map((rec) => (
                <tr key={rec.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${rec.title} for comparison`}
                      checked={compareIds.includes(rec.id)}
                      onChange={() => toggleCompare(rec.id)}
                      className="rounded border-zinc-300 dark:border-zinc-700"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(rec)}
                      className="text-left font-medium text-zinc-950 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                    >
                      {rec.title}
                    </button>
                    <div className="text-[11px] text-zinc-500">
                      {rec.symbol || 'Unspecified'} · {rec.market || 'Market'}
                      {rec.isDemoFixture ? ' · Sample Fixture' : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono">{rec.timeframe || '—'}</td>
                  <td
                    className={`px-4 py-3 font-semibold capitalize ${
                      rec.marketBias === 'bullish'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : rec.marketBias === 'bearish'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {rec.marketBias}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-zinc-500">
                    {new Date(rec.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(rec)}
                        className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        aria-label={`Favorite ${rec.title}`}
                        onClick={() => handleToggleFav(rec)}
                        className="text-zinc-400 hover:text-amber-400"
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${rec.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${rec.title}`}
                        onClick={() => handleDelete(rec.id)}
                        className="text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface WatchlistViewProps {
  onAnalyzeSymbol: (symbol: string) => void;
  onSetAlertForSymbol?: (symbol: string, livePrice?: number | null) => void;
}

export function WatchlistView({ onAnalyzeSymbol, onSetAlertForSymbol }: WatchlistViewProps) {
  const [items, setItems] = useState<any[]>([]);
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState('Crypto');
  const [exchange, setExchange] = useState('Binance');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: any[] }>('/api/watchlist');
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;
    await apiFetch('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol, market, exchange }),
    });
    setSymbol('');
    await load();
  };

  const handleRemove = async (id: string) => {
    await apiFetch(`/api/watchlist/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
      >
        <div>
          <label htmlFor="wl-sym" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Symbol
          </label>
          <input
            id="wl-sym"
            required
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="BTCUSDT, ETHUSDT, EUR/USD"
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          />
        </div>
        <div>
          <label htmlFor="wl-mkt" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Market
          </label>
          <select
            id="wl-mkt"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          >
            <option>Crypto</option>
            <option>Forex</option>
            <option>Stocks</option>
            <option>Indices</option>
            <option>Commodities</option>
          </select>
        </div>
        <div>
          <label htmlFor="wl-ex" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Exchange
          </label>
          <input
            id="wl-ex"
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Instrument
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111114]">
        {loading ? (
          <div className="py-10 text-center text-xs text-zinc-500">Loading watchlist quotes...</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            Your watchlist is empty. Add symbols like BTCUSDT or ETHUSDT to view public spot quotes
            and jump straight into analysis.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Instrument</th>
                <th className="px-4 py-3 font-medium">Market / Exchange</th>
                <th className="px-4 py-3 text-right font-medium">Latest Public Price</th>
                <th className="px-4 py-3 text-right font-medium">24h Change</th>
                <th className="px-4 py-3 font-medium">Source & Freshness</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                    {item.symbol}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {item.market} · {item.exchange}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {item.quote ? item.quote.lastPrice : 'Unavailable'}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${
                      item.quote?.change24hPercent > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.quote?.change24hPercent < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-zinc-500'
                    }`}
                  >
                    {item.quote?.change24hPercent != null
                      ? `${item.quote.change24hPercent > 0 ? '+' : ''}${item.quote.change24hPercent}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-zinc-500">
                    {item.quote
                      ? `${item.quote.sourceName} · ${new Date(item.quote.fetchedAt).toLocaleTimeString()}`
                      : 'No public spot feed for symbol'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {onSetAlertForSymbol && (
                        <button
                          type="button"
                          onClick={() => onSetAlertForSymbol(item.symbol, item.quote?.lastPrice ?? null)}
                          className="font-medium text-zinc-600 hover:text-emerald-600 hover:underline dark:text-zinc-300 dark:hover:text-emerald-400"
                        >
                          Alert
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onAnalyzeSymbol(item.symbol)}
                        className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Analyze
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${item.symbol}`}
                        onClick={() => handleRemove(item.id)}
                        className="text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
