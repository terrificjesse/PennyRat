"use client";

import { useEffect, useMemo, useState } from "react";
import { fixtureIntake } from "@/fixtures";
import { useTripStore } from "@/lib/store/trip";
import type { OptionKind } from "@/lib/types";
import { BucketAllocation } from "@/components/budget/BucketAllocation";
import { BudgetMeter } from "@/components/budget/BudgetMeter";
import { OptionList } from "@/components/options/OptionList";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stepper, type StepperStep } from "@/components/ui/Stepper";
import { TripIntakeForm } from "./TripIntakeForm";

const WIZARD_STEPS: readonly StepperStep[] = [
  { id: "plan", label: "Plan", description: "Trip and budget" },
  { id: "flights", label: "Flights", description: "There and back" },
  { id: "activities", label: "Explore", description: "Food and things to do" },
  { id: "lodging", label: "Stay", description: "A place to recharge" },
  { id: "transit", label: "Around", description: "Local transportation" },
  { id: "schedule", label: "Schedule", description: "Your day-by-day plan" },
];

const OPTION_STEPS: Record<
  number,
  { kind: OptionKind; title: string; description: string; emptyMessage: string }
> = {
  1: {
    kind: "flight",
    title: "Choose your flights",
    description:
      "Pick at least one outbound and one return option. Prices cover the whole party.",
    emptyMessage: "No flight options are loaded yet.",
  },
  2: {
    kind: "activity",
    title: "Choose what sounds worth it",
    description: "Restaurants draw from food; every other stop draws from activities.",
    emptyMessage: "No activity options are loaded yet.",
  },
  3: {
    kind: "lodging",
    title: "Choose where to stay",
    description: "Every price shown is the full stay, not a nightly teaser rate.",
    emptyMessage: "No lodging options are loaded yet.",
  },
  4: {
    kind: "transit",
    title: "Choose how you’ll get around",
    description: "This has its own protected budget, separate from food and activities.",
    emptyMessage: "No local transit options are loaded yet.",
  },
};

function PennyMark() {
  return (
    <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-control">
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-6">
        <path
          d="M9 10.5h8.25a5.25 5.25 0 0 1 0 10.5H13v4M13 7v18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
        <path d="M8 15h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
    </span>
  );
}

function BuilderSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-20 w-full" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.7fr)]">
        <Skeleton className="h-[42rem] w-full" />
        <Skeleton className="h-[30rem] w-full" />
      </div>
    </main>
  );
}

export function TripBuilder() {
  const [hydrated, setHydrated] = useState(false);
  const intake = useTripStore((state) => state.intake);
  const budgetPlan = useTripStore((state) => state.budgetPlan);
  const selectedIds = useTripStore((state) => state.selectedIds);
  const options = useTripStore((state) => state.options);
  const currentStep = useTripStore((state) => state.currentStep);
  const setIntake = useTripStore((state) => state.setIntake);
  const adjustBucket = useTripStore((state) => state.adjustBucket);
  const resetBudgetPlan = useTripStore((state) => state.resetBudgetPlan);
  const toggleOption = useTripStore((state) => state.toggleOption);
  const setCurrentStep = useTripStore((state) => state.setCurrentStep);

  useEffect(() => {
    let active = true;
    const finish = () => {
      if (active) setHydrated(true);
    };

    Promise.resolve(useTripStore.persist.rehydrate()).then(finish, finish);
    return () => {
      active = false;
    };
  }, []);

  const steps = useMemo(
    () => WIZARD_STEPS.map((step, index) => ({ ...step, disabled: index > 0 && !intake })),
    [intake],
  );

  const optionStep = OPTION_STEPS[currentStep];
  const visibleOptions = optionStep
    ? options.filter((option) => option.kind === optionStep.kind)
    : [];

  if (!hydrated) return <BuilderSkeleton />;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <PennyMark />
            <div>
              <p className="text-lg font-bold tracking-[-0.03em]">PennyRat</p>
              <p className="text-xs text-muted-foreground">Plan boldly. Spend deliberately.</p>
            </div>
          </div>
          <Badge variant="estimate">Fixture research</Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <Stepper
          steps={steps}
          currentStep={currentStep}
          onStepClick={(index) => setCurrentStep(index)}
          className="mb-9"
        />

        {currentStep === 0 || !intake || !budgetPlan ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <Card variant="raised" padding="lg">
              <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge variant="primary">Start with the ceiling</Badge>
                  <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-[-0.045em] text-foreground sm:text-4xl">
                    Build a trip that fits before you fall for it.
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                    Tell us the non-negotiables. We’ll turn the total into a practical plan you can tune.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIntake(fixtureIntake)}
                >
                  Use Tokyo sample
                </Button>
              </div>

              <TripIntakeForm
                key={intake ? `${intake.origin}-${intake.destination}-${intake.budgetTotal}` : "empty"}
                initialValue={intake}
                onSubmit={setIntake}
              />
            </Card>

            <aside className="space-y-6 lg:sticky lg:top-6">
              {intake && budgetPlan ? (
                <>
                  <Card variant="raised" padding="lg">
                    <BucketAllocation
                      plan={budgetPlan}
                      total={intake.budgetTotal}
                      onBucketChange={adjustBucket}
                      onReset={resetBudgetPlan}
                    />
                    <Button
                      type="button"
                      size="lg"
                      className="mt-8 w-full"
                      onClick={() => setCurrentStep(1)}
                    >
                      Start choosing flights
                    </Button>
                  </Card>
                  <BudgetMeter
                    plan={budgetPlan}
                    total={intake.budgetTotal}
                    options={options}
                    selectedIds={selectedIds}
                  />
                </>
              ) : (
                <Card variant="muted">
                  <p className="text-sm font-semibold text-foreground">
                    Your budget plan will appear here.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Add dates and a total to see flights, lodging, food, activities, local transit, and buffer separated clearly.
                  </p>
                </Card>
              )}
            </aside>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)]">
            <div>
              {optionStep ? (
                <OptionList
                  title={optionStep.title}
                  description={optionStep.description}
                  emptyMessage={optionStep.emptyMessage}
                  options={visibleOptions}
                  selectedIds={selectedIds}
                  onSelectionChange={toggleOption}
                />
              ) : (
                <Card variant="raised" padding="lg">
                  <Badge variant="accent">Final step</Badge>
                  <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-foreground">
                    Your choices are ready for scheduling.
                  </h1>
                  <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
                    Scheduling will turn everything you checked into a practical day-by-day itinerary.
                  </p>
                </Card>
              )}

              <div className="mt-7 flex items-center justify-between gap-4 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Back
                </Button>
                {currentStep < WIZARD_STEPS.length - 1 && (
                  <Button type="button" onClick={() => setCurrentStep(currentStep + 1)}>
                    Continue
                  </Button>
                )}
              </div>
            </div>

            <aside className="lg:sticky lg:top-6">
              <BudgetMeter
                plan={budgetPlan}
                total={intake.budgetTotal}
                options={options}
                selectedIds={selectedIds}
              />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
