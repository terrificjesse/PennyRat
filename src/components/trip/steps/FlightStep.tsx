import { applySelection, formatCents, type BudgetState } from "@/lib/budget";
import {
  TRAVEL_MODE_LABELS,
  travelMode,
  type BucketKey,
  type BudgetPlan,
  type Cents,
  type TravelOption,
} from "@/lib/types";
import { OptionList } from "@/components/options/OptionList";
import { StepBudgetControl } from "@/components/budget/StepBudgetControl";
import {
  OptionListSkeleton,
  ResearchNotice,
  type ResearchLoadState,
} from "@/components/trip/ResearchNotice";
import { Badge } from "@/components/ui/Badge";

type FlightStepProps = {
  options: readonly TravelOption[];
  selectedIds: readonly string[];
  onSelectionChange: (id: string, selected: boolean) => void;
  research: ResearchLoadState;
  onRetry: () => void;
  remainingCents: Cents;
  budget: BudgetState;
  plan: BudgetPlan;
  total: Cents;
  onBucketChange: (bucket: BucketKey, value: Cents) => void;
};

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatLocalDateTime(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const localClock = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Airport times intentionally have no timezone; UTC prevents the browser from shifting them.
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(localClock);
}

function JourneyLegs({
  label,
  legs,
  title,
}: {
  label: string;
  legs: TravelOption["legs"];
  title: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
        {label}
      </p>
      <ol className="space-y-3" aria-label={`${title} ${label.toLowerCase()}`}>
        {legs.map((leg, index) => (
          <li
            key={`${leg.from}-${leg.to}-${index}`}
            className="rounded-control border border-border bg-muted px-3 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 break-words font-semibold text-foreground">
                {leg.from} → {leg.to}
              </span>
              <span className="text-xs">
                {leg.carrier}
                {leg.flightNo ? ` ${leg.flightNo}` : ""} · {formatDuration(leg.durationMinutes)}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <span>Depart {formatLocalDateTime(leg.departLocal)}</span>
              <span className="sm:text-right">Arrive {formatLocalDateTime(leg.arriveLocal)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FlightDetails({
  comparison,
  option,
}: {
  comparison?: { outboundCents: Cents; returnCents: Cents; savingCents: Cents };
  option: TravelOption;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">{TRAVEL_MODE_LABELS[travelMode(option)]}</Badge>
        <Badge variant="neutral">{formatDuration(option.totalDurationMinutes)}</Badge>
        <Badge variant="neutral">
          {option.stops === 0
            ? "Nonstop"
            : `${option.stops} stop${option.stops === 1 ? "" : "s"}`}
        </Badge>
        <Badge variant={option.baggageIncluded ? "success" : "warning"}>
          {option.baggageIncluded ? "Bag included" : "No checked bag"}
        </Badge>
      </div>

      {comparison && comparison.savingCents > 0 && (
        <p className="rounded-control bg-success-soft px-3 py-2 text-xs leading-5 text-foreground">
          <span className="font-semibold">Save {formatCents(comparison.savingCents)}:</span>{" "}
          compare this one total with{" "}
          {formatCents(comparison.outboundCents)} out + {formatCents(comparison.returnCents)} home
          when booked separately.
        </p>
      )}

      <JourneyLegs
        title={option.title}
        label={option.direction === "return" ? "Journey home" : "Getting there"}
        legs={option.legs}
      />
      {option.direction === "roundtrip" && option.returnLegs && (
        <JourneyLegs title={option.title} label="Coming home" legs={option.returnLegs} />
      )}
    </div>
  );
}

export function FlightStep({
  budget,
  onRetry,
  onBucketChange,
  onSelectionChange,
  options,
  plan,
  remainingCents,
  research,
  selectedIds,
  total,
}: FlightStepProps) {
  const outbound = options.filter((option) => option.direction === "outbound");
  const returns = options.filter((option) => option.direction === "return");
  const roundTrips = options.filter((option) => option.direction === "roundtrip");
  const cheapestOutbound = [...outbound].sort((a, b) => a.costCents - b.costCents)[0];
  const cheapestReturn = [...returns].sort((a, b) => a.costCents - b.costCents)[0];
  const separateOneWayCost =
    cheapestOutbound && cheapestReturn
      ? applySelection(plan, total, options, [cheapestOutbound.id, cheapestReturn.id]).spentTotal
      : undefined;
  const comparisonFor = (roundTrip: TravelOption) =>
    cheapestOutbound && cheapestReturn && separateOneWayCost !== undefined
      ? {
          outboundCents: cheapestOutbound.costCents,
          returnCents: cheapestReturn.costCents,
          savingCents: applySelection(plan, separateOneWayCost, options, [roundTrip.id])
            .remainingTotal,
        }
      : undefined;

  return (
    <div>
      <div className="mb-5">
        <Badge variant="primary">Whole-party prices</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Choose how you’ll get there
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Compare flights, trains, coaches, and driving where they make sense. Every price covers the full party.
        </p>
      </div>

      <StepBudgetControl
        budget={budget}
        buckets={["flights"]}
        plan={plan}
        total={total}
        onBucketChange={onBucketChange}
        note="Adjust this share while the real travel prices are in front of you."
      />

      <ResearchNotice state={research} onRetry={onRetry} />
      {research.status === "loading" && options.length === 0 ? (
        <OptionListSkeleton />
      ) : (
        <div className="space-y-10">
          <OptionList
            title="Round trips"
            description="One booking covers the journey there and home, usually for less than two separate tickets."
            emptyMessage="No round trips matched these dates."
            options={roundTrips}
            remainingCents={remainingCents}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => (
              <FlightDetails option={option} comparison={comparisonFor(option)} />
            )}
          />
          <OptionList
            title="Getting there one way"
            description="Choose this when your way home will be different."
            emptyMessage="No one-way journeys out matched these dates."
            options={outbound}
            remainingCents={remainingCents}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => <FlightDetails option={option} />}
          />
          <OptionList
            title="Coming home one way"
            description="Pair one of these with a one-way journey out."
            emptyMessage="No one-way journeys home matched these dates."
            options={returns}
            remainingCents={remainingCents}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => <FlightDetails option={option} />}
          />
        </div>
      )}
    </div>
  );
}
