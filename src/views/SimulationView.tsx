import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { EventTimeline } from '../components/emergency/EventTimeline';
import { Play, RotateCcw, CheckCircle2, ArrowRight, Smartphone, Droplet, Building2, ShieldCheck, Activity } from 'lucide-react';

export const SimulationView: React.FC = () => {
  const { createEmergencyRequest, processSmsReply, verifyAndFulfillRequest, bloodCentres, requests, events, resetDemoData } = useBloodStore();
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [activeReqId, setActiveReqId] = useState<string | null>(null);

  const activeReq = requests.find((r) => r.id === activeReqId) || requests[0];
  const reqEvents = events.filter((e) => e.requestId === activeReq?.id);

  const simulationSteps = [
    {
      title: '1. Attendant Creates Emergency Request',
      actor: 'Patient Attendant',
      description: 'Request submitted for O+ Packed RBC (2 units required) at City General Hospital.',
      action: () => {
        const created = createEmergencyRequest({
          bloodGroup: 'O+',
          component: 'Packed RBC',
          unitsRequired: 2,
          urgency: 'Critical',
          hospitalName: 'City General Hospital',
          hospitalAddress: '700 Main Street, Ward 3B',
          city: 'Metro City',
          contactName: 'Robert Taylor',
          contactPhone: '+1 (555) 012-3456',
          preferredContact: 'Phone',
        });
        setActiveReqId(created.id);
      },
    },
    {
      title: '2. Resource Discovery (Blood Bank Check)',
      actor: 'Shortage Engine',
      description: 'System queries verified blood centres: 1 unit of O+ Packed RBC located in inventory.',
      action: () => {
        // Automatically handled in createEmergencyRequest timeout or state
      },
    },
    {
      title: '3. Shortage Detection (1 Unit Missing)',
      actor: 'Shortage Engine',
      description: 'Shortage engine calculates 1 unit remaining shortfall. Triggers Level 1 responder matching.',
      action: () => {},
    },
    {
      title: '4. Responder Matching & Notification',
      actor: 'Notification Engine',
      description: 'Matching engine dispatches Web & SMS alerts to nearby registered O+ donors.',
      action: () => {},
    },
    {
      title: '5. Keypad Phone SMS Reply "1"',
      actor: 'Feature Phone User',
      description: 'Volunteer donor receives SMS alert on feature phone and replies "1" (Can Help).',
      action: () => {
        if (activeReq) {
          processSmsReply('+15550101', activeReq.referenceCode, '1');
        }
      },
    },
    {
      title: '6. Coordinator Control Room Updated',
      actor: 'Coordinator',
      description: 'Coordinator receives response event. Total units coordinated: 2 of 2 units.',
      action: () => {},
    },
    {
      title: '7. Blood Centre Verification & Issue',
      actor: 'Blood Centre Clinician',
      description: 'Blood centre staff verifies donor eligibility and compatibility, issuing the required units.',
      action: () => {
        if (activeReq) {
          verifyAndFulfillRequest(activeReq.id, bloodCentres[0].id, 1);
        }
      },
    },
    {
      title: '8. Request Fully Resolved',
      actor: 'System',
      description: 'Emergency request BR-8F42 marked FULFILLED. Event audit log finalized.',
      action: () => {},
    },
  ];

  const handleNextStep = () => {
    if (currentStepIndex < simulationSteps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      simulationSteps[nextIdx].action();
      setCurrentStepIndex(nextIdx);
    }
  };

  const handleReset = () => {
    resetDemoData();
    setCurrentStepIndex(0);
    setActiveReqId(null);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/30">
              SECTION 33 CRITICAL WORKFLOW TEST
            </span>
            <h1 className="text-xl font-bold">End-to-End Emergency Simulation</h1>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Step-by-step interactive test runner executing the complete emergency coordination sequence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Simulation
          </button>
          <button
            type="button"
            onClick={handleNextStep}
            disabled={currentStepIndex >= simulationSteps.length - 1}
            className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Step {currentStepIndex + 1} / {simulationSteps.length} Next →
          </button>
        </div>
      </div>

      {/* Workflow Step Diagrams */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5">
        {simulationSteps.map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPassed = idx < currentStepIndex;
          return (
            <div
              key={idx}
              className={`p-2 rounded-lg border text-[11px] font-semibold text-center transition-all ${
                isActive
                  ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-600 ring-offset-1'
                  : isPassed
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              Step {idx + 1}
            </div>
          );
        })}
      </div>

      {/* Current Step Focus Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 font-black flex items-center justify-center text-sm">
              {currentStepIndex + 1}
            </span>
            <h2 className="text-lg font-bold text-slate-900">{simulationSteps[currentStepIndex].title}</h2>
          </div>
          <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2.5 py-1 rounded-full">
            Actor: {simulationSteps[currentStepIndex].actor}
          </span>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">
          {simulationSteps[currentStepIndex].description}
        </p>

        {/* Live Active Request State */}
        {activeReq && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Active Reference</span>
              <strong className="font-mono text-slate-900 text-sm">{activeReq.referenceCode}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Blood Group / Need</span>
              <strong className="text-red-600 text-sm">{activeReq.bloodGroup} {activeReq.component}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Units Coordinated</span>
              <strong className="text-slate-900 text-sm">{activeReq.unitsCoordinated} / {activeReq.unitsRequired} Units</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Request Status</span>
              <strong className="text-blue-700 text-xs">{activeReq.status}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Immutable Event Log Stream Result */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-bold text-slate-900">Live Simulation Audit Event Stream</h3>
        <EventTimeline events={reqEvents} />
      </div>
    </div>
  );
};
