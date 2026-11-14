import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { BloodGroup, BloodComponent } from '../../types';
import { DonorOnboardingInput, validateDonorOnboardingInput } from '../../services/donorResponseService';
import { emailValidationService } from '../../services/emailValidationService';
import { hospitalDiscoveryService } from '../../services/hospitalDiscoveryService';
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
  Navigation,
  MapPin,
  Clock,
  Sparkles,
} from 'lucide-react';

interface DonorOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type AboType = 'A' | 'B' | 'AB' | 'O';
type RhType = '+' | '-';

const ABO_GROUPS: AboType[] = ['A', 'B', 'AB', 'O'];
const RH_FACTORS: RhType[] = ['+', '-'];
const ALL_COMPONENTS: BloodComponent[] = ['Whole Blood', 'Packed RBC', 'Platelets', 'Plasma'];

export const DonorOnboardingModal: React.FC<DonorOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const { currentUser, onboardAsDonor, donors, isRegisteredDonor, userDonorProfile } = useBloodStore();

  // ABO & Rh State
  const initialBloodGroup = currentUser?.bloodGroup || 'O+';
  const initialAbo: AboType = initialBloodGroup.startsWith('AB')
    ? 'AB'
    : (initialBloodGroup.charAt(0) as AboType) || 'O';
  const initialRh: RhType = initialBloodGroup.endsWith('-') ? '-' : '+';

  const [aboGroup, setAboGroup] = useState<AboType>(initialAbo);
  const [rhFactor, setRhFactor] = useState<RhType>(initialRh);
  const derivedBloodGroup: BloodGroup = `${aboGroup}${rhFactor}` as BloodGroup;

  // Form State
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState<number>(25);
  const [weightKg, setWeightKg] = useState<number>(65);

  // Address & Location State
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState(currentUser?.city || 'Vijayawada');
  const [district, setDistrict] = useState(currentUser?.district || 'Krishna');
  const [state, setState] = useState('Andhra Pradesh');
  const [postalCode, setPostalCode] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  // Donation Preferences State
  const [componentPreferences, setComponentPreferences] = useState<BloodComponent[]>(['Whole Blood']);
  const [donationHistory, setDonationHistory] = useState<number>(0);
  const [lastDonatedAt, setLastDonatedAt] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState(true);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Hydrate account and existing donor information once per modal open session
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (isOpen && !hasHydratedRef.current) {
      hasHydratedRef.current = true;
      const existingDonor = userDonorProfile || donors.find(
        (d) =>
          (currentUser?.id && d.profileId === currentUser.id) ||
          (currentUser?.email && d.email?.toLowerCase() === currentUser.email?.toLowerCase())
      );

      if (existingDonor) {
        setFullName(existingDonor.fullName || currentUser?.fullName || '');
        setPhone(existingDonor.phone || currentUser?.phone || '');
        setEmail(existingDonor.email || currentUser?.email || '');

        const bg = existingDonor.bloodGroup || 'O+';
        const parsedAbo: AboType = bg.startsWith('AB') ? 'AB' : (bg.charAt(0) as AboType) || 'O';
        const parsedRh: RhType = bg.endsWith('-') ? '-' : '+';
        setAboGroup(parsedAbo);
        setRhFactor(parsedRh);

        setGender(
          existingDonor.gender === 'female' || existingDonor.sex === 'female'
            ? 'female'
            : existingDonor.gender === 'other' || existingDonor.sex === 'other'
            ? 'other'
            : 'male'
        );
        setAge(existingDonor.age || 25);
        setWeightKg(existingDonor.weightKg || 65);
        setCity(existingDonor.city || currentUser?.city || 'Vijayawada');
        setDistrict(existingDonor.district || currentUser?.district || 'Krishna');
        setDonationHistory(existingDonor.totalDonations || 0);
        setLastDonatedAt(
          existingDonor.lastDonatedAt ? existingDonor.lastDonatedAt.split('T')[0] : ''
        );
        if (existingDonor.lastDonatedComponent) {
          setComponentPreferences([existingDonor.lastDonatedComponent]);
        }
        setIsAvailable(existingDonor.isAvailable);
      } else if (currentUser) {
        setFullName(currentUser.fullName || '');
        setPhone(currentUser.phone || '');
        setEmail(currentUser.email || '');
        if (currentUser.bloodGroup) {
          const bg = currentUser.bloodGroup;
          setAboGroup(bg.startsWith('AB') ? 'AB' : (bg.charAt(0) as AboType));
          setRhFactor(bg.endsWith('-') ? '-' : '+');
        }
        setCity(currentUser.city || 'Vijayawada');
        setDistrict(currentUser.district || 'Krishna');
      }
    }
    if (!isOpen) {
      hasHydratedRef.current = false;
      setError(null);
      setEmailError(null);
      setLocationNotice(null);
      setIsSubmitted(false);
    }
  }, [isOpen, currentUser, donors, userDonorProfile]);

  if (!isOpen) return null;

  // Live interval validation (NBTC 2023: 90 days male, 120 days female)
  let intervalWarning: string | null = null;
  if (lastDonatedAt) {
    const lastDate = new Date(lastDonatedAt);
    if (!isNaN(lastDate.getTime())) {
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      const requiredInterval = gender === 'female' ? 120 : 90;
      if (daysSince < requiredInterval) {
        intervalWarning = `NBTC guidelines require ${requiredInterval} days between whole blood donations for ${gender} donors (${requiredInterval - daysSince} day(s) remaining). You can still register; your profile will activate once the interval is complete.`;
      }
    }
  }

  // Handle email blur to check for disposable domains
  const handleEmailBlur = () => {
    if (!email.trim()) {
      setEmailError(null);
      return;
    }
    const valRes = emailValidationService.validate(email);
    if (!valRes.valid) {
      setEmailError(valRes.error || 'Invalid email address format.');
    } else {
      setEmailError(null);
      setEmail(valRes.normalizedEmail || email.trim().toLowerCase());
    }
  };

  // Component preference toggling
  const toggleComponent = (comp: BloodComponent) => {
    setComponentPreferences((prev) => {
      if (prev.includes(comp)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((c) => c !== comp);
      }
      return [...prev, comp];
    });
  };

  // Device Location Auto-detection
  const handleUseLocation = async () => {
    setIsLocating(true);
    setLocationNotice(null);

    const locRes = await hospitalDiscoveryService.getCurrentLocation(10000);
    if (locRes.error || !locRes.coords.latitude) {
      setIsLocating(false);
      setLocationNotice(locRes.error || 'Could not access device location. Please enter city and district manually.');
      return;
    }

    try {
      const addr = await hospitalDiscoveryService.reverseGeocode(
        locRes.coords.latitude,
        locRes.coords.longitude
      );
      if (addr) {
        if (addr.city) setCity(addr.city);
        if (addr.district) setDistrict(addr.district);
        if (addr.state) setState(addr.state);
        if (addr.locality) setLocality(addr.locality);
        if (addr.postalCode) setPostalCode(addr.postalCode);
        setLocationNotice(`Location set to ${addr.city}, ${addr.district}.`);
      }
    } catch {
      setLocationNotice('Retrieved coordinates, but could not resolve address names.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    // Email validation
    if (email.trim()) {
      const emailRes = emailValidationService.validate(email);
      if (!emailRes.valid) {
        setError(emailRes.error || 'Please provide a valid, permanent email address.');
        return;
      }
    }

    const input: DonorOnboardingInput = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() ? emailValidationService.normalizeEmail(email) : undefined,
      bloodGroup: derivedBloodGroup,
      gender,
      age: Number(age),
      weightKg: Number(weightKg),
      city: city.trim(),
      district: district.trim() || undefined,
      state: state.trim() || undefined,
      donationHistory: Number(donationHistory),
      lastDonatedAt: lastDonatedAt ? new Date(lastDonatedAt).toISOString() : undefined,
      donationType: componentPreferences[0] || 'Whole Blood',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="donor-onboard-title"
    >
      <div className="bg-app-surface w-full max-w-2xl rounded-2xl border border-app-border shadow-elevated overflow-hidden my-4 sm:my-8">
        {/* Header */}
        <div className="bg-app-muted/40 p-4 sm:p-6 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shadow-xs shrink-0">
              <Heart className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 id="donor-onboard-title" className="text-base sm:text-lg font-bold text-app-text font-display">
                Register as a Volunteer Blood Donor
              </h2>
              <p className="text-xs text-app-text-secondary">
                Connect directly with emergency requests when your verified blood type is critically needed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-text hover:bg-app-muted transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto">
          {/* Case 1: Already Registered Banner */}
          {!isSubmitted && isRegisteredDonor && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2 mb-4">
              <div className="flex items-center gap-2 text-emerald-900 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>You are already a registered volunteer donor ({userDonorProfile?.bloodGroup})</span>
              </div>
              <p className="text-emerald-800 text-[11px] leading-relaxed">
                Your profile is linked to your account. You can update your availability, review notifications, or edit your contact information in the Donor Workspace.
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/donor');
                  }}
                  className="bg-brand hover:bg-brand-dark text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors"
                >
                  Go to Donor Workspace
                </button>
              </div>
            </div>
          )}

          {/* Case 2: Just Submitted Confirmation */}
          {isSubmitted ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-success flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  Status: donor_registration_pending
                </span>
                <h3 className="text-lg font-bold text-app-text font-display mt-1">Application Recorded</h3>
                <p className="text-xs text-app-text-secondary max-w-md mx-auto leading-relaxed">
                  Thank you, <strong className="text-app-text">{fullName}</strong>. Your volunteer donor registration has been
                  recorded in the clinical registry.
                </p>
              </div>

              <div className="p-4 bg-app-muted/30 rounded-xl border border-app-border text-left text-xs space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-app-text-secondary">Blood Group:</span>
                  <span className="font-bold text-brand text-sm">{derivedBloodGroup}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-app-text-secondary">Components Offered:</span>
                  <span className="font-semibold text-app-text">{componentPreferences.join(', ')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-app-text-secondary">Region:</span>
                  <span className="font-semibold text-app-text">{city}, {district} ({state})</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-app-border">
                  <span className="text-app-text-secondary">Clinical Screening:</span>
                  <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                    verification_required (On-site Pathology)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-left text-[11px] text-sky-900 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  Physical health screening (Hb ≥ 12.5 g/dL, blood pressure, infectious disease cross-match) is executed on-site by accredited hospital pathologists upon arrival for donation.
                </span>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/donor');
                  }}
                  className="w-full sm:w-auto bg-brand hover:bg-brand-dark text-white font-bold py-2.5 px-6 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
                >
                  <Heart className="w-4 h-4 fill-current" />
                  <span>Go to Donor Workspace</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto bg-app-surface hover:bg-app-muted border border-app-border text-app-text font-medium py-2.5 px-5 rounded-lg text-xs transition-colors"
                >
                  <span>Close</span>
                </button>
              </div>
            </div>
          ) : (
            /* Case 3: Registration Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-emergency rounded-lg text-xs flex items-center gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {intervalWarning && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>{intervalWarning}</span>
                </div>
              )}

              {/* Section 1: Blood Group & Clinical Criteria */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary mb-3 flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5 text-brand" />
                  <span>1. Blood Group & Biological Eligibility</span>
                </h3>

                {/* ABO & Rh Canonical Selection */}
                <div className="bg-app-muted/30 p-3.5 rounded-xl border border-app-border space-y-3 mb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* ABO Type */}
                    <div>
                      <label className="block text-xs font-semibold text-app-text mb-1">
                        ABO Blood Group <span className="text-emergency">*</span>
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {ABO_GROUPS.map((abo) => (
                          <button
                            key={abo}
                            type="button"
                            onClick={() => setAboGroup(abo)}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              aboGroup === abo
                                ? 'bg-brand text-white border-brand shadow-xs'
                                : 'bg-app-bg text-app-text border-app-border hover:border-brand/40'
                            }`}
                          >
                            {abo}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Rh Factor */}
                    <div>
                      <label className="block text-xs font-semibold text-app-text mb-1">
                        Rh Factor <span className="text-emergency">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {RH_FACTORS.map((rh) => (
                          <button
                            key={rh}
                            type="button"
                            onClick={() => setRhFactor(rh)}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              rhFactor === rh
                                ? 'bg-brand text-white border-brand shadow-xs'
                                : 'bg-app-bg text-app-text border-app-border hover:border-brand/40'
                            }`}
                          >
                            {rh === '+' ? '+ Positive' : '- Negative'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-app-border text-xs">
                    <span className="text-app-text-secondary">Derived Clinical Blood Group:</span>
                    <span className="text-base font-extrabold text-brand bg-brand-light px-3 py-0.5 rounded-md border border-brand/20">
                      {derivedBloodGroup}
                    </span>
                  </div>
                </div>

                {/* Biological Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </div>

                {/* Component Preferences Multi-Select */}
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-app-text mb-1">
                    Component Preferences (Willing to Donate)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ALL_COMPONENTS.map((comp) => {
                      const isSelected = componentPreferences.includes(comp);
                      return (
                        <button
                          key={comp}
                          type="button"
                          onClick={() => toggleComponent(comp)}
                          className={`p-2 text-xs rounded-lg border text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-brand-light border-brand text-brand font-bold'
                              : 'bg-app-bg border-app-border text-app-text-secondary hover:text-app-text'
                          }`}
                        >
                          <span className="text-[11px]">{comp}</span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 2: Contact & Identity */}
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
                      Phone Number (Mobile) <span className="text-emergency">*</span>
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

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-app-text mb-1">
                    Email Address (Permanent, Non-disposable)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    onBlur={handleEmailBlur}
                    placeholder="e.g. rahul.sharma@example.com"
                    className={`w-full bg-app-bg border rounded-lg px-3 py-2 text-xs text-app-text focus:outline-hidden ${
                      emailError ? 'border-red-500 focus:border-red-500' : 'border-app-border focus:border-brand'
                    }`}
                  />
                  {emailError ? (
                    <p className="text-[10px] text-red-600 mt-1">{emailError}</p>
                  ) : (
                    <span className="text-[10px] text-app-text-secondary">
                      Used for critical safety notices and verification. Disposable email domains are rejected.
                    </span>
                  )}
                </div>
              </div>

              {/* Section 3: Location Details with Geolocation */}
              <div className="pt-3 border-t border-app-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">
                    3. Donor Region & Location
                  </h3>
                  <button
                    type="button"
                    onClick={handleUseLocation}
                    disabled={isLocating}
                    className="text-[11px] bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-lg border border-red-200 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {isLocating ? (
                      <Loader2 className="w-3 h-3 animate-spin text-red-600" />
                    ) : (
                      <Navigation className="w-3 h-3 text-red-600" />
                    )}
                    <span>Use My Location</span>
                  </button>
                </div>

                {locationNotice && (
                  <p className="text-[11px] text-slate-600 mb-2 italic">
                    ℹ️ {locationNotice}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">
                      City / Town <span className="text-emergency">*</span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">Locality / Ward (Optional)</label>
                    <input
                      type="text"
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                      placeholder="e.g. Benz Circle / Auto Nagar"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text focus:border-brand focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-text mb-1">Postal Code (PIN)</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="e.g. 520001"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-app-text font-mono focus:border-brand focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: History & Availability */}
              <div className="pt-3 border-t border-app-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary mb-3">
                  4. Donation History & Active Availability
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
                    <span className="text-[10px] text-app-text-secondary">Enter 0 if this will be your first donation</span>
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

              {/* Clinical Verification Mandate Disclaimer */}
              <div className="p-3.5 bg-app-muted/30 rounded-xl border border-app-border text-[11px] text-app-text-secondary space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-app-text">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                  <span>NBTC Clinical Verification Protocol</span>
                </div>
                <p className="leading-relaxed">
                  CareLoop facilitates candidate discovery. Registration records your application under <code className="text-brand font-mono text-[10px]">donor_registration_pending</code>. Physical donor medical clearance, vital signs, mandatory hemoglobin screening (≥12.5 g/dL), infectious disease testing (HIV, HBV, HCV, Syphilis, Malaria), and pre-transfusion cross-matching are strictly executed on-site by accredited hospital pathologists upon arrival (<code className="text-brand font-mono text-[10px]">verification_required</code>).
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
                  disabled={isSubmitting || Boolean(emailError)}
                  className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
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
