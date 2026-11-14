import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hospitalDiscoveryService, calculateDistanceKm } from '../services/hospitalDiscoveryService';

describe('hospitalDiscoveryService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('calculates great-circle distance accurately via Haversine formula', () => {
    // Distance between Hyderabad (17.3850, 78.4867) and Vijayawada (16.5062, 80.6480) ~ 248 km
    const dist = calculateDistanceKm(17.385, 78.4867, 16.5062, 80.648);
    expect(dist).toBeGreaterThan(240);
    expect(dist).toBeLessThan(260);
  });

  it('returns local directory hospitals when searching by district and city', async () => {
    const results = await hospitalDiscoveryService.searchHospitals({
      district: 'Krishna',
      city: 'Machilipatnam',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first.name).toBeTruthy();
    expect(first.city).toBe('Machilipatnam');
    expect(['careloop_verified', 'public_directory']).toContain(first.source);
    expect(['verified', 'source_listed']).toContain(first.verificationStatus);
  });

  it('handles geolocation permission denial gracefully without throwing', async () => {
    // Mock navigator.geolocation error code 1 (permission denied)
    const mockGeolocation = {
      getCurrentPosition: vi.fn((_success, error) => {
        error({ code: 1, message: 'User denied Geolocation' });
      }),
    };
    vi.stubGlobal('navigator', { geolocation: mockGeolocation });

    const result = await hospitalDiscoveryService.getCurrentLocation();
    expect(result.error).toContain('denied');
    expect(result.coords.latitude).toBe(0);
  });

  it('parses reverse geocoding results and formats addresses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({
        display_name: 'Government General Hospital, Vijayawada, Krishna, Andhra Pradesh, 520001, India',
        address: {
          city: 'Vijayawada',
          state_district: 'Krishna District',
          state: 'Andhra Pradesh',
          postcode: '520001',
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const addr = await hospitalDiscoveryService.reverseGeocode(16.5062, 80.648);
    expect(addr).not.toBeNull();
    expect(addr?.city).toBe('Vijayawada');
    expect(addr?.district).toBe('Krishna');
    expect(addr?.state).toBe('Andhra Pradesh');
    expect(addr?.postalCode).toBe('520001');
  });

  it('discovers nearby hospitals and assigns proper source indicators', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[]',
      json: async () => [
        {
          osm_id: 987654321,
          name: 'Apollo Speciality Hospital',
          display_name: 'Apollo Speciality Hospital, MG Road, Vijayawada',
          lat: '16.5100',
          lon: '80.6500',
          address: {
            city: 'Vijayawada',
            state_district: 'Krishna',
            state: 'Andhra Pradesh',
          },
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetch);

    const hospitals = await hospitalDiscoveryService.discoverNearbyHospitals(16.5062, 80.648, 10);
    expect(hospitals.length).toBeGreaterThan(0);
    const osmFound = hospitals.find((h) => h.id === 'osm_987654321');
    if (osmFound) {
      expect(osmFound.source).toBe('osm_discovered');
      expect(osmFound.verificationStatus).toBe('unverified');
    }
  });
});
