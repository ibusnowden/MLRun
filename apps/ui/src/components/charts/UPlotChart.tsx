'use client';

import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSeries {
  label: string;
  data: number[];
  color?: string;
}

export interface UPlotChartProps {
  /** X-axis values (typically step or time) */
  xData: number[];
  /** Series data */
  series: ChartSeries[];
  /** Chart title */
  title?: string;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Chart height in pixels */
  height?: number;
  /** Enable zoom/pan */
  interactive?: boolean;
  /** Callback when viewport changes */
  onViewportChange?: (min: number, max: number) => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
];

export function UPlotChart({
  xData,
  series,
  title,
  xLabel = 'Step',
  yLabel = 'Value',
  height = 300,
  interactive = true,
  onViewportChange,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });

  // Update dimensions on container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [height]);

  // Create/update chart
  useEffect(() => {
    if (!containerRef.current || dimensions.width === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Prepare data: [xData, ...series.data]
    const data: uPlot.AlignedData = [xData, ...series.map((s) => s.data)];

    // Build series config
    const seriesConfig: uPlot.Series[] = [
      { label: xLabel },
      ...series.map((s, i) => ({
        label: s.label,
        stroke: s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        width: 2,
        points: { show: xData.length < 100 },
      })),
    ];

    // Chart options
    const opts: uPlot.Options = {
      width: dimensions.width,
      height: dimensions.height,
      title,
      series: seriesConfig,
      scales: {
        x: { time: false },
      },
      axes: [
        { label: xLabel, grid: { show: true } },
        { label: yLabel, grid: { show: true } },
      ],
      cursor: {
        drag: interactive ? { x: true, y: false } : undefined,
      },
      hooks: interactive && onViewportChange
        ? {
            setScale: [
              (u, key) => {
                if (key === 'x') {
                  const min = u.scales.x.min ?? 0;
                  const max = u.scales.x.max ?? 0;
                  onViewportChange(min, max);
                }
              },
            ],
          }
        : undefined,
    };

    // Create chart
    chartRef.current = new uPlot(opts, data, containerRef.current);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [xData, series, title, xLabel, yLabel, dimensions, interactive, onViewportChange]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: height }}
    />
  );
}
