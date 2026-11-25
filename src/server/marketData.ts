import {
  DemoScenarioId,
  OhlcvCandle,
  generateDeterministicSampleCandles,
} from '../utils/indicators.ts';

export interface MarketDataResult {
  sourceName: string;
  sourceType: 'external_market_data' | 'synthetic_sample_fixture';
  symbol: string;
  normalizedSymbol: string;
  timeframe: string;
  exchange: string;
  fetchedAt: string;
  freshness: 'live_public_spot' | 'synthetic_demo';
  lastPrice: number;
  change24hPercent: number | null;
  candles: OhlcvCandle[];
  attribution: string;
}

const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '6h': '6h',
  '12h': '12h',
  '1d': '1d',
  '1w': '1w',
  d: '1d',
  daily: '1d',
  weekly: '1w',
  w: '1w',
};

const cache = new Map<string, { expiresAt: number; data: MarketDataResult }>();

export function normalizeCryptoSymbol(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned || cleaned.length < 4 || cleaned.length > 12) return null;
  if (cleaned.endsWith('USDT') || cleaned.endsWith('USDC') || cleaned.endsWith('BUSD')) {
    return cleaned;
  }
  const commonBases = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'MATIC', 'ARB', 'OP']);
  if (commonBases.has(cleaned)) {
    return `${cleaned}USDT`;
  }
  if (cleaned.endsWith('USD') && commonBases.has(cleaned.slice(0, -3))) {
    return `${cleaned.slice(0, -3)}USDT`;
  }
  return null;
}

export function normalizeTimeframe(raw?: string | null): string {
  if (!raw) return '4h';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  return TIMEFRAME_MAP[key] || '4h';
}

export async function fetchCryptoMarketData(
  rawSymbol: string,
  rawTimeframe?: string | null
): Promise<MarketDataResult | null> {
  const normalized = normalizeCryptoSymbol(rawSymbol);
  if (!normalized) return null;

  const interval = normalizeTimeframe(rawTimeframe);
  const cacheKey = `${normalized}:${interval}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const klineUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(
      normalized
    )}&interval=${encodeURIComponent(interval)}&limit=100`;
    const tickerUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(
      normalized
    )}`;

    const [klineRes, tickerRes] = await Promise.all([
      fetch(klineUrl, { signal: controller.signal }),
      fetch(tickerUrl, { signal: controller.signal }).catch(() => null),
    ]);
    clearTimeout(timeout);

    if (!klineRes.ok) return null;
    const rawKlines = (await klineRes.json()) as unknown[];
    if (!Array.isArray(rawKlines) || rawKlines.length < 20) return null;

    const candles: OhlcvCandle[] = rawKlines.map((row: any) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));

    let change24hPercent: number | null = null;
    if (tickerRes && tickerRes.ok) {
      const ticker = (await tickerRes.json()) as { priceChangePercent?: string };
      if (ticker.priceChangePercent) {
        change24hPercent = Math.round(Number(ticker.priceChangePercent) * 100) / 100;
      }
    }

    const lastPrice = candles[candles.length - 1].close;
    const result: MarketDataResult = {
      sourceName: 'Binance Public Spot API',
      sourceType: 'external_market_data',
      symbol: rawSymbol.toUpperCase(),
      normalizedSymbol: normalized,
      timeframe: interval.toUpperCase(),
      exchange: 'Binance Spot',
      fetchedAt: new Date().toISOString(),
      freshness: 'live_public_spot',
      lastPrice,
      change24hPercent,
      candles,
      attribution: 'Public OHLCV market data via Binance Spot REST API (non-advisory reference).',
    };

    cache.set(cacheKey, { expiresAt: Date.now() + 60_000, data: result });
    return result;
  } catch {
    return null;
  }
}

export function getSampleMarketData(scenario: DemoScenarioId): MarketDataResult {
  const fixture = generateDeterministicSampleCandles(scenario);
  const firstClose = fixture.candles[0].close;
  const lastClose = fixture.candles[fixture.candles.length - 1].close;
  const changePct = Math.round(((lastClose - firstClose) / firstClose) * 10000) / 100;

  return {
    sourceName: 'ChartLedger Synthetic Sample Fixture',
    sourceType: 'synthetic_sample_fixture',
    symbol: fixture.symbol,
    normalizedSymbol: fixture.symbol.replace('/', ''),
    timeframe: fixture.timeframe,
    exchange: fixture.exchange,
    fetchedAt: new Date().toISOString(),
    freshness: 'synthetic_demo',
    lastPrice: lastClose,
    change24hPercent: changePct,
    candles: fixture.candles,
    attribution: 'Clearly labeled deterministic synthetic sample OHLCV data for demonstration only.',
  };
}
