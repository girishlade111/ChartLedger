import { useEffect, useRef } from 'react';
import { CandlestickSeries, ColorType, createChart, HistogramSeries } from 'lightweight-charts';
import type { OhlcvCandle } from '../utils/indicators';

interface CandlestickChartProps {
  candles: OhlcvCandle[];
  theme: 'dark' | 'light';
  height?: number;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
}

export function CandlestickChart({
  candles,
  theme,
  height = 340,
  supportLevel,
  resistanceLevel,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      height,
      width: el.clientWidth || 640,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#111114' : '#FFFFFF' },
        textColor: isDark ? '#A1A1AA' : '#52525B',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? '#1F1F23' : '#F4F4F5' },
        horzLines: { color: isDark ? '#1F1F23' : '#F4F4F5' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#27272A' : '#E4E4E7',
      },
      timeScale: {
        borderColor: isDark ? '#27272A' : '#E4E4E7',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16A34A',
      downColor: '#DC2626',
      borderVisible: false,
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    if (typeof supportLevel === 'number' && Number.isFinite(supportLevel)) {
      candleSeries.createPriceLine({
        price: supportLevel,
        color: '#22C55E',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Support',
      });
    }

    if (typeof resistanceLevel === 'number' && Number.isFinite(resistanceLevel)) {
      candleSeries.createPriceLine({
        price: resistanceLevel,
        color: '#EF4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Resistance',
      });
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      }))
    );

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        chart.applyOptions({ width: el.clientWidth });
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, theme, height, supportLevel, resistanceLevel]);

  return (
    <div
      ref={containerRef}
      data-testid="candlestick-chart"
      className="w-full overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111114]"
      style={{ minHeight: `${height}px` }}
    />
  );
}
