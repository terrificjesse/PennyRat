import { formatCents } from "@/lib/budget";
import type { Itinerary, ScheduleBlock, TripIntake, TripOption } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ItineraryViewProps = {
  itinerary: Itinerary;
  intake: TripIntake;
  options: readonly TripOption[];
  onReviewOption?: (option: TripOption) => void;
};

const blockLabels: Record<ScheduleBlock["kind"], string> = {
  flight: "Flight",
  activity: "Activity",
  meal: "Meal",
  lodging_checkin: "Check-in",
  lodging_checkout: "Check-out",
  transit: "Transit",
  free: "Open time",
};

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatClock(value: string): string {
  const time = value.split("T")[1];
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function DayBlock({
  block,
  onReviewOption,
  option,
}: {
  block: ScheduleBlock;
  option?: TripOption;
  onReviewOption?: (option: TripOption) => void;
}) {
  return (
    <li className="relative pl-8 print:break-inside-avoid">
      <span
        aria-hidden="true"
        className="absolute left-[0.2rem] top-2 size-3 rounded-full border-[3px] border-surface bg-accent ring-1 ring-accent"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <time dateTime={block.start}>{formatClock(block.start)}</time>
            {" – "}
            <time dateTime={block.end}>{formatClock(block.end)}</time>
            {" · "}
            {blockLabels[block.kind]}
          </p>
          <h3 className="mt-1 font-semibold text-foreground">{block.title}</h3>
          {block.note && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {block.note}
            </p>
          )}
          {option && onReviewOption && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="no-print -ml-3 mt-1"
              onClick={() => onReviewOption(option)}
            >
              Review choice
            </Button>
          )}
        </div>
        {block.costCents > 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {formatCents(block.costCents)}
          </span>
        )}
      </div>
    </li>
  );
}

export function ItineraryView({
  intake,
  itinerary,
  onReviewOption,
  options = [],
}: ItineraryViewProps) {
  const optionsById = new Map(options.map((option) => [option.id, option]));

  return (
    <article className="print-itinerary" aria-labelledby="itinerary-title">
      <Card variant="raised" padding="lg" className="print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <Badge variant="success">Within budget</Badge>
            <h1
              id="itinerary-title"
              className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl"
            >
              {intake.destination}, day by day
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {intake.origin} → {intake.destination} · {intake.startDate} to {intake.endDate}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Planned total
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {formatCents(itinerary.totalCents)}
            </p>
          </div>
        </div>

        {itinerary.warnings.length > 0 && (
          <div className="mt-6 rounded-control border border-warning/40 bg-warning-soft p-4">
            <h2 className="text-sm font-semibold text-warning">Trip notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              {itinerary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {itinerary.days.length > 0 ? (
          <div className="mt-8 space-y-8">
            {itinerary.days.map((day) => (
              <section
                key={day.date}
                aria-labelledby={`day-${day.date}`}
                className="itinerary-day"
              >
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                      {day.date}
                    </p>
                    <h2
                      id={`day-${day.date}`}
                      className="mt-1 text-xl font-semibold tracking-[-0.025em] text-foreground"
                    >
                      {formatDate(day.date)}
                    </h2>
                  </div>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {formatCents(day.daySpendCents)} planned
                  </p>
                </div>

                {day.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-warning">
                    {day.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}

                {day.blocks.length > 0 ? (
                  <ol className="mt-5 space-y-6 border-l border-border pb-1">
                    {day.blocks.map((block, index) => (
                      <DayBlock
                        key={`${block.start}-${block.title}-${index}`}
                        block={block}
                        option={block.refId ? optionsById.get(block.refId) : undefined}
                        onReviewOption={onReviewOption}
                      />
                    ))}
                  </ol>
                ) : (
                  <div className="mt-4 rounded-control bg-muted px-4 py-4">
                    <p className="text-sm font-semibold text-foreground">Travel day</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Your selected flight is in progress, so no destination activities are scheduled.
                    </p>
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-control bg-muted p-5 text-sm text-muted-foreground">
            No days were generated for these dates. Return to the plan and check the trip dates.
          </div>
        )}

        {itinerary.unscheduled.length > 0 && (
          <section className="mt-8 border-t border-border pt-6" aria-labelledby="unscheduled-title">
            <h2 id="unscheduled-title" className="text-lg font-semibold text-foreground">
              Couldn’t fit everything
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These picks remain in your budget, but need a manual time slot.
            </p>
            <ul className="mt-4 space-y-3">
              {itinerary.unscheduled.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-muted px-4 py-3 text-sm"
                >
                  <p>
                    <span className="font-semibold text-foreground">
                      {optionsById.get(item.id)?.title ?? item.id}
                    </span>
                    <span className="text-muted-foreground"> — {item.reason}</span>
                  </p>
                  {optionsById.get(item.id) && onReviewOption && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="no-print"
                      onClick={() => {
                        const option = optionsById.get(item.id);
                        if (option) onReviewOption(option);
                      }}
                    >
                      Review choice
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Card>
    </article>
  );
}
