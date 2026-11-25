import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlertHistoryStats,
  buildPortfolioPerformanceSeries,
  buildPortfolioSummary,
  computeAlertOutcomeMetrics,
  computeHoldingValuation,
  evaluatePriceAlert,
} from '../../src/utils/portfolioAndAlerts';
import { generatePortfolioPdfBuffer } from '../../src/server/portfolioPdf';
import {
  buildPortfolioMarketSentiment,
  computeAssetTechnicalSentiment,
} from '../../src/utils/marketSentiment';
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

test('computeAlertOutcomeMetrics and buildAlertHistoryStats evaluate post-trigger follow-through accurately', () => {
  const favAbove = computeAlertOutcomeMetrics('above', 60000, 60100, 62000);
  assert.equal(favAbove.followThrough, 'favorable');
  assert.ok(favAbove.postTriggerMovePercent !== null && favAbove.postTriggerMovePercent > 3);

  const revAbove = computeAlertOutcomeMetrics('above', 60000, 60100, 58500);
  assert.equal(revAbove.followThrough, 'reversed');
  assert.ok(revAbove.postTriggerMovePercent !== null && revAbove.postTriggerMovePercent < 0);

  const favBelow = computeAlertOutcomeMetrics('below', 2000, 1990, 1900);
  assert.equal(favBelow.followThrough, 'favorable');

  const noFeed = computeAlertOutcomeMetrics('above', 100, 101, null);
  assert.equal(noFeed.followThrough, 'unavailable');

  const stats = buildAlertHistoryStats([
    {
      id: 'h1',
      alertId: 'a1',
      symbol: 'BTCUSDT',
      market: 'Crypto',
      condition: 'above',
      targetPrice: 60000,
      triggeredPrice: 60100,
      alertNote: '',
      outcomeStatus: 'actioned',
      outcomeNote: 'Entered long',
      triggeredAt: '2026-11-25T10:00:00Z',
      reviewedAt: '2026-11-25T11:00:00Z',
      metrics: favAbove,
    },
    {
      id: 'h2',
      alertId: 'a2',
      symbol: 'ETHUSDT',
      market: 'Crypto',
      condition: 'above',
      targetPrice: 2000,
      triggeredPrice: 2010,
      alertNote: '',
      outcomeStatus: 'pending_review',
      outcomeNote: '',
      triggeredAt: '2026-11-25T12:00:00Z',
      reviewedAt: null,
      metrics: revAbove,
    },
  ]);

  assert.equal(stats.totalTriggered, 2);
  assert.equal(stats.reviewedCount, 1);
  assert.equal(stats.pendingReviewCount, 1);
  assert.equal(stats.actionedCount, 1);
  assert.equal(stats.evaluableFollowThroughCount, 2);
  assert.equal(stats.followThroughRatePercent, 50);
});

test('generatePortfolioPdfBuffer builds a valid PDF document with holdings and curve', async () => {
  const summary = buildPortfolioSummary([
    {
      holding: { id: '1', symbol: 'BTCUSDT', market: 'Crypto', quantity: 0.5, avgCost: 50000 },
      livePrice: 60000,
      change24hPercent: 2.5,
    },
  ]);
  const day = 86400;
  const baseTs = 1760000000 - (1760000000 % day);
  const performance = buildPortfolioPerformanceSeries(
    [
      {
        holding: { id: '1', symbol: 'BTCUSDT', market: 'Crypto', quantity: 0.5, avgCost: 50000 },
        candles: [
          { time: baseTs, open: 50000, high: 52000, low: 49500, close: 51000, volume: 10 },
          { time: baseTs + day, open: 51000, high: 61000, low: 50800, close: 60000, volume: 15 },
        ],
      },
    ],
    30
  );

  const pdfBuffer = await generatePortfolioPdfBuffer({
    ownerName: 'Alex Trader',
    ownerEmail: 'alex@example.com',
    rangeDays: 30,
    generatedAt: '2026-11-25T16:00:00Z',
    summary,
    performance,
  });

  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 1200, 'Expected non-trivial PDF size');
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
  const rawPdf = pdfBuffer.toString('latin1');
  assert.ok(rawPdf.includes('%%EOF'));
  assert.ok(rawPdf.includes('/Count 1'), 'Expected 1-page PDF with zero blank overflow pages');
});

test('computeAssetTechnicalSentiment and buildPortfolioMarketSentiment score uptrends bullish and downtrends bearish', () => {
  const day = 86400;
  const baseTs = 1760000000;
  const uptrendCandles: OhlcvCandle[] = Array.from({ length: 70 }, (_, i) => {
    const close = 100 + i * 2.5 + (i % 2 === 0 ? 0.5 : -0.2);
    return {
      time: baseTs + i * day,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000,
    };
  });
  const downtrendCandles: OhlcvCandle[] = Array.from({ length: 70 }, (_, i) => {
    const close = 300 - i * 2.5 + (i % 2 === 0 ? -0.5 : 0.2);
    return {
      time: baseTs + i * day,
      open: close + 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000,
    };
  });

  const bullAsset = computeAssetTechnicalSentiment('BTCUSDT', 'Crypto', 30000, uptrendCandles);
  assert.equal(bullAsset.available, true);
  assert.ok(bullAsset.score !== null && bullAsset.score >= 70, `Expected bullish score >=70, got ${bullAsset.score}`);
  assert.equal(bullAsset.label, 'Strong Bullish');
  assert.equal(bullAsset.signals.length, 5);

  const bearAsset = computeAssetTechnicalSentiment('ETHUSDT', 'Crypto', 10000, downtrendCandles);
  assert.equal(bearAsset.available, true);
  assert.ok(bearAsset.score !== null && bearAsset.score <= 30, `Expected bearish score <=30, got ${bearAsset.score}`);
  assert.equal(bearAsset.label, 'Strong Bearish');

  const portfolioSentiment = buildPortfolioMarketSentiment([
    { symbol: 'BTCUSDT', market: 'Crypto', currentValue: 30000, candles: uptrendCandles },
    { symbol: 'ETHUSDT', market: 'Crypto', currentValue: 10000, candles: downtrendCandles },
    { symbol: 'AAPL', market: 'Stocks', currentValue: 5000, candles: null },
  ]);

  assert.equal(portfolioSentiment.totalHoldingsCount, 3);
  assert.equal(portfolioSentiment.scoredHoldingsCount, 2);
  // 75% weight on Strong Bullish (100) + 25% weight on Strong Bearish (0) => ~75 Strong Bullish
  assert.ok(
    portfolioSentiment.overallScore !== null && portfolioSentiment.overallScore >= 60,
    `Expected weighted bullish score >= 60, got ${portfolioSentiment.overallScore}`
  );
  assert.equal(portfolioSentiment.assets[2].available, false);
});


