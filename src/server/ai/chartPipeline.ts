import crypto from 'node:crypto';
import {
  AnalysisResult,
  DEFAULT_FINANCIAL_DISCLAIMER,
  validateAnalysisResult,
} from '../../utils/analysisSchema.ts';
import {
  DemoScenarioId,
  calculateDeterministicIndicators,
  calculateHypotheticalRiskReward,
  computeFibonacciLevels,
  detectDecimals,
  roundPrice,
} from '../../utils/indicators.ts';
import { wrapUntrustedContent } from '../../utils/security.ts';
import { MarketDataResult, fetchCryptoMarketData, getSampleMarketData } from '../marketData.ts';
import { DEFAULT_PROMPT_TEMPLATES } from './promptRegistry.ts';
import { generateGeminiJson, getGeminiClient } from './providerRegistry.ts';

export interface ChartMetadataInput {
  symbol?: string;
  market?: string;
  exchange?: string;
  timeframe?: string;
  chartPlatform?: string;
  captureTime?: string;
  notes?: string;
  objective?: string;
  demoScenario?: DemoScenarioId;
  useMockProvider?: boolean;
}

export interface UserResearchPreferences {
  experience?: string;
  researchStyle?: string;
  detailLevel?: string;
  language?: string;
  preferredMarkets?: string[];
  preferredTimeframes?: string[];
  personalizationEnabled?: boolean;
}

export interface ChartPipelineInput {
  analysisId?: string;
  imageBase64?: string;
  imageMimeType?: string;
  metadata: ChartMetadataInput;
  preferences?: UserResearchPreferences;
  ragContext?: Array<{ documentTitle: string; content: string }>;
  systemPromptOverride?: string;
}

export interface ChartPipelineOutput {
  result: AnalysisResult;
  provider: string;
  model: string;
  tokensUsed: number;
  isDemoFixture: boolean;
  validationWarnings: string[];
  marketData: MarketDataResult | null;
}

