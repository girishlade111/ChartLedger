import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortfolioPerformanceSeries,
  buildPortfolioSummary,
  computeHoldingValuation,
  evaluatePriceAlert,
} from '../../src/utils/portfolioAndAlerts';
import type { OhlcvCandle } from '../../src/utils/indicators';

test('evaluatePriceAlert triggers accurately for above/below conditions and respects paused/triggered status', () => {
  const aboveHit = evaluatePriceAlert(
    { condition: 'above', targetPrice: 90000, status: 'active' },
    91500
  );
  assert.equal(aboveHit.shouldTrigger, true);
  assert.ok(aboveHit.distancePercent !== null && aboveHit.distancePercent < 0);

  const aboveMiss = evaluatePriceAlert(
    { condition: 'above', targetPrice: 95000, status: 'active' },
    91500
  );
  assert.equal(aboveMiss.shouldTrigger, false);

  const belowHit = evaluatePriceAlert(
    { condition: 'below', targetPrice: 3200, status: 'active' },
    3150
  );
  assert.equal(belowHit.shouldTrigger, true);

  const paused = evaluatePriceAlert(
    { condition: 'below', targetPrice: 3200, status: 'paused' },
    3000
  );
  assert.equal(paused.shouldTrigger, false);

  const noPrice = evaluatePriceAlert(
    { condition: 'above', targetPrice: 100, status: 'active' },
    null
  );
  assert.equal(noPrice.shouldTrigger, false);
  assert.equal(noPrice.distancePercent, null);
});

test('computeHoldingValuation and buildPortfolioSummary calculate cost basis, P&L, and allocations accurately', () => {
  const btc = computeHoldingValuation(
    { id: '1', symbol: 'BTCUSDT', market: 'Crypto', quantity: 0.5, avgCost: 60000 },
    80000,
    4.5,
    'Spot Feed',
    '2026-11-25T15:00:00Z'
  );
  assert.equal(btc.costBasis, 30000);
  assert.equal(btc.currentValue, 40000);
  assert.equal(btc.unrealizedPnl, 10000);
  assert.equal(btc.unrealizedPnlPercent, 33.33);

  const summary = buildPortfolioSummary([
    {
      holding: { id: '1', symbol: 'BTCUSDT', market: 'Crypto', quantity: 0.5, avgCost: 60000 },
      livePrice: 80000,
      change24hPercent: 4.0,
    },
    {
      holding: { id: '2', symbol: 'ETHUSDT', market: 'Crypto', quantity: 10, avgCost: 2500 },
      livePrice: 2000,
      change24hPercent: -2.0,
    },
  ]);

  assert.equal(summary.totalCostBasis, 55000);
  assert.equal(summary.totalCurrentValue, 60000);
  assert.equal(summary.totalUnrealizedPnl, 5000);
  assert.equal(summary.liveCoverageCount, 2);
  // Allocation percentages should sum to 100
  const allocSum = summary.holdings.reduce((a, h) => a + h.allocationPercent, 0);
  assert.ok(Math.abs(allocSum - 100) < 0.1);
  // Weighted 24h change: (40000 * 4 + 20000 * -2) / 60000 = 2.0%
  assert.equal(summary.weightedChange24hPercent, 2);
});

test('buildPortfolioPerformanceSeries aligns multi-asset historical OHLCV and handles cost-basis fallback', () => {
  const day = 86400;
  const baseTs = 1760000000 - (1760000000 % day);
  const btcCandles: OhlcvCandle[] = [
    { time: baseTs, open: 50000, high: 51000, low: 49500, close: 50000, volume: 100 },
    { time: baseTs + day, open: 50000, high: 56000, low: 49900, close: 55000, volume: 110 },
    { time: baseTs + 2 * day, open: 55000, high: 61000, low: 54500, close: 60000, volume: 120 },
  ];

  const series = buildPortfolioPerformanceSeries(
    [
      {
        holding: { id: '1', symbol: 'BTCUSDT', market: 'Crypto', quantity: 1, avgCost: 50000 },
        candles: btcCandles,
      },
      {
        holding: { id: '2', symbol: 'AAPL', market: 'Stocks', quantity: 10, avgCost: 200 },
        candles: null,
      },
    ],
    30
  );

  assert.equal(series.liveHistoricalAssets, 1);
  assert.equal(series.costBasisFallbackAssets, 1);
  assert.equal(series.points.length, 3);
  // Day 0: 50000 + 2000 = 52000; Day 2: 60000 + 2000 = 62000
  assert.equal(series.points[0].value, 52000);
  assert.equal(series.points[2].value, 62000);
  assert.equal(series.periodChangeValue, 10000);
});
