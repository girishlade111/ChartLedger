import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { AnalysisResult } from '../../utils/analysisSchema';
import type { DemoScenarioId, OhlcvCandle } from '../../utils/indicators';
import { AnalysisResultView } from '../AnalysisResultView';

interface NewAnalysisViewProps {
  theme: 'dark' | 'light';
  initialSymbol?: string;
  onAnalysisCreated: (record: any) => void;
  onOpenChat: (analysisId: string, prompt?: string) => void;
}

const PIPELINE_STAGES = [
  'Validating image signature & dimensions',
  'Extracting visible chart structure & metadata',
  'Checking matched OHLCV market data & indicators',
  'Generating conditional scenarios & Stage 8 safety validation',
];

export function NewAnalysisView({
  theme,
  initialSymbol,
  onAnalysisCreated,
  onOpenChat,
}: NewAnalysisViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{
    filename: string;
    width?: number;
    height?: number;
    sizeBytes: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const [symbol, setSymbol] = useState(initialSymbol || '');
  const [market, setMarket] = useState('Crypto');
  const [exchange, setExchange] = useState('');
  const [timeframe, setTimeframe] = useState('4H');
  const [chartPlatform, setChartPlatform] = useState('TradingView');
  const [notes, setNotes] = useState('');
  const [objective, setObjective] = useState('');
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  const [demoScenario, setDemoScenario] = useState<DemoScenarioId | ''>('');
  const [useMockProvider, setUseMockProvider] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{
    record: any;
    candles?: OhlcvCandle[];
    warnings?: string[];
  } | null>(null);

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  const uploadFileObject = async (file: File) => {
    setError(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Unsupported format. Please upload a PNG, JPEG, or WebP chart screenshot.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image exceeds the 8 MB upload limit.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => setPreviewDataUrl(String(reader.result || ''));
      reader.readAsDataURL(file);

      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch<{
        id: string;
        filename: string;
        width?: number;
        height?: number;
        sizeBytes: number;
      }>('/api/uploads', {
        method: 'POST',
        body: form,
      });

      setUploadId(res.id);
      setDemoScenario('');
      setFileMeta({
        filename: res.filename,
        width: res.width,
        height: res.height,
        sizeBytes: res.sizeBytes,
      });
    } catch (err: any) {
      setError(err.message || 'Image upload failed.');
      setPreviewDataUrl(null);
      setUploadId(null);
    } finally {
      setUploading(false);
    }
  };

  // Clipboard paste handler (Ctrl+V / Cmd+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadFileObject(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFileObject(file);
  };

  const handleSelectFixture = (sc: DemoScenarioId) => {
    setUploadId(null);
    setPreviewDataUrl(null);
    setFileMeta(null);
    setDemoScenario(sc);
    setError(null);
    if (sc === 'btc_uptrend') {
      setSymbol('BTC/USDT');
      setMarket('Crypto');
      setTimeframe('4H');
    } else if (sc === 'eurusd_range') {
      setSymbol('EUR/USD');
      setMarket('Forex');
      setTimeframe('1H');
    } else {
      setSymbol('SPX500');
      setMarket('Indices');
      setTimeframe('4H');
    }
  };

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadId && !demoScenario) {
      setError('Upload a chart screenshot (or select a labeled sample fixture below) to run an analysis.');
      return;
    }

    setError(null);
    setAnalyzing(true);
    setStageIdx(0);

    const timer = setInterval(() => {
      setStageIdx((prev) => (prev < PIPELINE_STAGES.length - 1 ? prev + 1 : prev));
    }, 1100);

    try {
      const res = await apiFetch<{
        analysis: any;
        validationWarnings: string[];
        marketData?: { candles?: OhlcvCandle[] } | null;
      }>('/api/analyses', {
        method: 'POST',
        body: JSON.stringify({
          uploadId: uploadId || undefined,
          symbol: symbol.trim() || undefined,
          market: market || undefined,
          exchange: exchange.trim() || undefined,
          timeframe: timeframe || undefined,
          chartPlatform: chartPlatform || undefined,
          notes: notes.trim() || undefined,
          objective: objective.trim() || undefined,
          demoScenario: demoScenario || undefined,
          useKnowledgeBase,
          useMockProvider,
        }),
      });

      setCompleted({
        record: res.analysis,
        candles: res.marketData?.candles,
        warnings: res.validationWarnings,
      });
      onAnalysisCreated(res.analysis);
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
    } finally {
      clearInterval(timer);
      setAnalyzing(false);
    }
  };

  if (completed) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCompleted(null)}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-[#111114] dark:text-zinc-100"
          >
            Run Another Chart Analysis
          </button>
          {completed.warnings && completed.warnings.length > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Stage 8 Audit: {completed.warnings.join(' · ')}
            </span>
          )}
        </div>
        <AnalysisResultView
          recordId={completed.record.id}
          title={completed.record.title}
          uploadId={completed.record.uploadId}
          isFavorite={completed.record.isFavorite}
          isDemoFixture={completed.record.isDemoFixture}
          result={completed.record.resultJson as AnalysisResult}
          candles={completed.candles}
          theme={theme}
          onOpenChat={onOpenChat}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleRunAnalysis} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upload & Sample Fixture Column */}
        <div className="space-y-4 lg:col-span-7">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center transition-colors hover:border-emerald-500 dark:border-zinc-700 dark:bg-[#111114]"
          >
            {previewDataUrl ? (
              <div className="w-full space-y-3">
                <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
                  <img
                    src={previewDataUrl}
                    alt="Uploaded chart screenshot preview"
                    className="max-h-72 w-full object-contain"
                  />
                  <button
                    type="button"
                    aria-label="Remove uploaded chart"
                    onClick={() => {
                      setUploadId(null);
                      setPreviewDataUrl(null);
                      setFileMeta(null);
                    }}
                    className="absolute right-2 top-2 rounded-md bg-zinc-950/80 p-1.5 text-white hover:bg-zinc-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {fileMeta && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                    <span className="truncate font-mono">{fileMeta.filename}</span>
                    <span className="font-mono tabular-nums">
                      {fileMeta.width && fileMeta.height
                        ? `${fileMeta.width}×${fileMeta.height}px · `
                        : ''}
                      {(fileMeta.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                  ) : (
                    <Upload className="h-5 w-5 text-zinc-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Drop a trading chart screenshot, browse files, or press Ctrl+V
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    PNG, JPEG, or WebP up to 8 MB · Magic-byte & dimension verified
                  </p>
                </div>
                <div className="pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Upload chart image"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFileObject(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {uploading ? 'Validating image...' : 'Browse Chart Screenshot'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Labeled Sample Fixtures for Safe Instant Testing */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#111114]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Or Load a Labeled Synthetic Sample Fixture
              </span>
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                Deterministic Demo Data
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  ['btc_uptrend', 'BTC/USDT · 4H', 'Ascending structure'],
                  ['eurusd_range', 'EUR/USD · 1H', 'Range consolidation'],
                  ['spx_pullback', 'SPX500 · 4H', 'Lower-high pullback'],
                ] as const
              ).map(([id, title, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectFixture(id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    demoScenario === id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold">{title}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Optional Metadata Column */}
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-5">
          <div>
            <h2 className="font-display text-base font-semibold">Optional Chart Context</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Supplying symbol and timeframe enables deterministic OHLCV indicator verification for
              supported crypto pairs and prevents ambiguity.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="meta-symbol" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Trading Symbol
              </label>
              <input
                id="meta-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTC/USDT, EUR/USD"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              />
            </div>
            <div>
              <label htmlFor="meta-market" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Market Category
              </label>
              <select
                id="meta-market"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              >
                <option>Crypto</option>
                <option>Forex</option>
                <option>Stocks</option>
                <option>Indices</option>
                <option>Commodities</option>
              </select>
            </div>
            <div>
              <label htmlFor="meta-tf" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Timeframe
              </label>
              <select
                id="meta-tf"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              >
                <option>5M</option>
                <option>15M</option>
                <option>1H</option>
                <option>4H</option>
                <option>1D</option>
                <option>1W</option>
              </select>
            </div>
            <div>
              <label htmlFor="meta-exchange" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Exchange / Platform
              </label>
              <input
                id="meta-exchange"
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                placeholder="Binance, TradingView"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="meta-objective" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Research Objective
            </label>
            <input
              id="meta-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g., Evaluate breakout validity and key invalidation levels"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
          </div>

          <div>
            <label htmlFor="meta-notes" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              User Notes
            </label>
            <textarea
              id="meta-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional higher-timeframe context or questions..."
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-[#09090B]"
            />
          </div>

          <div className="space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={useKnowledgeBase}
                onChange={(e) => setUseKnowledgeBase(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              Incorporate my private Knowledge Base notes (RAG)
            </label>
            <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={useMockProvider}
                onChange={(e) => setUseMockProvider(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              Use deterministic local fixture engine (no external AI call)
            </label>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {analyzing && (
            <div className="space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running 8-stage pipeline...
              </div>
              <p className="text-zinc-600 dark:text-zinc-400">{PIPELINE_STAGES[stageIdx]}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={analyzing || uploading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {analyzing ? 'Analyzing Chart...' : 'Run Structured Analysis'}
          </button>
        </div>
      </div>
    </form>
  );
}
