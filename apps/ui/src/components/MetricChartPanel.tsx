'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, MetricSeries } from '@/lib/api';
import { UPlotChart } from '@/components/charts/UPlotChart';
import { ChartControls } from '@/components/charts/ChartControls';

interface MetricChartPanelProps {
  runId: string;
  darkTheme?: boolean;
}

export function MetricChartPanel({ runId, darkTheme = true }: MetricChartPanelProps) {
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxPoints, setMaxPoints] = useState(500);
  const [smoothing, setSmoothing] = useState(0);
  const chartRef = useRef<{ resetZoom?: () => void }>(null);

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

  // Theme classes
  const bgClass = darkTheme ? 'bg-[#161b22]' : 'bg-white';
  const borderClass = darkTheme ? 'border-gray-800' : 'border-gray-200';
  const textClass = darkTheme ? 'text-gray-200' : 'text-gray-900';
  const mutedTextClass = darkTheme ? 'text-gray-400' : 'text-gray-500';
  const selectClass = darkTheme
    ? 'bg-[#0d1117] border-gray-700 text-gray-300 focus:border-blue-500'
    : 'bg-white border-gray-300 text-gray-700 focus:border-blue-500';

  return (
    <div className={`${bgClass} rounded-xl shadow-sm border ${borderClass}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${borderClass}`}>
        <h2 className={`text-xl font-semibold ${textClass}`}>Metrics</h2>
        <div className="flex items-center gap-3">
          <select
            value={maxPoints}
            onChange={(e) => setMaxPoints(parseInt(e.target.value, 10))}
            className={`px-3 py-1.5 border rounded-lg text-sm ${selectClass} outline-none`}
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
        <div className={`px-6 py-3 border-b ${borderClass} flex flex-wrap gap-2`}>
          {availableMetrics.map((name) => {
            const isSelected = selectedMetrics.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggleMetric(name)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : darkTheme
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Content area */}
      <div className="p-4">
        {error && (
          <div className={`p-4 rounded-lg ${
            darkTheme
              ? 'bg-red-900/30 border border-red-800 text-red-400'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {error}
          </div>
        )}

        {loading ? (
          <div className={`h-64 flex items-center justify-center ${mutedTextClass}`}>
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Loading metrics...
            </div>
          </div>
        ) : availableMetrics.length === 0 ? (
          <div className={`h-64 flex items-center justify-center ${mutedTextClass}`}>
            No metrics recorded for this run
          </div>
        ) : chartData.xData.length > 0 ? (
          <div>
            {/* Chart with controls */}
            <ChartControls
              title={selectedMetrics.length === 1 ? selectedMetrics[0] : 'Metrics'}
              smoothing={smoothing}
              onSmoothingChange={setSmoothing}
              onResetZoom={() => chartRef.current?.resetZoom?.()}
              darkTheme={darkTheme}
            >
              <UPlotChart
                xData={chartData.xData}
                series={chartData.series}
                xLabel="Step"
                yLabel="Value"
                height={300}
                interactive={true}
                darkTheme={darkTheme}
                smoothing={smoothing}
                onViewportChange={handleViewportChange}
              />
            </ChartControls>

            {/* Info bar */}
            <div className={`mt-3 px-2 text-sm ${mutedTextClass} flex flex-wrap gap-x-4 gap-y-1`}>
              {series.map((s) => (
                <span key={s.name}>
                  <span className="font-medium">{s.name}:</span> {s.total_points.toLocaleString()} points
                  {s.downsampled && <span className="text-yellow-500 ml-1">(downsampled)</span>}
                </span>
              ))}
            </div>

            {/* Summary stats */}
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              {series.slice(0, 1).map((s) => (
                <>
                  <div key={`${s.name}-min`} className={`rounded-lg p-3 ${
                    darkTheme ? 'bg-[#0d1117]' : 'bg-gray-50'
                  }`}>
                    <div className={mutedTextClass}>Min ({s.name})</div>
                    <div className={`font-mono text-lg ${textClass}`}>
                      {Math.min(...s.points.map((p) => p.min)).toFixed(4)}
                    </div>
                  </div>
                  <div key={`${s.name}-max`} className={`rounded-lg p-3 ${
                    darkTheme ? 'bg-[#0d1117]' : 'bg-gray-50'
                  }`}>
                    <div className={mutedTextClass}>Max ({s.name})</div>
                    <div className={`font-mono text-lg ${textClass}`}>
                      {Math.max(...s.points.map((p) => p.max)).toFixed(4)}
                    </div>
                  </div>
                  <div key={`${s.name}-last`} className={`rounded-lg p-3 ${
                    darkTheme ? 'bg-[#0d1117]' : 'bg-gray-50'
                  }`}>
                    <div className={mutedTextClass}>Last ({s.name})</div>
                    <div className={`font-mono text-lg ${textClass}`}>
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
    </div>
  );
}
