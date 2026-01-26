'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, Run, ListRunsResponse } from '@/lib/api';

interface RunsTableProps {
  initialData?: ListRunsResponse;
  onRunClick?: (run: Run) => void;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800',
  finished: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  killed: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-gray-100 text-gray-800',
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatDate(dateStr: string): string {
  // Handle SystemTime format: "SystemTime { tv_sec: ..., tv_nsec: ... }"
  const match = dateStr.match(/tv_sec:\s*(\d+)/);
  if (match) {
    const timestamp = parseInt(match[1], 10) * 1000;
    return new Date(timestamp).toLocaleString();
  }
  return dateStr;
}

export function RunsTable({ initialData, onRunClick }: RunsTableProps) {
  const [runs, setRuns] = useState<Run[]>(initialData?.runs || []);
  const [total, setTotal] = useState(initialData?.total || 0);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.listRuns({
        status: statusFilter || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setRuns(response.runs);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Client-side search filter
  const filteredRuns = runs.filter((run) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      run.run_id.toLowerCase().includes(query) ||
      run.name?.toLowerCase().includes(query) ||
      run.project_id.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full">
      {/* Filters */}
      <div className="mb-4 flex gap-4">
        <input
          type="text"
          placeholder="Search runs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-2 border rounded-lg flex-1 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All Status</option>
          <option value="running">Running</option>
          <option value="finished">Finished</option>
          <option value="failed">Failed</option>
          <option value="killed">Killed</option>
        </select>
        <button
          onClick={fetchRuns}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Project</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Metrics</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Duration</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No runs found
                </td>
              </tr>
            ) : (
              filteredRuns.map((run) => (
                <tr
                  key={run.run_id}
                  onClick={() => onRunClick?.(run)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {run.name || run.run_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {run.run_id.slice(0, 8)}...
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[run.status] || STATUS_COLORS.pending
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{run.project_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{run.metrics_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDuration(run.duration_seconds)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(run.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total} runs
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
