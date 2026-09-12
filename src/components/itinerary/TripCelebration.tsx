"use client";

import { useEffect } from "react";

const CELEBRATION_DURATION_MS = 2_400;

type TripCelebrationProps = {
  open: boolean;
  onComplete: () => void;
};

export function TripCelebration({ open, onComplete }: TripCelebrationProps) {
  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(onComplete, CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [onComplete, open]);

  if (!open) return null;

  return (
    <div
      className="trip-celebration pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand-deep/90 px-5 py-8 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Enjoy your trip"
    >
      <div className="trip-celebration-card w-full max-w-lg rounded-card border-2 border-brand-deep-ink bg-surface px-6 py-7 text-center shadow-[0_28px_80px_rgba(16,16,24,0.38)] sm:px-10 sm:py-9">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied local artwork */}
        <img
          src="/enjoy-your-trip.PNG"
          alt=""
          className="mx-auto w-full max-w-sm"
        />
        <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em] text-foreground sm:text-5xl">
          Enjoy your trip.
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Your budget is set. Your adventure is ready.
        </p>
      </div>
    </div>
  );
}
