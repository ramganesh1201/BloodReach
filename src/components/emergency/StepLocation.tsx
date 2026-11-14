import React, { useState, useEffect, useRef } from 'react';
import { healthcareFacilityService } from '../../services/healthcareFacilityService';
import {
  hospitalDiscoveryService,
  DiscoveredHospital,
  GeolocationCoords,
} from '../../services/hospitalDiscoveryService';
import {
  DistrictInfo,
  VerificationStatus,
  FacilityType,
} from '../../types/healthcareFacility';
import {
  Building2,
  MapPin,
  Search,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Sparkles,
  Navigation,
  Loader2,
  RefreshCw,
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

const FACILITY_TYPE_LABELS: Record<string, string> = {
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
  hospital: 'Hospital',
  health_centre: 'Health Centre',
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
  const [facilityResults, setFacilityResults] = useState<DiscoveredHospital[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Geolocation & Discovery State
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationNotice, setLocationNotice] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [userCoords, setUserCoords] = useState<GeolocationCoords | null>(null);

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

  // Debounced search facilities when query, district, or city changes
  useEffect(() => {
    let isMounted = true;
    const debounceTimer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await hospitalDiscoveryService.searchHospitals({
          district: selectedDistrict,
          city: selectedCity,
          query: searchQuery,
          limit: 12,
        });
        if (isMounted) {
          setFacilityResults(results);
          setIsSearching(false);
        }
      } catch {
        if (isMounted) setIsSearching(false);
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [selectedDistrict, selectedCity, searchQuery]);

  // Handler for device geolocation
  const handleUseMyLocation = async () => {
    setIsLocating(true);
    setLocationNotice(null);

    const locRes = await hospitalDiscoveryService.getCurrentLocation(10000);
    if (locRes.error || !locRes.coords.latitude) {
      setIsLocating(false);
      setLocationNotice({
        type: 'error',
        message: locRes.error || 'Unable to retrieve your location. Please select your district or enter hospital manually.',
      });
      return;
    }

    setUserCoords(locRes.coords);

    try {
      // Reverse geocode to find user's district and city
      const address = await hospitalDiscoveryService.reverseGeocode(
        locRes.coords.latitude,
        locRes.coords.longitude
      );

      if (address) {
        if (address.district) {
          // If matching AP district found, select it
          const matchingDistrict = districtsList.find(
            (d) => d.name.toLowerCase() === address.district.toLowerCase()
          );
          if (matchingDistrict) {
            setSelectedDistrict(matchingDistrict.name);
          }
        }
        if (address.city) {
          setSelectedCity(address.city);
        }
      }

      // Discover nearby hospitals within 25km radius
      const nearby = await hospitalDiscoveryService.discoverNearbyHospitals(
        locRes.coords.latitude,
        locRes.coords.longitude,
        25
      );

      setFacilityResults(nearby);
      setLocationNotice({
        type: 'success',
        message: `Located nearby hospitals within 25 km${address?.city ? ` around ${address.city}` : ''}.`,
      });
    } catch {
      setLocationNotice({
        type: 'error',
        message: 'Could not fetch nearby facilities. Please select from the district directory.',
      });
    } finally {
      setIsLocating(false);
    }
  };

  const handleSelectFacility = (fac: DiscoveredHospital) => {
    onChange({
      hospitalName: fac.name,
      hospitalAddress: fac.address || `${fac.city || fac.district}, ${fac.state}`,
      city: fac.city || selectedCity || 'Vijayawada',
      district: fac.district || selectedDistrict,
      state: fac.state || 'Andhra Pradesh',
      postalCode: fac.postalCode || '',
      facilityId: fac.id,
      locationSource: fac.sourceLabel,
      locationVerificationStatus: fac.verificationStatus,
      latitude: fac.latitude,
      longitude: fac.longitude,
    });
    setMode('selected');
  };

  const handleManualSubmit = () => {
    onChange({
      locationVerificationStatus: 'unverified',
      locationSource: 'User Submitted',
      facilityId: `manual_${Date.now()}`,
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
              Step 2 of 4
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Care Location</h2>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">Where is the patient receiving emergency medical care?</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isLocating}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-xl border border-red-200 transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            title="Locate nearest hospitals using device GPS"
          >
            {isLocating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                <span>Locating...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5 text-red-600" />
                <span>Use Current Location</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Geolocation Notice Banner */}
      {locationNotice && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fade-in ${
            locationNotice.type === 'error'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : locationNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {locationNotice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{locationNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setLocationNotice(null)}
            className="text-slate-400 hover:text-slate-600 text-[11px] font-bold"
          >
            ✕
          </button>
        </div>
      )}

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
                      {locationVerificationStatus === 'verified'
                        ? 'Verified Facility'
                        : locationVerificationStatus === 'source_listed'
                        ? 'Public Registry'
                        : 'Unverified Entry'}
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
                  {city}, {district ? `${district} District, ` : ''}{state} {postalCode && `(${postalCode})`}
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
                {locationVerificationStatus === 'verified'
                  ? 'CareLoop verified hospital network partner.'
                  : 'Listed from public directory or discovered via OpenStreetMap. Pathologist verification on-site.'}
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
                  placeholder={`Search hospital in ${selectedDistrict} (e.g. GGH, Apollo, Area Hospital, KIMS)...`}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {/* Accessibility toggle: "I don't know the hospital name" */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs px-1 gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'unknown_name' ? 'guided' : 'unknown_name')}
              className="text-slate-600 hover:text-slate-900 font-semibold inline-flex items-center gap-1.5 underline"
            >
              <HelpCircle className="w-3.5 h-3.5 text-red-600" />
              {mode === 'unknown_name'
                ? 'Back to direct search'
                : `Browse all healthcare facilities in ${selectedDistrict}`}
            </button>

            <button
              type="button"
              onClick={() => setMode('manual')}
              className="text-slate-600 hover:text-slate-900 font-bold self-start sm:self-auto"
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
                {facilityResults.length} facilities discovered
              </span>
            </div>

            {isSearching ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <span className="text-xs text-slate-500">Discovering healthcare facilities...</span>
              </div>
            ) : facilityResults.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">No matching hospital found in this area</h4>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  If the required medical facility is unlisted or outside our current directory, you can enter the details manually.
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
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-red-400 hover:shadow-md transition-all cursor-pointer space-y-2 flex flex-col justify-between group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-red-700 leading-snug">
                          {fac.name}
                        </h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                          fac.source === 'careloop_verified'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : fac.source === 'osm_discovered'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {FACILITY_TYPE_LABELS[fac.facilityType] || 'Hospital'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {fac.address || `${fac.city}, ${fac.district}`}
                      </p>
                      {fac.distanceKm !== undefined && (
                        <span className="inline-block text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          📍 {fac.distanceKm} km away
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px]">
                      <span className="flex items-center gap-1 text-slate-500 font-medium">
                        {fac.source === 'careloop_verified' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : fac.source === 'osm_discovered' ? (
                          <Sparkles className="w-3 h-3 text-amber-600" />
                        ) : (
                          <Building2 className="w-3 h-3 text-sky-600" />
                        )}
                        <span>{fac.sourceLabel}</span>
                      </span>
                      <span className="text-red-600 font-bold group-hover:underline flex items-center gap-0.5">
                        Select <ChevronRight className="w-3 h-3" />
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
