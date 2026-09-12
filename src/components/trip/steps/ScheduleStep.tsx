"use client";

import type { Itinerary, ScheduleBlock, TripIntake, TripOption } from "@/lib/types";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export type ScheduleLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

type ScheduleStepProps = {
  intake: TripIntake;
  itinerary: Itinerary | null;
  options: readonly TripOption[];
  state: ScheduleLoadState;
  onRetry: () => void;
  editing?: boolean;
  editError?: string;
  onAddOption: (date: string, option: TripOption) => void;
  onMoveBlock: (id: string, date: string, startMinutes: number) => void;
  onRemoveSuggestion: (block: ScheduleBlock) => void;
  onSwapBlock: (block: ScheduleBlock, replacement: TripOption) => void;
};

function ScheduleSkeleton() {
  return (
    <div aria-label="Building itinerary" role="status">
      <span className="sr-only">Building itinerary</span>
      <Card variant="raised" padding="lg">
        <Skeleton variant="text" className="w-32" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton variant="text" className="mt-3 w-1/2" />
        <div className="mt-8 space-y-7">
          {[0, 1, 2].map((day) => (
            <div key={day}>
              <Skeleton className="h-7 w-52" />
              <Skeleton className="mt-4 h-24 w-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ScheduleStep({
  editError,
  editing = false,
  intake,
  itinerary,
  onAddOption,
  onMoveBlock,
  onRetry,
  onRemoveSuggestion,
  onSwapBlock,
  options,
  state,
}: ScheduleStepProps) {
  if ((state.status === "loading" || state.status === "idle") && !itinerary) {
    return <ScheduleSkeleton />;
  }

  if (state.status === "error") {
    return (
      <Card variant="raised" padding="lg" className="border-danger/50">
        <Badge variant="danger">Scheduling paused</Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">
          We couldn’t build the itinerary.
        </h1>
        <p role="alert" className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {state.error ?? "The schedule response could not be read."}
        </p>
        <Button type="button" className="mt-6" onClick={onRetry}>
          Try scheduling again
        </Button>
      </Card>
    );
  }

  if (!itinerary) {
    return (
      <Card variant="muted">
        <p className="text-sm text-muted-foreground">No itinerary is available yet.</p>
        <Button type="button" className="mt-4" onClick={onRetry}>
          Build itinerary
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge variant={editing ? "accent" : "success"}>
            {editing ? "Updating itinerary" : "Itinerary built"}
          </Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            Times are local. Review booking details before you pay.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Print itinerary
        </Button>
      </div>
      {editError && (
        <div role="alert" className="no-print mb-5 rounded-control border border-danger/50 bg-danger-soft px-4 py-3 text-sm text-danger">
          {editError}
        </div>
      )}
      <ItineraryView
        editing={editing}
        itinerary={itinerary}
        intake={intake}
        options={options}
        onAddOption={onAddOption}
        onMoveBlock={onMoveBlock}
        onRemoveSuggestion={onRemoveSuggestion}
        onSwapBlock={onSwapBlock}
      />
    </div>
  );
}
