import React, { useState, useEffect, useRef } from 'react';
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
  const { createEmergencyRequest, currentUser } = useBloodStore();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Clean form state initialized with authenticated account details (loaded once)
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
    hospitalName: '',
    hospitalAddress: '',
    landmark: '',
    hospitalContactPerson: '',
    city: currentUser?.city || '',
    district: currentUser?.district || '',
    state: 'Andhra Pradesh',
    postalCode: '',
    latitude: undefined,
    longitude: undefined,
    facilityId: undefined,
    locationSource: 'Public Healthcare Directory',
    locationVerificationStatus: 'source_listed',
    contactName: currentUser?.fullName || '',
    contactPhone: currentUser?.phone || '',
    preferredContact: 'Phone',
    requiredDateTime: '',
    additionalInstructions: '',
  });

  // Profile hydration guard: prefill once upon async profile resolution without overwriting user edits
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (currentUser && !hasHydratedRef.current) {
      hasHydratedRef.current = true;
      setFormData((prev) => ({
        ...prev,
        contactName: prev.contactName || currentUser.fullName || '',
        contactPhone: prev.contactPhone || currentUser.phone || '',
        city: prev.city || currentUser.city || '',
        district: prev.district || currentUser.district || '',
      }));
    }
  }, [currentUser]);

  const updateFields = (fields: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return; // Prevent duplicate concurrent submissions
    setSubmitError(null);

    if (!formData.contactName.trim()) {
      setSubmitError('Please provide the attendant/contact person name.');
      return;
    }
    if (!formData.contactPhone.trim() || formData.contactPhone.trim().length < 7) {
      setSubmitError('Please provide a valid attendant contact phone number.');
      return;
    }
    if (!formData.hospitalName.trim() || !formData.hospitalAddress.trim() || !formData.city.trim()) {
      setSubmitError('Please select or specify the hospital care location.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createEmergencyRequest(formData);
      if (res.success && res.data) {
        navigate(`/request/confirm/${res.data.id}${res.data.trackingToken ? `?token=${res.data.trackingToken}` : ''}`);
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
