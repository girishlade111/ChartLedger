import type { OhlcvCandle } from './indicators';

export type PriceAlertCondition = 'above' | 'below';
export type PriceAlertStatus = 'active' | 'paused' | 'triggered';

export interface PriceAlertInput {
  condition: PriceAlertCondition;
  targetPrice: number;
  status: PriceAlertStatus;
}

export interface PriceAlertEvaluation {
  shouldTrigger: boolean;
  distancePercent: number | null;
  distanceAmount: number | null;
}

export function evaluatePriceAlert(
  alert: PriceAlertInput,
  currentPrice: number | null
): PriceAlertEvaluation {
  if (
    currentPrice === null ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(alert.targetPrice) ||
    alert.targetPrice <= 0
  ) {
    return { shouldTrigger: false, distancePercent: null, distanceAmount: null };
  }

  const distanceAmount = Number((alert.targetPrice - currentPrice).toFixed(6));
  const distancePercent =
    Math.round(((alert.targetPrice - currentPrice) / currentPrice) * 10000) / 100;

  if (alert.status !== 'active') {
    return { shouldTrigger: false, distancePercent, distanceAmount };
  }

  const shouldTrigger =
    alert.condition === 'above'
      ? currentPrice >= alert.targetPrice
      : currentPrice <= alert.targetPrice;

  return { shouldTrigger, distancePercent, distanceAmount };
}

export interface PortfolioHoldingInput {
  id: string;
  symbol: string;
  market: string;
  quantity: number;
  avgCost: number;
  notes?: string;
}

export interface EnrichedHolding extends PortfolioHoldingInput {
  livePrice: number | null;
  change24hPercent: number | null;
  sourceName: string | null;
  fetchedAt: string | null;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  allocationPercent: number;
  hasLivePrice: boolean;
}

export interface PortfolioSummary {
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  weightedChange24hPercent: number | null;
  holdingCount: number;
  liveCoverageCount: number;
  holdings: EnrichedHolding[];
}

export function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

export function computeHoldingValuation(
  holding: PortfolioHoldingInput,
  livePrice: number | null,
  change24hPercent: number | null,
  sourceName: string | null = null,
  fetchedAt: string | null = null
): Omit<EnrichedHolding, 'allocationPercent'> {
  const safeQty = Math.max(0, Number.isFinite(holding.quantity) ? holding.quantity : 0);
  const safeAvg = Math.max(0, Number.isFinite(holding.avgCost) ? holding.avgCost : 0);
  const hasLivePrice =
    livePrice !== null && Number.isFinite(livePrice) && livePrice > 0;
  const effectivePrice = hasLivePrice ? livePrice : safeAvg;

  const costBasis = roundMoney(safeQty * safeAvg);
  const currentValue = roundMoney(safeQty * effectivePrice);
  const unrealizedPnl = roundMoney(currentValue - costBasis);
  const unrealizedPnlPercent =
    costBasis > 0 ? Math.round((unrealizedPnl / costBasis) * 10000) / 100 : 0;

  return {
    ...holding,
    quantity: safeQty,
    avgCost: safeAvg,
    livePrice: hasLivePrice ? livePrice : null,
    change24hPercent: hasLivePrice ? change24hPercent : null,
    sourceName: hasLivePrice ? sourceName : null,
    fetchedAt: hasLivePrice ? fetchedAt : null,
    costBasis,
    currentValue,
    unrealizedPnl,
    unrealizedPnlPercent,
    hasLivePrice,
  };
}

export function buildPortfolioSummary(
  items: Array<{
    holding: PortfolioHoldingInput;
    livePrice: number | null;
    change24hPercent: number | null;
    sourceName?: string | null;
    fetchedAt?: string | null;
  }>
): PortfolioSummary {
  const prelim = items.map((item) =>
    computeHoldingValuation(
      item.holding,
      item.livePrice,
      item.change24hPercent,
      item.sourceName ?? null,
      item.fetchedAt ?? null
    )
  );

  const totalCostBasis = roundMoney(prelim.reduce((acc, h) => acc + h.costBasis, 0));
  const totalCurrentValue = roundMoney(prelim.reduce((acc, h) => acc + h.currentValue, 0));
  const totalUnrealizedPnl = roundMoney(totalCurrentValue - totalCostBasis);
  const totalUnrealizedPnlPercent =
    totalCostBasis > 0
      ? Math.round((totalUnrealizedPnl / totalCostBasis) * 10000) / 100
      : 0;

  let weighted24hNum = 0;
  let weighted24hDen = 0;
  let liveCoverageCount = 0;

  const holdings: EnrichedHolding[] = prelim.map((h) => {
    if (h.hasLivePrice) {
      liveCoverageCount += 1;
      if (h.change24hPercent !== null && Number.isFinite(h.change24hPercent)) {
        weighted24hNum += h.currentValue * h.change24hPercent;
        weighted24hDen += h.currentValue;
      }
    }
    const allocationPercent =
      totalCurrentValue > 0
        ? Math.round((h.currentValue / totalCurrentValue) * 10000) / 100
        : 0;
    return { ...h, allocationPercent };
  });

  holdings.sort((a, b) => b.currentValue - a.currentValue);

  const weightedChange24hPercent =
    weighted24hDen > 0 ? Math.round((weighted24hNum / weighted24hDen) * 100) / 100 : null;

  return {
    totalCostBasis,
    totalCurrentValue,
    totalUnrealizedPnl,
    totalUnrealizedPnlPercent,
    weightedChange24hPercent,
    holdingCount: holdings.length,
    liveCoverageCount,
    holdings,
  };
}

