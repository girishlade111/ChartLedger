import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Moon,
  Sun,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AnalysisResult } from '../utils/analysisSchema';
import type { DemoScenarioId, OhlcvCandle } from '../utils/indicators';
import { formatCents } from '../utils/billing';
import { CandlestickChart } from './CandlestickChart';
import { AnalysisResultView } from './AnalysisResultView';

export type PublicPage =
  | 'home'
  | 'features'
  | 'pricing'
  | 'resources'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'risk'
  | 'disclaimer';

interface PublicSiteProps {
  page: PublicPage;
  onNavigate: (page: PublicPage) => void;
  onGoAuth: (mode: 'login' | 'register') => void;
  onGoWorkspace: () => void;
  isAuthenticated: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

interface DemoPayload {
  isDemoFixture: boolean;
  label: string;
  marketData: {
    symbol: string;
    timeframe: string;
    exchange: string;
    lastPrice: number;
    change24hPercent: number | null;
    candles: OhlcvCandle[];
  };
  analysis: AnalysisResult;
}

interface PlanRow {
  id: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  analysesLimit: number;
  messagesLimit: number;
  kbDocsLimit: number;
  featuresJson: string[];
}

const FAQ_ITEMS = [
  {
    q: 'Which chart screenshot formats and platforms are supported?',
    a: 'ChartLedger accepts PNG, JPEG, and WebP screenshots up to 8 MB via drag-and-drop, file browser, mobile gallery, or direct clipboard paste (Ctrl+V / Cmd+V). Screenshots from TradingView, MetaTrader, cTrader, Thinkorswim, or exchange web terminals work as long as candlesticks and price axes are legible.',
  },
  {
    q: 'Which financial markets can I research?',
    a: 'You can analyze charts across Forex pairs, Cryptocurrencies, Equities, Stock Indices, and Commodities. For compatible spot cryptocurrency symbols, ChartLedger can also retrieve public Binance spot OHLCV candles to calculate deterministic technical indicators alongside the visual interpretation.',
  },
  {
    q: 'Does ChartLedger guarantee trading accuracy or execute trades?',
    a: 'No. ChartLedger is strictly an educational and informational research workspace. It never connects to brokerage accounts, never executes trades, and never promises profitability or uncalibrated win probabilities. Every analysis explicitly separates visible observations from conditional scenarios and lists uncertainties and invalidation triggers.',
  },
  {
    q: 'How are technical indicators handled when underlying price data is missing?',
    a: 'ChartLedger never invents exact indicator numbers from a screenshot alone. Indicators are either calculated deterministically from verified OHLCV data, recorded strictly as visible screenshot observations, or explicitly marked as unavailable.',
  },
  {
    q: 'How is my uploaded data and private knowledge base stored?',
    a: 'Chart screenshots are stored privately and served only to their authenticated owner (or via an explicit share link if you opt in). Knowledge-base documents and vector chunks are strictly isolated per user account and are never retrieved across different accounts. You can export your JSON data or delete your account at any time.',
  },
];

const EDUCATIONAL_ARTICLES = [
  {
    title: 'Separating Visible Evidence from Scenario Inference on Trading Charts',
    category: 'Methodology',
    readTime: '5 min read',
    summary:
      'Why disciplined technical research starts by cataloging raw swing highs, lows, and visible scale limits before hypothesizing directional breakouts.',
    body: 'Most discretionary trading mistakes stem from conflating a clean visual narrative with objective price evidence. A structured workflow begins with verifying symbol, timeframe, and visible range boundaries, then checking whether momentum indicators come from deterministic OHLCV series or screenshot overlays. Only after documenting missing higher-timeframe context should bullish, bearish, and neutral conditional scenarios be written—each with an explicit invalidation close.',
  },
  {
    title: 'Understanding False Breakouts and Liquidity Sweeps',
    category: 'Market Structure',
    readTime: '6 min read',
    summary:
      'How wick rejections beyond established resistance or support zones create whipsaw risk and why closing confirmation matters.',
    body: 'Horizontal support and resistance zones concentrate stop orders and breakout entries. When price pierces a prior swing high intrabar but closes back inside the consolidation range, liquidity above the level has been absorbed without sustained follow-through. Incorporating ATR volatility envelopes and waiting for session closes helps contextualize breakout quality.',
  },
  {
    title: 'Deterministic Indicators vs. Visual Screenshot Readings',
    category: 'Technical Indicators',
    readTime: '4 min read',
    summary:
      'Why mathematical calculation on matched OHLCV series (RSI, MACD, ATR, Bollinger Bands) is superior to visual estimation.',
    body: 'While multimodal AI models can interpret candlestick structure and visible chart annotations, reading exact numerical values for oscillators or moving averages from compressed pixels introduces error. Pairing screenshot review with deterministic server-side indicator libraries ensures numerical accuracy when matched symbol/timeframe feeds exist, and honest unavailability flags when they do not.',
  },
];

export function PublicSite({
  page,
  onNavigate,
  onGoAuth,
  onGoWorkspace,
  isAuthenticated,
  theme,
  onToggleTheme,
}: PublicSiteProps) {
  const [scenario, setScenario] = useState<DemoScenarioId>('btc_uptrend');
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [selectedArticle, setSelectedArticle] = useState<number>(0);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTopic, setContactTopic] = useState('Product Question');
  const [contactMsg, setContactMsg] = useState('');
  const [contactStatus, setContactStatus] = useState<{ ok?: boolean; text: string } | null>(null);
  const [contactSending, setContactSending] = useState(false);

