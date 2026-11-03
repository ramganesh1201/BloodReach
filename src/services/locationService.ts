import { LocationProvider, LocationSuggestion, LocationDetails, SearchOptions } from '../types/location';
import { NominatimProvider } from './locationProviders/nominatimProvider';

class LocationService {
  private provider: LocationProvider;

  constructor(provider?: LocationProvider) {
    this.provider = provider || new NominatimProvider();
  }

  public setProvider(newProvider: LocationProvider) {
    this.provider = newProvider;
  }

  public async searchHealthcareFacilities(
    query: string,
    options?: SearchOptions
  ): Promise<LocationSuggestion[]> {
    if (!query || query.trim().length < 2) return [];
    return this.provider.searchHealthcareFacilities(query, options);
  }

  public async searchAddresses(
    query: string,
    options?: SearchOptions
  ): Promise<LocationSuggestion[]> {
    if (!query || query.trim().length < 2) return [];
    return this.provider.searchAddresses(query, options);
  }

  public async getPlaceDetails(
    suggestion: LocationSuggestion,
    signal?: AbortSignal
  ): Promise<LocationDetails> {
    return this.provider.getPlaceDetails(suggestion, signal);
  }
}

export const locationService = new LocationService();
