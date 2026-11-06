import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { BloodGroup, BloodComponent, UrgencyLevel } from '../types';
import { StepRequirement } from '../components/emergency/StepRequirement';
import { StepLocation } from '../components/emergency/StepLocation';
import { StepRequestInfo } from '../components/emergency/StepRequestInfo';
import { StepReview } from '../components/emergency/StepReview';
import { Droplet, MapPin, User, CheckCircle2 } from 'lucide-react';

export const CreateRequestView: React.FC = () => {
  const navigate = useNavigate();
  const { createEmergencyRequest } = useBloodStore();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Guided Form State with Realistic Defaults
  const [formData, setFormData] = useState<{
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    hospitalAddress: string;
    landmark?: string;
    hospitalContactPerson?: string;
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
    requiredDateTime?: string;
    additionalInstructions?: string;
  }>({
    bloodGroup: 'O+',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Urgent',
    hospitalName: 'Government General Hospital, Machilipatnam',
    hospitalAddress: 'Ramanayyapeta Road, Near Bus Stand',
    landmark: 'Near District Collectorate Complex',
    hospitalContactPerson: 'Dr. Ramesh / Duty Medical Officer',
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
    contactPhone: '+91 98490 55123',
    preferredContact: 'Phone',
    requiredDateTime: '',
    additionalInstructions: 'Patient in Emergency Trauma Ward 2A. Scheduled for urgent surgery.',
  });

  const updateFields = (fields: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await createEmergencyRequest(formData);
      if (res.success && res.data) {
        navigate(`/request/confirm/${res.data.id}`);
      } else {
        setSubmitError(res.error || 'Failed to dispatch emergency blood request. Please check details and try again.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Network failure while dispatching request.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* 4-Step Progress Stepper Bar */}
      <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle">
        <div className="flex items-center justify-between">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-2 text-xs font-bold transition-colors ${
              currentStep >= 1 ? 'text-brand' : 'text-app-text-secondary'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                currentStep >= 1 ? 'bg-brand text-white' : 'bg-app-muted text-app-text-secondary'
              }`}
            >
              1
            </span>
            <span className="hidden sm:inline">Requirement</span>
          </button>

          <div className={`h-0.5 flex-1 mx-2 sm:mx-3 ${currentStep >= 2 ? 'bg-brand' : 'bg-app-border'}`} />

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className={`flex items-center gap-2 text-xs font-bold transition-colors ${
              currentStep >= 2 ? 'text-brand' : 'text-app-text-secondary'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                currentStep >= 2 ? 'bg-brand text-white' : 'bg-app-muted text-app-text-secondary'
              }`}
            >
              2
            </span>
            <span className="hidden sm:inline">Hospital</span>
          </button>

          <div className={`h-0.5 flex-1 mx-2 sm:mx-3 ${currentStep >= 3 ? 'bg-brand' : 'bg-app-border'}`} />

          {/* Step 3 */}
          <button
            type="button"
            onClick={() => setCurrentStep(3)}
            className={`flex items-center gap-2 text-xs font-bold transition-colors ${
              currentStep >= 3 ? 'text-brand' : 'text-app-text-secondary'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                currentStep >= 3 ? 'bg-brand text-white' : 'bg-app-muted text-app-text-secondary'
              }`}
            >
              3
            </span>
            <span className="hidden sm:inline">Contact</span>
          </button>

          <div className={`h-0.5 flex-1 mx-2 sm:mx-3 ${currentStep >= 4 ? 'bg-brand' : 'bg-app-border'}`} />

          {/* Step 4 */}
          <div
            className={`flex items-center gap-2 text-xs font-bold ${
              currentStep >= 4 ? 'text-brand' : 'text-app-text-secondary'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                currentStep >= 4 ? 'bg-brand text-white' : 'bg-app-muted text-app-text-secondary'
              }`}
            >
              4
            </span>
            <span className="hidden sm:inline">Review</span>
          </div>
        </div>
      </div>

      {/* Step Components Container */}
      <div className="bg-app-surface p-6 sm:p-7 rounded-xl border border-app-border shadow-card">
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
            landmark={formData.landmark}
            hospitalContactPerson={formData.hospitalContactPerson}
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
          <StepRequestInfo
            requiredDateTime={formData.requiredDateTime}
            additionalInstructions={formData.additionalInstructions}
            contactName={formData.contactName}
            contactPhone={formData.contactPhone}
            preferredContact={formData.preferredContact}
            onChange={updateFields}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <StepReview
            {...formData}
            onEditStep={(step) => setCurrentStep(step)}
            onSubmit={handleSubmit}
            onBack={() => setCurrentStep(3)}
            isSubmitting={isSubmitting}
            submitError={submitError}
          />
        )}
      </div>
    </div>
  );
};
