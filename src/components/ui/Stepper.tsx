"use client";

import type { ReactNode } from "react";

export type StepperStep = {
  id: string;
  label: ReactNode;
  ariaLabel?: string;
  description?: ReactNode;
  disabled?: boolean;
};

export type StepperProps = {
  steps: readonly StepperStep[];
  /** Zero-based index of the active step. */
  currentStep: number;
  onStepClick?: (index: number, step: StepperStep) => void;
  ariaLabel?: string;
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="m3.25 8.25 2.75 2.5 6.75-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Stepper({
  ariaLabel = "Trip builder progress",
  className,
  currentStep,
  onStepClick,
  steps,
}: StepperProps) {
  const activeIndex = Math.min(
    Math.max(Math.trunc(currentStep), 0),
    Math.max(steps.length - 1, 0),
  );
  const activeStep = steps[activeIndex];
  const activeLabel =
    activeStep?.ariaLabel ??
    (typeof activeStep?.label === "string" ? activeStep.label : activeStep?.id);

  return (
    <nav aria-label={ariaLabel} className={className}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {activeIndex + 1} of {steps.length}: {activeLabel}
      </p>
      <ol className="flex w-full items-start" role="list">
        {steps.map((step, index) => {
          const complete = index < activeIndex;
          const current = index === activeIndex;
          const canClick = Boolean(onStepClick) && !step.disabled;
          const markerClasses = cx(
            "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums transition-colors",
            complete && "border-accent bg-accent text-accent-foreground",
            current && "border-primary bg-primary text-primary-foreground ring-4 ring-primary-soft",
            !complete && !current && "border-border-strong bg-surface text-muted-foreground",
          );

          return (
            <li
              key={step.id}
              className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center first:items-start first:text-left last:items-end last:text-right"
              aria-current={current ? "step" : undefined}
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2",
                    index < activeIndex ? "bg-accent" : "bg-border",
                  )}
                />
              )}

              {canClick ? (
                <button
                  type="button"
                  className={cx(
                    markerClasses,
                    "cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  onClick={() => onStepClick?.(index, step)}
                  aria-label={
                    step.ariaLabel ??
                    `Go to step ${index + 1}${typeof step.label === "string" ? `: ${step.label}` : ""}`
                  }
                >
                  {complete ? <CheckIcon /> : index + 1}
                </button>
              ) : (
                <span className={markerClasses} aria-hidden="true">
                  {complete ? <CheckIcon /> : index + 1}
                </span>
              )}

              <div className="relative z-10 mt-3 max-w-32 px-1">
                <span
                  className={cx(
                    "block text-[0.6875rem] font-semibold leading-4 sm:text-sm sm:leading-5",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="mt-0.5 hidden text-xs leading-4 text-muted-foreground sm:block">
                    {step.description}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
