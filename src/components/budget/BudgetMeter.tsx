import { applySelection, formatCents } from "@/lib/budget";
import {
  BUCKET_KEYS,
  BUCKET_LABELS,
  type BucketKey,
  type BudgetPlan,
  type Cents,
  type TripOption,
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";

type BudgetMeterProps = {
  plan: BudgetPlan;
  total: Cents;
  options: readonly TripOption[];
  selectedIds: readonly string[];
  className?: string;
};

const indicatorClasses: Record<BucketKey, string> = {
  flights: "bg-bucket-flights",
  lodging: "bg-bucket-lodging",
  activities: "bg-bucket-activities",
  food: "bg-bucket-food",
  localTransit: "bg-bucket-local-transit",
  buffer: "bg-bucket-buffer",
};

export function BudgetMeter({
  className,
  options,
  plan,
  selectedIds,
  total,
}: BudgetMeterProps) {
  const budget = applySelection(plan, total, options, selectedIds);

  return (
    <Card
      variant="raised"
      className={`${budget.overTotal ? "border-danger/60" : ""} ${className ?? ""}`}
      aria-labelledby="budget-meter-title"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Live trip budget
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="budget-meter-title" className="text-sm font-semibold text-muted-foreground">
            {budget.overTotal ? "Over budget" : "Left to spend"}
          </h2>
          <p
            aria-live="polite"
            className={`text-3xl font-bold tracking-[-0.04em] ${
              budget.overTotal ? "text-danger" : "text-foreground"
            }`}
          >
            {formatCents(budget.remainingTotal)}
          </p>
        </div>
        <Badge variant={budget.overTotal ? "danger" : "success"}>
          {formatCents(budget.spentTotal)} selected
        </Badge>
      </div>

      <Progress
        className="mt-5"
        ariaLabel="Total trip budget used"
        value={budget.spentTotal}
        max={total}
        tone={budget.overTotal ? "danger" : "primary"}
        size="lg"
      />
      <p className="mt-2 text-xs text-muted-foreground">Total plan: {formatCents(total)}</p>

      <div className="mt-7 space-y-4 border-t border-border pt-6">
        {BUCKET_KEYS.map((bucket) => {
          const status = budget.perBucket[bucket];
          return (
            <div key={bucket}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{BUCKET_LABELS[bucket]}</span>
                  {status.over && <Badge variant="danger">Over</Badge>}
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {formatCents(status.spent)} / {formatCents(status.planned)}
                </span>
              </div>
              <Progress
                ariaLabel={`${BUCKET_LABELS[bucket]} budget used`}
                value={status.spent}
                max={status.planned}
                size="sm"
                indicatorClassName={status.over ? "bg-danger" : indicatorClasses[bucket]}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