export interface PortfolioPerformancePoint {
  time: number; // unix seconds
  value: number;
  costBasis: number;
  returnPercent: number;
}

export interface PortfolioPerformanceSeries {
  rangeDays: number;
  points: PortfolioPerformancePoint[];
  periodChangeValue: number;
  periodChangePercent: number;
  liveHistoricalAssets: number;
  costBasisFallbackAssets: number;
}

export function buildPortfolioPerformanceSeries(
  items: Array<{
    holding: PortfolioHoldingInput;
    candles: OhlcvCandle[] | null;
  }>,
  rangeDays: number
): PortfolioPerformanceSeries {
  if (items.length === 0) {
    return {
      rangeDays,
      points: [],
      periodChangeValue: 0,
      periodChangePercent: 0,
      liveHistoricalAssets: 0,
      costBasisFallbackAssets: 0,
    };
  }

  const totalCostBasis = roundMoney(
    items.reduce((sum, i) => sum + Math.max(0, i.holding.quantity) * Math.max(0, i.holding.avgCost), 0)
  );

  // Collect reference timestamps from holdings that have historical OHLCV candles
  const timestampSet = new Set<number>();
  let liveHistoricalAssets = 0;
  let costBasisFallbackAssets = 0;

  const candleMaps = items.map((item) => {
    const map = new Map<number, number>();
    if (item.candles && item.candles.length > 0) {
      liveHistoricalAssets += 1;
      const sliced = item.candles.slice(-rangeDays);
      for (const c of sliced) {
        // Normalize to UTC midnight for clean cross-asset daily alignment when range >= 14D
        const bucket = rangeDays >= 14 ? Math.floor(c.time / 86400) * 86400 : c.time;
        map.set(bucket, c.close);
        timestampSet.add(bucket);
      }
    } else {
      costBasisFallbackAssets += 1;
    }
    return {
      holding: item.holding,
      map,
      sortedKeys: Array.from(map.keys()).sort((a, b) => a - b),
    };
  });

  const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);

  // If no holding has external historical candles, return a flat cost-basis baseline series
  if (sortedTimestamps.length === 0) {
    const nowDay = Math.floor(Date.now() / 86400000) * 86400;
    const points: PortfolioPerformancePoint[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      points.push({
        time: nowDay - i * 86400,
        value: totalCostBasis,
        costBasis: totalCostBasis,
        returnPercent: 0,
      });
    }
    return {
      rangeDays,
      points,
      periodChangeValue: 0,
      periodChangePercent: 0,
      liveHistoricalAssets: 0,
      costBasisFallbackAssets,
    };
  }

  const points: PortfolioPerformancePoint[] = sortedTimestamps.map((ts) => {
    let val = 0;
    for (const entry of candleMaps) {
      const qty = Math.max(0, entry.holding.quantity);
      let price = entry.holding.avgCost;
      if (entry.map.has(ts)) {
        price = entry.map.get(ts)!;
      } else if (entry.sortedKeys.length > 0) {
        // Carry forward last known close at or prior to ts, otherwise earliest close
        let fallback = entry.map.get(entry.sortedKeys[0])!;
        for (const k of entry.sortedKeys) {
          if (k <= ts) fallback = entry.map.get(k)!;
          else break;
        }
        price = fallback;
      }
      val += qty * price;
    }

    const roundedVal = roundMoney(val);
    const returnPercent =
      totalCostBasis > 0
        ? Math.round(((roundedVal - totalCostBasis) / totalCostBasis) * 10000) / 100
        : 0;
    return {
      time: ts,
      value: roundedVal,
      costBasis: totalCostBasis,
      returnPercent,
    };
  });

  const firstVal = points[0]?.value ?? totalCostBasis;
  const lastVal = points[points.length - 1]?.value ?? totalCostBasis;
  const periodChangeValue = roundMoney(lastVal - firstVal);
  const periodChangePercent =
    firstVal > 0 ? Math.round((periodChangeValue / firstVal) * 10000) / 100 : 0;

  return {
    rangeDays,
    points,
    periodChangeValue,
    periodChangePercent,
    liveHistoricalAssets,
    costBasisFallbackAssets,
  };
}

