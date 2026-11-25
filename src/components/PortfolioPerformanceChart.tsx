import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import type { PortfolioPerformancePoint } from '../utils/portfolioAndAlerts';

interface PortfolioPerformanceChartProps {
  points: PortfolioPerformancePoint[];
  costBasis: number;
  theme: 'dark' | 'light';
  height?: number;
}

export function PortfolioPerformanceChart({
  points,
  costBasis,
  theme,
  height = 220,
}: PortfolioPerformanceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    const isDark = theme === 'dark';
    const lastVal = points[points.length - 1]?.value ?? costBasis;
    const isPositive = lastVal >= costBasis;

    const chart: IChartApi = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0B0B0E' : '#FFFFFF' },
        textColor: isDark ? '#A1A1AA' : '#52525B',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(39, 39, 42, 0.45)' : 'rgba(228, 228, 231, 0.7)' },
        horzLines: { color: isDark ? 'rgba(39, 39, 42, 0.45)' : 'rgba(228, 228, 231, 0.7)' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#27272A' : '#E4E4E7',
      },
      timeScale: {
        borderColor: isDark ? '#27272A' : '#E4E4E7',
        timeVisible: points.length > 0 && points.length <= 45,
      },
      crosshair: {
        vertLine: { color: isDark ? '#52525B' : '#A1A1AA', width: 1 },
        horzLine: { color: isDark ? '#52525B' : '#A1A1AA', width: 1 },
      },
    });

    const strokeColor = isPositive ? '#22C55E' : '#EF4444';
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: strokeColor,
      topColor: isPositive ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.25)',
      bottomColor: isPositive ? 'rgba(34, 197, 94, 0.0)' : 'rgba(239, 68, 68, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Deduplicate & sort strictly ascending timestamps for Lightweight Charts v5
    const dedup = new Map<number, number>();
    for (const p of points) {
      dedup.set(p.time, p.value);
    }
    const sorted = Array.from(dedup.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as Time, value: v }));

    areaSeries.setData(sorted);

    if (costBasis > 0) {
      areaSeries.createPriceLine({
        price: costBasis,
        color: isDark ? '#71717A' : '#71717A',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Cost Basis',
      });
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [points, costBasis, theme, height]);

  return (
    <div
      ref={containerRef}
      data-testid="portfolio-performance-chart"
      className="w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
      style={{ height }}
    />
  );
}
