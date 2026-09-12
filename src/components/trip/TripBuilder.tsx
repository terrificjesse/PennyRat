"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fixtureIntake } from "@/fixtures";
import { applySelection, canSubmit } from "@/lib/budget";
import { type SchedulePin, useTripStore } from "@/lib/store/trip";
import type {
  ActivityOption,
  Itinerary,
  LodgingOption,
  OptionKind,
  ScheduleBlock,
  TransitOption,
  TripIntake,
  TripOption,
  TravelOption,
} from "@/lib/types";
import { PennyRatsLogo } from "@/components/brand/PennyRatsLogo";
import { BudgetMeter } from "@/components/budget/BudgetMeter";
import { TripCelebration } from "@/components/itinerary/TripCelebration";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stepper, type StepperStep } from "@/components/ui/Stepper";
import type { ResearchLoadState } from "./ResearchNotice";
import { SubmitGate } from "./SubmitGate";
import { TripIntakeForm } from "./TripIntakeForm";
import { isAbortError } from "./jsonRequest";
import { buildTripSchedule } from "./schedule";
import {
  intakeRequestKey,
  isIntakeRequestCurrent,
  isScheduleRequestCurrent,
  researchCurrentTrip,
  scheduleCurrentTrip,
  scheduleRequestKey,
} from "./requestState";
import { ActivityStep } from "./steps/ActivityStep";
import { FlightStep } from "./steps/FlightStep";
import { LodgingStep } from "./steps/LodgingStep";
import { ScheduleStep, type ScheduleLoadState } from "./steps/ScheduleStep";
import { TransitStep } from "./steps/TransitStep";

const WIZARD_STEPS: readonly StepperStep[] = [
  { id: "plan", label: "Plan", description: "Trip and budget" },
  { id: "travel", label: "Getting there", description: "There and back" },
  { id: "lodging", label: "Stay", description: "A place to recharge" },
  { id: "activities", label: "Explore", description: "Food and things to do" },
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
  2: "lodging",
  3: "activity",
  4: "transit",
};

function initialResearchState(): Record<OptionKind, ResearchLoadState> {
  return {
    flight: { status: "idle" },
    activity: { status: "idle" },
    lodging: { status: "idle" },
    transit: { status: "idle" },
  };
}

