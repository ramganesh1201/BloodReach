import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: 'primary' | 'secondary' | 'danger';
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  variant?: 'neutral' | 'success' | 'warning' | 'info';
  className?: string;
}

const VARIANT_ICON_STYLES: Record<string, string> = {
  neutral: 'bg-app-muted text-app-text-secondary border-app-border',
  success: 'bg-success-light text-success border-success-border',
  warning: 'bg-warning-light text-warning-dark border-warning-border',
  info: 'bg-info-light text-info border-info-border',
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'neutral',
  className = '',
}) => {
  const iconStyle = VARIANT_ICON_STYLES[variant] || VARIANT_ICON_STYLES.neutral;

  return (
    <div
      className={`bg-app-surface border border-app-border rounded-xl p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto shadow-subtle ${className}`}
    >
      <div className={`p-3.5 rounded-full border mb-4 ${iconStyle}`}>
        <Icon className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
      </div>

      <h3 className="text-base sm:text-lg font-bold text-app-text font-display">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-app-text-secondary mt-1.5 max-w-md leading-relaxed">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {action && (
            action.href ? (
              <a
                href={action.href}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-brand text-white hover:bg-brand-hover shadow-sm transition-colors"
              >
                {action.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className={`inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-sm ${
                  action.variant === 'danger'
                    ? 'bg-emergency text-white hover:bg-emergency-hover'
                    : action.variant === 'secondary'
                    ? 'bg-app-muted text-app-text border border-app-border hover:bg-app-muted-hover'
                    : 'bg-brand text-white hover:bg-brand-hover'
                }`}
              >
                {action.label}
              </button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-app-surface text-app-text border border-app-border hover:bg-app-muted transition-colors"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-app-surface text-app-text border border-app-border hover:bg-app-muted transition-colors"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};

