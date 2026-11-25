import {
  ADX,
  ATR,
  BollingerBands,
  EMA,
  MACD,
  RSI,
  SMA,
  Stochastic,
  VWAP,
} from 'technicalindicators';

export interface OhlcvCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ComputedIndicator {
  name: string;
  value: string | number | null;
  interpretation: string;
  sourceType: 'calculated_ohlcv' | 'visible_screenshot' | 'unavailable';
  available: boolean;
  evidenceReferences: string[];
}

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  direction: 'uptrend_retracement' | 'downtrend_retracement';
  retracements: Record<string, number>;
  extensions: Record<string, number>;
}

export function roundPrice(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function detectDecimals(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 10) return 2;
  if (price >= 1) return 4;
  return 6;
}

export function computeFibonacciLevels(candles: OhlcvCandle[]): FibonacciLevels | null {
  if (candles.length < 10) return null;
  const recent = candles.slice(-60);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let highIdx = 0;
  let lowIdx = 0;

  recent.forEach((c, idx) => {
    if (c.high > swingHigh) {
      swingHigh = c.high;
      highIdx = idx;
    }
    if (c.low < swingLow) {
      swingLow = c.low;
      lowIdx = idx;
    }
  });

  const range = swingHigh - swingLow;
  if (range <= 0) return null;
  const decimals = detectDecimals(swingHigh);
  const uptrend = highIdx >= lowIdx;

  const retracements = uptrend
    ? {
        '0.236': roundPrice(swingHigh - range * 0.236, decimals),
        '0.382': roundPrice(swingHigh - range * 0.382, decimals),
        '0.500': roundPrice(swingHigh - range * 0.5, decimals),
        '0.618': roundPrice(swingHigh - range * 0.618, decimals),
        '0.786': roundPrice(swingHigh - range * 0.786, decimals),
      }
    : {
        '0.236': roundPrice(swingLow + range * 0.236, decimals),
        '0.382': roundPrice(swingLow + range * 0.382, decimals),
        '0.500': roundPrice(swingLow + range * 0.5, decimals),
        '0.618': roundPrice(swingLow + range * 0.618, decimals),
        '0.786': roundPrice(swingLow + range * 0.786, decimals),
      };

  const extensions = uptrend
    ? {
        '1.272': roundPrice(swingLow + range * 1.272, decimals),
        '1.618': roundPrice(swingLow + range * 1.618, decimals),
      }
    : {
        '1.272': roundPrice(swingHigh - range * 1.272, decimals),
        '1.618': roundPrice(swingHigh - range * 1.618, decimals),
      };

  return {
    swingHigh: roundPrice(swingHigh, decimals),
    swingLow: roundPrice(swingLow, decimals),
    direction: uptrend ? 'uptrend_retracement' : 'downtrend_retracement',
    retracements,
    extensions,
  };
}

