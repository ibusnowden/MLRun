'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

const TOKEN_REGEX = /(\w+):("[^"]+"|'[^']+'|\S+)/g;
const TOKEN_KEYS = new Set(['project', 'status', 'tag', 'name', 'id']);

type SearchToken = {
  key: string;
  value: string;
  raw: string;
};

function stripTokenQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSearchQuery(input: string): { tokens: SearchToken[]; text: string } {
  const tokens: SearchToken[] = [];
  const textParts: string[] = [];
  let cursor = 0;

  for (const match of input.matchAll(TOKEN_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    const key = match[1].toLowerCase();

    if (!TOKEN_KEYS.has(key)) {
      continue;
    }

    if (start > cursor) {
      textParts.push(input.slice(cursor, start));
    }

    const rawValue = match[2];
    const value = stripTokenQuotes(rawValue);
    tokens.push({ key, value, raw });
    cursor = end;
  }

  textParts.push(input.slice(cursor));
  const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
  return { tokens, text };
}

function formatToken(key: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const needsQuotes = /\s/.test(trimmed);
  return `${key}:${needsQuotes ? `"${trimmed}"` : trimmed}`;
}

function buildSearchQuery(text: string, tokens: SearchToken[]): string {
  const tokenStrings = tokens.map((token) => formatToken(token.key, token.value)).filter(Boolean);
  const parts = [...tokenStrings, text.trim()].filter(Boolean);
  return parts.join(' ').trim();
}

function updateTokenValue(query: string, key: string, value: string): string {
  const parsed = parseSearchQuery(query);
  const nextTokens = parsed.tokens.filter((token) => token.key !== key);
  const trimmed = value.trim();
  if (trimmed) {
    nextTokens.push({ key, value: trimmed, raw: formatToken(key, trimmed) });
  }
  return buildSearchQuery(parsed.text, nextTokens);
}

function parseTagFilter(value: string): { key: string; value?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [key, tagValue] = trimmed.split('=', 2);
  if (!key) return null;
  return tagValue ? { key, value: tagValue } : { key };
}

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialPageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const initialPage = Number.isFinite(initialPageParam) && initialPageParam > 0
    ? initialPageParam - 1
    : 0;

  const [runs, setRuns] = useState<Run[]>(initialData?.runs || []);
  const [total, setTotal] = useState(initialData?.total || 0);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Pagination
  const [page, setPage] = useState(initialPage);
  const pageSize = 20;

  const parsedSearch = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  const parsedDebounced = useMemo(() => parseSearchQuery(debouncedQuery), [debouncedQuery]);

  const statusToken = parsedSearch.tokens.find((token) => token.key === 'status');

  const effectiveFilters = useMemo(() => {
    const status = parsedDebounced.tokens.find((token) => token.key === 'status')?.value;
    const project = parsedDebounced.tokens.find((token) => token.key === 'project')?.value;
    const nameTokens = parsedDebounced.tokens
      .filter((token) => token.key === 'name')
      .map((token) => token.value);
    const idTokens = parsedDebounced.tokens
      .filter((token) => token.key === 'id')
      .map((token) => token.value);
    const tagTokens = parsedDebounced.tokens
      .filter((token) => token.key === 'tag')
      .map((token) => token.value)
      .filter(Boolean);

    const tagFilters = tagTokens
      .map(parseTagFilter)
      .filter((tag): tag is { key: string; value?: string } => tag !== null)
      .map((tag) => (tag.value ? `${tag.key}=${tag.value}` : tag.key));

    const queryParts = [parsedDebounced.text, ...nameTokens, ...idTokens]
      .map((part) => part.trim())
      .filter(Boolean);

    const query = queryParts.join(' ').trim();

    return {
      status: status?.toLowerCase(),
      project: project?.trim(),
      query: query || undefined,
      tags: tagFilters.length > 0 ? tagFilters : undefined,
    };
  }, [parsedDebounced]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);

    return () => clearTimeout(debounce);
  }, [searchQuery]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (page > 0) params.set('page', String(page + 1));
    const queryString = params.toString();
    const currentQuery = searchParams.toString();
    if (queryString !== currentQuery) {
      router.replace(queryString ? `/?${queryString}` : '/', { scroll: false });
    }
  }, [searchQuery, page, router, searchParams]);

  useEffect(() => {
    const nextQuery = searchParams.get('q') ?? '';
    const nextPageParam = parseInt(searchParams.get('page') ?? '1', 10);
    const nextPage = Number.isFinite(nextPageParam) && nextPageParam > 0
      ? nextPageParam - 1
      : 0;

    if (nextQuery !== searchQuery) {
      setSearchQuery(nextQuery);
    }
    if (nextPage !== page) {
      setPage(nextPage);
    }
  }, [searchParams]);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.listRuns({
        project: effectiveFilters.project,
        status: effectiveFilters.status || undefined,
        query: effectiveFilters.query,
        tags: effectiveFilters.tags,
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
  }, [effectiveFilters, page]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const totalPages = Math.ceil(total / pageSize);
  const isSearching = searchQuery.trim().length > 0;
  const resultsLabel = isSearching
    ? `Showing ${runs.length} of ${total} matching runs`
    : `Showing ${runs.length} of ${total} runs`;

  return (
    <div className="w-full">
      {/* Filters */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Search runs by name, id, project, or tag"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="px-3 py-2 border rounded-lg flex-1 min-w-[240px]"
          />
          <select
            value={statusToken?.value ?? ''}
            onChange={(e) => {
              const nextQuery = updateTokenValue(searchQuery, 'status', e.target.value);
              setSearchQuery(nextQuery);
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
            onClick={() => {
              setSearchQuery('');
              setPage(0);
            }}
            className="px-3 py-2 border rounded-lg text-gray-600 hover:border-gray-400"
          >
            Clear
          </button>
          <button
            onClick={fetchRuns}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Examples: <span className="font-mono">project:demo status:finished tag:model=toy</span>
        </div>
      </div>
      <div className="mb-3 text-sm text-gray-500">{resultsLabel}</div>

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
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No runs found
                </td>
              </tr>
            ) : (
              runs.map((run) => (
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
