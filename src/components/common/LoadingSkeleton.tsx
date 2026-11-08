import React from 'react';

export const StatCardSkeleton: React.FC = () => (
  <div className="bg-app-surface border border-app-border rounded-xl p-5 shadow-subtle animate-pulse space-y-3">
    <div className="flex justify-between items-start">
      <div className="space-y-2 w-2/3">
        <div className="h-3 bg-app-muted rounded w-1/2" />
        <div className="h-7 bg-app-muted rounded w-3/4" />
        <div className="h-2.5 bg-app-muted rounded w-2/3" />
      </div>
      <div className="w-10 h-10 bg-app-muted rounded-lg shrink-0" />
    </div>
  </div>
);

export const CardSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="bg-app-surface border border-app-border rounded-xl p-5 shadow-subtle animate-pulse space-y-4">
    <div className="flex justify-between items-center pb-3 border-b border-app-border">
      <div className="h-4 bg-app-muted rounded w-1/3" />
      <div className="h-5 bg-app-muted rounded w-20" />
    </div>
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-app-muted rounded" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
  <div className="bg-app-surface border border-app-border rounded-xl overflow-hidden shadow-subtle animate-pulse">
    <div className="p-4 bg-app-muted/50 border-b border-app-border flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-3.5 bg-app-muted rounded flex-1" />
      ))}
    </div>
    <div className="divide-y divide-app-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-4 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-3 bg-app-muted rounded flex-1"
              style={{ opacity: 1 - (r * 0.1) }}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const PageLoadingState: React.FC<{ label?: string }> = ({ label = 'Loading emergency coordination data...' }) => (
  <div className="space-y-6 animate-pulse">
    <div className="h-28 bg-app-muted rounded-xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>
    <div className="bg-app-surface border border-app-border rounded-xl p-6 text-center text-xs text-app-text-secondary">
      {label}
    </div>
  </div>
);

