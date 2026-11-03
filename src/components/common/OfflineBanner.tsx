import React from 'react';
import { useBloodStore } from '../../store/useBloodStore';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isOffline } = useBloodStore();

  if (!isOffline) return null;

  return (
    <div className="bg-amber-600 text-white text-xs py-2 px-4 shadow-sm font-medium" role="alert">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>
          You're offline. Previously loaded information is available, but live emergency coordination requires a network connection.
        </span>
      </div>
    </div>
  );
};
