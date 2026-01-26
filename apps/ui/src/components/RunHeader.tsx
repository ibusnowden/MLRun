'use client';

import { RunDetail } from '@/lib/api';

interface RunHeaderProps {
  run: RunDetail;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  finished: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  killed: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pending: 'bg-gray-100 text-gray-800 border-gray-200',
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function RunHeader({ run }: RunHeaderProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
      {/* Title Row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {run.name || 'Unnamed Run'}
          </h1>
          <p className="text-sm text-gray-500 font-mono mt-1">{run.run_id}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium border ${
            STATUS_COLORS[run.status] || STATUS_COLORS.pending
          }`}
        >
          {run.status}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm text-gray-500">Project</div>
          <div className="font-medium text-gray-900">{run.project_id}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm text-gray-500">Duration</div>
          <div className="font-medium text-gray-900">
            {formatDuration(run.duration_seconds)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm text-gray-500">Metrics</div>
          <div className="font-medium text-gray-900">{run.metrics_count}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm text-gray-500">Parameters</div>
          <div className="font-medium text-gray-900">{run.params_count}</div>
        </div>
      </div>

      {/* Tags */}
      {Object.keys(run.tags).length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-gray-500 mb-2">Tags</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(run.tags).map(([key, value]) => (
              <span
                key={key}
                className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-700"
              >
                <span className="font-medium">{key}:</span> {value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
