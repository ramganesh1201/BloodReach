import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { BloodGroup, BloodComponent } from '../../types';
import { DonorOnboardingInput, validateDonorOnboardingInput } from '../../services/donorResponseService';
import {
  Heart,
  Droplet,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  Info,
} from 'lucide-react';

interface DonorOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS: BloodComponent[] = ['Whole Blood', 'Packed RBC', 'Platelets', 'Plasma'];

export const DonorOnboardingModal: React.FC<DonorOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const { currentUser, onboardAsDonor, donors } = useBloodStore();

  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(currentUser?.bloodGroup || 'O+');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState<number>(25);
  const [weightKg, setWeightKg] = useState<number>(65);
  const [city, setCity] = useState(currentUser?.city || 'Hyderabad');
  const [district, setDistrict] = useState(currentUser?.district || 'Hyderabad');
  const [state, setState] = useState('Telangana');
  const [donationHistory, setDonationHistory] = useState<number>(0);
  const [lastDonatedAt, setLastDonatedAt] = useState<string>('');
  const [donationType, setDonationType] = useState<BloodComponent>('Whole Blood');
  const [isAvailable, setIsAvailable] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Hydrate account and existing donor information once per modal open session
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (isOpen && !hasHydratedRef.current) {
      hasHydratedRef.current = true;
      const existingDonor = donors.find(
        (d) =>
          (currentUser?.id && d.profileId === currentUser.id) ||
          (currentUser?.email && d.email?.toLowerCase() === currentUser.email?.toLowerCase())
      );
      if (existingDonor) {
        setFullName(existingDonor.fullName || currentUser?.fullName || '');
        setPhone(existingDonor.phone || currentUser?.phone || '');
        setEmail(existingDonor.email || currentUser?.email || '');
        setBloodGroup(existingDonor.bloodGroup || currentUser?.bloodGroup || 'O+');
        setGender(
          existingDonor.gender === 'female' || existingDonor.sex === 'female'
            ? 'female'
            : existingDonor.gender === 'other' || existingDonor.sex === 'other'
            ? 'other'
            : 'male'
        );
        setAge(existingDonor.age || 25);
        setWeightKg(existingDonor.weightKg || 65);
        setCity(existingDonor.city || currentUser?.city || 'Hyderabad');
        setDistrict(existingDonor.district || currentUser?.district || 'Hyderabad');
        setDonationHistory(existingDonor.totalDonations || 0);
        setLastDonatedAt(
          existingDonor.lastDonatedAt ? existingDonor.lastDonatedAt.split('T')[0] : ''
        );
        setDonationType(existingDonor.lastDonatedComponent || 'Whole Blood');
        setIsAvailable(existingDonor.isAvailable);
      } else if (currentUser) {
        setFullName(currentUser.fullName || '');
        setPhone(currentUser.phone || '');
        setEmail(currentUser.email || '');
        setBloodGroup(currentUser.bloodGroup || 'O+');
        setCity(currentUser.city || 'Hyderabad');
        setDistrict(currentUser.district || 'Hyderabad');
      }
    }
    if (!isOpen) {
      hasHydratedRef.current = false;
      setError(null);
      setIsSubmitted(false);
    }
  }, [isOpen, currentUser, donors]);

  if (!isOpen) return null;

  // Live interval validation (NBTC 2023: 90 days male, 120 days female)
  let intervalWarning: string | null = null;
  if (lastDonatedAt) {
    const lastDate = new Date(lastDonatedAt);
    if (!isNaN(lastDate.getTime())) {
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      const requiredInterval = gender === 'female' ? 120 : 90;
      if (daysSince < requiredInterval) {
        intervalWarning = `NBTC 2023 guidelines require ${requiredInterval} days between whole blood donations for ${gender} donors (${requiredInterval - daysSince} day(s) remaining). You can still register; your profile will activate once the interval is complete.`;
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Strict double-submission guard
    setError(null);

    const input: DonorOnboardingInput = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      bloodGroup,
      gender,
      age: Number(age),
      weightKg: Number(weightKg),
      city: city.trim(),
      district: district.trim() || undefined,
      state: state.trim() || undefined,
      donationHistory: Number(donationHistory),
      lastDonatedAt: lastDonatedAt ? new Date(lastDonatedAt).toISOString() : undefined,
      donationType,
      isAvailable,
    };

    const validation = validateDonorOnboardingInput(input);
    if (!validation.valid) {
      setError(validation.error || 'Please correct the form fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onboardAsDonor(input);
      if (res.success) {
        setIsSubmitted(true);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(res.error || 'Failed to submit donor registration. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected network error submitting donor registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="donor-onboard-title"
    >
      <div className="bg-app-surface w-full max-w-2xl rounded-2xl border border-app-border shadow-elevated overflow-hidden my-8">
        {/* Header */}
        <div className="bg-app-muted/40 p-6 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shadow-xs">
              <Heart className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 id="donor-onboard-title" className="text-lg font-bold text-app-text font-display">
                Register as a Volunteer Blood Donor
              </h2>
              <p className="text-xs text-app-text-secondary">
                Connect directly with emergency requests when your compatible blood type is critically needed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-text hover:bg-app-muted transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isSubmitted ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-success-light text-success flex items-center justify-center mx-auto border border-success-border">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-app-text font-display">Application Recorded</h3>
                <p className="text-xs text-app-text-secondary max-w-md mx-auto leading-relaxed">
                  Thank you, <strong className="text-app-text">{fullName}</strong>. Your donor registration has been
                  recorded in the clinical registry and forwarded for verification. Your role will be activated once verified
                  by the hospital coordinator.
                </p>
              </div>
              <div className="p-4 bg-app-muted/30 rounded-xl border border-app-border text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-app-text-secondary">Blood Group:</span>
                  <span className="font-bold text-brand">{bloodGroup}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-text-secondary">City / District:</span>
                  <span className="font-semibold text-app-text">{city}, {district}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-text-secondary">Initial Clearance:</span>
                  <span className="font-medium text-warning">Pending Pathologist Verification</span>
                </div>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/donor');
                  }}
                  className="w-full sm:w-auto bg-brand hover:bg-brand-dark text-white font-bold py-2.5 px-6 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Heart className="w-4 h-4 fill-current" />
                  <span>Go to Donor Workspace</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto bg-app-surface hover:bg-app-muted border border-app-border text-app-text font-medium py-2.5 px-5 rounded-lg text-xs transition-colors"
                >
                  <span>Stay on Current Page</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-emergency-light border border-emergency-border text-emergency rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {intervalWarning && (
                <div className="p-3 bg-warning-light border border-warning-border text-warning-dark rounded-lg text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{intervalWarning}</span>
                </div>
              )}

              {/* Section 1: Clinical Profile */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary mb-3">
                  1. Clinical Profile & Blood Group
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Blood Group <span className="text-emergency">*</span>
                    </label>
                    <select
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs font-bold text-brand focus:border-brand focus:outline-hidden"
                      required
                    >
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Biological Sex <span className="text-emergency">*</span>
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                      required
                    >
                      <option value="male">Male (90-day interval)</option>
                      <option value="female">Female (120-day interval)</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Age (Years) <span className="text-emergency">*</span>
                    </label>
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                      required
                    />
                    <span className="text-[10px] text-app-text-secondary">NBTC criteria: 18–65 yrs</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Body Weight (kg) <span className="text-emergency">*</span>
                    </label>
                    <input
                      type="number"
                      min={45}
                      step="0.5"
                      value={weightKg}
                      onChange={(e) => setWeightKg(Number(e.target.value))}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                      required
                    />
                    <span className="text-[10px] text-app-text-secondary">Minimum eligible: 45 kg</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Primary Component Offered
                    </label>
                    <select
                      value={donationType}
                      onChange={(e) => setDonationType(e.target.value as BloodComponent)}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                    >
                      {COMPONENTS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Contact & Location */}
              <div className="pt-3 border-t border-app-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary mb-3">
                  2. Identity & Contact Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Full Legal Name <span className="text-emergency">*</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Phone Number <span className="text-emergency">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      City <span className="text-emergency">*</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">District</label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">State</label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Donation History */}
              <div className="pt-3 border-t border-app-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary mb-3">
                  3. Donation History & Availability
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Total Prior Donations
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={donationHistory}
                      onChange={(e) => setDonationHistory(Number(e.target.value))}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                    />
                    <span className="text-[10px] text-app-text-secondary">Enter 0 if this is your first donation</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      Date of Last Donation (if applicable)
                    </label>
                    <input
                      type="date"
                      value={lastDonatedAt}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setLastDonatedAt(e.target.value)}
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isAvailable"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="rounded border-app-border text-brand focus:ring-brand"
                  />
                  <label htmlFor="isAvailable" className="text-xs text-app-text font-medium cursor-pointer">
                    I am actively available for emergency dispatches in my region
                  </label>
                </div>
              </div>

              {/* Medical Disclaimer Alert */}
              <div className="p-3.5 bg-app-muted/30 rounded-xl border border-app-border text-[11px] text-app-text-secondary space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-app-text">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                  <span>NBTC 2023 Blood Centre Clinical Mandate</span>
                </div>
                <p className="leading-relaxed">
                  CareLoop facilitates candidate discovery. Physical donor medical clearance, vital signs, mandatory
                  hemoglobin screening (≥12.5 g/dL), infectious disease testing (HIV, HBV, HCV, Syphilis, Malaria), and pre-transfusion
                  cross-matching are strictly executed on-site by accredited hospital pathologists upon arrival.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-app-text-secondary hover:text-app-text hover:bg-app-muted rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Registration...</span>
                    </>
                  ) : (
                    <>
                      <Heart className="w-4 h-4 fill-current" />
                      <span>Complete Registration</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

