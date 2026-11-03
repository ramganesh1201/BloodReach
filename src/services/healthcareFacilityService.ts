import {
  HealthcareFacility,
  DistrictInfo,
  FacilitySearchOptions,
  VerificationStatus
} from '../types/healthcareFacility';
import { ANDHRA_PRADESH_DISTRICTS } from '../data/healthcareFacilities/districts';
import { ANDHRA_PRADESH_HEALTHCARE_FACILITIES } from '../data/healthcareFacilities/andhraPradesh';

export interface HealthcareFacilityProvider {
  searchDistricts(query: string): Promise<DistrictInfo[]>;
  getCitiesByDistrict(district: string): Promise<string[]>;
  searchFacilities(options: FacilitySearchOptions): Promise<HealthcareFacility[]>;
  getFacilityById(id: string): Promise<HealthcareFacility | undefined>;
}

export class SeededAndhraPradeshProvider implements HealthcareFacilityProvider {
  private districts: DistrictInfo[] = ANDHRA_PRADESH_DISTRICTS;
  private facilities: HealthcareFacility[] = ANDHRA_PRADESH_HEALTHCARE_FACILITIES;

  async searchDistricts(query: string): Promise<DistrictInfo[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.districts;
    return this.districts.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.headquarters.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q)
    );
  }

  async getCitiesByDistrict(districtName: string): Promise<string[]> {
    const matched = this.facilities.filter(
      (f) => f.district.toLowerCase() === districtName.trim().toLowerCase()
    );
    const citiesSet = new Set<string>();
    matched.forEach((f) => {
      if (f.city) citiesSet.add(f.city);
      if (f.town && f.town !== f.city) citiesSet.add(f.town);
    });
    return Array.from(citiesSet).sort();
  }

  async searchFacilities(options: FacilitySearchOptions): Promise<HealthcareFacility[]> {
    const { district, city, locality, query, facilityType, limit = 8 } = options;
    const q = query ? query.trim().toLowerCase() : '';

    let results = this.facilities;

    if (district) {
      results = results.filter(
        (f) => f.district.toLowerCase() === district.trim().toLowerCase()
      );
    }

    if (city) {
      results = results.filter(
        (f) =>
          f.city?.toLowerCase() === city.trim().toLowerCase() ||
          f.town?.toLowerCase() === city.trim().toLowerCase()
      );
    }

    if (locality) {
      results = results.filter(
        (f) => f.locality?.toLowerCase().includes(locality.trim().toLowerCase())
      );
    }

    if (facilityType) {
      results = results.filter((f) => f.facilityType === facilityType);
    }

    if (q) {
      results = results.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.normalizedName.includes(q) ||
          (f.city && f.city.toLowerCase().includes(q)) ||
          (f.locality && f.locality.toLowerCase().includes(q)) ||
          f.facilityType.toLowerCase().includes(q)
      );
    }

    return results.slice(0, limit);
  }

  async getFacilityById(id: string): Promise<HealthcareFacility | undefined> {
    return this.facilities.find((f) => f.id === id);
  }
}

class HealthcareFacilityService {
  private provider: HealthcareFacilityProvider;

  constructor(provider?: HealthcareFacilityProvider) {
    this.provider = provider || new SeededAndhraPradeshProvider();
  }

  public setProvider(newProvider: HealthcareFacilityProvider) {
    this.provider = newProvider;
  }

  public async getDistricts(query: string = ''): Promise<DistrictInfo[]> {
    return this.provider.searchDistricts(query);
  }

  public async getCitiesByDistrict(district: string): Promise<string[]> {
    return this.provider.getCitiesByDistrict(district);
  }

  public async searchFacilities(options: FacilitySearchOptions): Promise<HealthcareFacility[]> {
    return this.provider.searchFacilities(options);
  }

  public async getFacilityById(id: string): Promise<HealthcareFacility | undefined> {
    return this.provider.getFacilityById(id);
  }
}

export const healthcareFacilityService = new HealthcareFacilityService();
