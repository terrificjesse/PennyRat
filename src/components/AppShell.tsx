"use client";

import { useEffect, useState } from "react";
import { fixtureIntake } from "@/fixtures";
import { useTripStore } from "@/lib/store/trip";
import { PennyRatsLogo } from "@/components/brand/PennyRatsLogo";
import { HomeScreen } from "@/components/HomeScreen";
import { TripBuilder } from "@/components/trip/TripBuilder";

/**
 * Chooses between the home screen and the builder.
 *
 * Home is the front door, and the logo in the builder's header is the way back to it.
 * Coming home does not throw away a trip in progress — the store keeps it, so the
 * resume button drops you back exactly where you were.
 *
 * The view is derived rather than stored: with no explicit choice yet, a saved trip
 * opens the builder and an empty one opens the front door.
 */
export function AppShell() {
  const intake = useTripStore((state) => state.intake);
  const setIntake = useTripStore((state) => state.setIntake);
  const setCurrentStep = useTripStore((state) => state.setCurrentStep);
  const resetTrip = useTripStore((state) => state.resetTrip);

  const [intent, setIntent] = useState<"home" | "builder" | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // The store persists with skipHydration, so nothing is known until it is read back.
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setHydrated(true);
    };
    Promise.resolve(useTripStore.persist.rehydrate()).then(finish, finish);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-deep">
        <PennyRatsLogo size={180} />
      </div>
    );
  }

  const view = intent ?? (intake ? "builder" : "home");

  if (view === "home") {
    return (
      <HomeScreen
        onStart={() => {
          resetTrip();
          setIntent("builder");
        }}
        onUseSample={() => {
          setIntake(fixtureIntake);
          setCurrentStep(1);
          setIntent("builder");
        }}
        onResume={intake ? () => setIntent("builder") : undefined}
        resumeLabel={intake ? `Back to ${intake.destination.split(",")[0]}` : undefined}
      />
    );
  }

  return <TripBuilder onHome={() => setIntent("home")} />;
}
