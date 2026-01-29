'use client';

import { useState } from 'react';

interface MetricSectionProps {
  /** Section title */
  title: string;
  /** Number of metrics/charts in this section */
  metricCount: number;
  /** Whether the section is expanded by default */
  defaultExpanded?: boolean;
  /** Children elements (charts) */
  children: React.ReactNode;
  /** Use dark theme */
  darkTheme?: boolean;
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`w-5 h-5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export function MetricSection({
  title,
  metricCount,
  defaultExpanded = true,
  children,
  darkTheme = true,
}: MetricSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const bgClass = darkTheme ? 'bg-[#161b22]' : 'bg-white';
  const borderClass = darkTheme ? 'border-[#30363d]' : 'border-gray-200';
  const textClass = darkTheme ? 'text-[#e6edf3]' : 'text-gray-900';
  const mutedTextClass = darkTheme ? 'text-[#8b949e]' : 'text-gray-500';
  const hoverBgClass = darkTheme ? 'hover:bg-[#1c2128]' : 'hover:bg-gray-50';
  const badgeBgClass = darkTheme ? 'bg-[#238636]' : 'bg-green-500';

  return (
    <div className={`${bgClass} rounded-xl border ${borderClass} overflow-hidden mb-4`}>
      {/* Section Header - Clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-5 py-4 ${hoverBgClass} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <ChevronIcon expanded={expanded} />
          <h2 className={`text-lg font-semibold ${textClass}`}>{title}</h2>
          <span
            className={`${badgeBgClass} text-white text-xs font-medium px-2 py-0.5 rounded-full`}
          >
            {metricCount}
          </span>
        </div>
        <span className={`text-sm ${mutedTextClass}`}>
          {expanded ? 'Click to collapse' : 'Click to expand'}
        </span>
      </button>

      {/* Section Content - Grid of Charts */}
      {expanded && (
        <div className={`px-5 pb-5 border-t ${borderClass}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