export type AlertOutcomeStatus =
  | 'pending_review'
  | 'actioned'
  | 'confirmed_move'
  | 'false_breakout'
  | 'ignored';

export type AlertFollowThrough = 'favorable' | 'reversed' | 'flat' | 'unavailable';

export interface AlertHistoryEntryInput {
  id: string;
  alertId: string | null;
  symbol: string;
  market: string;
  condition: PriceAlertCondition;
  targetPrice: number;
  triggeredPrice: number;
  alertNote: string;
  outcomeStatus: AlertOutcomeStatus;
  outcomeNote: string;
  triggeredAt: string;
  reviewedAt: string | null;
}

export interface AlertOutcomeMetrics {
  breachDeltaAmount: number;
  breachDeltaPercent: number;
  currentPrice: number | null;
  postTriggerMoveAmount: number | null;
  postTriggerMovePercent: number | null;
  followThrough: AlertFollowThrough;
}

export interface EnrichedAlertHistoryEntry extends AlertHistoryEntryInput {
  metrics: AlertOutcomeMetrics;
}

export interface AlertHistoryStats {
  totalTriggered: number;
  pendingReviewCount: number;
  reviewedCount: number;
  actionedCount: number;
  confirmedMoveCount: number;
  falseBreakoutCount: number;
  favorableFollowThroughCount: number;
  evaluableFollowThroughCount: number;
  followThroughRatePercent: number | null;
}

export function computeAlertOutcomeMetrics(
  condition: PriceAlertCondition,
  targetPrice: number,
  triggeredPrice: number,
  currentPrice: number | null
): AlertOutcomeMetrics {
  const breachDeltaAmount = Number((triggeredPrice - targetPrice).toFixed(6));
  const breachDeltaPercent =
    targetPrice > 0
      ? Math.round(((triggeredPrice - targetPrice) / targetPrice) * 10000) / 100
      : 0;

  if (
    currentPrice === null ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(triggeredPrice) ||
    triggeredPrice <= 0
  ) {
    return {
      breachDeltaAmount,
      breachDeltaPercent,
      currentPrice: null,
      postTriggerMoveAmount: null,
      postTriggerMovePercent: null,
      followThrough: 'unavailable',
    };
  }

  const postTriggerMoveAmount = Number((currentPrice - triggeredPrice).toFixed(6));
  const postTriggerMovePercent =
    Math.round(((currentPrice - triggeredPrice) / triggeredPrice) * 10000) / 100;

  let followThrough: AlertFollowThrough = 'flat';
  if (Math.abs(postTriggerMovePercent) >= 0.05) {
    const movedUp = currentPrice > triggeredPrice;
    if ((condition === 'above' && movedUp) || (condition === 'below' && !movedUp)) {
      followThrough = 'favorable';
    } else {
      followThrough = 'reversed';
    }
  }

  return {
    breachDeltaAmount,
    breachDeltaPercent,
    currentPrice,
    postTriggerMoveAmount,
    postTriggerMovePercent,
    followThrough,
  };
}

export function buildAlertHistoryStats(
  entries: EnrichedAlertHistoryEntry[]
): AlertHistoryStats {
  let pendingReviewCount = 0;
  let actionedCount = 0;
  let confirmedMoveCount = 0;
  let falseBreakoutCount = 0;
  let favorableFollowThroughCount = 0;
  let evaluableFollowThroughCount = 0;

  for (const e of entries) {
    if (e.outcomeStatus === 'pending_review') pendingReviewCount += 1;
    if (e.outcomeStatus === 'actioned') actionedCount += 1;
    if (e.outcomeStatus === 'confirmed_move') confirmedMoveCount += 1;
    if (e.outcomeStatus === 'false_breakout') falseBreakoutCount += 1;

    if (e.metrics.followThrough === 'favorable' || e.metrics.followThrough === 'reversed') {
      evaluableFollowThroughCount += 1;
      if (e.metrics.followThrough === 'favorable') {
        favorableFollowThroughCount += 1;
      }
    }
  }

  const totalTriggered = entries.length;
  const reviewedCount = totalTriggered - pendingReviewCount;
  const followThroughRatePercent =
    evaluableFollowThroughCount > 0
      ? Math.round((favorableFollowThroughCount / evaluableFollowThroughCount) * 10000) / 100
      : null;

  return {
    totalTriggered,
    pendingReviewCount,
    reviewedCount,
    actionedCount,
    confirmedMoveCount,
    falseBreakoutCount,
    favorableFollowThroughCount,
    evaluableFollowThroughCount,
    followThroughRatePercent,
  };
}

