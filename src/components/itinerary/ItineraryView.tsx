"use client";

import type { DragEvent } from "react";
import { formatCents } from "@/lib/budget";
import type { Itinerary, ScheduleBlock, TripIntake, TripOption } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ItineraryViewProps = {
  itinerary: Itinerary;
  intake: TripIntake;
  options: readonly TripOption[];
  editing?: boolean;
  onAddOption?: (date: string, option: TripOption) => void;
  onMoveBlock?: (id: string, date: string, startMinutes: number) => void;
  onRemoveSuggestion?: (block: ScheduleBlock) => void;
  onSwapBlock?: (block: ScheduleBlock, replacement: TripOption) => void;
};

const blockLabels: Record<ScheduleBlock["kind"], string> = {
  flight: "Journey",
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

function startMinutes(value: string): number {
  const [hour, minute] = value.split("T")[1].split(":").map(Number);
  return hour * 60 + minute;
}

function mapUrl(option?: TripOption): string | undefined {
  return option?.kind === "activity" || option?.kind === "lodging"
    ? option.mapsUrl
    : undefined;
}

function canMove(block: ScheduleBlock): boolean {
  return Boolean(block.refId && (block.kind === "activity" || block.kind === "meal"));
}

function DayBlock({
  block,
  date,
  editing,
  nextStart,
  onMoveBlock,
  onRemoveSuggestion,
  onSwapBlock,
  option,
  optionsById,
  previousStart,
}: {
  block: ScheduleBlock;
  date: string;
  editing: boolean;
  nextStart?: number;
  onMoveBlock?: ItineraryViewProps["onMoveBlock"];
  onRemoveSuggestion?: ItineraryViewProps["onRemoveSuggestion"];
  onSwapBlock?: ItineraryViewProps["onSwapBlock"];
  option?: TripOption;
  optionsById: ReadonlyMap<string, TripOption>;
  previousStart?: number;
}) {
  const alternatives = (block.alternatives ?? [])
    .map((id) => optionsById.get(id))
    .filter((candidate): candidate is TripOption => candidate !== undefined);
  const refId = block.refId;
  const movable = canMove(block) && Boolean(onMoveBlock);
  const mapsUrl = mapUrl(option);

  const handleDragStart = (event: DragEvent<HTMLLIElement>) => {
    if (!movable || !refId) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/pennyrat-option", refId);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>) => {
    const id = event.dataTransfer.getData("text/pennyrat-option");
    if (!id || !onMoveBlock) return;
    event.preventDefault();
    event.stopPropagation();
    if (id === refId) return;
    onMoveBlock(id, date, startMinutes(block.start));
  };

  return (
    <li
      className={`relative rounded-control pl-8 transition-colors print:break-inside-avoid ${movable ? "cursor-grab hover:bg-muted/60 active:cursor-grabbing" : ""}`}
      draggable={movable}
      onDragStart={handleDragStart}
      onDragOver={movable ? (event) => event.preventDefault() : undefined}
      onDrop={movable ? handleDrop : undefined}
    >
      <span
        aria-hidden="true"
        className="absolute left-[0.2rem] top-2 size-3 rounded-full border-[3px] border-surface bg-accent ring-1 ring-accent"
      />
      <div className="flex flex-wrap items-start justify-between gap-3 pr-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <time dateTime={block.start}>{formatClock(block.start)}</time>
              {" – "}
              <time dateTime={block.end}>{formatClock(block.end)}</time>
              {" · "}
              {blockLabels[block.kind]}
            </p>
            {block.suggested && <Badge variant="estimate">Suggested</Badge>}
            {movable && <Badge variant="neutral">Drag to move</Badge>}
          </div>
          <h3 className="mt-1 font-semibold text-foreground">{block.title}</h3>
          {block.note && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {block.note}
            </p>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="no-print mt-2 inline-block rounded-control text-sm font-semibold text-primary underline decoration-2 underline-offset-4 hover:text-primary-hover"
            >
              View on map<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
        {block.costCents > 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {formatCents(block.costCents)}
          </span>
        )}
      </div>

      {(alternatives.length > 0 || (block.suggested && refId) || movable) && (
        <details className="no-print mt-3 rounded-control border border-border bg-muted/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Edit {block.title}
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-2 pr-2">
            {alternatives.map((replacement) => (
              <Button
                key={replacement.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={editing}
                onClick={() => onSwapBlock?.(block, replacement)}
              >
                Swap for {replacement.title}
              </Button>
            ))}
            {block.suggested && refId && onRemoveSuggestion && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={editing}
                onClick={() => onRemoveSuggestion(block)}
              >
                Remove suggestion
              </Button>
            )}
            {movable && refId && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={editing || previousStart === undefined}
                  onClick={() =>
                    previousStart !== undefined &&
                    onMoveBlock?.(refId, date, previousStart)
                  }
                >
                  Move earlier
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={editing || nextStart === undefined}
                  onClick={() =>
                    nextStart !== undefined && onMoveBlock?.(refId, date, nextStart)
                  }
                >
                  Move later
                </Button>
              </>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

export function ItineraryView({
  editing = false,
  intake,
  itinerary,
  onAddOption,
  onMoveBlock,
  onRemoveSuggestion,
  onSwapBlock,
  options = [],
}: ItineraryViewProps) {
  const optionsById = new Map(options.map((option) => [option.id, option]));
  const overBudget = (itinerary.overBudgetCents ?? 0) > 0;

  return (
    <article className="print-itinerary" aria-labelledby="itinerary-title">
      <Card variant="raised" padding="lg" className="print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <Badge variant={overBudget ? "danger" : "success"}>
              {overBudget
                ? `${formatCents(itinerary.overBudgetCents ?? 0)} over budget`
                : "Within budget"}
            </Badge>
            <h1 id="itinerary-title" className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">
              {intake.destination}, day by day
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {intake.origin} → {intake.destination} · {intake.startDate} to {intake.endDate}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Planned total</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatCents(itinerary.totalCents)}</p>
            {itinerary.chosenCents !== undefined && itinerary.suggestedCents !== undefined && (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {formatCents(itinerary.chosenCents)} chosen · {formatCents(itinerary.suggestedCents)} suggested
              </p>
            )}
          </div>
        </div>

        {itinerary.warnings.length > 0 && (
          <div className="mt-6 rounded-control border border-warning/40 bg-warning-soft p-4">
            <h2 className="text-sm font-semibold text-warning">Trip notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              {itinerary.warnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {itinerary.days.length > 0 ? (
          <div className="mt-8 space-y-8">
            {itinerary.days.map((day) => {
              const movableBlocks = day.blocks.filter(canMove);
              const couldAdd = (day.couldAdd ?? [])
                .map((id) => optionsById.get(id))
                .filter((option): option is TripOption => option !== undefined);

              return (
                <section
                  key={day.date}
                  aria-labelledby={`day-${day.date}`}
                  className="itinerary-day rounded-control"
                  onDragOver={onMoveBlock ? (event) => event.preventDefault() : undefined}
                  onDrop={onMoveBlock ? (event) => {
                    const id = event.dataTransfer.getData("text/pennyrat-option");
                    if (id) onMoveBlock(id, day.date, 9 * 60);
                  } : undefined}
                >
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{day.date}</p>
                      <h2 id={`day-${day.date}`} className="mt-1 text-xl font-semibold tracking-[-0.025em] text-foreground">
                        {formatDate(day.date)}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular-nums text-muted-foreground">{formatCents(day.daySpendCents)} planned</p>
                      {day.filledMinutes !== undefined && (
                        <p className="mt-1 text-xs text-muted-foreground">{Math.round(day.filledMinutes / 60)} hours filled</p>
                      )}
                    </div>
                  </div>

                  {day.warnings.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-warning">
                      {day.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  )}

                  {day.blocks.length > 0 ? (
                    <ol className="mt-5 space-y-6 border-l border-border pb-1">
                      {day.blocks.map((block, index) => {
                        const movableIndex = movableBlocks.indexOf(block);
                        return (
                          <DayBlock
                            key={`${block.start}-${block.title}-${index}`}
                            block={block}
                            date={day.date}
                            editing={editing}
                            option={block.refId ? optionsById.get(block.refId) : undefined}
                            optionsById={optionsById}
                            onMoveBlock={onMoveBlock}
                            onRemoveSuggestion={onRemoveSuggestion}
                            onSwapBlock={onSwapBlock}
                            previousStart={movableIndex > 0 ? startMinutes(movableBlocks[movableIndex - 1].start) : undefined}
                            nextStart={movableIndex >= 0 && movableIndex < movableBlocks.length - 1 ? startMinutes(movableBlocks[movableIndex + 1].start) : undefined}
                          />
                        );
                      })}
                    </ol>
                  ) : (
                    <div className="mt-4 rounded-control bg-muted px-4 py-4">
                      <p className="text-sm font-semibold text-foreground">Travel day</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Your selected journey is in progress, so no destination activities are scheduled.
                      </p>
                    </div>
                  )}

                  {couldAdd.length > 0 && onAddOption && (
                    <details className="no-print mt-5 rounded-control border border-border bg-muted px-4 py-3">
                      <summary className="cursor-pointer font-semibold text-foreground">Add something to {formatDate(day.date)}</summary>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {couldAdd.map((option) => (
                          <Button key={option.id} type="button" size="sm" variant="outline" disabled={editing} onClick={() => onAddOption(day.date, option)}>
                            Add {option.title}
                          </Button>
                        ))}
                      </div>
                    </details>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-control bg-muted p-5 text-sm text-muted-foreground">
            No days were generated for these dates. Check the trip dates and try scheduling again.
          </div>
        )}

        {itinerary.unscheduled.length > 0 && (
          <section className="mt-8 border-t border-border pt-6" aria-labelledby="unscheduled-title">
            <h2 id="unscheduled-title" className="text-lg font-semibold text-foreground">Couldn’t fit everything</h2>
            <p className="mt-1 text-sm text-muted-foreground">These choices need a different time or a swap.</p>
            <ul className="mt-4 space-y-3">
              {itinerary.unscheduled.map((item, index) => (
                <li key={`${index}-${item.id}-${item.reason}`} className="rounded-control bg-muted px-4 py-3 text-sm">
                  <span className="font-semibold text-foreground">{optionsById.get(item.id)?.title ?? item.id}</span>
                  <span className="text-muted-foreground"> — {item.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Card>

      <section className="trip-sendoff no-print mx-auto mt-10 max-w-xl text-center" aria-label="Enjoy your trip">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied local artwork */}
        <img
          src="/enjoy-your-trip.PNG"
          alt="Penny Rat celebrating your finished itinerary"
          className="mx-auto w-full max-w-sm drop-shadow-[0_18px_30px_rgba(20,18,15,0.2)]"
        />
        <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-foreground">Enjoy your trip.</h2>
        <p className="mt-2 text-sm text-muted-foreground">The budget is set. The days are yours.</p>
      </section>
    </article>
  );
}
