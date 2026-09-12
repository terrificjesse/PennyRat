import type { FlightOption } from "@/lib/types";
import { OptionList } from "@/components/options/OptionList";
import {
  OptionListSkeleton,
  ResearchNotice,
  type ResearchLoadState,
} from "@/components/trip/ResearchNotice";
import { Badge } from "@/components/ui/Badge";

type FlightStepProps = {
  options: readonly FlightOption[];
  selectedIds: readonly string[];
  onSelectionChange: (id: string, selected: boolean) => void;
  research: ResearchLoadState;
  onRetry: () => void;
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

function FlightDetails({ option }: { option: FlightOption }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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

      <ol className="space-y-3" aria-label={`${option.title} itinerary`}>
        {option.legs.map((leg, index) => (
          <li
            key={`${leg.from}-${leg.to}-${index}`}
            className="rounded-control border border-border bg-muted px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
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

export function FlightStep({
  onRetry,
  onSelectionChange,
  options,
  research,
  selectedIds,
}: FlightStepProps) {
  const outbound = options.filter((option) => option.direction === "outbound");
  const returns = options.filter((option) => option.direction === "return");

  return (
    <div>
      <div className="mb-5">
        <Badge variant="primary">Whole-party prices</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Choose your flights
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose one flight there and one flight home. Every fare covers the full party.
        </p>
      </div>

      <ResearchNotice state={research} onRetry={onRetry} />
      {research.status === "loading" && options.length === 0 ? (
        <OptionListSkeleton />
      ) : (
        <div className="space-y-10">
          <OptionList
            title="Outbound"
            description="The first outbound you choose will be replaced if you select another."
            emptyMessage="No outbound flights matched these dates."
            options={outbound}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => <FlightDetails option={option} />}
          />
          <OptionList
            title="Return"
            description="Choose the trip home separately so both directions stay easy to compare."
            emptyMessage="No return flights matched these dates."
            options={returns}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => <FlightDetails option={option} />}
          />
        </div>
      )}
    </div>
  );
}
