import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { hospitalService } from '../services/hospitalService';
import {
  HospitalRegistrationInput,
  HospitalFacilityType,
  HospitalOwnershipType,
} from '../types/hospital';
import { BloodComponent } from '../types';
import {
  Building2,
  MapPin,
  Phone,
  ShieldCheck,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Droplet,
  Check,
} from 'lucide-react';

const FACILITY_TYPES: { value: HospitalFacilityType; label: string }[] = [
  { value: 'government_hospital', label: 'Government / District Hospital' },
  { value: 'private_hospital', label: 'Private Multi-Specialty Hospital' },
  { value: 'medical_college', label: 'Medical College & Research Institute' },
  { value: 'trauma_centre', label: 'Emergency Trauma Care Centre' },
  { value: 'super_speciality', label: 'Super Speciality Tertiary Hospital' },
];

const OWNERSHIP_TYPES: HospitalOwnershipType[] = [
  'Government / Public',
  'Private / Corporate',
  'Trust / Charitable',
  'Semi-Government',
];

const COMPONENT_OPTIONS: BloodComponent[] = [
  'Packed RBC',
  'Whole Blood',
  'Platelets',
  'Plasma',
];

export const HospitalRegisterView: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedHospitalId, setSubmittedHospitalId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<HospitalRegistrationInput>({
    name: '',
    registrationNumber: '',
    facilityType: 'private_hospital',
    ownershipType: 'Private / Corporate',
    establishedYear: 2005,
    website: '',
    state: 'Telangana',
    district: 'Hyderabad',
    city: 'Hyderabad',
    address: '',
    postalCode: '',
    latitude: 17.385,
    longitude: 78.4867,
    contactName: '',
    contactDesignation: 'Medical Superintendent',
    contactEmail: '',
    contactPhone: '',
    emergencyPhone: '',
    hasBloodBank: true,
    bloodBankLicenseNumber: '',
    storageCapacityUnits: 250,
    componentsSupported: ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'],
    operatingHours: '24/7 Emergency Operation',
    isEmergencyAvailable: true,
    registrationCertificateUrl: 'DOC-HOSP-REG-' + Math.floor(100000 + Math.random() * 900000),
    bloodBankLicenseUrl: 'DOC-BB-LIC-' + Math.floor(100000 + Math.random() * 900000),
    authorizedIdProofUrl: '',
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const updateField = <K extends keyof HospitalRegistrationInput>(
    field: K,
    value: HospitalRegistrationInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrorMessage(null);
  };

  const toggleComponentCapability = (comp: BloodComponent) => {
    setFormData((prev) => {
      const current = prev.componentsSupported;
      const exists = current.includes(comp);
      return {
        ...prev,
        componentsSupported: exists
          ? current.filter((c) => c !== comp)
          : [...current, comp],
      };
    });
  };

  // Step Validation
  const validateStep = (step: number): boolean => {
    setErrorMessage(null);

    if (step === 1) {
      if (!formData.name.trim()) {
        setErrorMessage('Hospital name is required.');
        return false;
      }
      if (!formData.registrationNumber.trim()) {
        setErrorMessage('Clinical establishment registration / license number is required.');
        return false;
      }
      if (formData.establishedYear < 1850 || formData.establishedYear > new Date().getFullYear()) {
        setErrorMessage('Please specify a valid year established.');
        return false;
      }
    } else if (step === 2) {
      if (!formData.address.trim()) {
        setErrorMessage('Hospital street address is required.');
        return false;
      }
      if (!formData.city.trim() || !formData.district.trim() || !formData.state.trim()) {
        setErrorMessage('City, District, and State are required.');
        return false;
      }
      if (!formData.postalCode.trim() || !/^\d{6}$/.test(formData.postalCode.trim())) {
        setErrorMessage('A valid 6-digit postal PIN code is required.');
        return false;
      }
    } else if (step === 3) {
      if (!formData.contactName.trim()) {
        setErrorMessage('Authorized medical superintendent/contact name is required.');
        return false;
      }
      if (!formData.contactPhone.trim() || formData.contactPhone.trim().length < 8) {
        setErrorMessage('Valid official contact telephone is required.');
        return false;
      }
      if (!formData.emergencyPhone.trim() || formData.emergencyPhone.trim().length < 8) {
        setErrorMessage('24/7 emergency hotline is required for urgent blood coordination.');
        return false;
      }
      if (!formData.contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail.trim())) {
        setErrorMessage('A valid official institutional email address is required.');
        return false;
      }
    } else if (step === 4) {
      if (formData.hasBloodBank) {
        if (!formData.bloodBankLicenseNumber?.trim()) {
          setErrorMessage('Blood bank regulatory license number is required for in-house facilities.');
          return false;
        }
        if (formData.componentsSupported.length === 0) {
          setErrorMessage('Please select at least one component storage/processing capability.');
          return false;
        }
      }
    } else if (step === 5) {
      if (!formData.registrationCertificateUrl?.trim()) {
        setErrorMessage('Hospital registration certificate reference is required.');
        return false;
      }
      if (formData.hasBloodBank && !formData.bloodBankLicenseUrl?.trim()) {
        setErrorMessage('Blood bank license document reference is required.');
        return false;
      }
      if (!acceptedTerms) {
        setErrorMessage('You must confirm the legal accuracy of hospital registration details.');
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(5)) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await hospitalService.submitHospitalRegistration(formData);
      if (res.success && res.data) {
        setSubmittedHospitalId(res.data.id);
      } else {
        setErrorMessage(res.error || 'Failed to submit hospital registration.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error submitting registration.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submission Success Screen
  if (submittedHospitalId) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-lg w-full bg-app-surface border border-app-border rounded-2xl shadow-subtle p-6 sm:p-8 space-y-6 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-success-light border border-success-border text-success mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-app-text font-display">
              Hospital Registration Submitted
            </h2>
            <p className="text-xs text-app-text-secondary leading-relaxed max-w-sm mx-auto">
              Your application for <strong>{formData.name}</strong> has been received with status{' '}
              <span className="font-bold text-info bg-info-light px-2 py-0.5 rounded">UNDER REVIEW</span>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-app-muted/30 border border-app-border text-left space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-app-border">
              <span className="text-app-text-secondary">Hospital ID:</span>
              <span className="font-mono font-bold text-app-text">{submittedHospitalId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-app-border">
              <span className="text-app-text-secondary">Clinical License:</span>
              <span className="font-mono text-app-text">{formData.registrationNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-app-border">
              <span className="text-app-text-secondary">Review Timeline:</span>
              <span className="text-success font-semibold">24–48 Hours</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-app-text-secondary">Official Contact:</span>
              <span className="text-app-text">{formData.contactName} ({formData.contactPhone})</span>
            </div>
          </div>

          <p className="text-[11px] text-app-text-secondary leading-normal">
            CareLoop healthcare administrators will verify institutional credentials against the State Clinical Registries. Once approved, the facility will be active on the emergency blood dispatch grid.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate('/hospital')}
              className="flex-1 py-3 px-4 rounded-xl bg-brand text-white text-xs font-bold shadow-subtle hover:bg-brand-dark transition-colors"
            >
              Go to Hospital Portal
            </button>
            <Link
              to="/"
              className="flex-1 py-3 px-4 rounded-xl border border-app-border bg-app-surface text-app-text text-xs font-semibold hover:bg-app-muted transition-colors flex items-center justify-center"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6 animate-fade-in">
      {/* Title Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-light text-brand text-xs font-bold border border-brand/20">
          <Building2 className="w-3.5 h-3.5" />
          <span>Institutional Healthcare Onboarding</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-app-text font-display">
          Hospital & Medical Centre Registration
        </h1>
        <p className="text-xs sm:text-sm text-app-text-secondary max-w-xl mx-auto">
          Enroll your hospital, surgical centre, or clinical blood bank into the CareLoop emergency coordination network.
        </p>
      </div>

      {/* 5-Step Progress Bar */}
      <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-subtle">
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {[
            { num: 1, label: 'Basic Info', icon: Building2 },
            { num: 2, label: 'Location', icon: MapPin },
            { num: 3, label: 'Contact', icon: Phone },
            { num: 4, label: 'Blood Bank', icon: Droplet },
            { num: 5, label: 'Verification', icon: ShieldCheck },
          ].map((s) => {
            const Icon = s.icon;
            const isDone = s.num < currentStep;
            const isCurrent = s.num === currentStep;

            return (
              <div
                key={s.num}
                className={`flex flex-col items-center gap-1.5 transition-colors ${
                  isCurrent
                    ? 'text-brand font-bold'
                    : isDone
                    ? 'text-success font-semibold'
                    : 'text-app-text-secondary opacity-60'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    isCurrent
                      ? 'bg-brand text-white ring-4 ring-brand-light font-bold'
                      : isDone
                      ? 'bg-success text-white font-bold'
                      : 'bg-app-muted border border-app-border text-app-text-secondary'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="hidden sm:inline text-[11px]">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-emergency-light border border-emergency-border text-emergency text-xs flex items-center gap-2 animate-shake">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Multi-Step Wizard Body */}
      <div className="bg-app-surface border border-app-border rounded-2xl shadow-subtle p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* STEP 1: Basic Hospital Info */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-app-border pb-3">
                <h2 className="text-base font-bold text-app-text font-display">
                  Step 1: Hospital Facility Details
                </h2>
                <p className="text-xs text-app-text-secondary mt-0.5">
                  Official clinical name, registration number, and facility classification.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-app-text mb-1">
                    Official Hospital Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g. Apollo Hospital, Jubilee Hills"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Clinical Establishment Registration Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.registrationNumber}
                      onChange={(e) => updateField('registrationNumber', e.target.value)}
                      placeholder="e.g. CEA/TS/HYD/2024/0981"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Facility Classification *
                    </label>
                    <select
                      value={formData.facilityType}
                      onChange={(e) => updateField('facilityType', e.target.value as HospitalFacilityType)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-semibold focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {FACILITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Ownership Type *
                    </label>
                    <select
                      value={formData.ownershipType}
                      onChange={(e) => updateField('ownershipType', e.target.value as HospitalOwnershipType)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-semibold focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {OWNERSHIP_TYPES.map((ot) => (
                        <option key={ot} value={ot}>
                          {ot}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Year Established *
                    </label>
                    <input
                      type="number"
                      min={1850}
                      max={new Date().getFullYear()}
                      value={formData.establishedYear}
                      onChange={(e) => updateField('establishedYear', parseInt(e.target.value) || 2000)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Address and Location */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-app-border pb-3">
                <h2 className="text-base font-bold text-app-text font-display">
                  Step 2: Location & Address
                </h2>
                <p className="text-xs text-app-text-secondary mt-0.5">
                  Physical street address used for emergency routing and donor matching calculations.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-app-text mb-1">
                    Full Street Address *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={formData.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Road No. 72, Film Nagar, Jubilee Hills"
                    className="w-full text-xs px-3.5 py-2 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">District *</label>
                    <input
                      type="text"
                      required
                      value={formData.district}
                      onChange={(e) => updateField('district', e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">Postal PIN Code *</label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={formData.postalCode}
                      onChange={(e) => updateField('postalCode', e.target.value)}
                      placeholder="500033"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">GPS Latitude (Approx)</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => updateField('latitude', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">GPS Longitude (Approx)</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => updateField('longitude', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Authorized Contact */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-app-border pb-3">
                <h2 className="text-base font-bold text-app-text font-display">
                  Step 3: Medical Superintendent & Emergency Contact
                </h2>
                <p className="text-xs text-app-text-secondary mt-0.5">
                  Direct communication channels for critical transfusions and coordinator escalations.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Medical Superintendent / Contact Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.contactName}
                      onChange={(e) => updateField('contactName', e.target.value)}
                      placeholder="Dr. K. Srinivas Rao, MD"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Official Designation *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.contactDesignation}
                      onChange={(e) => updateField('contactDesignation', e.target.value)}
                      placeholder="Medical Superintendent / Transfusion In-Charge"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      Direct Contact Telephone *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.contactPhone}
                      onChange={(e) => updateField('contactPhone', e.target.value)}
                      placeholder="+91 40 2345 6789"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      24/7 Blood Bank / Emergency Hotline *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.emergencyPhone}
                      onChange={(e) => updateField('emergencyPhone', e.target.value)}
                      placeholder="+91 40 2345 9999"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-bold text-emergency focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text mb-1">
                    Official Institutional Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.contactEmail}
                    onChange={(e) => updateField('contactEmail', e.target.value)}
                    placeholder="transfusion@apollohyderabad.org"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Blood Bank & Storage Facilities */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-app-border pb-3">
                <h2 className="text-base font-bold text-app-text font-display">
                  Step 4: Blood Bank & Cold-Chain Storage
                </h2>
                <p className="text-xs text-app-text-secondary mt-0.5">
                  Specify whether the hospital houses a licensed blood bank or coordinates via external depositories.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-app-border bg-app-muted/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-app-text block">
                      In-House Licensed Blood Bank Facility
                    </span>
                    <span className="text-[11px] text-app-text-secondary">
                      Does the facility have on-site apheresis, blood storage refrigerators, or cross-matching labs?
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.hasBloodBank}
                    onChange={(e) => updateField('hasBloodBank', e.target.checked)}
                    className="w-5 h-5 accent-brand rounded cursor-pointer"
                  />
                </div>

                {formData.hasBloodBank ? (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-app-text mb-1">
                          Blood Bank Regulatory License Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.bloodBankLicenseNumber || ''}
                          onChange={(e) => updateField('bloodBankLicenseNumber', e.target.value)}
                          placeholder="e.g. 28C/TS/2021/1102"
                          className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-app-text mb-1">
                          Blood Unit Storage Capacity
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={10000}
                          value={formData.storageCapacityUnits || 200}
                          onChange={(e) => updateField('storageCapacityUnits', parseInt(e.target.value) || 0)}
                          className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-app-text mb-2">
                        Supported Component Capabilities *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {COMPONENT_OPTIONS.map((c) => {
                          const active = formData.componentsSupported.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => toggleComponentCapability(c)}
                              className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                                active
                                  ? 'border-brand bg-brand-light text-brand shadow-xs'
                                  : 'border-app-border bg-app-surface text-app-text-secondary hover:text-app-text'
                              }`}
                            >
                              <span>{c}</span>
                              {active && <Check className="w-4 h-4 text-brand" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-info-light border border-info-border text-info text-xs">
                    Hospital will coordinate incoming emergency units directly with nearby certified blood depositories.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Verification Documents */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-app-border pb-3">
                <h2 className="text-base font-bold text-app-text font-display">
                  Step 5: Regulatory Verification Documents
                </h2>
                <p className="text-xs text-app-text-secondary mt-0.5">
                  Provide regulatory license references or verification proofs for administrative validation.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-app-text mb-1">
                    Clinical Establishment Registration Document Ref *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.registrationCertificateUrl || ''}
                    onChange={(e) => updateField('registrationCertificateUrl', e.target.value)}
                    placeholder="Document reference or verification link"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  />
                </div>

                {formData.hasBloodBank && (
                  <div>
                    <label className="block text-xs font-bold text-app-text mb-1">
                      State Blood Bank License Copy / Reference *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.bloodBankLicenseUrl || ''}
                      onChange={(e) => updateField('bloodBankLicenseUrl', e.target.value)}
                      placeholder="Blood bank regulatory authorization copy ref"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </div>
                )}

                <div className="pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-app-text leading-relaxed">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-brand rounded shrink-0 cursor-pointer"
                    />
                    <span>
                      I declare on behalf of the hospital administration that all provided licenses, medical superintendent details, and clinical blood bank specs are accurate under the National Blood Transfusion Council regulations.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Action Buttons */}
          <div className="pt-4 border-t border-app-border flex items-center justify-between gap-3">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-app-border bg-app-surface text-app-text text-xs font-semibold hover:bg-app-muted transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-xs font-bold shadow-subtle hover:bg-brand-dark transition-colors"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-success text-white text-xs font-bold shadow-subtle hover:bg-success/90 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Submitting Application...' : 'Submit Hospital Registration'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
