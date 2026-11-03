import React from 'react';
import { EmergencyEvent } from '../../types';
import { CheckCircle2, Clock, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

interface EventTimelineProps {
  events: EmergencyEvent[];
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-xs">
        No event history logged yet.
      </div>
    );
  }

  // Sort events chronologically (newest at bottom or top)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {sortedEvents.map((evt, idx) => {
          const isLast = idx === sortedEvents.length - 1;
          const timeFormatted = new Date(evt.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          let iconBg = 'bg-slate-100 text-slate-600';
          let IconComp = Clock;

          if (evt.eventType.includes('FULFILLED') || evt.eventType.includes('ACCEPTED')) {
            iconBg = 'bg-emerald-100 text-emerald-700';
            IconComp = CheckCircle2;
          } else if (evt.eventType.includes('SHORTAGE') || evt.eventType.includes('ESCALATED')) {
            iconBg = 'bg-amber-100 text-amber-800';
            IconComp = AlertTriangle;
          } else if (evt.eventType.includes('RESOURCE') || evt.eventType.includes('VERIFIED')) {
            iconBg = 'bg-blue-100 text-blue-700';
            IconComp = ShieldCheck;
          }

          return (
            <li key={evt.id || idx}>
              <div className="relative pb-6">
                {!isLast && (
                  <span
                    className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex items-start space-x-3">
                  <div
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full border border-white ${iconBg} shadow-sm shrink-0`}
                  >
                    <IconComp className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{evt.eventType.replace(/_/g, ' ')}</span>
                      <span className="text-slate-400 font-mono">{timeFormatted}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{evt.description}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>Actor: <strong className="text-slate-700 font-medium">{evt.actorRole}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
