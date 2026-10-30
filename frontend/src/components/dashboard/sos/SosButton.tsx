"use client";

import { useState } from "react";
import { Siren } from "lucide-react";
import { SosModal } from "./SosModal";

export function SosButton() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="Emergency SOS Dispatch"
        className="group flex w-full items-center gap-2.5 rounded-lg bg-destructive px-3 py-2.5 text-sm font-bold text-destructive-foreground shadow-sm transition-all hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/30 active:scale-[0.98]"
      >
        {/* Animated beacon */}
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
        <Siren className="size-4 shrink-0" />
        <span className="tracking-wide">Emergency SOS</span>
      </button>

      <SosModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