  useEffect(() => {
    setDemoLoading(true);
    apiFetch<DemoPayload>(`/api/public/demo/${scenario}`)
      .then((d) => setDemo(d))
      .catch(() => setDemo(null))
      .finally(() => setDemoLoading(false));
  }, [scenario]);

  useEffect(() => {
    apiFetch<{ plans: PlanRow[] }>('/api/billing/plans')
      .then((res) => setPlans(res.plans))
      .catch(() => setPlans([]));
  }, []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactSending(true);
    setContactStatus(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          topic: contactTopic,
          message: contactMsg,
        }),
      });
      setContactStatus({ ok: true, text: res.message });
      setContactName('');
      setContactEmail('');
      setContactMsg('');
    } catch (err: any) {
      setContactStatus({ ok: false, text: err.message || 'Submission failed.' });
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-950 dark:bg-[#09090B] dark:text-[#FAFAFA]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-[#09090B]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="font-display whitespace-nowrap shrink-0 text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            ChartLedger
          </button>

          {/* Zone 2: 4–5 clean single-line nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400 md:flex"
          >
            <button
              type="button"
              onClick={() => onNavigate('features')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50 ${
                page === 'features' ? 'text-zinc-950 dark:text-zinc-50' : ''
              }`}
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50 ${
                page === 'pricing' ? 'text-zinc-950 dark:text-zinc-50' : ''
              }`}
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => onNavigate('resources')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50 ${
                page === 'resources' ? 'text-zinc-950 dark:text-zinc-50' : ''
              }`}
            >
              Resources
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50 ${
                page === 'contact' ? 'text-zinc-950 dark:text-zinc-50' : ''
              }`}
            >
              Contact
            </button>
          </nav>

          {/* Zone 3: Single primary CTA */}
          <div className="flex shrink-0 items-center gap-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onGoWorkspace}
                className="whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Open Workspace
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onGoAuth('register')}
                className="whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {page === 'home' && (
          <>
            {/* Hero Section */}
            <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 lg:pt-20">
              <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
                <div className="flex flex-col justify-center space-y-6 lg:col-span-6">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Forex · Crypto · Equities · Indices · Commodities
                  </p>
                  <h1 className="font-display text-balance text-4xl font-bold leading-[1.1] tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
                    Structured technical research from any trading chart screenshot.
                  </h1>
                  <p className="max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Upload a candlestick chart to extract visible market structure, compute
                    deterministic OHLCV technical indicators, compare bullish and bearish scenarios
                    with explicit invalidation levels, and ask grounded follow-up questions.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => (isAuthenticated ? onGoWorkspace() : onGoAuth('register'))}
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                    >
                      {isAuthenticated ? 'Go to Dashboard' : 'Start Free Account'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {!isAuthenticated && (
                      <button
                        type="button"
                        onClick={() => onGoAuth('login')}
                        className="whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-[#111114] dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Sign In
                      </button>
                    )}
                    <a
                      href="#interactive-demo"
                      className="whitespace-nowrap px-3 py-2.5 text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      Explore Sample Demo
                    </a>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    Educational & informational research assistant only. Not investment advice or an
                    automated trading bot.
                  </p>
                </div>

                {/* Live Interactive Product Preview Card */}
                <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {demo?.marketData.symbol || 'BTC/USDT'} · {demo?.marketData.timeframe || '4H'}
                    </span>
                    <span className="font-mono text-zinc-500">
                      Sample Fixture · Deterministic OHLCV
                    </span>
                  </div>
                  {demo?.marketData.candles ? (
                    <CandlestickChart
                      candles={demo.marketData.candles}
                      theme={theme}
                      height={270}
                      supportLevel={
                        demo.analysis.priceLevels.find((p) => p.type === 'support')?.lowerBound
                      }
                      resistanceLevel={
                        demo.analysis.priceLevels.find((p) => p.type === 'resistance')?.upperBound
                      }
                    />
                  ) : (
                    <div className="flex h-[270px] items-center justify-center rounded-lg border border-zinc-200 bg-white text-xs text-zinc-500 dark:border-zinc-800 dark:bg-[#09090B]">
                      Loading interactive chart fixture...
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
                    <div>
                      <div className="text-zinc-500">Last Sample Close</div>
                      <div className="font-mono font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                        {demo?.marketData.lastPrice ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Observed Bias</div>
                      <div className="font-semibold capitalize text-emerald-600 dark:text-emerald-400">
                        {demo?.analysis.summary.marketBias ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">RSI (14) Calc</div>
                      <div className="font-mono font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                        {String(
                          demo?.analysis.technicalIndicators.find((i) => i.name === 'RSI (14)')
                            ?.value ?? '—'
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* How It Works */}
            <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
              <div className="mx-auto max-w-6xl px-6">
                <h2 className="font-display text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                  How the 8-Stage Analysis Pipeline Works
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                  Every chart undergoes validation, metadata separation, deterministic math where
                  matched OHLCV data exists, and schema-checked conditional scenario generation.
                </p>
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
                    <div className="font-mono text-xs text-zinc-500">01. Upload & Validate</div>
                    <h3 className="font-display text-base font-semibold">
                      Drop or paste any chart screenshot
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Binary magic-byte and dimension checks secure PNG, JPEG, and WebP uploads.
                      Optional symbol, timeframe, and research objective metadata prevent silent
                      assumptions.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
                    <div className="font-mono text-xs text-zinc-500">
                      02. Multimodal + Deterministic Indicators
                    </div>
                    <h3 className="font-display text-base font-semibold">
                      Combine vision with verified math
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Gemini vision extracts market structure and visible levels while matching
                      OHLCV data computes SMA, EMA, RSI, MACD, ATR, Bollinger Bands, ADX, VWAP, and
                      Fibonacci retracements deterministically.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#111114]">
                    <div className="font-mono text-xs text-zinc-500">
                      03. Scenarios, RAG & Follow-Up Chat
                    </div>
                    <h3 className="font-display text-base font-semibold">
                      Interrogate risks and invalidation triggers
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Review bullish, bearish, and neutral conditions with explicit invalidation
                      levels, then continue in streaming research chat grounded in your private
                      knowledge base.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Interactive Safe Demo */}
            <section
              id="interactive-demo"
              className="border-t border-zinc-200 bg-zinc-50/70 py-16 dark:border-zinc-800 dark:bg-[#0D0D10]"
            >
              <div className="mx-auto max-w-6xl px-6">
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Interactive Sample Demonstration · Synthetic Fixture Data Only
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
                      Inspect a Live Structured Analysis Report
                    </h2>
                  </div>
                  <div
                    role="tablist"
                    aria-label="Sample chart scenarios"
                    className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-200/80 p-1 dark:bg-zinc-900"
                  >
                    {(
                      [
                        ['btc_uptrend', 'BTC/USDT · 4H'],
                        ['eurusd_range', 'EUR/USD · 1H'],
                        ['spx_pullback', 'SPX500 · 4H'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={scenario === id}
                        onClick={() => setScenario(id)}
                        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          scenario === id
                            ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                            : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#09090B]">
                  {demoLoading || !demo ? (
                    <div className="py-16 text-center text-sm text-zinc-500">
                      Computing deterministic sample fixture...
                    </div>
                  ) : (
                    <AnalysisResultView
                      recordId={`demo-${scenario}`}
                      title={`${demo.marketData.symbol} (${demo.marketData.timeframe}) Sample Research`}
                      isDemoFixture
                      result={demo.analysis}
                      candles={demo.marketData.candles}
                      theme={theme}
                      readOnly
                    />
                  )}
                </div>
              </div>
            </section>

            {/* Asymmetric Capabilities Bento */}
            <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
              <div className="mx-auto max-w-6xl px-6">
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Built for Evidence-First Trading Research
                </h2>
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114] md:col-span-2">
                    <h3 className="font-display text-lg font-semibold">
                      Private Knowledge Base with Semantic RAG
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Upload your own trading playbooks, risk checklists, and technical study notes
                      (.md, .txt, .csv, .json). ChartLedger chunks and embeds each document with
                      strict per-user isolation, citing exact excerpts inside your chart analyses
                      and streaming research conversations.
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]">
                    <h3 className="font-display text-lg font-semibold">
                      Transparent Personalization
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Configure experience level, preferred markets, timeframes, and research style.
                      Review, edit, or reset preferences anytime without opaque model claims.
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]">
                    <h3 className="font-display text-lg font-semibold">
                      Persistent History & Comparison
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Search, filter, favorite, tag, and compare two analyses side by side to review
                      how market structure and key zones evolved over time.
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114] md:col-span-2">
                    <h3 className="font-display text-lg font-semibold">
                      Streaming Follow-Up Assistant & Reusable Prompt Library
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Attach any saved chart analysis directly into a real-time Server-Sent Events
                      conversation. Stop generation mid-stream, regenerate responses, save custom
                      prompts, and export structured Markdown or JSON reports.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Pricing Preview */}
            <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
              <div className="mx-auto max-w-6xl px-6">
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Configurable Research Plans
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Clear monthly quotas enforced server-side. Upgrade or cancel anytime.
                </p>
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {(plans.length > 0
                    ? plans
                    : [
                        {
                          id: 'free',
                          name: 'Free Research',
                          description: 'For individual traders exploring structured chart analysis.',
                          priceMonthlyCents: 0,
                          analysesLimit: 15,
                          messagesLimit: 75,
                          kbDocsLimit: 5,
                          featuresJson: [
                            '15 chart analyses / month',
                            '75 AI research messages / month',
                            '5 private knowledge-base documents',
                          ],
                        },
                        {
                          id: 'pro',
                          name: 'Pro Desk',
                          description: 'For active discretionary traders and researchers.',
                          priceMonthlyCents: 2900,
                          analysesLimit: 200,
                          messagesLimit: 1000,
                          kbDocsLimit: 100,
                          featuresJson: [
                            '200 chart analyses / month',
                            '1,000 AI research messages / month',
                            '100 private knowledge-base documents',
                          ],
                        },
                      ]
                  ).map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]"
                    >
                      <div>
                        <div className="flex items-baseline justify-between">
                          <h3 className="font-display text-xl font-bold">{p.name}</h3>
                          <div className="font-mono text-2xl font-bold tabular-nums">
                            {formatCents(p.priceMonthlyCents)}
                            <span className="text-xs font-normal text-zinc-500">/mo</span>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {p.description}
                        </p>
                        <ul className="mt-5 space-y-2 border-t border-zinc-200 pt-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                          {p.featuresJson.map((feat, idx) => (
                            <li key={idx}>• {feat}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => (isAuthenticated ? onGoWorkspace() : onGoAuth('register'))}
                        className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                          p.id === 'pro'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : 'border border-zinc-300 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900'
                        }`}
                      >
                        {p.id === 'pro' ? 'Start with Pro Desk' : 'Create Free Account'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
              <div className="mx-auto max-w-4xl px-6">
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Frequently Asked Questions
                </h2>
                <div className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {FAQ_ITEMS.map((item, idx) => {
                    const expanded = openFaq === idx;
                    return (
                      <div key={idx} className="py-4">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setOpenFaq(expanded ? null : idx)}
                          className="flex w-full items-center justify-between gap-4 text-left text-sm font-semibold text-zinc-950 dark:text-zinc-50"
                        >
                          <span>{item.q}</span>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                          )}
                        </button>
                        {expanded && (
                          <p className="mt-2.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {item.a}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}

        {page === 'features' && (
          <section className="mx-auto max-w-5xl space-y-8 px-6 py-16">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Platform Architecture & Capabilities
            </h1>
            <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
              ChartLedger separates visual chart parsing, deterministic OHLCV math, private
              knowledge retrieval, and schema validation so every research report remains transparent
              and auditable.
            </p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                ['Multimodal Chart Interpretation', 'Extracts symbol, timeframe, candlestick structure, visible price levels, and image quality while explicitly flagging missing or cropped scales.'],
                ['Deterministic Technical Indicators', 'Computes SMA, EMA, RSI, MACD, ATR, Bollinger Bands, Stochastic, ADX, VWAP, and Fibonacci levels server-side from verified OHLCV data without hallucinating values.'],
                ['Conditional Scenario Framework', 'Generates Bullish, Bearish, and Neutral scenarios complete with confirmation criteria, hypothetical reference levels, and structural invalidation conditions.'],
                ['Streaming Research Chat & RAG', 'SSE-powered follow-up conversations grounded in your selected analysis and private, isolated vector-indexed trading notes.'],
                ['Analysis History & Comparison', 'PostgreSQL-backed research library with search, filters, favorites, JSON/Markdown/Print exports, and side-by-side comparison.'],
                ['Shareable Links & Embeddable Widgets', 'Generate revocable, expiring public share URLs (private screenshots excluded by default) and light/dark embed widgets.'],
              ].map(([heading, desc]) => (
                <div
                  key={heading}
                  className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]"
                >
                  <h2 className="font-display text-base font-semibold">{heading}</h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === 'pricing' && (
          <section className="mx-auto max-w-5xl space-y-8 px-6 py-16">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Pricing & Quotas</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Simple monthly tiers with transparent, server-enforced usage limits. Billing runs in
                Stripe test mode until live launch approval.
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-[#111114]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Capability</th>
                    <th className="px-4 py-3 font-semibold">Free Research ($0/mo)</th>
                    <th className="px-4 py-3 font-semibold">Pro Desk ($29/mo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <tr>
                    <td className="px-4 py-3">Structured Chart Analyses / Month</td>
                    <td className="px-4 py-3 font-mono tabular-nums">15</td>
                    <td className="px-4 py-3 font-mono tabular-nums">200</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Streaming AI Chat Messages / Month</td>
                    <td className="px-4 py-3 font-mono tabular-nums">75</td>
                    <td className="px-4 py-3 font-mono tabular-nums">1,000</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Private Knowledge-Base Documents</td>
                    <td className="px-4 py-3 font-mono tabular-nums">5</td>
                    <td className="px-4 py-3 font-mono tabular-nums">100</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Deterministic OHLCV Indicators & Export</td>
                    <td className="px-4 py-3">Included</td>
                    <td className="px-4 py-3">Included</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Side-by-Side Comparison & Embed Widgets</td>
                    <td className="px-4 py-3">Standard</td>
                    <td className="px-4 py-3">Full Access</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => (isAuthenticated ? onGoWorkspace() : onGoAuth('register'))}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              {isAuthenticated ? 'Manage Plan in Workspace' : 'Create Account'}
            </button>
          </section>
        )}

        {page === 'resources' && (
          <section className="mx-auto max-w-5xl space-y-8 px-6 py-16">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Educational Research Guides
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Foundational reading on technical structure, indicator math, and disciplined risk
                framing.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-3">
                {EDUCATIONAL_ARTICLES.map((art, idx) => (
                  <button
                    key={art.title}
                    type="button"
                    onClick={() => setSelectedArticle(idx)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selectedArticle === idx
                        ? 'border-emerald-500 bg-zinc-50 dark:bg-[#111114]'
                        : 'border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-[#09090B]'
                    }`}
                  >
                    <div className="text-xs text-zinc-500">
                      {art.category} · {art.readTime}
                    </div>
                    <div className="mt-1 font-display text-sm font-semibold">{art.title}</div>
                  </button>
                ))}
              </div>
              <article className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114] lg:col-span-2">
                <div className="text-xs text-zinc-500">
                  {EDUCATIONAL_ARTICLES[selectedArticle].category} ·{' '}
                  {EDUCATIONAL_ARTICLES[selectedArticle].readTime}
                </div>
                <h2 className="font-display text-xl font-bold">
                  {EDUCATIONAL_ARTICLES[selectedArticle].title}
                </h2>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {EDUCATIONAL_ARTICLES[selectedArticle].summary}
                </p>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {EDUCATIONAL_ARTICLES[selectedArticle].body}
                </p>
              </article>
            </div>
          </section>
        )}

        {page === 'contact' && (
          <section className="mx-auto max-w-2xl space-y-6 px-6 py-16">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Contact Support</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Questions about research quotas, data privacy, or enterprise integrations? Send a
                message below.
              </p>
            </div>
            <form
              onSubmit={handleContactSubmit}
              className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#111114]"
            >
              <div>
                <label htmlFor="contact-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Name
                </label>
                <input
                  id="contact-name"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
                />
              </div>
              <div>
                <label htmlFor="contact-topic" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Topic
                </label>
                <select
                  id="contact-topic"
                  value={contactTopic}
                  onChange={(e) => setContactTopic(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
                >
                  <option>Product Question</option>
                  <option>Billing & Plans</option>
                  <option>Privacy & Compliance</option>
                  <option>Bug Report</option>
                </select>
              </div>
              <div>
                <label htmlFor="contact-msg" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Message
                </label>
                <textarea
                  id="contact-msg"
                  required
                  minLength={10}
                  rows={4}
                  value={contactMsg}
                  onChange={(e) => setContactMsg(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
                />
              </div>
              {contactStatus && (
                <p
                  className={`text-xs font-medium ${
                    contactStatus.ok
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {contactStatus.text}
                </p>
              )}
              <button
                type="submit"
                disabled={contactSending}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {contactSending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </section>
        )}

        {(page === 'privacy' || page === 'terms' || page === 'risk' || page === 'disclaimer') && (
          <section className="mx-auto max-w-3xl space-y-4 px-6 py-16 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            <h1 className="font-display text-3xl font-bold text-zinc-950 dark:text-zinc-50">
              {page === 'privacy'
                ? 'Privacy Policy'
                : page === 'terms'
                  ? 'Terms of Service'
                  : page === 'risk'
                    ? 'Financial Risk Disclosure'
                    : 'Financial & Educational Disclaimer'}
            </h1>
            {page === 'privacy' && (
              <>
                <p>
                  ChartLedger collects only the information needed to operate your research account:
                  authentication identity (email and hashed credentials or Google Sign-In UID),
                  uploaded chart screenshots, analysis records, research chat history, and private
                  knowledge-base documents.
                </p>
                <p>
                  Uploaded screenshots are processed by the configured server-side AI vision
                  provider (Google Gemini) solely to generate your requested analysis. Knowledge-base
                  documents and embeddings are strictly scoped to your user ID and are never shared
                  across tenants. You may export your account records in JSON format or permanently
                  delete your account from Settings at any time.
                </p>
              </>
            )}
            {page === 'terms' && (
              <>
                <p>
                  By creating a ChartLedger account, you acknowledge that all generated outputs are
                  informational and educational research aids. You agree not to upload unlawful
                  content, attempt unauthorized access to other users’ records, or represent
                  automated AI outputs as regulated financial advice.
                </p>
                <p>
                  Usage quotas are enforced per billing period based on your active subscription
                  tier. Automated scraping, abuse of upload limits, or credential sharing may result
                  in suspension.
                </p>
              </>
            )}
            {(page === 'risk' || page === 'disclaimer') && (
              <>
                <p>
                  Trading foreign exchange, cryptocurrencies, equities, indices, and commodities on
                  margin or spot markets carries a high level of risk and may not be suitable for
                  all investors. You could sustain a loss of some or all of your initial capital.
                </p>
                <p>
                  ChartLedger is not a registered investment advisor, broker-dealer, or research
                  analyst regulated by the SEC, FINRA, SEBI, FCA, or any other financial authority.
                  AI interpretations may misread chart scales or omit macro events. Always verify
                  market prices directly with your licensed broker and consult a qualified
                  professional before making financial decisions.
                </p>
              </>
            )}
          </section>
        )}
      </main>

      {/* Quiet Footer with Financial Disclaimer & Legal Links */}
      <footer className="border-t border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-[#0B0B0E]">
        <div className="mx-auto max-w-6xl space-y-8 px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 space-y-3 md:col-span-1">
              <div className="font-display text-base font-bold">ChartLedger</div>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Independent AI financial chart analysis and trading research workspace.
              </p>
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label="Toggle color theme"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">Product</div>
              <div className="flex flex-col gap-1.5 text-zinc-600 dark:text-zinc-400">
                <button type="button" onClick={() => onNavigate('features')} className="text-left hover:underline">
                  Features
                </button>
                <button type="button" onClick={() => onNavigate('pricing')} className="text-left hover:underline">
                  Pricing
                </button>
                <button type="button" onClick={() => onNavigate('resources')} className="text-left hover:underline">
                  Educational Guides
                </button>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">Support</div>
              <div className="flex flex-col gap-1.5 text-zinc-600 dark:text-zinc-400">
                <button type="button" onClick={() => onNavigate('contact')} className="text-left hover:underline">
                  Contact
                </button>
                <button type="button" onClick={() => onGoAuth('login')} className="text-left hover:underline">
                  Sign In
                </button>
                <button type="button" onClick={() => onGoAuth('register')} className="text-left hover:underline">
                  Create Account
                </button>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">Legal & Compliance</div>
              <div className="flex flex-col gap-1.5 text-zinc-600 dark:text-zinc-400">
                <button type="button" onClick={() => onNavigate('privacy')} className="text-left hover:underline">
                  Privacy Policy
                </button>
                <button type="button" onClick={() => onNavigate('terms')} className="text-left hover:underline">
                  Terms of Service
                </button>
                <button type="button" onClick={() => onNavigate('risk')} className="text-left hover:underline">
                  Risk Disclosure
                </button>
                <button type="button" onClick={() => onNavigate('disclaimer')} className="text-left hover:underline">
                  Financial Disclaimer
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            <p>
              Educational & Informational Notice: ChartLedger provides AI-assisted technical chart
              research for educational purposes only. It is not personalized financial advice, does
              not guarantee trading outcomes, and does not execute trades. ©{' '}
              {new Date().getFullYear()} ChartLedger.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
