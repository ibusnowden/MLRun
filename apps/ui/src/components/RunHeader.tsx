'use client';

import { RunDetail } from '@/lib/api';

interface RunHeaderProps {
  run: RunDetail;
  darkTheme?: boolean;
}

const STATUS_COLORS_LIGHT: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  finished: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  killed: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pending: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_COLORS_DARK: Record<string, string> = {
  running: 'bg-blue-900/50 text-blue-300 border-blue-700',
  finished: 'bg-green-900/50 text-green-300 border-green-700',
  failed: 'bg-red-900/50 text-red-300 border-red-700',
  killed: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  pending: 'bg-gray-800 text-gray-300 border-gray-600',
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function RunHeader({ run, darkTheme = true }: RunHeaderProps) {
  const statusColors = darkTheme ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  const bgClass = darkTheme ? 'bg-[#161b22] border border-gray-800' : 'bg-white';
  const titleClass = darkTheme ? 'text-gray-100' : 'text-gray-900';
  const subtitleClass = darkTheme ? 'text-gray-500' : 'text-gray-500';
  const cardBgClass = darkTheme ? 'bg-[#0d1117]' : 'bg-gray-50';
  const labelClass = darkTheme ? 'text-gray-500' : 'text-gray-500';
  const valueClass = darkTheme ? 'text-gray-200' : 'text-gray-900';
  const tagBgClass = darkTheme ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700';

  return (
    <div className={`${bgClass} rounded-xl shadow-sm p-6 mb-6`}>
      {/* Title Row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className={`text-2xl font-bold ${titleClass}`}>
            {run.name || 'Unnamed Run'}
          </h1>
          <p className={`text-sm font-mono mt-1 ${subtitleClass}`}>{run.run_id}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium border ${
            statusColors[run.status] || statusColors.pending
          }`}
        >
          {run.status}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`${cardBgClass} rounded-lg p-3`}>
          <div className={`text-sm ${labelClass}`}>Project</div>
          <div className={`font-medium ${valueClass}`}>{run.project_id}</div>
        </div>
        <div className={`${cardBgClass} rounded-lg p-3`}>
          <div className={`text-sm ${labelClass}`}>Duration</div>
          <div className={`font-medium ${valueClass}`}>
            {formatDuration(run.duration_seconds)}
          </div>
        </div>
        <div className={`${cardBgClass} rounded-lg p-3`}>
          <div className={`text-sm ${labelClass}`}>Metrics</div>
          <div className={`font-medium ${valueClass}`}>{run.metrics_count}</div>
        </div>
        <div className={`${cardBgClass} rounded-lg p-3`}>
          <div className={`text-sm ${labelClass}`}>Parameters</div>
          <div className={`font-medium ${valueClass}`}>{run.params_count}</div>
        </div>
      </div>

      {/* Tags */}
      {Object.keys(run.tags).length > 0 && (
        <div className="mt-4">
          <div className={`text-sm ${labelClass} mb-2`}>Tags</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(run.tags).map(([key, value]) => (
              <span
                key={key}
                className={`px-2 py-1 rounded text-sm ${tagBgClass}`}
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
