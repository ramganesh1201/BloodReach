import React, { useState, useEffect, useRef } from 'react';
import { healthcareFacilityService } from '../../services/healthcareFacilityService';
import {
  HealthcareFacility,
  DistrictInfo,
  VerificationStatus,
  FacilityType
} from '../../types/healthcareFacility';
import {
  Building2,
  MapPin,
  Search,
  CheckCircle2,
  Edit3,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface StepLocationProps {
  hospitalName: string;
  hospitalAddress: string;
  city: string;
  district?: string;
  landmark?: string;
  hospitalContactPerson?: string;
  state?: string;
  postalCode?: string;
  facilityId?: string;
  locationSource?: string;
  locationVerificationStatus?: VerificationStatus;
  latitude?: number;
  longitude?: number;
  onChange: (fields: Partial<{
    hospitalName: string;
    hospitalAddress: string;
    city: string;
    district?: string;
    landmark?: string;
    hospitalContactPerson?: string;
    state?: string;
    postalCode?: string;
    facilityId?: string;
    locationSource?: string;
    locationVerificationStatus?: VerificationStatus;
    latitude?: number;
    longitude?: number;
  }>) => void;
  onNext: () => void;
  onBack: () => void;
}

const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  government_hospital: 'Government Hospital',
  district_hospital: 'District Hospital',
  area_hospital: 'Area Hospital',
  community_health_centre: 'Community Health Centre',
  primary_health_centre: 'Primary Health Centre',
  teaching_hospital: 'Teaching Hospital',
  medical_college_hospital: 'Medical College Hospital',
  private_hospital: 'Private Hospital',
  speciality_hospital: 'Speciality Hospital',
  clinic: 'Clinic',
  nursing_home: 'Nursing Home',
  other: 'Healthcare Facility',
};

