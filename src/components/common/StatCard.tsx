import React from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'neutral' | 'brand' | 'emergency' | 'success' | 'warning' | 'info';
  onClick?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<string, { iconBg: string; iconColor: string; borderAccent?: string }> = {
  neutral: {
    iconBg: 'bg-app-muted',
    iconColor: 'text-app-text-secondary',
  },
  brand: {
    iconBg: 'bg-brand-light',
    iconColor: 'text-brand',
    borderAccent: 'border-l-brand',
  },
  emergency: {
    iconBg: 'bg-emergency-light',
    iconColor: 'text-emergency',
    borderAccent: 'border-l-emergency',
  },
  success: {
    iconBg: 'bg-success-light',
    iconColor: 'text-success',
    borderAccent: 'border-l-success',
  },
  warning: {
    iconBg: 'bg-warning-light',
    iconColor: 'text-warning-dark',
    borderAccent: 'border-l-warning',
  },
  info: {
    iconBg: 'bg-info-light',
    iconColor: 'text-info',
    borderAccent: 'border-l-info',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'neutral',
  onClick,
  className = '',
}) => {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      className={`bg-app-surface border border-app-border rounded-xl p-4 sm:p-5 shadow-subtle transition-all duration-150 ${
        styles.borderAccent ? `border-l-4 ${styles.borderAccent}` : ''
      } ${
        isClickable ? 'hover:border-app-border-strong hover:shadow-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/40' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-text-secondary truncate">
            {label}
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-app-text font-display leading-tight">
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-app-text-secondary font-medium pt-0.5 leading-normal">
              {subtext}
            </p>
          )}
        </div>

        {Icon && (
          <div className={`p-2.5 rounded-lg shrink-0 ${styles.iconBg} ${styles.iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

