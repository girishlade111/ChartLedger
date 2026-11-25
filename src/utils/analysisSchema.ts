import { z } from 'zod';

export const DEFAULT_FINANCIAL_DISCLAIMER =
  'Educational and informational market research only. ChartLedger is not a registered investment advisor or broker-dealer. AI chart interpretations may contain errors, market data may be delayed or synthetic, technical indicators do not guarantee future outcomes, and trading involves substantial risk of financial loss.';

export const DataSourceSchema = z.object({
  id: z.string(),
  type: z.enum([
    'uploaded_screenshot',
    'user_metadata',
    'external_market_data',
    'synthetic_sample_fixture',
    'knowledge_base',
  ]),
  name: z.string(),
  timestamp: z.string().nullable(),
  reference: z.string().nullable(),
});

export const TechnicalIndicatorItemSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.null()]),
  interpretation: z.string(),
  sourceType: z.enum(['calculated_ohlcv', 'visible_screenshot', 'unavailable']),
  available: z.boolean(),
  evidenceReferences: z.array(z.string()).default([]),
});

export const PriceLevelSchema = z.object({
  type: z.enum(['support', 'resistance', 'supply', 'demand', 'liquidity', 'pivot']),
  lowerBound: z.number().nullable(),
  upperBound: z.number().nullable(),
  reasoning: z.string(),
  estimated: z.boolean(),
  evidenceReferences: z.array(z.string()).default([]),
});

export const ChartPatternSchema = z.object({
  name: z.string(),
  status: z.enum(['forming', 'potential', 'confirmed_visible', 'invalidated', 'ambiguous']),
  evidence: z.array(z.string()),
  confirmationConditions: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
});

export const DirectionalScenarioSchema = z.object({
  description: z.string(),
  conditions: z.array(z.string()),
  hypotheticalLevels: z.array(
    z.object({
      label: z.string(),
      price: z.string(),
      note: z.string(),
    })
  ),
  invalidation: z.array(z.string()),
  risks: z.array(z.string()),
});

export const AnalysisResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  analysisId: z.string(),
  status: z.enum(['completed', 'insufficient_data', 'failed']),
  generatedAt: z.string(),
  model: z.object({
    provider: z.string(),
    name: z.string(),
    version: z.string(),
  }),
  chart: z.object({
    symbol: z.string().nullable(),
    market: z.string().nullable(),
    exchange: z.string().nullable(),
    timeframe: z.string().nullable(),
    chartType: z.string().nullable(),
    visiblePrice: z.number().nullable(),
    captureTime: z.string().nullable(),
    imageQuality: z.enum(['high', 'moderate', 'low', 'unreadable']),
    limitations: z.array(z.string()),
  }),
  dataSources: z.array(DataSourceSchema),
  summary: z.object({
    overview: z.string(),
    marketBias: z.enum(['bullish', 'bearish', 'neutral', 'uncertain']),
    evidenceQuality: z.enum(['high', 'medium', 'low', 'insufficient']),
    keyObservations: z.array(z.string()),
  }),
  marketStructure: z.object({
    trend: z.string(),
    observations: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
  technicalIndicators: z.array(TechnicalIndicatorItemSchema),
  priceLevels: z.array(PriceLevelSchema),
  patterns: z.array(ChartPatternSchema),
  scenarios: z.object({
    bullish: DirectionalScenarioSchema,
    bearish: DirectionalScenarioSchema,
    neutral: z.object({
      description: z.string(),
      conditions: z.array(z.string()),
      risks: z.array(z.string()),
    }),
  }),
  riskAnalysis: z.object({
    riskFactors: z.array(z.string()),
    volatility: z.string().nullable(),
    hypotheticalRiskReward: z.string().nullable(),
    limitations: z.array(z.string()),
  }),
  educationalExplanation: z.string(),
  followUpQuestions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  disclaimer: z.string(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export interface ValidationAudit {
  valid: boolean;
  warnings: string[];
  sanitized: AnalysisResult | null;
  errors: string[];
}

const UNSAFE_CERTAINTY_PATTERNS: RegExp[] = [
  /guaranteed\s+profit/i,
  /100%\s+(?:win|certain|sure|accuracy|probability)/i,
  /risk[-\s]?free\s+(?:trade|return|profit)/i,
  /will\s+definitely\s+(?:pump|dump|moon|crash|rally)/i,
  /personalized\s+financial\s+advice/i,
];

const ARBITRARY_PROBABILITY_PATTERN = /\b(?:[1-9]\d?)%\s+(?:chance|probability|likelihood)\s+of\s+(?:bullish|bearish|breakout|rally|drop|profit)/i;

export function validateAnalysisResult(raw: unknown): ValidationAudit {
  const parsed = AnalysisResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      warnings: [],
      sanitized: null,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const result = structuredClone(parsed.data);
  const warnings: string[] = [];

  // Ensure numeric bounds ordering on price levels
  for (const level of result.priceLevels) {
    if (
      level.lowerBound !== null &&
      level.upperBound !== null &&
      level.lowerBound > level.upperBound
    ) {
      const tmp = level.lowerBound;
      level.lowerBound = level.upperBound;
      level.upperBound = tmp;
      warnings.push(`Normalized inverted price bounds on ${level.type} level.`);
    }
  }

  // Enforce insufficient_data guard if image is unreadable and no external OHLCV
  const hasMarketData = result.dataSources.some(
    (s) => s.type === 'external_market_data' || s.type === 'synthetic_sample_fixture'
  );
  if (result.chart.imageQuality === 'unreadable' && !hasMarketData) {
    result.status = 'insufficient_data';
    result.summary.marketBias = 'uncertain';
    result.summary.evidenceQuality = 'insufficient';
    warnings.push('Downgraded status to insufficient_data because image quality is unreadable.');
  }

  // Check text fields for prohibited certainty or arbitrary probability claims
  const textBlob = [
    result.summary.overview,
    result.scenarios.bullish.description,
    result.scenarios.bearish.description,
    result.scenarios.neutral.description,
    result.educationalExplanation,
  ].join(' ');

  for (const pattern of UNSAFE_CERTAINTY_PATTERNS) {
    if (pattern.test(textBlob)) {
      warnings.push(`Flagged unsupported certainty phrase matching ${pattern.source}.`);
      result.uncertainties.push(
        'Validation note: Conditional scenario language enforced; no market outcome is guaranteed.'
      );
    }
  }

  if (ARBITRARY_PROBABILITY_PATTERN.test(textBlob)) {
    warnings.push('Flagged uncalibrated numerical scenario probability claim.');
    result.uncertainties.push(
      'Validation note: Numerical scenario probabilities are not statistically calibrated and should not be treated as forecasts.'
    );
  }

  // Guarantee disclaimer presence
  if (!result.disclaimer || result.disclaimer.trim().length < 40) {
    result.disclaimer = DEFAULT_FINANCIAL_DISCLAIMER;
    warnings.push('Restored standard educational and financial risk disclaimer.');
  }

  return {
    valid: true,
    warnings,
    sanitized: result,
    errors: [],
  };
}
