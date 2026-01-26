'use client';

import { useState, useEffect } from 'react';
import { api, MetricSeries } from '@/lib/api';

interface CompareData {
  run_id: string;
  run_name: string | null;
  status: string;
  series: MetricSeries[];
}

interface ComparePanelProps {
  runIds: string[];
}

const RUN_COLORS = [
  'rgb(59, 130, 246)',   // blue
  'rgb(239, 68, 68)',    // red
  'rgb(34, 197, 94)',    // green
  'rgb(168, 85, 247)',   // purple
  'rgb(249, 115, 22)',   // orange
  'rgb(236, 72, 153)',   // pink
  'rgb(20, 184, 166)',   // teal
  'rgb(234, 179, 8)',    // yellow
];

export function ComparePanel({ runIds }: ComparePanelProps) {
  const [runs, setRuns] = useState<CompareData[]>([]);
  const [commonMetrics, setCommonMetrics] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchComparison() {
      if (runIds.length === 0) {
        setRuns([]);
        setCommonMetrics([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await api.compareRuns(runIds, [], 500);
        setRuns(response.runs);
        setCommonMetrics(response.common_metrics);
        if (response.common_metrics.length > 0 && !selectedMetric) {
          setSelectedMetric(response.common_metrics[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to compare runs');
      } finally {
        setLoading(false);
      }
    }
    fetchComparison();
  }, [runIds, selectedMetric]);

  if (runIds.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="text-center py-8 text-gray-500">
          Select runs to compare from the runs table
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="text-center py-8 text-gray-500">Loading comparison...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      </div>
    );
  }

  // Get series for selected metric from each run
  const comparisonData = runs.map((run, idx) => ({
    ...run,
    color: RUN_COLORS[idx % RUN_COLORS.length],
    metricSeries: run.series.find((s) => s.name === selectedMetric),
  }));

  // Find max value for scaling
  const allValues = comparisonData
    .flatMap((r) => r.metricSeries?.points.map((p) => p.max) || []);
  const maxValue = Math.max(...allValues, 0.001);

  // Find all steps
  const allSteps = new Set<number>();
  comparisonData.forEach((r) => {
    r.metricSeries?.points.forEach((p) => allSteps.add(p.step));
  });
  const sortedSteps = Array.from(allSteps).sort((a, b) => a - b);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Compare Runs</h2>
        {commonMetrics.length > 0 && (
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            {commonMetrics.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {comparisonData.map((run) => (
          <div key={run.run_id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: run.color }}
            />
            <span className="text-sm">
              {run.run_name || run.run_id.slice(0, 8)}
            </span>
            <span className="text-xs text-gray-500">({run.status})</span>
          </div>
        ))}
      </div>

      {commonMetrics.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No common metrics found between selected runs
        </div>
      ) : (
        <div>
          {/* Simple comparison chart (placeholder for uPlot) */}
          <div className="h-64 bg-gray-50 rounded-lg p-4 overflow-auto">
            <div className="text-sm text-gray-500 mb-2">{selectedMetric}</div>
            <div className="space-y-2">
              {sortedSteps.slice(0, 30).map((step) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16">step {step}</span>
                  <div className="flex-1 flex gap-1">
                    {comparisonData.map((run) => {
                      const point = run.metricSeries?.points.find((p) => p.step === step);
                      if (!point) return null;
                      return (
                        <div
                          key={run.run_id}
                          className="h-4 rounded"
                          style={{
                            backgroundColor: run.color,
                            width: `${(point.mean / maxValue) * 100}%`,
                            minWidth: '2px',
                          }}
                          title={`${run.run_name || run.run_id.slice(0, 8)}: ${point.mean.toFixed(4)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {sortedSteps.length > 30 && (
                <div className="text-gray-500 text-sm">
                  ... and {sortedSteps.length - 30} more steps
                </div>
              )}
            </div>
          </div>

          {/* Summary table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Run</th>
                  <th className="text-right py-2 px-3">Min</th>
                  <th className="text-right py-2 px-3">Max</th>
                  <th className="text-right py-2 px-3">Last</th>
                  <th className="text-right py-2 px-3">Points</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((run) => {
                  const series = run.metricSeries;
                  if (!series) return null;
                  const points = series.points;
                  return (
                    <tr key={run.run_id} className="border-b">
                      <td className="py-2 px-3 flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: run.color }}
                        />
                        {run.run_name || run.run_id.slice(0, 8)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono">
                        {Math.min(...points.map((p) => p.min)).toFixed(4)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono">
                        {Math.max(...points.map((p) => p.max)).toFixed(4)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono">
                        {points.length > 0 ? points[points.length - 1].mean.toFixed(4) : '-'}
                      </td>
                      <td className="text-right py-2 px-3">{series.total_points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
