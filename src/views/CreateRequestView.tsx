import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { BloodGroup, BloodComponent, UrgencyLevel } from '../types';
import { StepRequirement } from '../components/emergency/StepRequirement';
import { StepLocation } from '../components/emergency/StepLocation';
import { StepContact } from '../components/emergency/StepContact';
import { CheckCircle2 } from 'lucide-react';

export const CreateRequestView: React.FC = () => {
  const navigate = useNavigate();
  const { createEmergencyRequest } = useBloodStore();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [formData, setFormData] = useState<{
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    hospitalAddress: string;
    city: string;
    district?: string;
    state?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
    facilityId?: string;
    locationSource?: string;
    locationVerificationStatus?: 'source_listed' | 'unverified' | 'pending' | 'verified';
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  }>({
    bloodGroup: 'O+',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Urgent',
    hospitalName: 'Government General Hospital, Machilipatnam',
    hospitalAddress: 'Ramanayyapeta Road, Near Bus Stand',
    city: 'Machilipatnam',
    district: 'Krishna',
    state: 'Andhra Pradesh',
    postalCode: '521001',
    latitude: 16.1856,
    longitude: 81.1362,
    facilityId: 'ap-krishna-ggh-machilipatnam',
    locationSource: 'AP Department of Health & Family Welfare',
    locationVerificationStatus: 'source_listed',
    contactName: 'Robert Taylor',
    contactPhone: '+1 (555) 012-3456',
    preferredContact: 'Phone',
  });

  const updateFields = (fields: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleSubmit = () => {
    const createdReq = createEmergencyRequest(formData);
    navigate(`/request/confirm/${createdReq.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Progress Stepper Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-subtle">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-xs font-bold ${currentStep >= 1 ? 'text-red-600' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              currentStep >= 1 ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              1
            </span>
            <span>Requirement</span>
          </div>

          <div className={`h-0.5 flex-1 mx-3 ${currentStep >= 2 ? 'bg-red-600' : 'bg-slate-200'}`} />

          <div className={`flex items-center gap-2 text-xs font-bold ${currentStep >= 2 ? 'text-red-600' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              currentStep >= 2 ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              2
            </span>
            <span>Location</span>
          </div>

          <div className={`h-0.5 flex-1 mx-3 ${currentStep >= 3 ? 'bg-red-600' : 'bg-slate-200'}`} />

          <div className={`flex items-center gap-2 text-xs font-bold ${currentStep >= 3 ? 'text-red-600' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              currentStep >= 3 ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              3
            </span>
            <span>Contact & Review</span>
          </div>
        </div>
      </div>

      {/* Step Components */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card">
        {currentStep === 1 && (
          <StepRequirement
            bloodGroup={formData.bloodGroup}
            component={formData.component}
            unitsRequired={formData.unitsRequired}
            urgency={formData.urgency}
            onChange={updateFields}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <StepLocation
            hospitalName={formData.hospitalName}
            hospitalAddress={formData.hospitalAddress}
            city={formData.city}
            district={formData.district}
            state={formData.state}
            postalCode={formData.postalCode}
            latitude={formData.latitude}
            longitude={formData.longitude}
            facilityId={formData.facilityId}
            locationSource={formData.locationSource}
            locationVerificationStatus={formData.locationVerificationStatus}
            onChange={updateFields}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <StepContact
            {...formData}
            onChange={updateFields}
            onSubmit={handleSubmit}
            onBack={() => setCurrentStep(2)}
          />
        )}
      </div>
    </div>
  );
};
