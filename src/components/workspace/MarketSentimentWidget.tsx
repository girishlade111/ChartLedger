import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type {
  PortfolioMarketSentiment,
  SentimentLabel,
  SignalVote,
} from '../../utils/marketSentiment';

interface SentimentResponse {
  sentiment: PortfolioMarketSentiment;
  timeframe: '4h' | '1d';
  fetchedAt: string;
}

interface MarketSentimentWidgetProps {
  refreshTrigger?: number;
  onAnalyzeSymbol: (symbol: string) => void;
}

function sentimentColorClass(label: SentimentLabel): string {
  if (label === 'Strong Bullish' || label === 'Bullish') {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (label === 'Strong Bearish' || label === 'Bearish') {
    return 'text-red-600 dark:text-red-400';
  }
  if (label === 'Neutral') {
    return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-zinc-500';
}

function voteColorClass(vote: SignalVote): string {
  if (vote === 'bullish') return 'text-emerald-600 dark:text-emerald-400';
  if (vote === 'bearish') return 'text-red-600 dark:text-red-400';
  return 'text-zinc-500';
}

function scoreBarFillClass(score: number): string {
  if (score >= 55) return 'bg-emerald-500';
  if (score <= 45) return 'bg-red-500';
  return 'bg-amber-500';
}

export function MarketSentimentWidget({
  refreshTrigger = 0,
  onAnalyzeSymbol,
}: MarketSentimentWidgetProps) {
  const [timeframe, setTimeframe] = useState<'4h' | '1d'>('4h');
  const [data, setData] = useState<SentimentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSentiment = useCallback(
    async (tf = timeframe, silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await apiFetch<SentimentResponse>(
          `/api/portfolio/sentiment?timeframe=${tf}`
        );
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Unable to compute technical market sentiment.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [timeframe]
  );

  useEffect(() => {
    void loadSentiment(timeframe, refreshTrigger > 0);
  }, [timeframe, refreshTrigger, loadSentiment]);

  const sentiment = data?.sentiment;
  const overallScore = sentiment?.overallScore ?? null;

  return (
    <section
      data-testid="market-sentiment-widget"
      aria-label="Portfolio technical market sentiment"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Market Sentiment
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            Weighted bullish/bearish technical score across your active holdings using SMA(20/50),
            EMA(20/50), RSI(14), and MACD(12,26,9).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Technical indicator timeframe"
            className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-[#09090B]"
          >
            {(['4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium uppercase transition-colors ${
                  timeframe === tf
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadSentiment(timeframe, true)}
            disabled={refreshing}
            aria-label="Refresh technical market sentiment"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-10 text-center text-xs text-zinc-500">
          Computing deterministic technical indicators for your active holdings...
        </div>
      ) : !sentiment || sentiment.totalHoldingsCount === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 py-8 text-center dark:border-zinc-800">
          <Activity className="mx-auto mb-2 h-6 w-6 text-zinc-400" aria-hidden="true" />
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            No active holdings to score yet.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add crypto positions in Asset Holdings above to compute your weighted bullish/bearish
            technical sentiment score.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Aggregate Sentiment Gauge Card */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-[#0B0B0E]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-zinc-500">
                  Portfolio Weighted Technical Score ({timeframe.toUpperCase()} Candles)
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="font-mono text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                    {overallScore !== null ? `${overallScore}` : '—'}
                    <span className="text-xs font-normal text-zinc-500"> / 100</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-display text-sm font-semibold ${sentimentColorClass(
                      sentiment.overallLabel
                    )}`}
                  >
                    {(sentiment.overallLabel === 'Strong Bullish' ||
                      sentiment.overallLabel === 'Bullish') && (
                      <TrendingUp className="h-4 w-4" aria-hidden="true" />
                    )}
                    {(sentiment.overallLabel === 'Strong Bearish' ||
                      sentiment.overallLabel === 'Bearish') && (
                      <TrendingDown className="h-4 w-4" aria-hidden="true" />
                    )}
                    {sentiment.overallLabel}
                  </span>
                </div>
              </div>

              <div className="text-right text-[11px] font-mono tabular-nums text-zinc-500">
                <div>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {sentiment.bullishSignals} Bullish
                  </span>
                  {' · '}
                  <span>{sentiment.neutralSignals} Neutral</span>
                  {' · '}
                  <span className="text-red-600 dark:text-red-400">
                    {sentiment.bearishSignals} Bearish
                  </span>
                </div>
                <div className="mt-0.5">
                  {sentiment.scoredHoldingsCount}/{sentiment.totalHoldingsCount} holdings scored via
                  live OHLCV
                </div>
              </div>
            </div>

            {/* Sentiment Scale Bar (0 = Bearish, 50 = Neutral, 100 = Bullish) */}
            <div className="mt-3.5">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500">
                {overallScore !== null && (
                  <div
                    role="progressbar"
                    aria-label="Overall bullish/bearish market sentiment score"
                    aria-valuenow={overallScore}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    style={{ left: `calc(${Math.min(98, Math.max(2, overallScore))}% - 3px)` }}
                    className="absolute top-0 h-full w-1.5 rounded-full bg-white shadow ring-1 ring-zinc-950/60"
                  />
                )}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500">
                <span>0 · Strong Bearish</span>
                <span>50 · Neutral</span>
                <span>100 · Strong Bullish</span>
              </div>
            </div>
          </div>

          {/* Per-Holding Indicator Breakdown */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {sentiment.assets.map((asset) => (
              <div
                key={asset.symbol}
                className="rounded-lg border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-[#0D0D10]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => onAnalyzeSymbol(asset.symbol)}
                      className="font-mono text-xs font-semibold text-zinc-950 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                    >
                      {asset.symbol}
                    </button>
                    <span className="ml-2 font-mono text-[11px] tabular-nums text-zinc-500">
                      {asset.weightPercent}% weight
                    </span>
                  </div>
                  <div className="text-right font-mono text-xs font-semibold tabular-nums">
                    <span className={sentimentColorClass(asset.label)}>
                      {asset.score !== null ? `${asset.score}/100 · ${asset.label}` : 'Unavailable'}
                    </span>
                  </div>
                </div>

                {asset.available && asset.score !== null ? (
                  <>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className={`h-full transition-all ${scoreBarFillClass(asset.score)}`}
                        style={{ width: `${Math.max(4, asset.score)}%` }}
                      />
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                      {asset.signals.map((sig) => (
                        <div
                          key={sig.name}
                          className="flex items-center justify-between gap-1 border-b border-zinc-100 pb-1 dark:border-zinc-800/70"
                        >
                          <span className="text-zinc-500">{sig.name}</span>
                          <span className={`font-mono tabular-nums font-medium ${voteColorClass(sig.vote)}`}>
                            {sig.reading}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    {asset.reason || 'Live OHLCV data unavailable for deterministic scoring.'}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-zinc-500">
            Educational indicator summary derived from public OHLCV candles ({timeframe.toUpperCase()}). Not
            investment advice or a trade signal.
          </p>
        </div>
      )}
    </section>
  );
}
