import { canSubmit } from "@/lib/budget";
import type { TripIntake, TripOption } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type SubmitGateProps = {
  intake: TripIntake;
  options: readonly TripOption[];
  selectedIds: readonly string[];
  onContinue: () => void;
};

export function SubmitGate({
  intake,
  onContinue,
  options,
  selectedIds,
}: SubmitGateProps) {
  const check = canSubmit(intake, options, selectedIds);

  return (
    <Card
      variant={check.ok ? "selected" : "muted"}
      className="mt-8"
      aria-labelledby="submit-gate-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <Badge variant={check.ok ? "success" : "warning"}>
            {check.ok ? "Ready to schedule" : "Before scheduling"}
          </Badge>
          <h2
            id="submit-gate-title"
            className="mt-3 text-xl font-semibold tracking-[-0.025em] text-foreground"
          >
            {check.ok ? "Your trip has the essentials." : "A few essentials are still missing."}
          </h2>
          {check.ok ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The trip is within budget and ready to turn into a day-by-day plan.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {check.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true" className="text-warning">
                    —
                  </span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="button" size="lg" disabled={!check.ok} onClick={onContinue}>
          Continue to schedule
        </Button>
      </div>
    </Card>
  );
}
