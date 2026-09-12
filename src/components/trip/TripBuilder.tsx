"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fixtureIntake } from "@/fixtures";
import { canSubmit } from "@/lib/budget";
import { useTripStore } from "@/lib/store/trip";
import type {
  ActivityOption,
  FlightOption,
  LodgingOption,
  OptionKind,
  TransitOption,
  TripIntake,
  TripOption,
} from "@/lib/types";
import { BucketAllocation } from "@/components/budget/BucketAllocation";
import { BudgetMeter } from "@/components/budget/BudgetMeter";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stepper, type StepperStep } from "@/components/ui/Stepper";
import type { ResearchLoadState } from "./ResearchNotice";
import { SubmitGate } from "./SubmitGate";
import { TripIntakeForm } from "./TripIntakeForm";
import { researchTripOptions } from "./research";
import { buildTripSchedule } from "./schedule";
import { ActivityStep } from "./steps/ActivityStep";
import { FlightStep } from "./steps/FlightStep";
import { LodgingStep } from "./steps/LodgingStep";
import { ScheduleStep, type ScheduleLoadState } from "./steps/ScheduleStep";
import { TransitStep } from "./steps/TransitStep";

const WIZARD_STEPS: readonly StepperStep[] = [
  { id: "plan", label: "Plan", description: "Trip and budget" },
  { id: "flights", label: "Flights", description: "There and back" },
  { id: "activities", label: "Explore", description: "Food and things to do" },
  { id: "lodging", label: "Stay", description: "A place to recharge" },
  { id: "transit", label: "Around", description: "Local transportation" },
  { id: "schedule", label: "Schedule", description: "Your day-by-day plan" },
];

const RESEARCH_KINDS: readonly OptionKind[] = [
  "flight",
  "activity",
  "lodging",
  "transit",
];

const STEP_KINDS: Partial<Record<number, OptionKind>> = {
  1: "flight",
  2: "activity",
  3: "lodging",
  4: "transit",
};

const KIND_STEPS: Record<OptionKind, number> = {
  flight: 1,
  activity: 2,
  lodging: 3,
  transit: 4,
};

function initialResearchState(): Record<OptionKind, ResearchLoadState> {
  return {
    flight: { status: "idle" },
    activity: { status: "idle" },
    lodging: { status: "idle" },
    transit: { status: "idle" },
  };
}

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

function ResearchHeaderBadge({
  kind,
  research,
}: {
  kind?: OptionKind;
  research: Record<OptionKind, ResearchLoadState>;
}) {
  if (!kind) return <Badge variant="neutral">Budget-first planning</Badge>;

  const active = research[kind];
  if (active.status === "loading") return <Badge variant="accent">Researching options</Badge>;
  if (active.status === "error") return <Badge variant="warning">Research needs attention</Badge>;

  const labels = {
    live: "Live research",
    cache: "Cached research",
    fixture: "Sample research",
  } as const;
  const variants: Record<keyof typeof labels, BadgeVariant> = {
    live: "success",
    cache: "neutral",
    fixture: "estimate",
  };

  if (active.meta) {
    return <Badge variant={variants[active.meta.source]}>{labels[active.meta.source]}</Badge>;
  }
  return <Badge variant="neutral">Options ready</Badge>;
}

function sameIntake(left: TripIntake | null, rightKey: string): boolean {
  return left !== null && JSON.stringify(left) === rightKey;
}

function makeScheduleKey(
  intake: TripIntake | null,
  options: readonly TripOption[],
  selectedIds: readonly string[],
): string {
  return JSON.stringify({ intake, options, selectedIds });
}