export function calculateDeterministicIndicators(
  candles: OhlcvCandle[],
  sourceRef = 'ohlcv_series'
): ComputedIndicator[] {
  if (candles.length < 30) {
    return [
      {
        name: 'Technical Indicator Suite',
        value: null,
        interpretation:
          'Insufficient OHLCV candle history (minimum 30 candles required for deterministic calculations).',
        sourceType: 'unavailable',
        available: false,
        evidenceReferences: [],
      },
    ];
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const lastClose = closes[closes.length - 1];
  const decimals = detectDecimals(lastClose);

  const indicators: ComputedIndicator[] = [];

  const sma20 = SMA.calculate({ period: 20, values: closes });
  const sma50 = closes.length >= 50 ? SMA.calculate({ period: 50, values: closes }) : [];
  const ema20 = EMA.calculate({ period: 20, values: closes });
  const ema50 = closes.length >= 50 ? EMA.calculate({ period: 50, values: closes }) : [];

  if (sma20.length > 0) {
    const val = roundPrice(sma20[sma20.length - 1], decimals);
    indicators.push({
      name: 'SMA (20)',
      value: val,
      interpretation:
        lastClose > val
          ? `Price (${roundPrice(lastClose, decimals)}) is trading above the 20-period simple moving average.`
          : `Price (${roundPrice(lastClose, decimals)}) is trading below the 20-period simple moving average.`,
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  if (sma50.length > 0) {
    const val = roundPrice(sma50[sma50.length - 1], decimals);
    indicators.push({
      name: 'SMA (50)',
      value: val,
      interpretation:
        lastClose > val
          ? 'Price sits above the 50-period baseline, consistent with constructive medium-term structure.'
          : 'Price sits below the 50-period baseline, indicating overhead trend resistance.',
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  if (ema20.length > 0 && ema50.length > 0) {
    const e20 = roundPrice(ema20[ema20.length - 1], decimals);
    const e50 = roundPrice(ema50[ema50.length - 1], decimals);
    indicators.push({
      name: 'EMA (20 / 50)',
      value: `${e20} / ${e50}`,
      interpretation:
        e20 > e50
          ? 'Fast EMA(20) is positioned above slow EMA(50), reflecting upward momentum alignment.'
          : e20 < e50
            ? 'Fast EMA(20) is positioned below slow EMA(50), reflecting downward momentum alignment.'
            : 'EMA(20) and EMA(50) are converged, indicating neutral trend momentum.',
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  const rsi14 = RSI.calculate({ period: 14, values: closes });
  if (rsi14.length > 0) {
    const val = roundPrice(rsi14[rsi14.length - 1], 2);
    let interp = 'Momentum sits in neutral territory (30–70).';
    if (val >= 70) interp = 'RSI is above 70 (overbought territory); pullback or consolidation risk is elevated.';
    else if (val <= 30) interp = 'RSI is below 30 (oversold territory); mean-reversion bounce risk is elevated.';
    else if (val > 55) interp = 'RSI above 55 reflects constructive bullish momentum without extreme overextension.';
    else if (val < 45) interp = 'RSI below 45 reflects bearish momentum pressure without extreme oversold conditions.';

    indicators.push({
      name: 'RSI (14)',
      value: val,
      interpretation: interp,
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

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
    if (latest.MACD !== undefined && latest.signal !== undefined && latest.histogram !== undefined) {
      const mVal = roundPrice(latest.MACD, decimals);
      const sVal = roundPrice(latest.signal, decimals);
      const hVal = roundPrice(latest.histogram, decimals);
      indicators.push({
        name: 'MACD (12, 26, 9)',
        value: `Line ${mVal} · Signal ${sVal} · Hist ${hVal}`,
        interpretation:
          latest.histogram > 0
            ? 'MACD line is above its signal line with a positive histogram.'
            : 'MACD line is below its signal line with a negative histogram.',
        sourceType: 'calculated_ohlcv',
        available: true,
        evidenceReferences: [sourceRef],
      });
    }
  }

  const atr14 = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  if (atr14.length > 0) {
    const val = roundPrice(atr14[atr14.length - 1], decimals);
    const pct = roundPrice((val / lastClose) * 100, 2);
    indicators.push({
      name: 'ATR (14)',
      value: `${val} (${pct}%)`,
      interpretation: `Average per-bar trading range is approximately ${pct}% of last close price.`,
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  const bb = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
  if (bb.length > 0) {
    const latest = bb[bb.length - 1];
    const upper = roundPrice(latest.upper, decimals);
    const middle = roundPrice(latest.middle, decimals);
    const lower = roundPrice(latest.lower, decimals);
    const bandwidth = roundPrice(((latest.upper - latest.lower) / latest.middle) * 100, 2);
    indicators.push({
      name: 'Bollinger Bands (20, 2)',
      value: `${lower} / ${middle} / ${upper}`,
      interpretation: `Band width is ${bandwidth}%. Price is ${
        lastClose >= latest.upper
          ? 'testing or above the upper band'
          : lastClose <= latest.lower
            ? 'testing or below the lower band'
            : lastClose > latest.middle
              ? 'in the upper half of the band envelope'
              : 'in the lower half of the band envelope'
      }.`,
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  const stoch = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
  if (stoch.length > 0) {
    const latest = stoch[stoch.length - 1];
    if (latest.k !== undefined && latest.d !== undefined) {
      indicators.push({
        name: 'Stochastic (14, 3)',
        value: `%K ${roundPrice(latest.k, 1)} / %D ${roundPrice(latest.d, 1)}`,
        interpretation:
          latest.k > 80
            ? 'Stochastic oscillator is in the upper extreme (>80).'
            : latest.k < 20
              ? 'Stochastic oscillator is in the lower extreme (<20).'
              : 'Stochastic oscillator is within midrange levels.',
        sourceType: 'calculated_ohlcv',
        available: true,
        evidenceReferences: [sourceRef],
      });
    }
  }

  const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  if (adx.length > 0) {
    const latest = adx[adx.length - 1];
    indicators.push({
      name: 'ADX (14)',
      value: roundPrice(latest.adx, 1),
      interpretation:
        latest.adx >= 25
          ? `ADX of ${roundPrice(latest.adx, 1)} indicates an established directional trend.`
          : `ADX of ${roundPrice(latest.adx, 1)} suggests weak trend strength or range-bound conditions.`,
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  const hasVolume = volumes.some((v) => v > 0);
  if (hasVolume) {
    const vwap = VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });
    if (vwap.length > 0) {
      const val = roundPrice(vwap[vwap.length - 1], decimals);
      indicators.push({
        name: 'VWAP',
        value: val,
        interpretation:
          lastClose >= val
            ? 'Price is above volume-weighted average price for the sampled window.'
            : 'Price is below volume-weighted average price for the sampled window.',
        sourceType: 'calculated_ohlcv',
        available: true,
        evidenceReferences: [sourceRef],
      });
    }
  }

  const fib = computeFibonacciLevels(candles);
  if (fib) {
    indicators.push({
      name: 'Fibonacci (0.382 / 0.618)',
      value: `${fib.retracements['0.382']} / ${fib.retracements['0.618']}`,
      interpretation: `Calculated from swing low ${fib.swingLow} to swing high ${fib.swingHigh} (${fib.direction.replace('_', ' ')}).`,
      sourceType: 'calculated_ohlcv',
      available: true,
      evidenceReferences: [sourceRef],
    });
  }

  return indicators;
}

export interface RiskRewardResult {
  direction: 'long' | 'short';
  riskDistance: number;
  rewardDistance: number;
  ratio: number;
  formatted: string;
}

export function calculateHypotheticalRiskReward(
  entry: number,
  stopLoss: number,
  target: number
): RiskRewardResult | null {
  if (!Number.isFinite(entry) || !Number.isFinite(stopLoss) || !Number.isFinite(target)) {
    return null;
  }
  if (entry === stopLoss || entry === target) return null;

  const isLong = target > entry && stopLoss < entry;
  const isShort = target < entry && stopLoss > entry;
  if (!isLong && !isShort) return null;

  const riskDistance = Math.abs(entry - stopLoss);
  const rewardDistance = Math.abs(target - entry);
  const ratio = roundPrice(rewardDistance / riskDistance, 2);

  return {
    direction: isLong ? 'long' : 'short',
    riskDistance: roundPrice(riskDistance, detectDecimals(entry)),
    rewardDistance: roundPrice(rewardDistance, detectDecimals(entry)),
    ratio,
    formatted: `1 : ${ratio.toFixed(2)}`,
  };
}

export type DemoScenarioId = 'btc_uptrend' | 'eurusd_range' | 'spx_pullback';

export interface DemoFixture {
  id: DemoScenarioId;
  symbol: string;
  market: string;
  exchange: string;
  timeframe: string;
  label: string;
  description: string;
  candles: OhlcvCandle[];
}

export function generateDeterministicSampleCandles(scenario: DemoScenarioId): DemoFixture {
  const count = 80;
  const startTime = 1761955200; // Deterministic UTC timestamp
  const stepSeconds = scenario === 'eurusd_range' ? 3600 : 14400; // 1H or 4H

  let basePrice = 84200;
  let drift = 125;
  let amp = 920;
  let volBase = 1450;

  if (scenario === 'eurusd_range') {
    basePrice = 1.084;
    drift = 0.00004;
    amp = 0.0052;
    volBase = 3200;
  } else if (scenario === 'spx_pullback') {
    basePrice = 6120;
    drift = -3.8;
    amp = 32;
    volBase = 89000;
  }

  const candles: OhlcvCandle[] = [];
  let prevClose = basePrice;

  for (let i = 0; i < count; i++) {
    const wave1 = Math.sin(i * 0.27) * amp;
    const wave2 = Math.cos(i * 0.63) * (amp * 0.42);
    const pseudo = Math.sin(i * 1.91 + 0.7) * (amp * 0.25);

    let trendShift = drift * i;
    if (scenario === 'spx_pullback' && i < 32) {
      trendShift = 4.2 * i;
    } else if (scenario === 'spx_pullback' && i >= 32) {
      trendShift = 4.2 * 32 - 5.1 * (i - 32);
    }

    const targetClose = basePrice + trendShift + wave1 + wave2 + pseudo;
    const open = prevClose;
    const close = targetClose;
    const spread = Math.abs(close - open);
    const wickUp = Math.abs(Math.sin(i * 2.3)) * (amp * 0.35) + spread * 0.2;
    const wickDown = Math.abs(Math.cos(i * 1.7)) * (amp * 0.35) + spread * 0.2;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;
    const decimals = detectDecimals(basePrice);

    candles.push({
      time: startTime + i * stepSeconds,
      open: roundPrice(open, decimals),
      high: roundPrice(high, decimals),
      low: roundPrice(low, decimals),
      close: roundPrice(close, decimals),
      volume: Math.round(volBase * (0.7 + Math.abs(Math.sin(i * 0.85)) * 0.9)),
    });

    prevClose = close;
  }

  if (scenario === 'eurusd_range') {
    return {
      id: scenario,
      symbol: 'EUR/USD',
      market: 'Forex',
      exchange: 'Synthetic Sample Fixture',
      timeframe: '1H',
      label: 'EUR/USD · 1H Range Consolidation (Sample Fixture)',
      description: 'Deterministic horizontal range fixture illustrating support/resistance boundaries and neutral ADX.',
      candles,
    };
  }

  if (scenario === 'spx_pullback') {
    return {
      id: scenario,
      symbol: 'SPX500',
      market: 'Indices',
      exchange: 'Synthetic Sample Fixture',
      timeframe: '4H',
      label: 'SPX500 · 4H Lower-High Pullback (Sample Fixture)',
      description: 'Deterministic distribution and lower-high pullback fixture illustrating bearish structure and risk bounds.',
      candles,
    };
  }

  return {
    id: scenario,
    symbol: 'BTC/USDT',
    market: 'Crypto',
    exchange: 'Synthetic Sample Fixture',
    timeframe: '4H',
    label: 'BTC/USDT · 4H Ascending Structure (Sample Fixture)',
    description: 'Deterministic higher-high / higher-low uptrend fixture illustrating trend continuation and invalidation levels.',
    candles,
  };
}