export function buildDeterministicFixtureAnalysis(
  analysisId: string,
  marketData: MarketDataResult,
  metadata: ChartMetadataInput
): AnalysisResult {
  const candles = marketData.candles;
  const lastCandle = candles[candles.length - 1];
  const decimals = detectDecimals(lastCandle.close);
  const indicators = calculateDeterministicIndicators(candles, 'src_ohlcv');
  const fib = computeFibonacciLevels(candles);

  const recentHigh = Math.max(...candles.slice(-30).map((c) => c.high));
  const recentLow = Math.min(...candles.slice(-30).map((c) => c.low));
  const midPrice = roundPrice((recentHigh + recentLow) / 2, decimals);

  const rsiObj = indicators.find((i) => i.name === 'RSI (14)');
  const rsiVal = typeof rsiObj?.value === 'number' ? rsiObj.value : 50;
  const sma20Obj = indicators.find((i) => i.name === 'SMA (20)');
  const sma20Val = typeof sma20Obj?.value === 'number' ? sma20Obj.value : lastCandle.close;

  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let trend = 'Sideways range consolidation';
  if (lastCandle.close > sma20Val && rsiVal > 53) {
    bias = 'bullish';
    trend = 'Ascending structure (higher highs and higher lows)';
  } else if (lastCandle.close < sma20Val && rsiVal < 47) {
    bias = 'bearish';
    trend = 'Descending pullback structure (lower highs and lower lows)';
  }

  const supportLow = roundPrice(recentLow, decimals);
  const supportHigh = roundPrice(recentLow + (recentHigh - recentLow) * 0.14, decimals);
  const resLow = roundPrice(recentHigh - (recentHigh - recentLow) * 0.12, decimals);
  const resHigh = roundPrice(recentHigh, decimals);

  const rr =
    bias === 'bearish'
      ? calculateHypotheticalRiskReward(lastCandle.close, resHigh, supportLow)
      : calculateHypotheticalRiskReward(lastCandle.close, supportLow, resHigh);

  return {
    schemaVersion: '1.0',
    analysisId,
    status: 'completed',
    generatedAt: new Date().toISOString(),
    model: {
      provider: 'mock_fixture',
      name: 'deterministic-fixture-v1',
      version: '1.0',
    },
    chart: {
      symbol: metadata.symbol || marketData.symbol,
      market: metadata.market || 'Crypto',
      exchange: metadata.exchange || marketData.exchange,
      timeframe: metadata.timeframe || marketData.timeframe,
      chartType: 'Candlestick (OHLCV)',
      visiblePrice: lastCandle.close,
      captureTime: marketData.fetchedAt,
      imageQuality: 'high',
      limitations: [
        marketData.sourceType === 'synthetic_sample_fixture'
          ? 'Generated using a clearly labeled deterministic synthetic sample fixture for educational demonstration.'
          : 'Deterministic analysis computed from retrieved public OHLCV series.',
      ],
    },
    dataSources: [
      {
        id: 'src_ohlcv',
        type: marketData.sourceType,
        name: marketData.sourceName,
        timestamp: marketData.fetchedAt,
        reference: marketData.attribution,
      },
    ],
    summary: {
      overview: `${marketData.symbol} (${marketData.timeframe}) displays a ${trend.toLowerCase()} with last sampled close at ${lastCandle.close}. Deterministic indicators place RSI(14) at ${rsiVal} and SMA(20) at ${sma20Val}, framing key structural boundaries between ${supportLow} and ${resHigh}.`,
      marketBias: bias,
      evidenceQuality: 'high',
      keyObservations: [
        `Last sampled close: ${lastCandle.close} relative to 30-bar range ${supportLow} – ${resHigh}.`,
        `SMA(20) sits at ${sma20Val}; price is trading ${lastCandle.close >= sma20Val ? 'above' : 'below'} its short-term mean.`,
        `RSI(14) reads ${rsiVal}, reflecting ${rsiVal > 55 ? 'constructive upward' : rsiVal < 45 ? 'downward' : 'balanced'} momentum.`,
        fib
          ? `Fibonacci 0.382 / 0.618 retracement cluster spans ${fib.retracements['0.382']} to ${fib.retracements['0.618']}.`
          : 'Fibonacci retracement levels require a wider swing range.',
      ],
    },
    marketStructure: {
      trend,
      observations: [
        `30-bar structural ceiling sits near ${resHigh} with demand absorption observed near ${supportLow}.`,
        `Mid-range equilibrium sits near ${midPrice}, acting as an intraday balance pivot.`,
      ],
      limitations: [
        'Single-timeframe structure does not capture higher-timeframe macro liquidity or unscheduled news catalysts.',
      ],
    },
    technicalIndicators: indicators,
    priceLevels: [
      {
        type: 'support',
        lowerBound: supportLow,
        upperBound: supportHigh,
        reasoning: 'Recent 30-candle structural low and prior demand reaction band.',
        estimated: false,
        evidenceReferences: ['src_ohlcv'],
      },
      {
        type: 'resistance',
        lowerBound: resLow,
        upperBound: resHigh,
        reasoning: 'Recent 30-candle swing high where upward momentum previously stalled.',
        estimated: false,
        evidenceReferences: ['src_ohlcv'],
      },
      {
        type: 'pivot',
        lowerBound: midPrice,
        upperBound: midPrice,
        reasoning: '50% midpoint of the observed 30-bar structural range.',
        estimated: false,
        evidenceReferences: ['src_ohlcv'],
      },
    ],
    patterns: [
      {
        name:
          bias === 'bullish'
            ? 'Ascending Structural Channel'
            : bias === 'bearish'
              ? 'Lower-High Distribution Pullback'
              : 'Horizontal Range Consolidation',
        status: 'forming',
        evidence: [
          `Price oscillates between ${supportLow} and ${resHigh} across the recent 30 candles.`,
          `Momentum alignment confirmed by deterministic EMA/RSI readings.`,
        ],
        confirmationConditions: [
          `Decisive candle close beyond ${bias === 'bearish' ? supportLow : resHigh} accompanied by expanding volume.`,
        ],
        invalidationConditions: [
          `Sustained close back beyond ${bias === 'bearish' ? resHigh : supportLow} negates the active structural thesis.`,
        ],
      },
    ],
    scenarios: {
      bullish: {
        description: `If buyers defend ${supportHigh} and achieve a confirmed close above ${resHigh}, structure favors continuation toward higher extension targets.`,
        conditions: [
          `Hold above structural support zone (${supportLow} – ${supportHigh}).`,
          `Confirmed candle close above resistance (${resHigh}) without immediate upper-wick rejection.`,
        ],
        hypotheticalLevels: [
          {
            label: 'Hypothetical Breakout Reference',
            price: String(resHigh),
            note: 'Upper boundary of recent 30-bar range (research level only).',
          },
          {
            label: 'Hypothetical Invalidation Reference',
            price: String(supportLow),
            note: 'Structural low below which bullish thesis weakens.',
          },
          ...(fib
            ? [
                {
                  label: 'Hypothetical 1.272 Extension Reference',
                  price: String(fib.extensions['1.272']),
                  note: 'Derived mathematically from observed swing high/low.',
                },
              ]
            : []),
        ],
        invalidation: [`Daily or session close below ${supportLow}.`],
        risks: [
          'False breakout (liquidity sweep above resistance followed by reversal back inside range).',
          'Overhead higher-timeframe supply not visible on this chart window.',
        ],
      },
      bearish: {
        description: `If rallies stall inside ${resLow} – ${resHigh} and price breaks below ${supportLow}, structure shifts toward deeper downside discovery.`,
        conditions: [
          `Rejection at overhead resistance zone (${resLow} – ${resHigh}).`,
          `Confirmed close below structural support (${supportLow}).`,
        ],
        hypotheticalLevels: [
          {
            label: 'Hypothetical Breakdown Reference',
            price: String(supportLow),
            note: 'Lower range support boundary (research level only).',
          },
          {
            label: 'Hypothetical Invalidation Reference',
            price: String(resHigh),
            note: 'Upper swing high invalidating bearish structure.',
          },
        ],
        invalidation: [`Confirmed breakout close above ${resHigh}.`],
        risks: [
          'Bear trap / rapid mean-reversion bounce if RSI enters oversold extremes.',
          'Liquidity gaps during macroeconomic releases.',
        ],
      },
      neutral: {
        description: `Price remains range-bound between ${supportHigh} and ${resLow} while directional trend strength (ADX) stays moderate.`,
        conditions: [
          `Repeated mean-reversion around range midpoint (${midPrice}).`,
          'Lack of volume expansion at either range boundary.',
        ],
        risks: ['Whipsaw losses from chasing mid-range breakouts before structural confirmation.'],
      },
    },
    riskAnalysis: {
      riskFactors: [
        'Single-timeframe analysis omits higher-timeframe macro trends and order-book depth.',
        'False breakouts and slippage can occur rapidly around obvious swing highs and lows.',
        'Deterministic indicators are lagging mathematical transformations of historical prices.',
      ],
      volatility:
        indicators.find((i) => i.name === 'ATR (14)')?.value?.toString() ?? 'Unavailable',
      hypotheticalRiskReward: rr
        ? `${rr.formatted} (hypothetical research calculation only — not a trade signal)`
        : null,
      limitations: [
        marketData.sourceType === 'synthetic_sample_fixture'
          ? 'Demonstration mode uses synthetic OHLCV sample data rather than live market feeds.'
          : 'Public spot OHLCV data may differ slightly from brokerage or futures feeds.',
      ],
    },
    educationalExplanation:
      'Technical structure analysis compares recent swing highs and lows against moving averages and volatility envelopes to frame conditional scenarios. Rather than predicting a single outcome, disciplined research defines both the evidence supporting a scenario and the exact structural price level that invalidates it.',
    followUpQuestions: [
      `What higher-timeframe context should I check before evaluating ${marketData.symbol} on ${marketData.timeframe}?`,
      `How would an invalidation close below ${supportLow} change the market structure?`,
      'How do ATR and Bollinger Band width help gauge breakout vs. range risk here?',
    ],
    uncertainties: [
      'No macroeconomic calendar or live order-book liquidity data is attached to this analysis.',
      'Market regimes can shift abruptly around central bank or earnings announcements.',
    ],
    disclaimer: DEFAULT_FINANCIAL_DISCLAIMER,
  };
}

