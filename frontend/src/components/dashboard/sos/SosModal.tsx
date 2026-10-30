"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  AlertTriangle,
  CarFront,
  CheckCircle2,
  Flame,
  HeartPulse,
  MapPin,
  PhoneCall,
  ShieldAlert,
  Siren,
  User,
  UserX,
  X,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  PERSONAL_EMERGENCY_OPTIONS,
  EmergencyOptionConfig,
  SosCallResult,
} from "@/lib/sos/types";
import { useAuthSession } from "@/lib/useAuthSession";
import { useSafeClerk } from "@/components/ClerkWrapper";

interface SosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SosModal({ isOpen, onClose }: SosModalProps) {
  const { user: anonUser } = useAuthSession();
  const clerk = useSafeClerk();

  const [selectedOption, setSelectedOption] = useState<EmergencyOptionConfig | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callResult, setCallResult] = useState<SosCallResult | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  // User location state
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

  // Identity preference: User can toggle anonymity
  const [forceAnonymous, setForceAnonymous] = useState(false);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Determine user name
  const clerkName =
    clerk?.user?.fullName ||
    clerk?.user?.firstName ||
    clerk?.user?.primaryEmailAddress?.emailAddress ||
    null;

  const rawUserName = clerk?.isSignedIn
    ? clerkName
    : anonUser?.username && !anonUser.username.toLowerCase().includes("anon")
    ? anonUser.username
    : null;

  const resolvedCitizenName = forceAnonymous || !rawUserName ? "Anonymous Citizen" : rawUserName;
  const isAnonymous = resolvedCitizenName === "Anonymous Citizen";

  // Automatically fetch current GPS location when modal opens
  const fetchLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setLocating(false);

        // Try reverse geocoding for quick street landmark
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
          );
          if (res.ok) {
            const data = await res.json();
            setLocationAddress(data.display_name || null);
          }
        } catch {
          // Non-fatal
        }
      },
      (err) => {
        console.warn("SOS Geolocation error:", err);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLocation();
    } else {
      // Reset state when closed
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setSelectedOption(null);
      setCountdown(null);
      setIsCalling(false);
      setCallResult(null);
      setCallError(null);
    }
  }, [isOpen, fetchLocation]);

  // Execute the Twilio AI dispatch call
  const executeCall = useCallback(
    async (option: EmergencyOptionConfig) => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setCountdown(null);
      setIsCalling(true);
      setCallError(null);

      try {
        const response = await fetch("/api/sos/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emergencyType: option.id,
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
            locationText: locationAddress,
            anonymous: isAnonymous,
          }),
        });

        const data: SosCallResult = await response.json();

        if (!response.ok || !data.success) {
          setCallError(data.error || "Failed to initiate emergency call.");
        } else {
          setCallResult(data);
        }
      } catch (err) {
        console.error("SOS Call network error:", err);
        setCallError("Network error: Could not reach emergency dispatch service.");
      } finally {
        setIsCalling(false);
      }
    },
    [coords, locationAddress, isAnonymous]
  );

  // Handle clicking an emergency option: starts 5-second countdown
  const handleSelectOption = (option: EmergencyOptionConfig) => {
    setSelectedOption(option);
    setCountdown(5);

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownTimerRef.current!);
          executeCall(option);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCancelCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setCountdown(null);
    setSelectedOption(null);
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
            "transition-opacity duration-200",
            "data-starting-style:opacity-0 data-ending-style:opacity-0"
          )}
        />
        {/* Centered panel */}
        <DialogPrimitive.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto",
            "rounded-2xl border border-destructive/40 bg-card shadow-2xl",
            "transition-all duration-200",
            "data-starting-style:opacity-0 data-starting-style:scale-95",
            "data-ending-style:opacity-0 data-ending-style:scale-95"
          )}
        >
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-md animate-pulse">
              <Siren className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-destructive">
                EMERGENCY SOS DISPATCH
              </h2>
              <p className="text-xs text-muted-foreground">
                AI automated emergency voice calling via Twilio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Active Calling or Result State */}
          {callResult ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 border border-emerald-300">
                <CheckCircle2 className="size-8" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground">
                  AI Emergency Call Dispatched
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Dialed <span className="font-semibold text-foreground">{callResult.dialedNumber}</span> ({callResult.responderDept})
                </p>
                {callResult.mode === "dry_run" && (
                  <Badge variant="outline" className="mt-2 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    Simulation Mode (Dry Run)
                  </Badge>
                )}
                {callResult.callSid && (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    Twilio Call SID: {callResult.callSid}
                  </div>
                )}
              </div>

              {/* Spoken Speech Transcript */}
              <div className="text-left rounded-xl border bg-muted/40 p-4 text-xs space-y-1.5">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <PhoneCall className="size-3.5 text-primary" />
                  What the AI announced:
                </div>
                <p className="italic text-muted-foreground leading-relaxed">
                  &ldquo;{callResult.speechText}&rdquo;
                </p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <Button variant="outline" onClick={() => setCallResult(null)}>
                  <RotateCcw className="size-4 mr-1.5" />
                  Trigger Another Alert
                </Button>
                <Button onClick={onClose} variant="secondary">
                  Done
                </Button>
              </div>
            </div>
          ) : isCalling ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative flex items-center justify-center">
                <span className="absolute size-20 animate-ping rounded-full bg-destructive/20" />
                <span className="relative flex size-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg">
                  <PhoneCall className="size-8 animate-bounce" />
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Connecting AI Emergency Call...</h3>
                <p className="text-xs text-muted-foreground">
                  Establishing direct voice connection with {selectedOption?.responderDept}
                </p>
              </div>
              <Spinner className="size-5 text-destructive" />
            </div>
          ) : countdown !== null && selectedOption ? (
            /* Countdown confirmation */
            <div className="py-6 flex flex-col items-center justify-center gap-4 text-center bg-destructive/5 rounded-xl border border-destructive/30 p-6">
              <div className="flex size-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xl font-black shadow-xl ring-4 ring-destructive/20 animate-pulse">
                {countdown}
              </div>

              <div className="space-y-1">
                <div className="text-lg font-bold text-destructive">
                  Calling {selectedOption.title}
                </div>
                <p className="text-xs text-muted-foreground max-w-sm">
                  AI is preparing to call <span className="font-semibold text-foreground">{selectedOption.responderDept}</span>. 
                  Cancelling in {countdown} seconds if tapped by accident.
                </p>
              </div>

              <div className="flex gap-3 w-full max-w-xs pt-2">
                <Button
                  variant="destructive"
                  size="lg"
                  className="flex-1 font-bold"
                  onClick={handleCancelCountdown}
                >
                  <X className="size-4 mr-1" />
                  CANCEL
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => executeCall(selectedOption)}
                >
                  <PhoneCall className="size-4 mr-1 text-destructive" />
                  Call Now
                </Button>
              </div>
            </div>
          ) : (
            /* Standard Option Selection View */
            <>
              {/* Context bar: Location & Citizen Identity */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 text-xs">
                {/* Location */}
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="size-4 shrink-0 text-destructive" />
                  <span className="truncate">
                    {locating ? (
                      <span className="text-muted-foreground">Detecting GPS location...</span>
                    ) : coords ? (
                      <span className="font-mono">
                        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Location disabled</span>
                    )}
                  </span>
                </div>

                {/* Identity & Anonymous Toggle */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-muted-foreground">Identity:</span>
                  <Badge variant="outline" className="font-medium gap-1">
                    {isAnonymous ? (
                      <>
                        <UserX className="size-3 text-muted-foreground" />
                        Anonymous
                      </>
                    ) : (
                      <>
                        <User className="size-3 text-primary" />
                        {resolvedCitizenName}
                      </>
                    )}
                  </Badge>

                  {rawUserName && (
                    <button
                      type="button"
                      onClick={() => setForceAnonymous(!forceAnonymous)}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1"
                    >
                      {forceAnonymous ? "Use My Name" : "Go Anonymous"}
                    </button>
                  )}
                </div>
              </div>

              {callError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{callError}</span>
                </div>
              )}

              {/* 5 Personal Emergency Options */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Emergency Situation (1-Tap Dispatch):
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {PERSONAL_EMERGENCY_OPTIONS.map((opt) => {
                    const IconComponent =
                      opt.id === "MEDICAL_EMERGENCY"
                        ? HeartPulse
                        : opt.id === "PHYSICAL_ASSAULT"
                        ? ShieldAlert
                        : opt.id === "ROBBERY_THEFT"
                        ? Siren
                        : opt.id === "ROAD_ACCIDENT"
                        ? CarFront
                        : Flame;

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectOption(opt)}
                        className="group flex flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:border-destructive hover:bg-destructive/5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-destructive"
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground transition-colors">
                            <IconComponent className="size-4" />
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-destructive">
                            {opt.shortLabel}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-foreground">
                          {opt.title}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

