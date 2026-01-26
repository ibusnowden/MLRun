'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, MetricSeries } from '@/lib/api';
import { UPlotChart } from '@/components/charts/UPlotChart';

interface MetricChartPanelProps {
  runId: string;
}

export function MetricChartPanel({ runId }: MetricChartPanelProps) {
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxPoints, setMaxPoints] = useState(500);

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMetrics(runId, {
        names: selectedMetrics.length > 0 ? selectedMetrics : undefined,
        maxPoints,
      });
      setSeries(response.series);
      setAvailableMetrics(response.available_metrics);

      // Auto-select first metric if none selected
      if (response.available_metrics.length > 0 && selectedMetrics.length === 0) {
        setSelectedMetrics([response.available_metrics[0]]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, [runId, selectedMetrics, maxPoints]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Toggle metric selection
  const toggleMetric = (name: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // Handle viewport change (zoom/pan)
  const handleViewportChange = useCallback((_min: number, _max: number) => {
    // Could implement viewport-driven fetching here
    // For now, just log it
    // console.log('Viewport:', min, max);
  }, []);

  // Prepare chart data
  const chartData = {
    xData: [] as number[],
    series: [] as { label: string; data: number[]; color?: string }[],
  };

  if (series.length > 0) {
    // Collect all unique steps
    const allSteps = new Set<number>();
    series.forEach((s) => s.points.forEach((p) => allSteps.add(p.step)));
    chartData.xData = Array.from(allSteps).sort((a, b) => a - b);

    // Build series data aligned to steps
    const stepToIndex = new Map(chartData.xData.map((s, i) => [s, i]));

    series.forEach((s) => {
      const data = new Array(chartData.xData.length).fill(null);
      s.points.forEach((p) => {
        const idx = stepToIndex.get(p.step);
        if (idx !== undefined) {
          data[idx] = p.mean;
        }
      });
      chartData.series.push({ label: s.name, data });
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Metrics</h2>
        <div className="flex gap-2">
          <select
            value={maxPoints}
            onChange={(e) => setMaxPoints(parseInt(e.target.value, 10))}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value={100}>100 points</option>
            <option value={500}>500 points</option>
            <option value={1000}>1000 points</option>
            <option value={5000}>5000 points</option>
          </select>
        </div>
      </div>

      {/* Metric selector */}
      {availableMetrics.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {availableMetrics.map((name) => {
            const isSelected = selectedMetrics.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggleMetric(name)}
                className={`px-3 py-1 rounded-full text-sm ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-500">
          Loading metrics...
        </div>
      ) : availableMetrics.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-500">
          No metrics recorded for this run
        </div>
      ) : chartData.xData.length > 0 ? (
        <div>
          {/* uPlot Chart */}
          <UPlotChart
            xData={chartData.xData}
            series={chartData.series}
            xLabel="Step"
            yLabel="Value"
            height={300}
            interactive={true}
            onViewportChange={handleViewportChange}
          />

          {/* Info */}
          <div className="mt-2 text-sm text-gray-500">
            {series.map((s) => (
              <span key={s.name} className="mr-4">
                {s.name}: {s.total_points} points
                {s.downsampled && ' (downsampled)'}
              </span>
            ))}
          </div>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            {series.slice(0, 1).map((s) => (
              <>
                <div key={`${s.name}-min`} className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">Min ({s.name})</div>
                  <div className="font-mono">
                    {Math.min(...s.points.map((p) => p.min)).toFixed(4)}
                  </div>
                </div>
                <div key={`${s.name}-max`} className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">Max ({s.name})</div>
                  <div className="font-mono">
                    {Math.max(...s.points.map((p) => p.max)).toFixed(4)}
                  </div>
                </div>
                <div key={`${s.name}-last`} className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">Last ({s.name})</div>
                  <div className="font-mono">
                    {s.points.length > 0
                      ? s.points[s.points.length - 1].mean.toFixed(4)
                      : '-'}
                  </div>
                </div>
              </>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