export const StepLocation: React.FC<StepLocationProps> = ({
  hospitalName,
  hospitalAddress,
  city,
  district = '',
  landmark = '',
  hospitalContactPerson = '',
  state = 'Andhra Pradesh',
  postalCode = '',
  facilityId = '',
  locationSource = 'Source-listed',
  locationVerificationStatus = 'source_listed',
  latitude,
  longitude,
  onChange,
  onNext,
  onBack,
}) => {
  // Mode: 'guided' (District -> City -> Facility) | 'selected' | 'manual' | 'unknown_name'
  const [mode, setMode] = useState<'guided' | 'selected' | 'manual' | 'unknown_name'>(() => {
    if (hospitalName && hospitalAddress && city) return 'selected';
    return 'guided';
  });

  // Selection Hierarchical State
  const [selectedDistrict, setSelectedDistrict] = useState<string>(district || 'Krishna');
  const [selectedCity, setSelectedCity] = useState<string>(city || '');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data State
  const [districtsList, setDistrictsList] = useState<DistrictInfo[]>([]);
  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [facilityResults, setFacilityResults] = useState<HealthcareFacility[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Load AP Districts on mount
  useEffect(() => {
    async function loadDistricts() {
      const dists = await healthcareFacilityService.getDistricts();
      setDistrictsList(dists);
    }
    loadDistricts();
  }, []);

  // Load cities when district changes
  useEffect(() => {
    async function loadCities() {
      if (selectedDistrict) {
        const cities = await healthcareFacilityService.getCitiesByDistrict(selectedDistrict);
        setCitiesList(cities);
        if (!selectedCity || !cities.includes(selectedCity)) {
          setSelectedCity(cities[0] || '');
        }
      }
    }
    loadCities();
  }, [selectedDistrict]);

  // Search facilities when query, district, or city changes
  useEffect(() => {
    let isMounted = true;
    async function performSearch() {
      setIsSearching(true);
      const results = await healthcareFacilityService.searchFacilities({
        district: selectedDistrict,
        city: selectedCity,
        query: searchQuery,
        limit: 8,
      });
      if (isMounted) {
        setFacilityResults(results);
        setIsSearching(false);
      }
    }
    performSearch();
    return () => {
      isMounted = false;
    };
  }, [selectedDistrict, selectedCity, searchQuery]);

  const handleSelectFacility = (fac: HealthcareFacility) => {
    onChange({
      hospitalName: fac.name,
      hospitalAddress: fac.address || `${fac.locality || fac.city || fac.district}, ${fac.state}`,
      city: fac.city || fac.town || selectedCity || 'Machilipatnam',
      district: fac.district,
      state: fac.state,
      postalCode: fac.postalCode || '',
      facilityId: fac.id,
      locationSource: fac.source || 'Public Healthcare Directory',
      locationVerificationStatus: fac.verificationStatus || 'source_listed',
      latitude: fac.latitude,
      longitude: fac.longitude,
    });
    setMode('selected');
  };

  const handleManualSubmit = () => {
    onChange({
      locationVerificationStatus: 'unverified',
      locationSource: 'Manually Added',
    });
    setMode('selected');
  };

  const isValid = hospitalName.trim().length > 2 && hospitalAddress.trim().length > 2 && city.trim().length > 1;

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Step 2 of 3
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Care Location</h2>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">Where is the patient receiving care?</p>
        </div>

        <span className="text-[11px] bg-slate-100 text-slate-700 font-medium px-3 py-1 rounded-full border border-slate-200 self-start sm:self-auto flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-red-600" />
          Andhra Pradesh Healthcare Directory
        </span>
      </div>

      {/* MODE 1: SELECTED LOCATION CARD SUMMARY */}
      {mode === 'selected' && hospitalName ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-card space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-md">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Location Selected
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      locationVerificationStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-900'
                        : locationVerificationStatus === 'unverified'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-100 text-amber-900'
                    }`}>
                      {locationVerificationStatus === 'source_listed'
                        ? 'Source-listed'
                        : locationVerificationStatus === 'unverified'
                        ? 'Unverified Entry'
                        : 'Verification Pending'}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 mt-1">{hospitalName}</h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMode('guided')}
                className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline shrink-0"
              >
                Change location
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Address & Ward</span>
                <p className="font-semibold text-slate-900 leading-relaxed">{hospitalAddress}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Administrative Area</span>
                <p className="font-semibold text-slate-900">
                  {city}, {district} District, Andhra Pradesh {postalCode && `(${postalCode})`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                  Location / Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => onChange({ landmark: e.target.value })}
                  placeholder="e.g. Near Main Bus Terminal, Block C"
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                  Hospital Contact Person (Optional)
                </label>
                <input
                  type="text"
                  value={hospitalContactPerson}
                  onChange={(e) => onChange({ hospitalContactPerson: e.target.value })}
                  placeholder="e.g. Dr. Ramesh / Sister In-Charge"
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Source: <strong>{locationSource}</strong></span>
              </div>
              <span className="text-slate-500 italic">
                Listed from a public healthcare directory. CareLoop has not independently verified this facility.
              </span>
            </div>
          </div>
        </div>
      ) : mode === 'guided' || mode === 'unknown_name' ? (
        /* MODE 2: HIERARCHICAL / DIRECT SEARCH UX */
        <div className="space-y-5">
          {/* Top Selection Path Controls */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Step 1: District Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Step 1: District (Andhra Pradesh) <span className="text-red-600">*</span>
                </label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-semibold bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
                >
                  {districtsList.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name} ({d.headquarters})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Area / Town / City Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Step 2: Area / Town / Locality
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-semibold bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
                >
                  <option value="">All Areas in {selectedDistrict}</option>
                  {citiesList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 3: Search hospital or healthcare facility */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Step 3: Search Hospital / Healthcare Facility
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search hospital in ${selectedDistrict} (e.g. GGH, Area Hospital, KIMS)...`}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {/* Accessibility toggle: "I don't know the hospital name" */}
          <div className="flex items-center justify-between text-xs px-1">
            <button
              type="button"
              onClick={() => setMode(mode === 'unknown_name' ? 'guided' : 'unknown_name')}
              className="text-slate-600 hover:text-slate-900 font-semibold inline-flex items-center gap-1.5 underline"
            >
              <HelpCircle className="w-3.5 h-3.5 text-red-600" />
              {mode === 'unknown_name'
                ? 'Back to search'
                : "I don't know the hospital name — Browse facilities in " + selectedDistrict}
            </button>

            <button
              type="button"
              onClick={() => setMode('manual')}
              className="text-slate-600 hover:text-slate-900 font-bold"
            >
              Enter location manually →
            </button>
          </div>

          {/* Results List Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Healthcare Facilities in {selectedDistrict} {selectedCity && `(${selectedCity})`}
              </span>
              <span className="text-[11px] text-slate-400">
                {facilityResults.length} facilities listed
              </span>
            </div>

            {isSearching ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <span className="text-xs text-slate-500">Searching healthcare facilities...</span>
              </div>
            ) : facilityResults.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">No matching facility in prototype directory</h4>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  If the required medical facility isn't listed in this district, you can enter the location details manually.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  Enter Location Manually
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {facilityResults.map((fac) => (
                  <div
                    key={fac.id}
                    onClick={() => handleSelectFacility(fac)}
                    className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:border-red-400 hover:shadow-md transition-all cursor-pointer space-y-2 flex flex-col justify-between group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-red-700 leading-snug">
                          {fac.name}
                        </h4>
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded shrink-0">
                          {FACILITY_TYPE_LABELS[fac.facilityType]}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {fac.locality || fac.city} · {fac.district} District
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-500">
                        {fac.verificationStatus === 'source_listed' ? 'Source-listed' : 'Unverified'}
                      </span>
                      <span className="text-red-600 font-bold group-hover:underline flex items-center gap-0.5">
                        Select Facility <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MODE 3: MANUAL LOCATION FORM */
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Enter Location Manually</h3>
              <p className="text-xs text-slate-500">Provide full care location details if facility is unlisted.</p>
            </div>
            <button
              type="button"
              onClick={() => setMode('guided')}
              className="text-xs font-bold text-red-600 hover:underline"
            >
              Back to directory
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label htmlFor="manual-facility-name" className="block font-bold text-slate-800 mb-1">
                Hospital / Healthcare Facility Name <span className="text-red-600">*</span>
              </label>
              <input
                id="manual-facility-name"
                type="text"
                value={hospitalName}
                onChange={(e) => onChange({ hospitalName: e.target.value })}
                placeholder="e.g. Community Health Clinic"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div>
              <label htmlFor="manual-address-line" className="block font-bold text-slate-800 mb-1">
                Department / Ward / Street Address <span className="text-red-600">*</span>
              </label>
              <input
                id="manual-address-line"
                type="text"
                value={hospitalAddress}
                onChange={(e) => onChange({ hospitalAddress: e.target.value })}
                placeholder="e.g. ICU Ward 2, Main Road"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-city-input" className="block font-bold text-slate-800 mb-1">
                  City / Town / Area <span className="text-red-600">*</span>
                </label>
                <input
                  id="manual-city-input"
                  type="text"
                  value={city}
                  onChange={(e) => onChange({ city: e.target.value })}
                  placeholder="e.g. Machilipatnam"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:border-red-600 focus:ring-1 focus:ring-red-600"
                />
              </div>

              <div>
                <label htmlFor="manual-district-input" className="block font-bold text-slate-800 mb-1">
                  District (Andhra Pradesh)
                </label>
                <input
                  id="manual-district-input"
                  type="text"
                  value={district}
                  onChange={(e) => onChange({ district: e.target.value })}
                  placeholder="e.g. Krishna"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:border-red-600 focus:ring-1 focus:ring-red-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="manual-postal-code" className="block font-bold text-slate-800 mb-1">
                PIN Code
              </label>
              <input
                id="manual-postal-code"
                type="text"
                value={postalCode}
                onChange={(e) => onChange({ postalCode: e.target.value })}
                placeholder="e.g. 521001"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={!isValid}
              className="py-2.5 px-5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-50"
            >
              Confirm Location Details
            </button>
          </div>
        </div>
      )}

      {/* Action Navigation Footer */}
      <div className="pt-4 flex items-center justify-between border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="text-slate-600 hover:text-slate-900 font-semibold px-4 py-2 rounded-xl text-xs transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="bg-red-600 text-white hover:bg-red-700 font-bold px-6 py-2.5 rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          Continue to Contact <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