function blockStartMinutes(block: ScheduleBlock): number {
  const [hour, minute] = block.start.split("T")[1].split(":").map(Number);
  return hour * 60 + minute;
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

type TripBuilderProps = {
  /** Called when the traveler taps the logo to go back to the front door. */
  onHome?: () => void;
};

export function TripBuilder({ onHome }: TripBuilderProps = {}) {
  const [hydrated, setHydrated] = useState(false);
  const [research, setResearch] = useState(initialResearchState);
  const [scheduleLoad, setScheduleLoad] = useState<ScheduleLoadState>({ status: "idle" });
  const [scheduleEditError, setScheduleEditError] = useState<string>();
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationRun, setCelebrationRun] = useState(0);
  const mounted = useRef(false);
  const startedFor = useRef<string | null>(null);
  const scheduleStartedFor = useRef<string | null>(null);
  const scheduleEditController = useRef<AbortController | null>(null);
  const scheduleEditSequence = useRef(0);
  const stepContent = useRef<HTMLDivElement>(null);
  const lastFocusedStep = useRef<number | null>(null);
  const celebratedItinerary = useRef<Itinerary | null>(null);
  const intake = useTripStore((state) => state.intake);
  const budgetPlan = useTripStore((state) => state.budgetPlan);
  const selectedIds = useTripStore((state) => state.selectedIds);
  const options = useTripStore((state) => state.options);
  const currentStep = useTripStore((state) => state.currentStep);
  const itinerary = useTripStore((state) => state.itinerary);
  const excludedIds = useTripStore((state) => state.excludedIds);
  const pinned = useTripStore((state) => state.pinned);
  const scheduleCelebrated = useTripStore((state) => state.scheduleCelebrated);
  const setIntake = useTripStore((state) => state.setIntake);
  const adjustBucket = useTripStore((state) => state.adjustBucket);
  const setCurrentStep = useTripStore((state) => state.setCurrentStep);
  const applyScheduleUpdate = useTripStore((state) => state.applyScheduleUpdate);
  const markScheduleCelebrated = useTripStore(
    (state) => state.markScheduleCelebrated,
  );

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
      scheduleEditController.current?.abort();
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

  useEffect(() => {
    if (!hydrated) return;

    if (currentStep !== WIZARD_STEPS.length - 1) {
      celebratedItinerary.current = null;
      setShowCelebration(false);
      return;
    }

    if (!itinerary || celebratedItinerary.current === itinerary) return;

    celebratedItinerary.current = itinerary;
    setCelebrationRun((run) => run + 1);
    setShowCelebration(true);
    if (!scheduleCelebrated) markScheduleCelebrated();
  }, [currentStep, hydrated, itinerary, markScheduleCelebrated, scheduleCelebrated]);

  const intakeKey = intakeRequestKey(intake);
  const researchEnabled = currentStep > 0;

  const loadResearch = useCallback(
    async (
      kind: OptionKind,
      requestedIntake: TripIntake,
      requestedIntakeKey: string,
      signal?: AbortSignal,
    ) => {
      try {
        const { result, committed } = await researchCurrentTrip(kind, requestedIntake, {
          signal,
          canCommit: () => mounted.current,
        });
        if (!committed) return;

        setResearch((state) => ({
          ...state,
          [kind]: { status: "ready", meta: result.meta },
        }));
      } catch (error) {
        if (isAbortError(error)) return;
        if (!mounted.current) return;
        if (!isIntakeRequestCurrent(requestedIntakeKey)) return;

        setResearch((state) => ({
          ...state,
          [kind]: {
            status: "error",
            error: error instanceof Error ? error.message : "Research could not be loaded.",
          },
        }));
      }
    },
    [],
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
    setScheduleEditError(undefined);
    setIntake(nextIntake);
    setCurrentStep(1);
  };

  const handleSelectionChange = useCallback((id: string, selected: boolean) => {
    const state = useTripStore.getState();
    const target = state.options.find((option) => option.id === id);
    if (!target) return;

    if (selected && target.kind !== "activity") {
      const conflictingIds = state.options
        .filter((option) => {
          if (target.kind === "flight") {
            if (option.kind !== "flight") return false;
            if (target.direction === "roundtrip") return true;
            return option.direction === target.direction || option.direction === "roundtrip";
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
  // Once a plan exists, the meals it added are committed money. Counting them keeps the
  // meter agreeing with the itinerary's own total instead of claiming more is left.
  const plannedExtraCents = itinerary?.suggestedCents ?? 0;
  const budgetState = useMemo(
    () =>
      intake && budgetPlan
        ? applySelection(
            budgetPlan,
            intake.budgetTotal,
            options,
            selectedIds,
            plannedExtraCents,
          )
        : null,
    [budgetPlan, intake, options, selectedIds, plannedExtraCents],
  );
  const remainingCents = budgetState?.remainingTotal ?? 0;
  const scheduleKey = scheduleRequestKey(
    intake,
    options,
    selectedIds,
    excludedIds,
    pinned,
  );

  const loadSchedule = useCallback(
    async (
      requestedIntake: TripIntake,
      requestedOptions: readonly TripOption[],
      requestedIds: readonly string[],
      requestedExcludedIds: readonly string[],
      requestedPinned: readonly SchedulePin[],
      requestedKey: string,
      signal?: AbortSignal,
    ) => {
      try {
        const { committed } = await scheduleCurrentTrip(
          requestedIntake,
          requestedOptions,
          requestedIds,
          {
            signal,
            canCommit: () => mounted.current,
            excludedIds: [...requestedExcludedIds],
            pinned: [...requestedPinned],
          },
        );
        if (!committed) return;
        setScheduleLoad({ status: "ready" });
      } catch (error) {
        if (isAbortError(error)) return;
        if (!mounted.current) return;
        if (!isScheduleRequestCurrent(requestedKey)) return;
        setScheduleLoad({
          status: "error",
          error: error instanceof Error ? error.message : "The schedule could not be built.",
        });
      }
    },
    [],
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
    void loadSchedule(
      intake,
      options,
      selectedIds,
      excludedIds,
      pinned,
      scheduleKey,
      controller.signal,
    ).then(() => {
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
    excludedIds,
    intake,
    itinerary,
    loadSchedule,
    options,
    pinned,
    scheduleKey,
    selectedIds,
    submitCheck.ok,
  ]);

  const retrySchedule = () => {
    if (!intake || !submitCheck.ok) return;
    scheduleStartedFor.current = scheduleKey;
    setScheduleLoad({ status: "loading" });
    void loadSchedule(intake, options, selectedIds, excludedIds, pinned, scheduleKey);
  };

  const runScheduleEdit = useCallback(
    async (
      update: {
        selectedIds: readonly string[];
        excludedIds: readonly string[];
        pinned: readonly SchedulePin[];
      },
      rejectIfUnscheduledId?: string,
    ) => {
      const state = useTripStore.getState();
      if (!state.intake) return;

      scheduleEditController.current?.abort();
      const controller = new AbortController();
      const sequence = scheduleEditSequence.current + 1;
      scheduleEditSequence.current = sequence;
      scheduleEditController.current = controller;
      setScheduleEditError(undefined);
      setScheduleLoad({ status: "loading" });

      try {
        const nextItinerary = await buildTripSchedule(
          state.intake,
          state.options,
          update.selectedIds,
          controller.signal,
          fetch,
          { excludedIds: [...update.excludedIds], pinned: [...update.pinned] },
        );
        if (controller.signal.aborted || sequence !== scheduleEditSequence.current) return;

        const rejected = rejectIfUnscheduledId
          ? nextItinerary.unscheduled.find((item) => item.id === rejectIfUnscheduledId)
          : undefined;
        if (rejected) {
          setScheduleEditError(rejected.reason);
          setScheduleLoad({ status: "ready" });
          return;
        }

        applyScheduleUpdate({ ...update, itinerary: nextItinerary });
        setScheduleLoad({ status: "ready" });
      } catch (error) {
        if (isAbortError(error) || sequence !== scheduleEditSequence.current) return;
        setScheduleEditError(
          error instanceof Error ? error.message : "The itinerary could not be updated.",
        );
        setScheduleLoad({ status: "ready" });
      }
    },
    [applyScheduleUpdate],
  );

  const handleAddOption = useCallback(
    (_date: string, option: TripOption) => {
      const state = useTripStore.getState();
      void runScheduleEdit({
        selectedIds: [...new Set([...state.selectedIds, option.id])],
        excludedIds: state.excludedIds.filter((id) => id !== option.id),
        pinned: state.pinned,
      });
    },
    [runScheduleEdit],
  );

  const handleRemoveSuggestion = useCallback(
    (block: ScheduleBlock) => {
      if (!block.refId) return;
      const state = useTripStore.getState();
      void runScheduleEdit({
        selectedIds: state.selectedIds.filter((id) => id !== block.refId),
        excludedIds: [...new Set([...state.excludedIds, block.refId])],
        pinned: state.pinned.filter((pin) => pin.id !== block.refId),
      });
    },
    [runScheduleEdit],
  );

  const handleSwapBlock = useCallback(
    (block: ScheduleBlock, replacement: TripOption) => {
      if (!block.refId) return;
      const state = useTripStore.getState();
      const pin: SchedulePin = {
        id: replacement.id,
        date: block.start.slice(0, 10),
        startMinutes: blockStartMinutes(block),
      };
      void runScheduleEdit(
        {
          selectedIds: [
            ...new Set([
              ...state.selectedIds.filter((id) => id !== block.refId),
              replacement.id,
            ]),
          ],
          excludedIds: [
            ...new Set([
              ...state.excludedIds.filter((id) => id !== replacement.id),
              block.refId,
            ]),
          ],
          pinned: [
            ...state.pinned.filter(
              (existing) => existing.id !== block.refId && existing.id !== replacement.id,
            ),
            pin,
          ],
        },
        replacement.id,
      );
    },
    [runScheduleEdit],
  );

  const handleMoveBlock = useCallback(
    (id: string, date: string, startMinutes: number) => {
      const state = useTripStore.getState();
      void runScheduleEdit(
        {
          selectedIds: state.selectedIds,
          excludedIds: state.excludedIds.filter((excludedId) => excludedId !== id),
          pinned: [
            ...state.pinned.filter((pin) => pin.id !== id),
            { id, date, startMinutes },
          ],
        },
        id,
      );
    },
    [runScheduleEdit],
  );

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
    (option): option is TravelOption => option.kind === "flight",
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
  if (intake && budgetPlan && budgetState) switch (currentStep) {
    case 1:
      activeStep = (
        <FlightStep
          budget={budgetState}
          options={flights}
          plan={budgetPlan}
          remainingCents={remainingCents}
          selectedIds={selectedIds}
          total={intake.budgetTotal}
          onBucketChange={adjustBucket}
          onSelectionChange={handleSelectionChange}
          research={research.flight}
          onRetry={() => retryResearch("flight")}
        />
      );
      break;
    case 2:
      activeStep = (
        <LodgingStep
          budget={budgetState}
          options={lodging}
          plan={budgetPlan}
          remainingCents={remainingCents}
          selectedIds={selectedIds}
          total={intake.budgetTotal}
          onBucketChange={adjustBucket}
          onSelectionChange={handleSelectionChange}
          research={research.lodging}
          onRetry={() => retryResearch("lodging")}
        />
      );
      break;
    case 3:
      activeStep = (
        <ActivityStep
          budget={budgetState}
          intake={intake}
          options={activities}
          plan={budgetPlan}
          remainingCents={remainingCents}
          selectedIds={selectedIds}
          total={intake.budgetTotal}
          onBucketChange={adjustBucket}
          onSelectionChange={handleSelectionChange}
          research={research.activity}
          onRetry={() => retryResearch("activity")}
        />
      );
      break;
    case 4:
      activeStep = (
        <>
          <TransitStep
            budget={budgetState}
            options={transit}
            plan={budgetPlan}
            remainingCents={remainingCents}
            selectedIds={selectedIds}
            total={intake.budgetTotal}
            onBucketChange={adjustBucket}
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
          editing={scheduleLoad.status === "loading"}
          editError={scheduleEditError}
          intake={intake}
          itinerary={itinerary}
          options={options}
          state={scheduleLoad}
          onAddOption={handleAddOption}
          onMoveBlock={handleMoveBlock}
          onRemoveSuggestion={handleRemoveSuggestion}
          onRetry={retrySchedule}
          onSwapBlock={handleSwapBlock}
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
      <TripCelebration
        key={celebrationRun}
        open={showCelebration && currentStep === WIZARD_STEPS.length - 1}
        onComplete={() => setShowCelebration(false)}
      />
      <header className="no-print border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onHome}
            aria-label="Back to the Penny Rats home screen"
            className="-m-1 flex items-center gap-3 rounded-card p-1 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <PennyRatsLogo
              size={60}
              showWordmark={false}
              className="-rotate-2 drop-shadow-[0_7px_12px_rgba(20,18,15,0.22)]"
            />
            <span>
              <span className="block text-lg font-bold tracking-[-0.03em]">Penny Rats</span>
              <span className="block text-xs text-muted-foreground">
                Plan boldly. Spend deliberately.
              </span>
            </span>
          </button>
          {currentStep === WIZARD_STEPS.length - 1 ? (
            <Badge
              variant={
                itinerary && scheduleLoad.status !== "loading"
                  ? "success"
                  : scheduleLoad.status === "error"
                    ? "warning"
                    : "accent"
              }
            >
              {itinerary && scheduleLoad.status !== "loading"
                ? "Itinerary ready"
                : itinerary
                  ? "Updating itinerary"
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
                    Tell us the non-negotiables. You’ll tune each part of the budget beside the real prices it buys.
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

            <aside className="lg:sticky lg:top-6">
              <Card variant="muted" padding="lg">
                <Badge variant="accent">Prices before percentages</Badge>
                <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-foreground">
                  One total now. Real tradeoffs next.
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  After you save the trip basics, each step shows what is left and lets you move money while looking at the options.
                </p>
              </Card>
            </aside>
          </div>
        ) : (
          <div className="grid items-start gap-6 print:block lg:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)]">
            {currentStep === WIZARD_STEPS.length - 1 && (
              <div className="no-print lg:hidden">
                <BudgetMeter
                  plannedExtraCents={plannedExtraCents}
                  compact
                  plan={budgetPlan}
                  total={intake.budgetTotal}
                  options={options}
                  selectedIds={selectedIds}
                />
              </div>
            )}
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

            <aside className="no-print hidden lg:sticky lg:top-6 lg:block">
              <BudgetMeter
                  plannedExtraCents={plannedExtraCents}
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
