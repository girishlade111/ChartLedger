import { EMA, MACD, RSI, SMA } from 'technicalindicators';
import type { OhlcvCandle } from './indicators';

export type SentimentLabel =
  | 'Strong Bullish'
  | 'Bullish'
  | 'Neutral'
  | 'Bearish'
  | 'Strong Bearish'
  | 'Unavailable';

export type SignalVote = 'bullish' | 'bearish' | 'neutral';

export interface IndicatorSignalDetail {
  name: string;
  reading: string;
  vote: SignalVote;
}

export interface AssetSentimentResult {
  symbol: string;
  market: string;
  weightPercent: number;
  currentValue: number;
  score: number | null; // 0 (Strong Bearish) to 100 (Strong Bullish)
  label: SentimentLabel;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  signals: IndicatorSignalDetail[];
  available: boolean;
  reason?: string;
}

export interface PortfolioMarketSentiment {
  overallScore: number | null; // 0-100 market-value weighted score
  overallLabel: SentimentLabel;
  bullishSignals: number;
  bearishSignals: number;
  neutralSignals: number;
  scoredHoldingsCount: number;
  totalHoldingsCount: number;
  assets: AssetSentimentResult[];
}

export function classifySentimentScore(score: number | null): SentimentLabel {
  if (score === null || !Number.isFinite(score)) return 'Unavailable';
  if (score >= 70) return 'Strong Bullish';
  if (score >= 55) return 'Bullish';
  if (score >= 46) return 'Neutral';
  if (score >= 31) return 'Bearish';
  return 'Strong Bearish';
}

function formatCompactPrice(val: number): string {
  if (Math.abs(val) >= 1000) return val.toFixed(2);
  if (Math.abs(val) >= 1) return val.toFixed(3);
  return val.toFixed(5);
}

export function computeAssetTechnicalSentiment(
  symbol: string,
  market: string,
  currentValue: number,
  candles: OhlcvCandle[] | null
): Omit<AssetSentimentResult, 'weightPercent'> {
  if (!candles || candles.length < 30) {
    return {
      symbol,
      market,
      currentValue,
      score: null,
      label: 'Unavailable',
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      signals: [],
      available: false,
      reason: 'Live OHLCV history unavailable for this symbol.',
    };
  }

  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 30) {
    return {
      symbol,
      market,
      currentValue,
      score: null,
      label: 'Unavailable',
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      signals: [],
      available: false,
      reason: 'Insufficient valid closing candles.',
    };
  }

  const lastClose = closes[closes.length - 1];
  const signals: IndicatorSignalDetail[] = [];

  // 1. Price vs SMA(20)
  const sma20 = SMA.calculate({ period: 20, values: closes });
  if (sma20.length > 0) {
    const val = sma20[sma20.length - 1];
    const diffPct = ((lastClose - val) / val) * 100;
    const vote: SignalVote =
      diffPct > 0.15 ? 'bullish' : diffPct < -0.15 ? 'bearish' : 'neutral';
    signals.push({
      name: 'SMA (20)',
      reading: `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}% vs $${formatCompactPrice(val)}`,
      vote,
    });
  }

  // 2. Price vs SMA(50)
  if (closes.length >= 50) {
    const sma50 = SMA.calculate({ period: 50, values: closes });
    if (sma50.length > 0) {
      const val = sma50[sma50.length - 1];
      const diffPct = ((lastClose - val) / val) * 100;
      const vote: SignalVote =
        diffPct > 0.2 ? 'bullish' : diffPct < -0.2 ? 'bearish' : 'neutral';
      signals.push({
        name: 'SMA (50)',
        reading: `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}% vs $${formatCompactPrice(val)}`,
        vote,
      });
    }
  }

  // 3. EMA(20) vs EMA(50) trend alignment
  if (closes.length >= 50) {
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });
    if (ema20.length > 0 && ema50.length > 0) {
      const fast = ema20[ema20.length - 1];
      const slow = ema50[ema50.length - 1];
      const spreadPct = ((fast - slow) / slow) * 100;
      const vote: SignalVote =
        spreadPct > 0.1 ? 'bullish' : spreadPct < -0.1 ? 'bearish' : 'neutral';
      signals.push({
        name: 'EMA 20/50',
        reading: spreadPct >= 0 ? `Bullish (+${spreadPct.toFixed(2)}%)` : `Bearish (${spreadPct.toFixed(2)}%)`,
        vote,
      });
    }
  }

  // 4. RSI (14) momentum
  const rsi14 = RSI.calculate({ period: 14, values: closes });
  if (rsi14.length > 0) {
    const val = Math.round(rsi14[rsi14.length - 1] * 100) / 100;
    const vote: SignalVote = val >= 55 ? 'bullish' : val <= 45 ? 'bearish' : 'neutral';
    signals.push({
      name: 'RSI (14)',
      reading: `${val.toFixed(1)}`,
      vote,
    });
  }

  // 5. MACD (12, 26, 9) histogram
  const macd = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  if (macd.length > 0) {
    const latest = macd[macd.length - 1];
    if (latest.histogram !== undefined && Number.isFinite(latest.histogram)) {
      const hist = latest.histogram;
      const vote: SignalVote = hist > 0 ? 'bullish' : hist < 0 ? 'bearish' : 'neutral';
      signals.push({
        name: 'MACD Hist',
        reading: `${hist >= 0 ? '+' : ''}${formatCompactPrice(hist)}`,
        vote,
      });
    }
  }

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  for (const s of signals) {
    if (s.vote === 'bullish') bullishCount += 1;
    else if (s.vote === 'bearish') bearishCount += 1;
    else neutralCount += 1;
  }

  const totalSignals = signals.length;
  const net = bullishCount - bearishCount;
  const score =
    totalSignals > 0
      ? Math.max(0, Math.min(100, Math.round(((net + totalSignals) / (2 * totalSignals)) * 100)))
      : null;

  return {
    symbol,
    market,
    currentValue,
    score,
    label: classifySentimentScore(score),
    bullishCount,
    bearishCount,
    neutralCount,
    signals,
    available: score !== null,
  };
}

