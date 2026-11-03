import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { AuthModal } from '../components/common/AuthModal';
import { HeroChapter } from '../components/landing/HeroChapter';
import { ProblemChapter } from '../components/landing/ProblemChapter';
import { WorkflowChapter } from '../components/landing/WorkflowChapter';
import { MatchingChapter } from '../components/landing/MatchingChapter';
import { CommunicationChapter } from '../components/landing/CommunicationChapter';
import { ReliabilityChapter } from '../components/landing/ReliabilityChapter';
import { ActionChapter } from '../components/landing/ActionChapter';

export const LandingPage: React.FC = () => {
  const { requests, inventory, donors } = useBloodStore();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');

  const handleRegisterDonor = () => {
    setAuthModalMode('signup');
    setIsAuthModalOpen(true);
  };

  // Live metrics from store
  const activeRequestsCount = requests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  ).length;
  const availableUnitsCount = inventory.reduce((acc, curr) => acc + curr.units, 0);
  const verifiedDonorsCount = donors.length;

  return (
    <div className="flex flex-col min-h-screen">
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      {/* Chapter 1: Hero Entry & Live Dispatch Telemetry */}
      <HeroChapter
        onRegisterDonor={handleRegisterDonor}
        activeRequestsCount={activeRequestsCount}
        availableUnitsCount={availableUnitsCount}
        verifiedDonorsCount={verifiedDonorsCount}
      />

      {/* Chapter 2: The Emergency Problem & Clinical Friction */}
      <ProblemChapter />

      {/* Chapter 3: 7-Step Visual Coordination Workflow */}
      <WorkflowChapter />

      {/* Chapter 4: Multi-Parameter Antigen Matching Engine */}
      <MatchingChapter />

      {/* Chapter 5: Centralized Multi-Role Communication Ecosystem */}
      <CommunicationChapter />

      {/* Chapter 6: Clinical Reliability, Fail-Safes & Offline Resilience */}
      <ReliabilityChapter />

      {/* Chapter 7: Clear Entry Points & Emergency Hotlines */}
      <ActionChapter onRegisterDonor={handleRegisterDonor} />
    </div>
  );
};

export default LandingPage;