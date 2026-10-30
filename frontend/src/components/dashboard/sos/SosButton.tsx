"use client";

import { useState } from "react";
import { Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SosModal } from "./SosModal";

export function SosButton() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setModalOpen(true)}
        className="relative font-bold shadow-sm transition-all hover:shadow-destructive/40 hover:scale-105 active:scale-95 gap-1.5 px-3"
        aria-label="Emergency SOS Dispatch"
      >
        {/* Animated Beacon Ping */}
        <span className="relative flex size-2 mr-0.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
        <Siren className="size-4 animate-pulse" />
        <span className="tracking-wide">SOS</span>
      </Button>

      <SosModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