export async function runChartAnalysisPipeline(
  input: ChartPipelineInput
): Promise<ChartPipelineOutput> {
  const analysisId = input.analysisId || crypto.randomUUID();
  const { metadata, preferences, ragContext } = input;

  // Stage 3/5 prep: Resolve compatible OHLCV market data if available or requested via sample scenario
  let marketData: MarketDataResult | null = null;
  if (metadata.demoScenario) {
    marketData = getSampleMarketData(metadata.demoScenario);
  } else if (metadata.symbol) {
    marketData = await fetchCryptoMarketData(metadata.symbol, metadata.timeframe);
  }

  const deterministicIndicators = marketData
    ? calculateDeterministicIndicators(marketData.candles, 'src_ohlcv')
    : [];

  const geminiClient = getGeminiClient();
  const forceDemoMode =
    metadata.useMockProvider === true ||
    process.env.DEMO_MODE === 'true' ||
    (!geminiClient && Boolean(metadata.demoScenario));

  // Deterministic fixture path (clearly labeled; never silently fakes live AI in production without key)
  if (forceDemoMode || (!geminiClient && !input.imageBase64 && marketData)) {
    const fallbackMarketData = marketData ?? getSampleMarketData('btc_uptrend');
    const rawResult = buildDeterministicFixtureAnalysis(analysisId, fallbackMarketData, metadata);
    const audit = validateAnalysisResult(rawResult);
    return {
      result: audit.sanitized ?? rawResult,
      provider: 'mock_fixture',
      model: 'deterministic-fixture-v1',
      tokensUsed: 0,
      isDemoFixture: true,
      validationWarnings: audit.warnings,
      marketData: fallbackMarketData,
    };
  }

  if (!geminiClient) {
    throw new Error(
      'AI vision provider is not configured (GEMINI_API_KEY missing). Enable Sample Demo mode to test with deterministic fixtures.'
    );
  }

  const systemInstruction =
    input.systemPromptOverride || DEFAULT_PROMPT_TEMPLATES[0].systemPrompt;

  const prefBlock =
    preferences && preferences.personalizationEnabled !== false
      ? `USER RESEARCH PREFERENCES (adapt explanation tone/detail only; never weaken safety rules):
- Trading experience: ${preferences.experience || 'Intermediate'}
- Research style: ${preferences.researchStyle || 'Swing / Price Action'}
- Detail level: ${preferences.detailLevel || 'Balanced'}
- Response language: ${preferences.language || 'English'}`
      : 'USER RESEARCH PREFERENCES: Standard balanced English explanation.';

  const userMetaBlock = wrapUntrustedContent(
    'user_metadata',
    JSON.stringify({
      symbol: metadata.symbol || null,
      market: metadata.market || null,
      exchange: metadata.exchange || null,
      timeframe: metadata.timeframe || null,
      chartPlatform: metadata.chartPlatform || null,
      captureTime: metadata.captureTime || null,
      notes: metadata.notes || null,
      objective: metadata.objective || null,
    })
  );

  const marketDataBlock = marketData
    ? `VERIFIED DETERMINISTIC OHLCV & INDICATORS (${marketData.sourceName}, fetched ${marketData.fetchedAt}, freshness=${marketData.freshness}):
Symbol: ${marketData.symbol}, Timeframe: ${marketData.timeframe}, Last Close: ${marketData.lastPrice}
Calculated Indicators JSON:
${JSON.stringify(deterministicIndicators)}`
    : 'EXTERNAL MARKET DATA: Not available for this symbol/timeframe. Do NOT fabricate numeric indicator values. Only report indicators directly visible on the chart screenshot or mark them unavailable.';

  const ragBlock =
    ragContext && ragContext.length > 0
      ? `OPTIONAL USER KNOWLEDGE-BASE EXCERPTS (untrusted user notes for context only):\n${ragContext
          .map((c) => wrapUntrustedContent(`kb_${c.documentTitle}`, c.content))
          .join('\n')}`
      : '';

  const prompt = `Perform a complete 8-stage structured financial chart analysis and return STRICT JSON matching schemaVersion "1.0".

Analysis ID: ${analysisId}
Generated At: ${new Date().toISOString()}

${prefBlock}

${userMetaBlock}

${marketDataBlock}

${ragBlock}

REQUIRED JSON STRUCTURE (exact keys):
{
  "schemaVersion": "1.0",
  "analysisId": "${analysisId}",
  "status": "completed" | "insufficient_data",
  "generatedAt": "ISO-8601 string",
  "model": { "provider": "gemini", "name": "gemini-4-hydrogen", "version": "4.0" },
  "chart": {
    "symbol": string | null,
    "market": string | null,
    "exchange": string | null,
    "timeframe": string | null,
    "chartType": string | null,
    "visiblePrice": number | null,
    "captureTime": string | null,
    "imageQuality": "high" | "moderate" | "low" | "unreadable",
    "limitations": string[]
  },
  "dataSources": [
    { "id": string, "type": "uploaded_screenshot" | "user_metadata" | "external_market_data" | "synthetic_sample_fixture" | "knowledge_base", "name": string, "timestamp": string | null, "reference": string | null }
  ],
  "summary": {
    "overview": string,
    "marketBias": "bullish" | "bearish" | "neutral" | "uncertain",
    "evidenceQuality": "high" | "medium" | "low" | "insufficient",
    "keyObservations": string[]
  },
  "marketStructure": { "trend": string, "observations": string[], "limitations": string[] },
  "technicalIndicators": [
    { "name": string, "value": string | number | null, "interpretation": string, "sourceType": "calculated_ohlcv" | "visible_screenshot" | "unavailable", "available": boolean, "evidenceReferences": string[] }
  ],
  "priceLevels": [
    { "type": "support" | "resistance" | "supply" | "demand" | "liquidity" | "pivot", "lowerBound": number | null, "upperBound": number | null, "reasoning": string, "estimated": boolean, "evidenceReferences": string[] }
  ],
  "patterns": [
    { "name": string, "status": "forming" | "potential" | "confirmed_visible" | "invalidated" | "ambiguous", "evidence": string[], "confirmationConditions": string[], "invalidationConditions": string[] }
  ],
  "scenarios": {
    "bullish": { "description": string, "conditions": string[], "hypotheticalLevels": [{ "label": string, "price": string, "note": string }], "invalidation": string[], "risks": string[] },
    "bearish": { "description": string, "conditions": string[], "hypotheticalLevels": [{ "label": string, "price": string, "note": string }], "invalidation": string[], "risks": string[] },
    "neutral": { "description": string, "conditions": string[], "risks": string[] }
  },
  "riskAnalysis": { "riskFactors": string[], "volatility": string | null, "hypotheticalRiskReward": string | null, "limitations": string[] },
  "educationalExplanation": string,
  "followUpQuestions": string[],
  "uncertainties": string[],
  "disclaimer": "${DEFAULT_FINANCIAL_DISCLAIMER}"
}`;

  const { text, tokensUsed, model } = await generateGeminiJson({
    systemInstruction,
    prompt,
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  });

  let parsedRaw: unknown;
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`AI provider returned invalid JSON output: ${(err as Error).message}`);
  }

  // Merge deterministic calculated indicators if OHLCV was available so numbers are 100% grounded
  if (
    parsedRaw &&
    typeof parsedRaw === 'object' &&
    deterministicIndicators.length > 0 &&
    Array.isArray((parsedRaw as any).technicalIndicators)
  ) {
    const visibleOnly = ((parsedRaw as any).technicalIndicators as any[]).filter(
      (i) => i?.sourceType === 'visible_screenshot'
    );
    (parsedRaw as any).technicalIndicators = [...deterministicIndicators, ...visibleOnly];
  }

  const audit = validateAnalysisResult(parsedRaw);
  if (!audit.valid || !audit.sanitized) {
    throw new Error(`Structured analysis schema validation failed: ${audit.errors.join('; ')}`);
  }

  return {
    result: audit.sanitized,
    provider: 'gemini',
    model,
    tokensUsed,
    isDemoFixture: Boolean(metadata.demoScenario),
    validationWarnings: audit.warnings,
    marketData,
  };
}
