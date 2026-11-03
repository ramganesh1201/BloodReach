import React, { useState, useEffect, useRef } from 'react';
import { locationService } from '../../services/locationService';
import { LocationSuggestion, LocationDetails } from '../../types/location';
import { MapPin, Loader2, Search } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectAddressSuggestion: (details: LocationDetails) => void;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelectAddressSuggestion,
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await locationService.searchAddresses(trimmed, { limit: 5 });
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch (err) {
        console.error('Error searching address:', err);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = async (item: LocationSuggestion) => {
    setIsLoading(true);
    setIsOpen(false);
    try {
      const details = await locationService.getPlaceDetails(item);
      setQuery(details.addressLine || item.name);
      onSelectAddressSuggestion(details);
    } catch (err) {
      console.error('Error selecting address details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label htmlFor="address-autocomplete-input" className="block text-sm font-semibold text-slate-800 mb-1">
        Department / Ward / Address Details <span className="text-red-600">*</span>
      </label>

      <div className="relative">
        <input
          id="address-autocomplete-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="e.g. Emergency Ward 3B, Sector 4..."
          className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:border-red-600 focus:ring-1 focus:ring-red-600"
        />
        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
        {isLoading && <Loader2 className="w-4 h-4 text-red-600 animate-spin absolute right-3 top-3.5" />}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-40 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden divide-y divide-slate-100">
          {suggestions.map((item) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item)}
              className="p-3 hover:bg-slate-50 cursor-pointer text-xs space-y-0.5"
            >
              <span className="font-bold text-slate-900 block truncate">{item.primaryText}</span>
              <span className="text-slate-500 block truncate text-[11px]">{item.secondaryText}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
