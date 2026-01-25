'use client';

import { useState, useEffect } from 'react';
import { api, MetricSeries } from '@/lib/api';

interface MetricChartPanelProps {
  runId: string;
}

export function MetricChartPanel({ runId }: MetricChartPanelProps) {
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getMetrics(runId, { maxPoints: 500 });
        setSeries(response.series);
        setAvailableMetrics(response.available_metrics);
        if (response.available_metrics.length > 0 && !selectedMetric) {
          setSelectedMetric(response.available_metrics[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, [runId, selectedMetric]);

  const currentSeries = series.find((s) => s.name === selectedMetric);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Metrics</h2>
        {availableMetrics.length > 0 && (
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            {availableMetrics.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

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
      ) : currentSeries ? (
        <div>
          {/* Simple text-based chart (will be replaced by uPlot in UI-004) */}
          <div className="h-64 bg-gray-50 rounded-lg p-4 overflow-auto">
            <div className="text-sm text-gray-500 mb-2">
              {currentSeries.name} ({currentSeries.total_points} points
              {currentSeries.downsampled && ', downsampled'})
            </div>
            <div className="space-y-1">
              {currentSeries.points.slice(0, 20).map((point, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-16">step {point.step}</span>
                  <div className="flex-1 h-4 bg-gray-200 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{
                        width: `${Math.min(100, (point.mean / Math.max(...currentSeries.points.map(p => p.max))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 text-right font-mono">
                    {point.mean.toFixed(4)}
                  </span>
                </div>
              ))}
              {currentSeries.points.length > 20 && (
                <div className="text-gray-500 text-sm">
                  ... and {currentSeries.points.length - 20} more points
                </div>
              )}
            </div>
          </div>
          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Min</div>
              <div className="font-mono">
                {Math.min(...currentSeries.points.map((p) => p.min)).toFixed(4)}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Max</div>
              <div className="font-mono">
                {Math.max(...currentSeries.points.map((p) => p.max)).toFixed(4)}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Last</div>
              <div className="font-mono">
                {currentSeries.points.length > 0
                  ? currentSeries.points[currentSeries.points.length - 1].mean.toFixed(4)
                  : '-'}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
