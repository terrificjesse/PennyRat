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
  const hasWarnings = check.warnings.length > 0;
  const title = !check.ok
    ? "Bring the trip back within budget."
    : hasWarnings
      ? "Ready to schedule, with a few notes."
      : "Your trip has the essentials.";

  return (
    <Card
      variant={check.ok ? "selected" : "muted"}
      className="mt-8"
      role="region"
      aria-labelledby="submit-gate-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <Badge variant={check.ok ? "success" : "danger"}>
            {check.ok ? "Ready to schedule" : "Over budget"}
          </Badge>
          <h2
            id="submit-gate-title"
            className="mt-3 text-xl font-semibold tracking-[-0.025em] text-foreground"
          >
            {title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {check.ok
              ? "The trip is within budget and ready to turn into a day-by-day plan."
              : "Replace or remove a choice before building the day-by-day plan."}
          </p>

          {check.blockers.length > 0 && (
            <div className="mt-4" role="alert">
              <h3 id="submit-blockers-title" className="text-sm font-semibold text-danger">
                What needs fixing
              </h3>
              <ul
                aria-labelledby="submit-blockers-title"
                className="mt-2 space-y-2 text-sm text-foreground"
              >
                {check.blockers.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span aria-hidden="true" className="text-danger">
                      —
                    </span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasWarnings && (
            <div className="mt-4">
              <h3 id="submit-warnings-title" className="text-sm font-semibold text-foreground">
                Good to know
              </h3>
              <ul
                aria-labelledby="submit-warnings-title"
                className="mt-2 space-y-2 text-sm text-muted-foreground"
              >
                {check.warnings.map((reason, index) => (
                  <li key={`${index}-${reason}`} className="flex gap-2">
                    <span aria-hidden="true" className="text-warning">
                      —
                    </span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Button type="button" size="lg" disabled={!check.ok} onClick={onContinue}>
          Continue to schedule
        </Button>
      </div>
    </Card>
  );
}
