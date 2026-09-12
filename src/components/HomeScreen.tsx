"use client";

import { PennyRatsLogo } from "@/components/brand/PennyRatsLogo";
import { Button } from "@/components/ui/Button";
import { formatCents } from "@/lib/budget";
import { fixtureIntake } from "@/fixtures";

type HomeScreenProps = {
  onStart: () => void;
  onUseSample: () => void;
  /** Present once a trip is underway, so the logo can lead back into it. */
  onResume?: () => void;
  resumeLabel?: string;
};

const PROMISES = [
  {
    title: "The number comes first",
    body: "Set the budget before you see a single option. Every price sits next to a checkbox, and the total only ever comes down.",
  },
  {
    title: "Nothing you cannot afford",
    body: "Six buckets, including one held back for getting around — the line that quietly sinks a trip when nobody plans for it.",
  },
  {
    title: "A schedule that checks the hours",
    body: "Days are packed around your flight times and each place's real opening hours. No museum on a Monday.",
  },
];

export function HomeScreen({ onStart, onUseSample, onResume, resumeLabel }: HomeScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-deep text-brand-deep-ink">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16">
        <PennyRatsLogo size={220} className="drop-shadow-[0_12px_28px_rgba(10,10,20,0.45)]" />

        <h1 className="mt-9 max-w-2xl text-center text-4xl font-bold tracking-[-0.045em] sm:text-5xl">
          Plan the whole trip for what you actually have.
        </h1>

        <p className="mt-4 max-w-xl text-center text-lg leading-8 text-brand-deep-ink/75">
          Flights, a bed, things worth doing and the way you get around — priced, chosen by
          you, and scheduled day by day without ever leaving your budget.
        </p>

        {/* The page sits on periwinkle, so the cream "secondary" is the loud button
            here and the tinted variants would vanish into the background. */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {onResume ? (
            <Button size="lg" variant="secondary" onClick={onResume}>
              {resumeLabel ?? "Pick up where you left off"}
            </Button>
          ) : null}
          <Button
            size="lg"
            variant={onResume ? "ghost" : "secondary"}
            onClick={onStart}
            className={
              onResume
                ? "border-2 border-brand-deep-ink/50 text-brand-deep-ink! hover:bg-white/10"
                : undefined
            }
          >
            Plan a trip
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={onUseSample}
            className="text-brand-deep-ink! hover:bg-white/10"
          >
            Try {fixtureIntake.destination.split(",")[0]} for{" "}
            {formatCents(fixtureIntake.budgetTotal)}
          </Button>
        </div>

        <ul className="mt-14 grid w-full gap-4 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <li
              key={promise.title}
              className="rounded-card border-2 border-border-strong bg-surface p-5 text-foreground shadow-card"
            >
              <h2 className="text-base font-bold tracking-[-0.02em]">{promise.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{promise.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center text-sm text-brand-deep-ink/75">
          Prices are researched estimates, and the app says so on every one.
        </p>
      </main>
    </div>
  );
}