export function TripBuilder() {
  const [hydrated, setHydrated] = useState(false);
  const [research, setResearch] = useState(initialResearchState);
  const [scheduleLoad, setScheduleLoad] = useState<ScheduleLoadState>({ status: "idle" });
  const mounted = useRef(false);
  const startedFor = useRef<string | null>(null);
  const scheduleStartedFor = useRef<string | null>(null);
  const stepContent = useRef<HTMLDivElement>(null);
  const lastFocusedStep = useRef<number | null>(null);
  const intake = useTripStore((state) => state.intake);
  const budgetPlan = useTripStore((state) => state.budgetPlan);
  const selectedIds = useTripStore((state) => state.selectedIds);
  const options = useTripStore((state) => state.options);
  const currentStep = useTripStore((state) => state.currentStep);
  const itinerary = useTripStore((state) => state.itinerary);
  const setIntake = useTripStore((state) => state.setIntake);
  const adjustBucket = useTripStore((state) => state.adjustBucket);
  const resetBudgetPlan = useTripStore((state) => state.resetBudgetPlan);
  const setOptionsForKind = useTripStore((state) => state.setOptionsForKind);
  const setItinerary = useTripStore((state) => state.setItinerary);
  const setCurrentStep = useTripStore((state) => state.setCurrentStep);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const finish = () => {
      if (active) setHydrated(true);
    };

    Promise.resolve(useTripStore.persist.rehydrate()).then(finish, finish);
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (lastFocusedStep.current === null) {
      lastFocusedStep.current = currentStep;
      return;
    }
    if (lastFocusedStep.current === currentStep) return;

    lastFocusedStep.current = currentStep;
    const frame = requestAnimationFrame(() => stepContent.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [currentStep, hydrated]);

  const intakeKey = intake ? JSON.stringify(intake) : "";
  const researchEnabled = currentStep > 0;

  const loadResearch = useCallback(
    async (
      kind: OptionKind,
      requestedIntake: TripIntake,
      requestedIntakeKey: string,
      signal?: AbortSignal,
    ) => {
      try {
        const result = await researchTripOptions(kind, requestedIntake, signal);
        if (!mounted.current) return;
        if (!sameIntake(useTripStore.getState().intake, requestedIntakeKey)) return;

        setOptionsForKind(kind, result.options);
        setResearch((state) => ({
          ...state,
          [kind]: { status: "ready", meta: result.meta },
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!mounted.current) return;
        if (!sameIntake(useTripStore.getState().intake, requestedIntakeKey)) return;

        setResearch((state) => ({
          ...state,
          [kind]: {
            status: "error",
            error: error instanceof Error ? error.message : "Research could not be loaded.",
          },
        }));
      }
    },
    [setOptionsForKind],
  );

  useEffect(() => {
    if (!researchEnabled || !intake || startedFor.current === intakeKey) return;

    const controller = new AbortController();
    let settled = false;
    startedFor.current = intakeKey;
    setResearch({
      flight: { status: "loading" },
      activity: { status: "loading" },
      lodging: { status: "loading" },
      transit: { status: "loading" },
    });

    void Promise.all(
      RESEARCH_KINDS.map((kind) =>
        loadResearch(kind, intake, intakeKey, controller.signal),
      ),
    ).then(() => {
      settled = true;
    });

    return () => {
      controller.abort();
      if (!settled && startedFor.current === intakeKey) startedFor.current = null;
    };
  }, [intake, intakeKey, loadResearch, researchEnabled]);

  const retryResearch = (kind: OptionKind) => {
    if (!intake) return;
    setResearch((state) => ({ ...state, [kind]: { status: "loading" } }));
    void loadResearch(kind, intake, intakeKey);
  };

  const handleIntakeChange = (nextIntake: TripIntake) => {
    startedFor.current = null;
    scheduleStartedFor.current = null;
    setResearch(initialResearchState());
    setScheduleLoad({ status: "idle" });
    setIntake(nextIntake);
  };

  const handleSelectionChange = useCallback((id: string, selected: boolean) => {
    const state = useTripStore.getState();
    const target = state.options.find((option) => option.id === id);
    if (!target) return;

    if (selected && target.kind !== "activity") {
      const conflictingIds = state.options
        .filter((option) => {
          if (target.kind === "flight") {
            return option.kind === "flight" && option.direction === target.direction;
          }
          return option.kind === target.kind;
        })
        .map((option) => option.id)
        .filter((optionId) => optionId !== id && state.selectedIds.includes(optionId));

      for (const conflictingId of conflictingIds) {
        state.toggleOption(conflictingId, false);
      }
    }

    state.toggleOption(id, selected);
  }, []);

  const submitCheck = useMemo(
    () => (intake ? canSubmit(intake, options, selectedIds) : { ok: false, reasons: [] }),
    [intake, options, selectedIds],
  );
  const scheduleKey = makeScheduleKey(intake, options, selectedIds);

  const loadSchedule = useCallback(
    async (
      requestedIntake: TripIntake,
      requestedOptions: readonly TripOption[],
      requestedIds: readonly string[],
      requestedKey: string,
      signal?: AbortSignal,
    ) => {
      try {
        const result = await buildTripSchedule(
          requestedIntake,
          requestedOptions,
          requestedIds,
          signal,
        );
        if (!mounted.current) return;
        const current = useTripStore.getState();
        if (makeScheduleKey(current.intake, current.options, current.selectedIds) !== requestedKey) {
          return;
        }
        setItinerary(result);
        setScheduleLoad({ status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!mounted.current) return;
        const current = useTripStore.getState();
        if (makeScheduleKey(current.intake, current.options, current.selectedIds) !== requestedKey) {
          return;
        }
        setScheduleLoad({
          status: "error",
          error: error instanceof Error ? error.message : "The schedule could not be built.",
        });
      }
    },
    [setItinerary],
  );

  useEffect(() => {
    if (
      currentStep !== WIZARD_STEPS.length - 1 ||
      !intake ||
      !submitCheck.ok ||
      itinerary ||
      scheduleStartedFor.current === scheduleKey
    ) {
      return;
    }

    const controller = new AbortController();
    let settled = false;
    scheduleStartedFor.current = scheduleKey;
    setScheduleLoad({ status: "loading" });
    void loadSchedule(intake, options, selectedIds, scheduleKey, controller.signal).then(() => {
      settled = true;
    });

    return () => {
      controller.abort();
      if (!settled && scheduleStartedFor.current === scheduleKey) {
        scheduleStartedFor.current = null;
      }
    };
  }, [
    currentStep,
    intake,
    itinerary,
    loadSchedule,
    options,
    scheduleKey,
    selectedIds,
    submitCheck.ok,
  ]);

  const retrySchedule = () => {
    if (!intake || !submitCheck.ok) return;
    scheduleStartedFor.current = scheduleKey;
    setScheduleLoad({ status: "loading" });
    void loadSchedule(intake, options, selectedIds, scheduleKey);
  };

  const steps = useMemo(
    () =>
      WIZARD_STEPS.map((step, index) => ({
        ...step,
        disabled:
          (index > 0 && !intake) ||
          (index === WIZARD_STEPS.length - 1 && !submitCheck.ok),
      })),
    [intake, submitCheck.ok],
  );

  if (!hydrated) return <BuilderSkeleton />;

  const activeKind = STEP_KINDS[currentStep];
  const flights = options.filter(
    (option): option is FlightOption => option.kind === "flight",
  );
  const activities = options.filter(
    (option): option is ActivityOption => option.kind === "activity",
  );
  const lodging = options.filter(
    (option): option is LodgingOption => option.kind === "lodging",
  );
  const transit = options.filter(
    (option): option is TransitOption => option.kind === "transit",
  );

  let activeStep;
  if (intake) switch (currentStep) {
    case 1:
      activeStep = (
        <FlightStep
          options={flights}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          research={research.flight}
          onRetry={() => retryResearch("flight")}
        />
      );
      break;
    case 2:
      activeStep = (
        <ActivityStep
          options={activities}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          research={research.activity}
          onRetry={() => retryResearch("activity")}
        />
      );
      break;
    case 3:
      activeStep = (
        <LodgingStep
          options={lodging}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          research={research.lodging}
          onRetry={() => retryResearch("lodging")}
        />
      );
      break;
    case 4:
      activeStep = (
        <>
          <TransitStep
            options={transit}
            selectedIds={selectedIds}
            onSelectionChange={handleSelectionChange}
            research={research.transit}
            onRetry={() => retryResearch("transit")}
          />
          <SubmitGate
            intake={intake}
            options={options}
            selectedIds={selectedIds}
            onContinue={() => setCurrentStep(5)}
          />
        </>
      );
      break;
    default:
      activeStep = submitCheck.ok ? (
        <ScheduleStep
          intake={intake}
          itinerary={itinerary}
          options={options}
          state={scheduleLoad}
          onRetry={retrySchedule}
          onReviewOption={(option) => setCurrentStep(KIND_STEPS[option.kind])}
        />
      ) : (
        <SubmitGate
          intake={intake}
          options={options}
          selectedIds={selectedIds}
          onContinue={() => setCurrentStep(5)}
        />
      );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="no-print border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <PennyMark />
            <div>
              <p className="text-lg font-bold tracking-[-0.03em]">PennyRat</p>
              <p className="text-xs text-muted-foreground">Plan boldly. Spend deliberately.</p>
            </div>
          </div>
          {currentStep === WIZARD_STEPS.length - 1 ? (
            <Badge
              variant={
                itinerary ? "success" : scheduleLoad.status === "error" ? "warning" : "accent"
              }
            >
              {itinerary
                ? "Itinerary ready"
                : scheduleLoad.status === "error"
                  ? "Schedule needs attention"
                  : "Building schedule"}
            </Badge>
          ) : (
            <ResearchHeaderBadge kind={activeKind} research={research} />
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 print:max-w-none print:p-0 sm:px-6 sm:py-9 lg:px-8">
        <Stepper
          steps={steps}
          currentStep={currentStep}
          onStepClick={(index) => setCurrentStep(index)}
          className="mb-9 print:hidden"
        />

        <div
          ref={stepContent}
          role="region"
          aria-label={`Trip builder step: ${WIZARD_STEPS[currentStep]?.id ?? "plan"}`}
          tabIndex={-1}
          className="focus:outline-none"
        >
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
                  onClick={() => handleIntakeChange(fixtureIntake)}
                >
                  Use Tokyo sample
                </Button>
              </div>

              <TripIntakeForm
                key={intake ? `${intake.origin}-${intake.destination}-${intake.budgetTotal}` : "empty"}
                initialValue={intake}
                onSubmit={handleIntakeChange}
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
                      Research and choose flights
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
          <div className="grid items-start gap-6 print:block lg:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)]">
            <div>
              {activeStep}

              <div className="no-print mt-7 flex items-center justify-between gap-4 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Back
                </Button>
                {currentStep > 0 && currentStep < 4 && (
                  <Button type="button" onClick={() => setCurrentStep(currentStep + 1)}>
                    Continue
                  </Button>
                )}
              </div>
            </div>

            <aside className="no-print lg:sticky lg:top-6">
              <BudgetMeter
                plan={budgetPlan}
                total={intake.budgetTotal}
                options={options}
                selectedIds={selectedIds}
              />
            </aside>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
