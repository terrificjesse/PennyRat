"use client";

import { useState, type FormEvent } from "react";
import { demoIntake } from "@/fixtures";
import { formatCents } from "@/lib/budget";
import type { SavedTrip } from "@/lib/store/trip";
import { PennyRatsLogo } from "@/components/brand/PennyRatsLogo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type HomeScreenProps = {
  activeTripId: string | null;
  savedTrips: readonly SavedTrip[];
  onDeleteTrip: (id: string) => void;
  onOpenTrip: (id: string) => void;
  onRenameTrip: (id: string, name: string) => void;
  onStart: () => void;
  onUseSample: () => void;
};

function formatTripDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function HomeScreen({
  activeTripId,
  onDeleteTrip,
  onOpenTrip,
  onRenameTrip,
  onStart,
  onUseSample,
  savedTrips,
}: HomeScreenProps) {
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string>();

  const beginRename = (trip: SavedTrip) => {
    setDeletingId(undefined);
    setRenamingId(trip.id);
    setRenameValue(trip.name);
  };

  const submitRename = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name) return;
    onRenameTrip(id, name);
    setRenamingId(undefined);
  };

  return (
    <div className="min-h-dvh bg-brand-deep text-brand-deep-ink">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col items-center text-center sm:text-left lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
            <PennyRatsLogo
              size={152}
              priority
              className="-rotate-2 drop-shadow-[0_16px_28px_rgba(10,10,20,0.38)]"
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-deep-ink/70">
                Penny Rats
              </p>
              <h1 className="mt-2 max-w-xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl">
                Your trips
              </h1>
              <p className="mt-2 max-w-xl text-base leading-7 text-brand-deep-ink/75">
                Pick up a plan or start somewhere new. Every change saves as you go.
              </p>
            </div>
          </div>

          <Button size="lg" variant="secondary" onClick={onStart} className="mt-6 lg:mt-0">
            Plan a new trip
          </Button>
        </header>

        <section className="mt-10" aria-labelledby="saved-trips-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="saved-trips-title" className="text-2xl font-bold tracking-[-0.03em]">
                Saved plans
              </h2>
              <p className="mt-1 text-sm text-brand-deep-ink/70">
                Destination, dates, choices, and itinerary are kept together.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onUseSample}
              className="border border-brand-deep-ink/40 text-brand-deep-ink! hover:bg-white/10"
            >
              Try a weekend in {demoIntake.destination.split(",")[0]} for {formatCents(demoIntake.budgetTotal)}
            </Button>
          </div>

          {savedTrips.length > 0 ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2" role="list">
              {savedTrips.map((trip) => {
                const isRenaming = renamingId === trip.id;
                const isDeleting = deletingId === trip.id;
                return (
                  <li
                    key={trip.id}
                    className="rounded-card border-2 border-border-strong bg-surface p-5 text-foreground shadow-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {isRenaming ? (
                          <form onSubmit={(event) => submitRename(event, trip.id)}>
                            <label htmlFor={`rename-${trip.id}`} className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Trip name
                            </label>
                            <div className="mt-2 flex gap-2">
                              <input
                                id={`rename-${trip.id}`}
                                value={renameValue}
                                maxLength={80}
                                autoFocus
                                onChange={(event) => setRenameValue(event.currentTarget.value)}
                                className="min-h-10 min-w-0 flex-1 rounded-control border border-border bg-surface-elevated px-3 text-sm text-foreground"
                              />
                              <Button type="submit" size="sm">Save</Button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-xl font-bold tracking-[-0.025em]">{trip.name}</h3>
                              {trip.id === activeTripId && <Badge variant="accent">Current</Badge>}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{trip.intake.destination}</p>
                          </>
                        )}
                      </div>
                      <Badge variant={trip.itinerary ? "success" : "neutral"}>
                        {trip.itinerary ? "Itinerary ready" : `Step ${trip.currentStep + 1} of 6`}
                      </Badge>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Dates</dt>
                        <dd className="mt-1 font-medium">
                          {formatTripDate(trip.intake.startDate)} – {formatTripDate(trip.intake.endDate)}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Total</dt>
                        <dd className="mt-1 font-bold tabular-nums">{formatCents(trip.intake.budgetTotal)}</dd>
                      </div>
                    </dl>

                    {isDeleting ? (
                      <div className="mt-4 rounded-control bg-danger-soft p-3">
                        <p className="text-sm text-danger">Delete {trip.name}? This cannot be undone.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => onDeleteTrip(trip.id)}
                          >
                            Delete trip
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDeletingId(undefined)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={() => onOpenTrip(trip.id)}>
                          Open {trip.name}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => beginRename(trip)}>
                          Rename
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          onClick={() => {
                            setRenamingId(undefined);
                            setDeletingId(trip.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-5 rounded-card border-2 border-dashed border-brand-deep-ink/45 px-6 py-12 text-center">
              <h3 className="text-xl font-semibold">No saved trips yet.</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-deep-ink/70">
                Start with one total. Your first plan will appear here as soon as the trip basics are saved.
              </p>
              <Button size="lg" variant="secondary" onClick={onStart} className="mt-6">
                Plan your first trip
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
