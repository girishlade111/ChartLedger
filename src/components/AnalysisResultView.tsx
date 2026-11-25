import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  MessageSquare,
  Minus,
  Printer,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import type { AnalysisResult } from '../utils/analysisSchema';
import type { OhlcvCandle } from '../utils/indicators';
import { CandlestickChart } from './CandlestickChart';
import { apiFetch, getAuthToken } from '../lib/api';

interface AnalysisResultViewProps {
  recordId: string;
  title: string;
  uploadId?: string | null;
  imageUrlOverride?: string | null;
  isFavorite?: boolean;
  isDemoFixture?: boolean;
  result: AnalysisResult;
  candles?: OhlcvCandle[];
  theme: 'dark' | 'light';
  readOnly?: boolean;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  onOpenChat?: (analysisId: string, prompt?: string) => void;
  onRename?: (newTitle: string) => void;
}

export function AnalysisResultView({
  recordId,
  title,
  uploadId,
  imageUrlOverride,
  isFavorite,
  isDemoFixture,
  result,
  candles,
  theme,
  readOnly = false,
  onToggleFavorite,
  onDelete,
  onOpenChat,
  onRename,
}: AnalysisResultViewProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [includeImageInShare, setIncludeImageInShare] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  const bias = result.summary.marketBias;
  const BiasIcon =
    bias === 'bullish' ? ArrowUpRight : bias === 'bearish' ? ArrowDownRight : Minus;
  const biasTextClass =
    bias === 'bullish'
      ? 'text-emerald-600 dark:text-emerald-400'
      : bias === 'bearish'
        ? 'text-red-600 dark:text-red-400'
        : 'text-amber-600 dark:text-amber-400';

  const token = getAuthToken();
  const previewSrc =
    imageUrlOverride ||
    (uploadId && token
      ? `/api/uploads/${uploadId}/image?token=${encodeURIComponent(token)}`
      : null);

  const supportLevel = result.priceLevels.find((l) => l.type === 'support')?.lowerBound ?? null;
  const resistanceLevel =
    result.priceLevels.find((l) => l.type === 'resistance')?.upperBound ?? null;

  const buildMarkdownExport = () => {
    const lines = [
      `# ${title}`,
      `Generated: ${result.generatedAt} | Symbol: ${result.chart.symbol || 'Unspecified'} | Timeframe: ${result.chart.timeframe || 'Unspecified'} | Bias: ${bias.toUpperCase()}`,
      '',
      '## Executive Summary',
      result.summary.overview,
      '',
      '## Key Observations',
      ...result.summary.keyObservations.map((o) => `- ${o}`),
      '',
      '## Market Structure',
      `Trend: ${result.marketStructure.trend}`,
      ...result.marketStructure.observations.map((o) => `- ${o}`),
      '',
      '## Technical Indicators',
      ...result.technicalIndicators.map(
        (i) => `- **${i.name}**: ${i.available ? i.value : 'Unavailable'} (${i.sourceType}) — ${i.interpretation}`
      ),
      '',
      '## Bullish Scenario',
      result.scenarios.bullish.description,
      '',
      '## Bearish Scenario',
      result.scenarios.bearish.description,
      '',
      '## Neutral Scenario',
      result.scenarios.neutral.description,
      '',
      '## Risk Factors & Uncertainties',
      ...result.riskAnalysis.riskFactors.map((r) => `- ${r}`),
      ...result.uncertainties.map((u) => `- ${u}`),
      '',
      '## Disclaimer',
      result.disclaimer,
    ];
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdownExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chartledger-${recordId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([buildMarkdownExport()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chartledger-${recordId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateShare = async () => {
    setSharing(true);
    try {
      const res = await apiFetch<{ share: { shareToken: string } }>(
        `/api/analyses/${recordId}/share`,
        {
          method: 'POST',
          body: JSON.stringify({ includeImage: includeImageInShare, expiresInDays: 14 }),
        }
      );
      setShareUrl(`${window.location.origin}/?share=${res.share.shareToken}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-8" data-testid="analysis-result-view">
      {/* Header & Action Bar */}
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
              {result.chart.symbol || 'Unspecified Symbol'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{result.chart.market || 'Financial Market'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{result.chart.timeframe || 'Unspecified TF'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {new Date(result.generatedAt).toLocaleString()}
            </span>
            {isDemoFixture && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  Sample Fixture Data
                </span>
              </>
            )}
          </div>

          {editingTitle && !readOnly ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                aria-label="Analysis title"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-lg font-semibold text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={() => {
                  onRename?.(draftTitle);
                  setEditingTitle(false);
                }}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftTitle(title);
                  setEditingTitle(false);
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {title}
              </h2>
              {!readOnly && onRename && (
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                >
                  Rename
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className={`inline-flex items-center gap-1 font-semibold capitalize ${biasTextClass}`}>
              <BiasIcon className="h-4 w-4" aria-hidden="true" />
              Market Bias: {bias}
            </span>
            <span className="text-zinc-400" aria-hidden="true">|</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              Evidence quality:{' '}
              <strong className="capitalize text-zinc-900 dark:text-zinc-100">
                {result.summary.evidenceQuality}
              </strong>
            </span>
            <span className="text-zinc-400" aria-hidden="true">|</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              Status:{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {result.status.replace('_', ' ')}
              </strong>
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && onOpenChat && (
            <button
              type="button"
              onClick={() => onOpenChat(recordId)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              Ask Follow-Up
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export MD
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print report"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print
          </button>
          {!readOnly && onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-300"
            >
              <Star
                className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
              />
            </button>
          )}
          {!readOnly && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete analysis"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-zinc-800 dark:bg-[#111114] dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Share panel for non-readOnly */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs dark:border-zinc-800 dark:bg-[#111114]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Shareable Link</span>
            <label className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={includeImageInShare}
                onChange={(e) => setIncludeImageInShare(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              Include private chart screenshot (excluded by default)
            </label>
          </div>
          <div className="flex items-center gap-2">
            {shareUrl ? (
              <code className="max-w-xs truncate rounded bg-zinc-200 px-2 py-1 font-mono text-[11px] text-zinc-900 dark:bg-zinc-900 dark:text-zinc-200">
                {shareUrl}
              </code>
            ) : null}
            <button
              type="button"
              disabled={sharing}
              onClick={handleCreateShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              {sharing ? 'Generating...' : 'Generate Link'}
            </button>
          </div>
        </div>
      )}

      {/* Visual Context: Uploaded Screenshot + Optional OHLCV Interactive Chart */}
      {(previewSrc || (candles && candles.length > 0)) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {previewSrc && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold tracking-tight text-zinc-600 dark:text-zinc-400">
                Uploaded Chart Screenshot
              </h3>
              <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-[#111114]">
                <img
                  src={previewSrc}
                  alt={`Uploaded trading chart for ${result.chart.symbol || title}`}
                  referrerPolicy="no-referrer"
                  className="max-h-[340px] w-full object-contain"
                />
              </div>
            </div>
          )}
          {candles && candles.length > 0 && (
            <div className={previewSrc ? 'space-y-2' : 'space-y-2 lg:col-span-2'}>
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold">
                  Interactive OHLCV Reference Chart ({result.chart.symbol} · {result.chart.timeframe})
                </span>
                <span className="font-mono">
                  {isDemoFixture ? 'Synthetic Sample Data' : 'External Public Market Data'}
                </span>
              </div>
              <CandlestickChart
                candles={candles}
                theme={theme}
                height={340}
                supportLevel={supportLevel}
                resistanceLevel={resistanceLevel}
              />
            </div>
          )}
        </div>
      )}

      {/* Executive Summary & Market Structure */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-2">
          <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Executive Summary
          </h3>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {result.summary.overview}
          </p>
          <div className="pt-2">
            <h4 className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Key Observations
            </h4>
            <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {result.summary.keyObservations.map((obs, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="font-mono text-zinc-400">0{idx + 1}.</span>
                  <span>{obs}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Market Structure
          </h3>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {result.marketStructure.trend}
          </p>
          <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {result.marketStructure.observations.map((item, idx) => (
              <li key={idx}>• {item}</li>
            ))}
          </ul>
          {result.marketStructure.limitations.length > 0 && (
            <div className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
              {result.marketStructure.limitations.join(' ')}
            </div>
          )}
        </section>
      </div>

      {/* Price Levels & Technical Indicators Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="mb-3 font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Support, Resistance & Reference Zones
          </h3>
          {result.priceLevels.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No reliable numeric price zones could be extracted from the available chart inputs.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-3 font-medium">Zone</th>
                    <th className="py-2 pr-3 text-right font-medium">Range</th>
                    <th className="py-2 font-medium">Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {result.priceLevels.map((lvl, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 pr-3 font-medium capitalize text-zinc-900 dark:text-zinc-100">
                        {lvl.type}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                        {lvl.lowerBound !== null && lvl.upperBound !== null
                          ? lvl.lowerBound === lvl.upperBound
                            ? lvl.lowerBound
                            : `${lvl.lowerBound} – ${lvl.upperBound}`
                          : 'Estimated'}
                      </td>
                      <td className="py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {lvl.reasoning}
                        {lvl.estimated ? ' (Visual estimate)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="mb-3 font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Technical Indicators
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Indicator</th>
                  <th className="py-2 pr-3 text-right font-medium">Value</th>
                  <th className="py-2 font-medium">Source & Reading</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {result.technicalIndicators.map((ind, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {ind.name}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-200">
                      {ind.available && ind.value !== null ? String(ind.value) : 'Unavailable'}
                    </td>
                    <td className="py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-mono text-[11px] text-zinc-500">
                        [{ind.sourceType.replace('_', ' ')}]
                      </span>{' '}
                      {ind.interpretation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Conditional Scenarios: Bullish / Bearish / Neutral */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Conditional Market Scenarios
          </h3>
          <span className="text-xs text-zinc-500">
            Hypothetical research frameworks — no outcome is guaranteed
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Bullish */}
          <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Bullish Scenario
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {result.scenarios.bullish.description}
            </p>
            <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="font-semibold text-zinc-900 dark:text-zinc-200">Confirmation</div>
              {result.scenarios.bullish.conditions.map((c, i) => (
                <p key={i}>• {c}</p>
              ))}
            </div>
            {result.scenarios.bullish.hypotheticalLevels.length > 0 && (
              <div className="space-y-1 border-t border-zinc-200 pt-2.5 text-xs dark:border-zinc-800">
                <div className="font-semibold text-zinc-900 dark:text-zinc-200">
                  Hypothetical Research Levels
                </div>
                {result.scenarios.bullish.hypotheticalLevels.map((lvl, i) => (
                  <div key={i} className="flex justify-between gap-2 font-mono tabular-nums">
                    <span className="text-zinc-600 dark:text-zinc-400">{lvl.label}</span>
                    <span className="font-medium text-zinc-950 dark:text-zinc-100">{lvl.price}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1 border-t border-zinc-200 pt-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <div className="font-semibold text-zinc-900 dark:text-zinc-200">Invalidation</div>
              {result.scenarios.bullish.invalidation.map((inv, i) => (
                <p key={i}>• {inv}</p>
              ))}
            </div>
          </div>

          {/* Bearish */}
          <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
              <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
              Bearish Scenario
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {result.scenarios.bearish.description}
            </p>
            <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="font-semibold text-zinc-900 dark:text-zinc-200">Confirmation</div>
              {result.scenarios.bearish.conditions.map((c, i) => (
                <p key={i}>• {c}</p>
              ))}
            </div>
            {result.scenarios.bearish.hypotheticalLevels.length > 0 && (
              <div className="space-y-1 border-t border-zinc-200 pt-2.5 text-xs dark:border-zinc-800">
                <div className="font-semibold text-zinc-900 dark:text-zinc-200">
                  Hypothetical Research Levels
                </div>
                {result.scenarios.bearish.hypotheticalLevels.map((lvl, i) => (
                  <div key={i} className="flex justify-between gap-2 font-mono tabular-nums">
                    <span className="text-zinc-600 dark:text-zinc-400">{lvl.label}</span>
                    <span className="font-medium text-zinc-950 dark:text-zinc-100">{lvl.price}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1 border-t border-zinc-200 pt-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <div className="font-semibold text-zinc-900 dark:text-zinc-200">Invalidation</div>
              {result.scenarios.bearish.invalidation.map((inv, i) => (
                <p key={i}>• {inv}</p>
              ))}
            </div>
          </div>

          {/* Neutral */}
          <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
              <Minus className="h-4 w-4" aria-hidden="true" />
              Neutral / Consolidation Scenario
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {result.scenarios.neutral.description}
            </p>
            <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="font-semibold text-zinc-900 dark:text-zinc-200">
                Inconclusive Conditions
              </div>
              {result.scenarios.neutral.conditions.map((c, i) => (
                <p key={i}>• {c}</p>
              ))}
            </div>
            <div className="space-y-1 border-t border-zinc-200 pt-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <div className="font-semibold text-zinc-900 dark:text-zinc-200">Range Risks</div>
              {result.scenarios.neutral.risks.map((r, i) => (
                <p key={i}>• {r}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Patterns, Risk Analysis & Educational Explanation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Risk Analysis & Uncertainties
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            {result.riskAnalysis.volatility && (
              <span>
                Volatility:{' '}
                <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                  {result.riskAnalysis.volatility}
                </strong>
              </span>
            )}
            {result.riskAnalysis.hypotheticalRiskReward && (
              <span>
                Hypothetical R/R:{' '}
                <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                  {result.riskAnalysis.hypotheticalRiskReward}
                </strong>
              </span>
            )}
          </div>
          <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            {result.riskAnalysis.riskFactors.map((rf, i) => (
              <li key={i}>• {rf}</li>
            ))}
          </ul>
          {result.uncertainties.length > 0 && (
            <div className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
              <strong className="text-zinc-700 dark:text-zinc-300">Uncertainties: </strong>
              {result.uncertainties.join(' · ')}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
          <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Educational Explanation & Suggested Questions
          </h3>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {result.educationalExplanation}
          </p>
          {!readOnly && onOpenChat && result.followUpQuestions.length > 0 && (
            <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-500">Ask in AI Research Chat</div>
              <div className="flex flex-col gap-1.5">
                {result.followUpQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onOpenChat(recordId, q)}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:border-emerald-500 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Data Provenance & Disclaimer */}
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-[#111114] dark:text-zinc-400">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">Data Provenance:</span>
          {result.dataSources.map((src) => (
            <span key={src.id} className="font-mono">
              {src.name} ({src.type.replace(/_/g, ' ')})
            </span>
          ))}
          <span className="font-mono">
            Engine: {result.model.provider}/{result.model.name}
          </span>
        </div>
        <div className="flex items-start gap-2 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <p>{result.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
