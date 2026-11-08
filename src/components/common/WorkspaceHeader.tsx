import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ShieldCheck, Activity } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface WorkspaceHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  roleBadge?: {
    label: string;
    variant?: 'brand' | 'success' | 'warning' | 'info' | 'neutral';
    icon?: React.ComponentType<{ className?: string }>;
  };
  title: string;
  description?: string;
  statusBadge?: {
    label: string;
    live?: boolean;
  };
  actions?: React.ReactNode;
}

const BADGE_VARIANTS: Record<string, string> = {
  brand: 'bg-brand-light text-brand border-brand/20',
  success: 'bg-success-light text-success border-success-border',
  warning: 'bg-warning-light text-warning-dark border-warning-border',
  info: 'bg-info-light text-info border-info-border',
  neutral: 'bg-app-muted text-app-text-secondary border-app-border',
};

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  breadcrumbs,
  roleBadge,
  title,
  description,
  statusBadge,
  actions,
}) => {
  const RoleIcon = roleBadge?.icon;
  const badgeClasses = BADGE_VARIANTS[roleBadge?.variant || 'neutral'];

  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-5 sm:p-6 shadow-subtle space-y-4">
      {/* Top Meta Bar: Breadcrumbs & Live Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border/60 pb-3 text-xs">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumbs" className="flex items-center gap-1.5 text-app-text-secondary">
            {breadcrumbs.map((item, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-app-text-secondary/50 shrink-0" />}
                  {item.href && !isLast ? (
                    <Link to={item.href} className="hover:text-app-text font-medium transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'font-semibold text-app-text' : 'font-medium'}>
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        ) : (
          <div />
        )}

        {statusBadge && (
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-app-text-secondary bg-app-muted/60 px-2.5 py-0.5 rounded-full border border-app-border">
            {statusBadge.live && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
            )}
            <span>{statusBadge.label}</span>
          </div>
        )}
      </div>

      {/* Main Title, Badge & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          {roleBadge && (
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${badgeClasses}`}>
              {RoleIcon && <RoleIcon className="w-3 h-3 shrink-0" />}
              <span>{roleBadge.label}</span>
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-app-text leading-tight font-display">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-app-text-secondary leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2.5 pt-1 md:pt-0 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

