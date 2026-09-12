"use client";

import { formatCents } from "@/lib/budget";
import {
  BUCKET_KEYS,
  BUCKET_LABELS,
  type BucketKey,
  type BudgetPlan,
  type Cents,
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type BucketAllocationProps = {
  plan: BudgetPlan;
  total: Cents;
  onBucketChange: (bucket: BucketKey, value: Cents) => void;
  onReset?: () => void;
};

const sliderClasses: Record<BucketKey, string> = {
  flights: "accent-bucket-flights",
  lodging: "accent-bucket-lodging",
  activities: "accent-bucket-activities",
  food: "accent-bucket-food",
  localTransit: "accent-bucket-local-transit",
  buffer: "accent-bucket-buffer",
};

export function BucketAllocation({
  onBucketChange,
  onReset,
  plan,
  total,
}: BucketAllocationProps) {
  return (
    <section aria-labelledby="bucket-allocation-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="bucket-allocation-title" className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Give every dollar a job
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
            Moving one slider rebalances the other five, so the plan always stays at {formatCents(total)}.
          </p>
        </div>
        {onReset && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Reset suggestion
          </Button>
        )}
      </div>

      <div className="mt-7 space-y-6">
        {BUCKET_KEYS.map((bucket) => {
          const inputId = `bucket-${bucket}`;
          return (
            <div key={bucket}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {BUCKET_LABELS[bucket]}
                  {bucket === "localTransit" && <Badge variant="accent">Protected line</Badge>}
                </label>
                <output htmlFor={inputId} className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCents(plan[bucket])}
                </output>
              </div>
              <input
                id={inputId}
                type="range"
                min={0}
                max={total}
                step={1}
                value={plan[bucket]}
                onChange={(event) => onBucketChange(bucket, Number(event.currentTarget.value))}
                aria-valuetext={formatCents(plan[bucket])}
                className={`w-full cursor-pointer ${sliderClasses[bucket]}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
