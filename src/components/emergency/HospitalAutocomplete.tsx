import React, { useState, useEffect, useRef } from 'react';
import { locationService } from '../../services/locationService';
import { LocationSuggestion, LocationDetails } from '../../types/location';
import { Building2, Search, Loader2, MapPin, Navigation, AlertCircle } from 'lucide-react';

interface HospitalAutocompleteProps {
  value: string;
  onSelectSuggestion: (details: LocationDetails) => void;
  onSwitchToManual: () => void;
  onDetectLocation?: () => void;
  isDetectingLocation?: boolean;
}

export const HospitalAutocomplete: React.FC<HospitalAutocompleteProps> = ({
  value,
  onSelectSuggestion,
  onSwitchToManual,
  onDetectLocation,
  isDetectingLocation = false,
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search API request
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const results = await locationService.searchHealthcareFacilities(trimmed, {
          limit: 7,
          signal: abortControllerRef.current.signal,
        });
        setSuggestions(results);
        setIsOpen(true);
        setSelectedIndex(-1);
        setHasSearched(true);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error searching hospitals:', err);
          setSearchError('Location search is temporarily unavailable. You can enter details manually.');
          setSuggestions([]);
          setIsOpen(true);
        }
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelect(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = async (suggestion: LocationSuggestion) => {
    setIsLoading(true);
    setIsOpen(false);
    try {
      const details = await locationService.getPlaceDetails(suggestion);
      setQuery(details.name || suggestion.name);
      onSelectSuggestion(details);
    } catch (err) {
      console.error('Error resolving place details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3" ref={dropdownRef}>
      <div className="flex items-center justify-between">
        <label htmlFor="hospital-search-input" className="block text-sm font-bold text-slate-900">
          Hospital / Healthcare Facility <span className="text-red-600">*</span>
        </label>

        {onDetectLocation && (
          <button
            type="button"
            onClick={onDetectLocation}
            disabled={isDetectingLocation}
            className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            {isDetectingLocation ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
            ) : (
              <Navigation className="w-3.5 h-3.5 text-red-600" />
            )}
            <span>{isDetectingLocation ? 'Detecting...' : 'Use current location'}</span>
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Start typing the hospital name and select the matching facility to auto-populate address details.
      </p>

      {/* Input Field with ARIA accessibility semantics */}
      <div className="relative">
        <input
          id="hospital-search-input"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="hospital-suggestions-list"
          aria-autocomplete="list"
          aria-activedescendant={selectedIndex >= 0 ? `suggestion-item-${selectedIndex}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search hospital or healthcare facility (e.g. KIMS, Apollo, AIIMS)..."
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:border-red-600 focus:ring-2 focus:ring-red-600/20 shadow-sm transition-all"
        />

        <Building2 className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />

        {isLoading ? (
          <Loader2 className="w-5 h-5 text-red-600 animate-spin absolute right-3 top-3.5" />
        ) : query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="text-slate-400 hover:text-slate-600 absolute right-3 top-3.5 text-xs font-bold px-1"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Autocomplete Dropdown Listbox */}
      {isOpen && (
        <div
          id="hospital-suggestions-list"
          role="listbox"
          className="absolute z-50 mt-1 max-w-2xl w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100"
        >
          {suggestions.length > 0 ? (
            suggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  id={`suggestion-item-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3.5 cursor-pointer flex items-start gap-3 transition-colors ${
                    isSelected ? 'bg-red-50/90 text-red-900' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'
                  }`}>
                    <Building2 className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs block text-slate-900 truncate">
                      {item.primaryText}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                      {item.secondaryText}
                    </span>
                  </div>
                </div>
              );
            })
          ) : hasSearched ? (
            <div className="p-4 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-slate-600 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span>No matching healthcare facilities found for "{query}".</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Try checking spelling or enter hospital location details manually.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSwitchToManual();
                }}
                className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-sm inline-flex items-center gap-1.5"
              >
                Enter location manually
              </button>
            </div>
          ) : searchError ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-xs text-slate-600">{searchError}</p>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSwitchToManual();
                }}
                className="py-1.5 px-3 rounded-lg bg-red-600 text-white font-bold text-xs hover:bg-red-700"
              >
                Enter manually
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Manual Entry Fallback Button */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
        <span>Can't find the hospital in search?</span>
        <button
          type="button"
          onClick={onSwitchToManual}
          className="text-slate-900 font-bold hover:underline"
        >
          Enter location manually →
        </button>
      </div>
    </div>
  );
};
