export interface LocationSuggestion {
  id: string;
  name: string;
  primaryText: string;
  secondaryText: string;
  type?: 'hospital' | 'clinic' | 'healthcare' | 'address' | 'locality';
  raw?: any;
}

export interface LocationDetails {
  placeId: string;
  name?: string;
  formattedAddress: string;
  addressLine?: string;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  source: string;
}

export interface SearchOptions {
  limit?: number;
  latitude?: number;
  longitude?: number;
  cityHint?: string;
  signal?: AbortSignal;
}

export interface LocationProvider {
  searchHealthcareFacilities(
    query: string,
    options?: SearchOptions
  ): Promise<LocationSuggestion[]>;

  searchAddresses(
    query: string,
    options?: SearchOptions
  ): Promise<LocationSuggestion[]>;

  getPlaceDetails(
    suggestion: LocationSuggestion,
    signal?: AbortSignal
  ): Promise<LocationDetails>;
}
