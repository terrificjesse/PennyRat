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
 * The home screen is always the front door on a fresh visit. Opening or starting a
 * trip is an explicit choice, which keeps a library of several plans predictable.
 */
export function AppShell() {
  const activeTripId = useTripStore((state) => state.activeTripId);
  const savedTrips = useTripStore((state) => state.savedTrips);
  const setIntake = useTripStore((state) => state.setIntake);
  const setCurrentStep = useTripStore((state) => state.setCurrentStep);
  const resetTrip = useTripStore((state) => state.resetTrip);
  const openSavedTrip = useTripStore((state) => state.openSavedTrip);
  const renameSavedTrip = useTripStore((state) => state.renameSavedTrip);
  const deleteSavedTrip = useTripStore((state) => state.deleteSavedTrip);

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

  const view = intent ?? "home";

  if (view === "home") {
    return (
      <HomeScreen
        activeTripId={activeTripId}
        savedTrips={savedTrips}
        onStart={() => {
          resetTrip();
          setIntent("builder");
        }}
        onUseSample={() => {
          resetTrip();
          setIntake(fixtureIntake);
          setCurrentStep(1);
          setIntent("builder");
        }}
        onOpenTrip={(id) => {
          openSavedTrip(id);
          setIntent("builder");
        }}
        onRenameTrip={renameSavedTrip}
        onDeleteTrip={deleteSavedTrip}
      />
    );
  }

  return <TripBuilder onHome={() => setIntent("home")} />;
}
