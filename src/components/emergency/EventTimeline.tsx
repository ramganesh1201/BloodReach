import React from 'react';
import { EmergencyEvent } from '../../types';
import { CheckCircle2, Clock, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';

interface EventTimelineProps {
  events: EmergencyEvent[];
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="p-6 text-center text-app-text-secondary text-xs">
        No event history logged for this emergency coordination cycle yet.
      </div>
    );
  }

  // Sort events chronologically (newest first for quick clinical assessment)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="flow-root">
      <ul role="list" className="space-y-4">
        {sortedEvents.map((evt, idx) => {
          const isLast = idx === sortedEvents.length - 1;
          const timeFormatted = new Date(evt.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          const dateFormatted = new Date(evt.timestamp).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
          });

          let iconBg = 'bg-app-muted text-app-text-secondary border-app-border';
          let IconComp = Clock;

          if (evt.eventType.includes('FULFILLED') || evt.eventType.includes('ACCEPTED') || evt.eventType.includes('CONFIRMED')) {
            iconBg = 'bg-emerald-50 text-success border-emerald-200';
            IconComp = CheckCircle2;
          } else if (evt.eventType.includes('SHORTAGE') || evt.eventType.includes('ESCALATED') || evt.eventType.includes('DECLINED')) {
            iconBg = 'bg-amber-50 text-warning border-amber-200';
            IconComp = AlertTriangle;
          } else if (evt.eventType.includes('ASSIGNED') || evt.eventType.includes('VERIFIED')) {
            iconBg = 'bg-sky-50 text-info border-sky-200';
            IconComp = ShieldCheck;
          }

          return (
            <li key={evt.id || idx} className="relative flex items-start gap-3">
              <div
                className={`relative flex h-7 w-7 items-center justify-center rounded-lg border ${iconBg} shadow-sm shrink-0 mt-0.5`}
              >
                <IconComp className="h-3.5 w-3.5" aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1 bg-app-surface p-3 rounded-lg border border-app-border text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-app-text-primary capitalize">
                    {evt.eventType.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  <span className="text-[11px] text-app-text-secondary font-mono">
                    {dateFormatted} • {timeFormatted}
                  </span>
                </div>
                <p className="text-app-text-secondary leading-relaxed text-[12px]">{evt.description}</p>
                <div className="mt-1.5 pt-1.5 border-t border-app-border flex items-center justify-between text-[11px] text-app-text-secondary">
                  <span>Logged Actor: <strong className="text-app-text-primary font-medium">{evt.actorRole.replace('_', ' ')}</strong></span>
                  {evt.id && <span className="font-mono text-[10px] text-slate-400">ID: {evt.id.slice(0, 8)}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
