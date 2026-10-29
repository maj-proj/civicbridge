"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  loadGoogleMapsScript,
  getGoogleMapsApiKey,
} from "@/lib/geo/googleMapsLoader";

interface ReportLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
  wardName?: string | null;
}

export function ReportLocationMap({
  latitude,
  longitude,
  address,
  wardName,
}: ReportLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapsState, setMapsState] = useState<"loading" | "ready" | "no_key" | "error">("loading");

  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    !isNaN(latitude) &&
    !isNaN(longitude);

  useEffect(() => {
    if (!hasCoords) return;

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      setMapsState("no_key");
      return;
    }

    let isCancelled = false;

    loadGoogleMapsScript()
      .then((googleInstance) => {
        if (isCancelled || !mapContainerRef.current) return;
        setMapsState("ready");

        const pos = { lat: latitude, lng: longitude };

        const map = new googleInstance.maps.Map(mapContainerRef.current, {
          center: pos,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        });

        new googleInstance.maps.Marker({
          position: pos,
          map,
          title: address || wardName || "Report Location",
        });
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Failed to load map on report details:", err);
        setMapsState("error");
      });

    return () => {
      isCancelled = true;
    };
  }, [hasCoords, latitude, longitude, address, wardName]);

  if (!hasCoords) return null;

  const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <MapPin className="size-4 text-primary" />
          Location map
        </CardTitle>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Open Maps
          <ExternalLink className="size-3" />
        </a>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative w-full h-48 rounded-lg overflow-hidden border border-border bg-muted/30">
          {mapsState === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10">
              <Spinner className="size-5 text-primary" />
            </div>
          )}

          {mapsState === "no_key" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-muted/40 z-10">
              <span className="text-xs text-muted-foreground">
                Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to view map.
              </span>
            </div>
          )}

          <div ref={mapContainerRef} className="w-full h-full" />
        </div>

        <div className="text-xs text-muted-foreground flex justify-between items-center font-mono">
          <span>
            {latitude?.toFixed(6)}, {longitude?.toFixed(6)}
          </span>
          {wardName && <span className="font-sans font-medium text-foreground">{wardName}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
