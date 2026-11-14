/**
 * CareLoop — Hospital Discovery Service
 * 
 * Location-aware healthcare facility discovery combining:
 * 1. CareLoop-curated & verified facilities
 * 2. Public health registry (Andhra Pradesh Department of Health)
 * 3. Live OpenStreetMap (OSM) Nominatim discovery with caching and debouncing
 * 4. User-submitted fallback entries
 */

import { HealthcareFacility, FacilityType, VerificationStatus } from '../types/healthcareFacility';
import { healthcareFacilityService } from './healthcareFacilityService';

export type HospitalSource = 'careloop_verified' | 'public_directory' | 'osm_discovered' | 'user_submitted';

export interface DiscoveredHospital {
  id: string; // Stable identifier: e.g. 'osm_12345678' or database UUID
  osmId?: number;
  name: string;
  address: string;
  city: string;
  district?: string;
  state: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  emergencyPhone?: string;
  facilityType: FacilityType | 'hospital' | 'clinic' | 'health_centre';
  source: HospitalSource;
  sourceLabel: string;
  verificationStatus: VerificationStatus;
  distanceKm?: number;
  isLiveAvailability?: boolean;
}

export interface GeolocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface GeocodedAddress {
  city: string;
  district: string;
  state: string;
  locality?: string;
  postalCode?: string;
  formattedAddress: string;
}

// In-memory cache for live OSM search and reverse geocode queries
const inMemoryCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Great-circle distance calculation via Haversine formula (in kilometers)
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Storage-backed cache helpers
 */
