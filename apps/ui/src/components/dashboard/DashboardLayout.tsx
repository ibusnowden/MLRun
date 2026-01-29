'use client';

import { useState } from 'react';

interface DashboardLayoutProps {
  /** Run name for the header */
  runName: string;
  /** Run status badge */
  status?: 'running' | 'finished' | 'failed' | 'killed' | 'pending';
  /** Total number of metrics */
  totalMetrics?: number;
  /** Filter callback when search changes */
  onFilterChange?: (filter: string) => void;
  /** Children (metric sections) */
  children: React.ReactNode;
  /** Use dark theme */
  darkTheme?: boolean;
}

// Search icon
const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

// Status badge component
function StatusBadge({
  status,
  darkTheme,
}: {
  status: 'running' | 'finished' | 'failed' | 'killed' | 'pending';
  darkTheme: boolean;
}) {
  const statusConfig = {
    running: {
      bg: darkTheme ? 'bg-blue-900/50' : 'bg-blue-100',
      text: darkTheme ? 'text-blue-400' : 'text-blue-700',
      dot: 'bg-blue-500 animate-pulse',
      label: 'Running',
    },
    finished: {
      bg: darkTheme ? 'bg-green-900/50' : 'bg-green-100',
      text: darkTheme ? 'text-[#3fb950]' : 'text-green-700',
      dot: 'bg-[#3fb950]',
      label: 'Finished',
    },
    failed: {
      bg: darkTheme ? 'bg-red-900/50' : 'bg-red-100',
      text: darkTheme ? 'text-red-400' : 'text-red-700',
      dot: 'bg-red-500',
      label: 'Failed',
    },
    killed: {
      bg: darkTheme ? 'bg-orange-900/50' : 'bg-orange-100',
      text: darkTheme ? 'text-orange-400' : 'text-orange-700',
      dot: 'bg-orange-500',
      label: 'Killed',
    },
    pending: {
      bg: darkTheme ? 'bg-gray-700/50' : 'bg-gray-100',
      text: darkTheme ? 'text-gray-400' : 'text-gray-700',
      dot: 'bg-gray-500',
      label: 'Pending',
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export function DashboardLayout({
  runName,
  status = 'finished',
  totalMetrics = 0,
  onFilterChange,
  children,
  darkTheme = true,
}: DashboardLayoutProps) {
  const [filter, setFilter] = useState('');

  // Theme classes
  const bgClass = darkTheme ? 'bg-[#0d1117]' : 'bg-gray-50';
  const headerBgClass = darkTheme ? 'bg-[#161b22]' : 'bg-white';
  const borderClass = darkTheme ? 'border-[#30363d]' : 'border-gray-200';
  const textClass = darkTheme ? 'text-[#e6edf3]' : 'text-gray-900';
  const mutedTextClass = darkTheme ? 'text-[#8b949e]' : 'text-gray-500';
  const inputBgClass = darkTheme ? 'bg-[#0d1117]' : 'bg-white';
  const inputBorderClass = darkTheme ? 'border-[#30363d]' : 'border-gray-300';
  const inputTextClass = darkTheme ? 'text-[#e6edf3] placeholder:text-[#8b949e]' : 'text-gray-900 placeholder:text-gray-400';

  const handleFilterChange = (value: string) => {
    setFilter(value);
    onFilterChange?.(value);
  };

  return (
    <div className={`min-h-screen ${bgClass}`}>
      {/* Sticky Header */}
      <div className={`sticky top-0 z-40 ${headerBgClass} border-b ${borderClass}`}>
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Run name and status */}
            <div className="flex items-center gap-3 min-w-0">
              <h1 className={`text-xl font-semibold truncate ${textClass}`}>
                {runName}
              </h1>
              <StatusBadge status={status} darkTheme={darkTheme} />
              {totalMetrics > 0 && (
                <span className={`text-sm ${mutedTextClass}`}>
                  {totalMetrics} metrics
                </span>
              )}
            </div>

            {/* Right: Search bar */}
            <div className="flex-shrink-0 w-72">
              <div className="relative">
                <div className={`absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none ${mutedTextClass}`}>
                  <SearchIcon />
                </div>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => handleFilterChange(e.target.value)}
                  placeholder="Filter metrics..."
                  className={`w-full pl-10 pr-4 py-2 text-sm rounded-lg border ${inputBgClass} ${inputBorderClass} ${inputTextClass} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        {children}
      </div>
    </div>
  );
}
