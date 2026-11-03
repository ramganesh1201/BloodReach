import {
  LocationProvider,
  LocationSuggestion,
  LocationDetails,
  SearchOptions
} from '../../types/location';

// Curated India Healthcare POI Fallback Registry for zero-latency / offline resilience
const INDIA_HEALTHCARE_REGISTRY: Array<{
  id: string;
  name: string;
  area: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number;
  lng: number;
}> = [
  { id: 'in-hosp-1', name: 'KIMS Hospital (Krishna Institute of Medical Sciences)', area: 'Minister Road, Secunderabad', city: 'Hyderabad', state: 'Telangana', postalCode: '500003', lat: 17.4342, lng: 78.4867 },
  { id: 'in-hosp-2', name: 'KIMS Hospitals Kondapur', area: 'Kondapur, Hitech City Road', city: 'Hyderabad', state: 'Telangana', postalCode: '500084', lat: 17.4645, lng: 78.3662 },
  { id: 'in-hosp-3', name: 'Apollo Hospitals Jubilee Hills', area: 'Road No 72, Film Nagar', city: 'Hyderabad', state: 'Telangana', postalCode: '500033', lat: 17.4168, lng: 78.4116 },
  { id: 'in-hosp-4', name: 'Yashoda Hospitals Somajiguda', area: 'Raj Bhavan Road', city: 'Hyderabad', state: 'Telangana', postalCode: '500082', lat: 17.4239, lng: 78.4589 },
  { id: 'in-hosp-5', name: 'Nizam Institute of Medical Sciences (NIMS)', area: 'Punjagutta', city: 'Hyderabad', state: 'Telangana', postalCode: '500082', lat: 17.4244, lng: 78.4528 },
  { id: 'in-hosp-6', name: 'AIIMS (All India Institute of Medical Sciences)', area: 'Sri Aurobindo Marg, Ansari Nagar', city: 'New Delhi', state: 'Delhi', postalCode: '110029', lat: 28.5672, lng: 77.2100 },
  { id: 'in-hosp-7', name: 'Max Super Speciality Hospital Saket', area: '1, 2 Press Enclave Marg, Saket', city: 'New Delhi', state: 'Delhi', postalCode: '110017', lat: 28.5280, lng: 77.2116 },
  { id: 'in-hosp-8', name: 'Fortis Escorts Heart Institute', area: 'Okhla Road, Sukhdev Vihar', city: 'New Delhi', state: 'Delhi', postalCode: '110025', lat: 28.5606, lng: 77.2736 },
  { id: 'in-hosp-9', name: 'Manipal Hospital HAL Airport Road', area: '98 HAL Old Airport Rd, Kodihalli', city: 'Bengaluru', state: 'Karnataka', postalCode: '560017', lat: 12.9583, lng: 77.6489 },
  { id: 'in-hosp-10', name: 'Narayana Health City', area: '258/A, Bommasandra Industrial Area', city: 'Bengaluru', state: 'Karnataka', postalCode: '560099', lat: 12.8118, lng: 77.6946 },
  { id: 'in-hosp-11', name: 'Fortis Hospital Bannerghatta Road', area: '154/9 Bannerghatta Main Rd', city: 'Bengaluru', state: 'Karnataka', postalCode: '560076', lat: 12.8943, lng: 77.5986 },
  { id: 'in-hosp-12', name: 'Kokilaben Dhirubhai Ambani Hospital', area: 'Rao Saheb, Achutrao Patwardhan Marg, Four Bungalows, Andheri West', city: 'Mumbai', state: 'Maharashtra', postalCode: '400053', lat: 19.1313, lng: 72.8251 },
  { id: 'in-hosp-13', name: 'KEM Hospital (King Edward Memorial)', area: 'Acharya Donde Marg, Parel', city: 'Mumbai', state: 'Maharashtra', postalCode: '400012', lat: 19.0028, lng: 72.8423 },
  { id: 'in-hosp-14', name: 'Tata Memorial Centre Advanced Centre', area: 'Dr. E Borges Road, Parel', city: 'Mumbai', state: 'Maharashtra', postalCode: '400012', lat: 19.0042, lng: 72.8432 },
  { id: 'in-hosp-15', name: 'Christian Medical College (CMC) Vellore', area: 'Ida Scudder Road', city: 'Vellore', state: 'Tamil Nadu', postalCode: '632004', lat: 12.9248, lng: 79.1347 },
  { id: 'in-hosp-16', name: 'Apollo Hospitals Greams Road', area: '21 Greams Lane, Thousand Lights', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600006', lat: 13.0607, lng: 80.2514 },
  { id: 'in-hosp-17', name: 'Amrita Institute of Medical Sciences (AIMS)', area: 'Ponekkara, Edappally', city: 'Kochi', state: 'Kerala', postalCode: '682041', lat: 10.0326, lng: 76.2994 },
  { id: 'in-hosp-18', name: 'Ruby Hall Clinic Pune', area: '40 Sassoon Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', lat: 18.5308, lng: 73.8732 },
  { id: 'in-hosp-19', name: 'PGIMER (Post Graduate Institute of Medical Education & Research)', area: 'Sector 12', city: 'Chandigarh', state: 'Chandigarh', postalCode: '160012', lat: 30.7629, lng: 76.7770 },
  { id: 'in-hosp-20', name: 'Government General Hospital Machilipatnam', area: 'Ramanayyapeta', city: 'Machilipatnam', state: 'Andhra Pradesh', postalCode: '521001', lat: 16.1856, lng: 81.1362 },
];

export class NominatimProvider implements LocationProvider {
  /**
   * Searches healthcare facilities using Photon OpenStreetMap API with India filter & local fallback
   */
  async searchHealthcareFacilities(
    query: string,
    options?: SearchOptions
  ): Promise<LocationSuggestion[]> {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return [];

    try {
      // 1. Live Fetch from Photon Geocoding API (Fast, Free, CORS-friendly, India-focused)
      const searchQuery = cleanQuery.toLowerCase().includes('hospital') || cleanQuery.toLowerCase().includes('clinic')
        ? cleanQuery
        : `${cleanQuery} hospital`;

      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&countrycodes=in&limit=${options?.limit || 7}`;
      
      const response = await fetch(url, { signal: options?.signal });
      if (response.ok) {
        const data = await response.json();
        if (data.features && Array.isArray(data.features) && data.features.length > 0) {
          const suggestions: LocationSuggestion[] = data.features
            .filter((feat: any) => feat.properties && feat.properties.name)
            .map((feat: any) => {
              const props = feat.properties;
              const name = props.name || cleanQuery;
              const secondary = [props.street, props.district || props.suburb || props.county, props.city, props.state]
                .filter(Boolean)
                .join(', ');

              return {
                id: `photon-${props.osm_id || Math.random()}`,
                name: name,
                primaryText: name,
                secondaryText: secondary || 'India',
                type: 'hospital',
                raw: {
                  name,
                  formattedAddress: [name, secondary].filter(Boolean).join(', '),
                  addressLine: [props.housenumber, props.street, props.suburb || props.district].filter(Boolean).join(', '),
                  city: props.city || props.town || props.county || 'Metro Area',
                  district: props.district || props.county || '',
                  state: props.state || '',
                  postalCode: props.postcode || '',
                  country: 'India',
                  latitude: feat.geometry?.coordinates?.[1],
                  longitude: feat.geometry?.coordinates?.[0],
                },
              };
            });

          if (suggestions.length > 0) {
            return suggestions;
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      console.warn('Network location API unavailable, falling back to local registry search:', err);
    }

    // 2. Local Fallback Matching for Resilience
    const lowerQ = cleanQuery.toLowerCase();
    const matchedFallback = INDIA_HEALTHCARE_REGISTRY.filter(
      (h) =>
        h.name.toLowerCase().includes(lowerQ) ||
        h.city.toLowerCase().includes(lowerQ) ||
        h.area.toLowerCase().includes(lowerQ) ||
        h.state.toLowerCase().includes(lowerQ)
    ).slice(0, options?.limit || 6);

    return matchedFallback.map((h) => ({
      id: h.id,
      name: h.name,
      primaryText: h.name,
      secondaryText: `${h.area}, ${h.city}, ${h.state}`,
      type: 'hospital',
      raw: {
        name: h.name,
        formattedAddress: `${h.name}, ${h.area}, ${h.city}, ${h.state} ${h.postalCode}`,
        addressLine: h.area,
        city: h.city,
        district: h.city,
        state: h.state,
        postalCode: h.postalCode,
        country: 'India',
        latitude: h.lat,
        longitude: h.lng,
      },
    }));
  }

  /**
   * Search general addresses/areas in India
   */
  async searchAddresses(
    query: string,
    options?: SearchOptions
  ): Promise<LocationSuggestion[]> {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return [];

    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&countrycodes=in&limit=${options?.limit || 5}`;
      const response = await fetch(url, { signal: options?.signal });
      if (response.ok) {
        const data = await response.json();
        if (data.features && Array.isArray(data.features)) {
          return data.features.map((feat: any) => {
            const props = feat.properties;
            const name = props.name || props.street || cleanQuery;
            const secondary = [props.suburb || props.district, props.city, props.state]
              .filter(Boolean)
              .join(', ');

            return {
              id: `addr-${props.osm_id || Math.random()}`,
              name: name,
              primaryText: name,
              secondaryText: secondary || 'India',
              type: 'address',
              raw: {
                name,
                formattedAddress: [name, secondary].filter(Boolean).join(', '),
                addressLine: [props.housenumber, props.street].filter(Boolean).join(', ') || name,
                city: props.city || props.town || props.county || '',
                district: props.district || props.county || '',
                state: props.state || '',
                postalCode: props.postcode || '',
                country: 'India',
                latitude: feat.geometry?.coordinates?.[1],
                longitude: feat.geometry?.coordinates?.[0],
              },
            };
          });
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
    }

    return [];
  }

  /**
   * Get complete structured details for selected location suggestion
   */
  async getPlaceDetails(
    suggestion: LocationSuggestion,
    _signal?: AbortSignal
  ): Promise<LocationDetails> {
    if (suggestion.raw) {
      const raw = suggestion.raw;
      return {
        placeId: suggestion.id,
        name: raw.name || suggestion.name,
        formattedAddress: raw.formattedAddress || `${suggestion.name}, ${suggestion.secondaryText}`,
        addressLine: raw.addressLine || suggestion.secondaryText,
        city: raw.city || 'Metro City',
        district: raw.district || raw.city || '',
        state: raw.state || '',
        postalCode: raw.postalCode || '',
        country: 'India',
        latitude: raw.latitude,
        longitude: raw.longitude,
        source: 'OpenStreetMap / Healthcare Registry',
      };
    }

    return {
      placeId: suggestion.id,
      name: suggestion.name,
      formattedAddress: `${suggestion.name}, ${suggestion.secondaryText}`,
      addressLine: suggestion.secondaryText,
      city: 'Metro City',
      country: 'India',
      source: 'BloodReach Location Engine',
    };
  }
}