function getCached<T>(key: string): T | null {
  const mem = inMemoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return mem.data as T;
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`careloop_osm_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          inMemoryCache.set(key, parsed);
          return parsed.data as T;
        }
      }
    } catch {
      // sessionStorage restricted or invalid
    }
  }
  return null;
}

function setCached<T>(key: string, data: T): void {
  const entry = { timestamp: Date.now(), data };
  inMemoryCache.set(key, entry);
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(`careloop_osm_${key}`, JSON.stringify(entry));
    } catch {
      // Quota exceeded
    }
  }
}

/**
 * Clean and normalize names for fuzzy deduplication
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hospital|hospitals|clinic|general hospital|ggh|medical college|centre|center|health)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export const hospitalDiscoveryService = {
  /**
   * Acquire browser geolocation with user-friendly timeout
   */
  async getCurrentLocation(timeoutMs = 10000): Promise<{
    coords: GeolocationCoords;
    error?: string;
  }> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return {
        coords: { latitude: 0, longitude: 0 },
        error: 'Geolocation is not supported by your browser.',
      };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          coords: { latitude: 0, longitude: 0 },
          error: 'Location request timed out. Please enter your location manually.',
        });
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer);
          resolve({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          });
        },
        (err) => {
          clearTimeout(timer);
          let errorMsg = 'Failed to retrieve your location.';
          if (err.code === 1) {
            errorMsg = 'Location permission was denied. Please allow location access or select your district manually.';
          } else if (err.code === 2) {
            errorMsg = 'Location unavailable. Please select your district or enter hospital manually.';
          } else if (err.code === 3) {
            errorMsg = 'Location request timed out. Please try again or select district manually.';
          }
          resolve({
            coords: { latitude: 0, longitude: 0 },
            error: errorMsg,
          });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
    });
  },

  /**
   * Reverse geocode coordinates via OpenStreetMap Nominatim
   */
  async reverseGeocode(lat: number, lon: number): Promise<GeocodedAddress | null> {
    const cacheKey = `rev_${lat.toFixed(3)}_${lon.toFixed(3)}`;
    const cached = getCached<GeocodedAddress>(cacheKey);
    if (cached) return cached;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'CareLoop-Emergency-Blood-Platform/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.address) return null;

      const addr = data.address;
      const city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || 'Hyderabad';
      const district = addr.state_district || addr.county || addr.district || '';
      const state = addr.state || 'Andhra Pradesh';
      const locality = addr.suburb || addr.neighbourhood || addr.road || '';
      const postalCode = addr.postcode || '';

      const result: GeocodedAddress = {
        city,
        district: district.replace(/district/i, '').trim(),
        state,
        locality,
        postalCode,
        formattedAddress: data.display_name || `${city}, ${district}, ${state}`,
      };

      setCached(cacheKey, result);
      return result;
    } catch {
      return null;
    }
  },

  /**
   * Discover nearby hospitals using OpenStreetMap Nominatim + local healthcare directory
   */
  async discoverNearbyHospitals(
    lat: number,
    lon: number,
    radiusKm = 25
  ): Promise<DiscoveredHospital[]> {
    const cacheKey = `nearby_${lat.toFixed(2)}_${lon.toFixed(2)}_${radiusKm}`;
    const cached = getCached<DiscoveredHospital[]>(cacheKey);
    if (cached) return cached;

    const discovered: DiscoveredHospital[] = [];

    // 1. Fetch live nearby hospitals from OpenStreetMap Nominatim
    try {
      const delta = radiusKm / 111; // Approx degree delta for radius
      const left = lon - delta;
      const right = lon + delta;
      const top = lat + delta;
      const bottom = lat - delta;

      const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&amenity=hospital&bounded=1&viewbox=${left},${top},${right},${bottom}&addressdetails=1&limit=15`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(osmUrl, {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'CareLoop-Emergency-Blood-Platform/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const osmData: any[] = await res.json();
        if (Array.isArray(osmData)) {
          for (const item of osmData) {
            const itemLat = Number(item.lat);
            const itemLon = Number(item.lon);
            const dist = calculateDistanceKm(lat, lon, itemLat, itemLon);
            const addr = item.address || {};
            const cityName = addr.city || addr.town || addr.suburb || addr.village || '';
            const districtName = (addr.state_district || addr.county || '').replace(/district/i, '').trim();

            discovered.push({
              id: `osm_${item.osm_id}`,
              osmId: item.osm_id,
              name: item.name || item.display_name.split(',')[0],
              address: item.display_name,
              city: cityName,
              district: districtName,
              state: addr.state || 'Andhra Pradesh',
              postalCode: addr.postcode || undefined,
              latitude: itemLat,
              longitude: itemLon,
              facilityType: 'hospital',
              source: 'osm_discovered',
              sourceLabel: 'OpenStreetMap Discovered',
              verificationStatus: 'unverified',
              distanceKm: dist,
              isLiveAvailability: false,
            });
          }
        }
      }
    } catch {
      // Network or timeout: continue to local directory
    }

    // 2. Query seeded & public directory facilities, calculating proximity
    try {
      const directoryFacilities = await healthcareFacilityService.searchFacilities({ limit: 50 });
      for (const fac of directoryFacilities) {
        let dist: number | undefined;
        if (fac.latitude && fac.longitude) {
          dist = calculateDistanceKm(lat, lon, fac.latitude, fac.longitude);
        }

        // Deduplication: if an OSM hospital matches this directory hospital, merge it
        const normDirName = normalizeName(fac.name);
        const existingIdx = discovered.findIndex((d) => {
          if (normDirName && normalizeName(d.name) === normDirName) return true;
          if (dist !== undefined && d.distanceKm !== undefined && Math.abs(d.distanceKm - dist) < 0.2) return true;
          return false;
        });

        const facilityModel: DiscoveredHospital = {
          id: fac.id,
          name: fac.name,
          address: fac.address || `${fac.locality || fac.city}, ${fac.district}`,
          city: fac.city || fac.town || '',
          district: fac.district,
          state: fac.state,
          postalCode: fac.postalCode,
          latitude: fac.latitude,
          longitude: fac.longitude,
          emergencyPhone: fac.emergencyPhone,
          facilityType: fac.facilityType,
          source: fac.verificationStatus === 'verified' ? 'careloop_verified' : 'public_directory',
          sourceLabel: fac.verificationStatus === 'verified' ? 'CareLoop Verified' : 'Public Health Directory',
          verificationStatus: fac.verificationStatus || 'source_listed',
          distanceKm: dist,
          isLiveAvailability: false,
        };

        if (existingIdx !== -1) {
          // Replace unverified OSM entry with verified public directory entry, preserving OSM ID
          const osmRef = discovered[existingIdx];
          facilityModel.osmId = osmRef.osmId;
          discovered[existingIdx] = facilityModel;
        } else if (dist === undefined || dist <= radiusKm) {
          discovered.push(facilityModel);
        }
      }
    } catch {
      // Local fallback failed
    }

    // Sort by distance (if available) then by verification status
    discovered.sort((a, b) => {
      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.verificationStatus === 'verified') return -1;
      if (b.verificationStatus === 'verified') return 1;
      return 0;
    });

    setCached(cacheKey, discovered);
    return discovered;
  },

  /**
   * Search hospitals across query, district, city, combining sources
   */
  async searchHospitals(options: {
    query?: string;
    district?: string;
    city?: string;
    limit?: number;
  }): Promise<DiscoveredHospital[]> {
    const { query = '', district = '', city = '', limit = 15 } = options;
    const cacheKey = `search_${query.trim().toLowerCase()}_${district.trim().toLowerCase()}_${city.trim().toLowerCase()}_${limit}`;
    const cached = getCached<DiscoveredHospital[]>(cacheKey);
    if (cached) return cached;

    const results: DiscoveredHospital[] = [];

    // 1. Search seeded & verified directory
    try {
      const dirResults = await healthcareFacilityService.searchFacilities({
        district: district || undefined,
        city: city || undefined,
        query: query || undefined,
        limit,
      });

      for (const fac of dirResults) {
        results.push({
          id: fac.id,
          name: fac.name,
          address: fac.address || `${fac.locality || fac.city}, ${fac.district}`,
          city: fac.city || fac.town || '',
          district: fac.district,
          state: fac.state,
          postalCode: fac.postalCode,
          latitude: fac.latitude,
          longitude: fac.longitude,
          emergencyPhone: fac.emergencyPhone,
          facilityType: fac.facilityType,
          source: fac.verificationStatus === 'verified' ? 'careloop_verified' : 'public_directory',
          sourceLabel: fac.verificationStatus === 'verified' ? 'CareLoop Verified' : 'Public Health Directory',
          verificationStatus: fac.verificationStatus || 'source_listed',
          isLiveAvailability: false,
        });
      }
    } catch {
      // Proceed to OSM search
    }

    // 2. If query is provided, query OpenStreetMap Nominatim for additional live discovered facilities
    if (query.trim().length >= 3) {
      try {
        const searchTerms = [query.trim()];
        if (city) searchTerms.push(city);
        else if (district) searchTerms.push(district);
        searchTerms.push('Andhra Pradesh');

        const osmQuery = encodeURIComponent(searchTerms.join(', '));
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${osmQuery}&addressdetails=1&limit=8`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(osmUrl, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'CareLoop-Emergency-Blood-Platform/1.0',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const osmData: any[] = await res.json();
          if (Array.isArray(osmData)) {
            for (const item of osmData) {
              const isHospital =
                item.type === 'hospital' ||
                item.class === 'amenity' ||
                item.display_name.toLowerCase().includes('hospital') ||
                item.display_name.toLowerCase().includes('medical');

              if (!isHospital) continue;

              const normName = normalizeName(item.name || item.display_name);
              const alreadyExists = results.some((r) => normalizeName(r.name) === normName);
              if (alreadyExists) continue;

              const addr = item.address || {};
              const cityName = addr.city || addr.town || addr.suburb || addr.village || city;
              const districtName = (addr.state_district || addr.county || district).replace(/district/i, '').trim();

              results.push({
                id: `osm_${item.osm_id}`,
                osmId: item.osm_id,
                name: item.name || item.display_name.split(',')[0],
                address: item.display_name,
                city: cityName,
                district: districtName,
                state: addr.state || 'Andhra Pradesh',
                postalCode: addr.postcode || undefined,
                latitude: Number(item.lat),
                longitude: Number(item.lon),
                facilityType: 'hospital',
                source: 'osm_discovered',
                sourceLabel: 'OpenStreetMap Discovered',
                verificationStatus: 'unverified',
                isLiveAvailability: false,
              });
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }

    const trimmed = results.slice(0, limit);
    setCached(cacheKey, trimmed);
    return trimmed;
  },
};
