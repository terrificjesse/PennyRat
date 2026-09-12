"use client";

import { formatCents, type BudgetState } from "@/lib/budget";
import {
  BUCKET_LABELS,
  type BucketKey,
  type BudgetPlan,
  type Cents,
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

type StepBudgetControlProps = {
  budget: BudgetState;
  buckets: readonly BucketKey[];
  plan: BudgetPlan;
  total: Cents;
  onBucketChange: (bucket: BucketKey, value: Cents) => void;
  note?: string;
};

const sliderClasses: Record<BucketKey, string> = {
  flights: "accent-bucket-flights",
  lodging: "accent-bucket-lodging",
  activities: "accent-bucket-activities",
  food: "accent-bucket-food",
  localTransit: "accent-bucket-local-transit",
  buffer: "accent-bucket-buffer",
};

export function StepBudgetControl({
  budget,
  buckets,
  note,
  onBucketChange,
  plan,
  total,
}: StepBudgetControlProps) {
  return (
    <section
      aria-labelledby="step-budget-title"
      className="mb-6 rounded-card border-2 border-border-strong bg-surface-elevated p-4 shadow-control sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Live trip budget
          </p>
          <h2 id="step-budget-title" className="mt-1 text-lg font-bold text-foreground">
            {budget.overTotal ? "Over budget" : "Left to spend"}
          </h2>
          {note && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{note}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {formatCents(
              budget.overTotal ? Math.abs(budget.remainingTotal) : budget.remainingTotal,
            )}
          </p>
          <Badge variant={budget.overTotal ? "danger" : "success"}>
            {budget.overTotal ? "needs trimming" : "still flexible"}
          </Badge>
        </div>
      </div>

      <div className={`mt-5 grid gap-5 ${buckets.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {buckets.map((bucket) => {
          const inputId = `step-budget-${bucket}`;
          const status = budget.perBucket[bucket];
          return (
            <div key={bucket}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <label htmlFor={inputId} className="font-semibold text-foreground">
                  Move money to {BUCKET_LABELS[bucket].toLowerCase()}
                </label>
                <span className="tabular-nums text-muted-foreground">
                  {formatCents(status.spent)} selected · {formatCents(plan[bucket])} set aside
                </span>
              </div>
              <input
                id={inputId}
                type="range"
                min={0}
                max={total}
                step={100}
                value={plan[bucket]}
                onChange={(event) => onBucketChange(bucket, Number(event.currentTarget.value))}
                aria-valuetext={`${formatCents(plan[bucket])} set aside for ${BUCKET_LABELS[bucket]}`}
                className={`w-full cursor-pointer ${sliderClasses[bucket]}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
