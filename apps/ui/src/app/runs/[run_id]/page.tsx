'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, RunDetail } from '@/lib/api';
import { RunHeader } from '@/components/RunHeader';
import { MetricChartPanel } from '@/components/MetricChartPanel';

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.run_id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRun() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getRun(runId);
        setRun(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch run');
      } finally {
        setLoading(false);
      }
    }
    fetchRun();
  }, [runId]);

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16 text-gray-500">Loading run...</div>
        </div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error || 'Run not found'}
          </div>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Back to Runs
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="mb-4 text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Runs
        </button>

        {/* Run Header */}
        <RunHeader run={run} />

        {/* Metrics Chart */}
        <MetricChartPanel runId={runId} />

        {/* Parameters Section */}
        {run.params_count > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Parameters</h2>
            <div className="text-gray-500 text-sm">
              {run.params_count} parameters logged
              <span className="ml-2 text-xs">(detail view coming soon)</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