export function buildPortfolioMarketSentiment(
  items: Array<{
    symbol: string;
    market: string;
    currentValue: number;
    candles: OhlcvCandle[] | null;
  }>
): PortfolioMarketSentiment {
  if (items.length === 0) {
    return {
      overallScore: null,
      overallLabel: 'Unavailable',
      bullishSignals: 0,
      bearishSignals: 0,
      neutralSignals: 0,
      scoredHoldingsCount: 0,
      totalHoldingsCount: 0,
      assets: [],
    };
  }

  const totalPortfolioVal = items.reduce((sum, i) => sum + Math.max(0, i.currentValue), 0);

  let weightedScoreNum = 0;
  let weightedScoreDen = 0;
  let bullishSignals = 0;
  let bearishSignals = 0;
  let neutralSignals = 0;
  let scoredHoldingsCount = 0;

  const assets: AssetSentimentResult[] = items.map((item) => {
    const computed = computeAssetTechnicalSentiment(
      item.symbol,
      item.market,
      item.currentValue,
      item.candles
    );
    const weightPercent =
      totalPortfolioVal > 0
        ? Math.round((Math.max(0, item.currentValue) / totalPortfolioVal) * 10000) / 100
        : 0;

    if (computed.available && computed.score !== null) {
      scoredHoldingsCount += 1;
      const weight = item.currentValue > 0 ? item.currentValue : 1;
      weightedScoreNum += computed.score * weight;
      weightedScoreDen += weight;
      bullishSignals += computed.bullishCount;
      bearishSignals += computed.bearishCount;
      neutralSignals += computed.neutralCount;
    }

    return {
      ...computed,
      weightPercent,
    };
  });

  assets.sort((a, b) => b.currentValue - a.currentValue);

  const overallScore =
    weightedScoreDen > 0 ? Math.round(weightedScoreNum / weightedScoreDen) : null;

  return {
    overallScore,
    overallLabel: classifySentimentScore(overallScore),
    bullishSignals,
    bearishSignals,
    neutralSignals,
    scoredHoldingsCount,
    totalHoldingsCount: items.length,
    assets,
  };
}
