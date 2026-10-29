"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Crosshair, MapPin, AlertCircle, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  loadGoogleMapsScript,
  getGoogleMapsApiKey,
  onGoogleMapsAuthFailure,
} from "@/lib/geo/googleMapsLoader";

interface LocationMapPickerProps {
  locationText: string;
  latitude: string;
  longitude: string;
  onChange: (update: {
    locationText?: string;
    latitude?: string;
    longitude?: string;
  }) => void;
  placeholder?: string;
  locating: boolean;
  onCaptureLocation: () => void;
  geoError: string | null;
}

// Default fallback coordinates (Bangalore center)
const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const DEFAULT_ZOOM = 12;
const FOCUSED_ZOOM = 16;

export function LocationMapPicker({
  locationText,
  latitude,
  longitude,
  onChange,
  placeholder = "Search for an address, road, or landmark...",
  locating,
  onCaptureLocation,
  geoError,
}: LocationMapPickerProps) {
  const [mapsState, setMapsState] = useState<"loading" | "ready" | "no_key" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  const hasValidCoords =
    !isNaN(latNum) &&
    !isNaN(lngNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180;

  // Reverse geocode a LatLng position to address text
  const reverseGeocodePosition = useCallback(
    (lat: number, lng: number) => {
      if (typeof window === "undefined" || !window.google?.maps?.Geocoder) return;

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const formatted = results[0].formatted_address;
          onChange({
            locationText: formatted,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
          });
        }
      });
    },
    [onChange]
  );

  // Initialize Google Maps and Places Autocomplete
  useEffect(() => {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      setMapsState("no_key");
      return;
    }

    let isCancelled = false;

    const cleanupAuth = onGoogleMapsAuthFailure(() => {
      if (!isCancelled) {
        setMapsState("error");
        setErrorMessage("Google Maps authentication failed: check your API key, domain restrictions, and billing in Google Cloud Console.");
      }
    });

    loadGoogleMapsScript()
      .then((googleInstance) => {
        if (isCancelled) return;
        setMapsState("ready");

        if (!mapContainerRef.current) return;

        const initialCenter = hasValidCoords
          ? { lat: latNum, lng: lngNum }
          : DEFAULT_CENTER;
        const initialZoom = hasValidCoords ? FOCUSED_ZOOM : DEFAULT_ZOOM;

        // Initialize Map
        const map = new googleInstance.maps.Map(mapContainerRef.current, {
          center: initialCenter,
          zoom: initialZoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        });
        mapRef.current = map;

        // Initialize Marker pointer
        const marker = new googleInstance.maps.Marker({
          position: initialCenter,
          map: hasValidCoords ? map : null, // visible only if valid coords exist
          draggable: true,
          animation: googleInstance.maps.Animation.DROP,
          title: "Incident location pointer",
        });
        markerRef.current = marker;

        // Drag marker event
        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const newLat = pos.lat();
          const newLng = pos.lng();
          onChange({
            latitude: newLat.toFixed(6),
            longitude: newLng.toFixed(6),
          });
          reverseGeocodePosition(newLat, newLng);
        });

        // Click on map to place/move marker pointer
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const clickedLat = e.latLng.lat();
          const clickedLng = e.latLng.lng();

          marker.setPosition(e.latLng);
          marker.setMap(map);

          onChange({
            latitude: clickedLat.toFixed(6),
            longitude: clickedLng.toFixed(6),
          });

          reverseGeocodePosition(clickedLat, clickedLng);
        });

        // Initialize Places Autocomplete
        if (searchInputRef.current && googleInstance.maps.places?.Autocomplete) {
          const autocomplete = new googleInstance.maps.places.Autocomplete(
            searchInputRef.current,
            {
              fields: ["formatted_address", "geometry", "name"],
            }
          );
          autocomplete.bindTo("bounds", map);
          autocompleteRef.current = autocomplete;

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (!place.geometry || !place.geometry.location) {
              return;
            }

            const pLat = place.geometry.location.lat();
            const pLng = place.geometry.location.lng();
            const placeAddress =
              place.formatted_address || place.name || "";

            // Update Map and Marker
            map.panTo(place.geometry.location);
            map.setZoom(FOCUSED_ZOOM);

            marker.setPosition(place.geometry.location);
            marker.setMap(map);

            onChange({
              locationText: placeAddress,
              latitude: pLat.toFixed(6),
              longitude: pLng.toFixed(6),
            });
          });
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Error initializing Google Maps/Places:", err);
        setMapsState("error");
        setErrorMessage(
          err?.message === "NO_API_KEY"
            ? "No Google Maps API Key provided."
            : err?.message || "Could not load Google Maps."
        );
      });

    return () => {
      isCancelled = true;
      cleanupAuth();
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
    };
  }, []); // Run on mount

  // Sync external coordinates changes (e.g. from "Use my location" button) to Google Map & Marker
  useEffect(() => {
    if (mapsState !== "ready" || !mapRef.current || !markerRef.current) return;
    if (!hasValidCoords) return;

    const targetPos = { lat: latNum, lng: lngNum };
    const currentMarkerPos = markerRef.current.getPosition();

    // Check if difference is significant before updating map & marker
    const isDifferent =
      !currentMarkerPos ||
      Math.abs(currentMarkerPos.lat() - latNum) > 0.00001 ||
      Math.abs(currentMarkerPos.lng() - lngNum) > 0.00001;

    if (isDifferent) {
      markerRef.current.setPosition(targetPos);
      markerRef.current.setMap(mapRef.current);
      mapRef.current.panTo(targetPos);
      if (mapRef.current.getZoom()! < FOCUSED_ZOOM) {
        mapRef.current.setZoom(FOCUSED_ZOOM);
      }
    }
  }, [hasValidCoords, latNum, lngNum, mapsState]);

  // Keep input text synced with locationText state if user changes it
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ locationText: e.target.value });
  };

  const handleClearLocation = () => {
    onChange({ locationText: "", latitude: "", longitude: "" });
    if (markerRef.current) {
      markerRef.current.setMap(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Input powered by Google Places API */}
      <Field>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor="places-search">Place & Landmark</FieldLabel>
            {mapsState === "ready" && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold">
                Google Places
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onCaptureLocation}
            disabled={locating}
          >
            {locating ? <Spinner /> : <Crosshair className="size-3.5" />}
            {locating ? "Locating" : "Use my location"}
          </Button>
        </div>

        <div className="relative">
          <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            id="places-search"
            value={locationText}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="pl-9 pr-10"
            autoComplete="off"
          />
          {locationText && (
            <button
              type="button"
              onClick={handleClearLocation}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Clear location"
            >
              Clear
            </button>
          )}
        </div>
        <FieldDescription>
          Type to search with Google Places Autocomplete, or select a spot directly on the map.
        </FieldDescription>
      </Field>

      {/* Google Map Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Interactive Map Pointer
          </span>
          {hasValidCoords && (
            <span className="text-xs text-emerald-600 font-mono">
              ● Pointer set at {latNum.toFixed(4)}, {lngNum.toFixed(4)}
            </span>
          )}
        </div>

        {/* Map Container */}
        <div className="relative w-full h-72 sm:h-80 rounded-xl overflow-hidden border border-border bg-muted/30">
          {mapsState === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50 z-10">
              <Spinner className="size-6 text-primary" />
              <span className="text-xs text-muted-foreground">Loading Google Map...</span>
            </div>
          )}

          {mapsState === "no_key" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-muted/40 z-10">
              <AlertCircle className="size-8 text-amber-500 mb-2" />
              <div className="text-sm font-semibold">Google Maps API Key Required</div>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                To enable Google Places autocomplete and the interactive Google Map preview, add{" "}
                <code className="font-mono bg-background px-1 py-0.5 rounded border text-[11px]">
                  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                </code>{" "}
                to your environment.
              </p>
              <div className="text-xs text-muted-foreground mt-2">
                You can still enter coordinates and landmarks manually below.
              </div>
            </div>
          )}

          {mapsState === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-muted/40 z-10">
              <AlertCircle className="size-8 text-destructive mb-2" />
              <div className="text-sm font-semibold">Google Map failed to load</div>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {errorMessage || "Check your network connection and Google Cloud API credentials."}
              </p>
            </div>
          )}

          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating Map Hint Overlay */}
          {mapsState === "ready" && (
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none flex justify-center">
              <div className="bg-background/90 backdrop-blur-sm shadow-sm border border-border/80 px-2.5 py-1 rounded-md text-[11px] text-muted-foreground flex items-center gap-1.5 pointer-events-auto">
                <Info className="size-3.5 text-primary" />
                <span>Click map or drag the pointer to adjust location</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coordinates Inputs (for fine-tuning or verification) */}
      <Field>
        <FieldLabel>Coordinates (Latitude & Longitude)</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <Input
            id="latitude"
            inputMode="decimal"
            value={latitude}
            onChange={(e) => onChange({ latitude: e.target.value })}
            placeholder="Latitude — 12.911600"
          />
          <Input
            id="longitude"
            inputMode="decimal"
            value={longitude}
            onChange={(e) => onChange({ longitude: e.target.value })}
            placeholder="Longitude — 77.641200"
            aria-label="Longitude"
          />
        </div>

        {geoError ? (
          <FieldDescription className="text-destructive">{geoError}</FieldDescription>
        ) : (
          <FieldDescription>
            Coordinates drive zone sensitivity and ward authority routing. Selecting a place automatically fills these.
          </FieldDescription>
        )}
      </Field>
    </div>
  );
}
