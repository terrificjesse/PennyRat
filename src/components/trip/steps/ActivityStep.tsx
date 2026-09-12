import { forecastFood, formatCents, tripNights, type BudgetState } from "@/lib/budget";
import type {
  ActivityOption,
  BucketKey,
  BudgetPlan,
  Cents,
  TripIntake,
} from "@/lib/types";
import { StepBudgetControl } from "@/components/budget/StepBudgetControl";
import { OptionList } from "@/components/options/OptionList";
import {
  OptionListSkeleton,
  ResearchNotice,
  type ResearchLoadState,
} from "@/components/trip/ResearchNotice";
import { Badge } from "@/components/ui/Badge";

type ActivityStepProps = {
  options: readonly ActivityOption[];
  selectedIds: readonly string[];
  onSelectionChange: (id: string, selected: boolean) => void;
  research: ResearchLoadState;
  onRetry: () => void;
  remainingCents: Cents;
  intake: TripIntake;
  budget: BudgetState;
  plan: BudgetPlan;
  total: Cents;
  onBucketChange: (bucket: BucketKey, value: Cents) => void;
};

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function ActivityDetails({ option }: { option: ActivityOption }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="neutral">{formatDuration(option.durationMinutes)}</Badge>
        <Badge variant="neutral">Best {option.bestTimeOfDay}</Badge>
        {option.rating !== undefined && (
          <Badge variant="neutral">
            {option.rating.toFixed(1)} rating
            {option.reviewCount !== undefined &&
              ` · ${option.reviewCount.toLocaleString("en-US")} reviews`}
          </Badge>
        )}
        {option.bookingRequired && <Badge variant="warning">Book ahead</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {option.interests.map((interest) => (
          <span
            key={interest}
            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            {interest.replaceAll("_", " ")}
          </span>
        ))}
      </div>
      {option.sensoryNotes && (
        <p className="rounded-control bg-muted px-3 py-2 text-xs leading-5">
          <span className="font-semibold text-foreground">Sensory note:</span>{" "}
          {option.sensoryNotes}
        </p>
      )}
    </div>
  );
}

export function ActivityStep({
  budget,
  intake,
  onBucketChange,
  onRetry,
  onSelectionChange,
  options,
  plan,
  remainingCents,
  research,
  selectedIds,
  total,
}: ActivityStepProps) {
  const restaurants = options.filter((option) => option.category === "restaurant");
  const activities = options.filter((option) => option.category !== "restaurant");
  const food = forecastFood(intake, options);

  return (
    <div>
      <div className="mb-5">
        <Badge variant="primary">Make it yours</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Choose what sounds worth it
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Pick as many as you like. Restaurants use the food budget; everything else uses activities.
        </p>
      </div>

      <StepBudgetControl
        budget={budget}
        buckets={["activities", "food"]}
        plan={plan}
        total={total}
        onBucketChange={onBucketChange}
        note={`Plan on about ${formatCents(food.perDayCents)} a day for ${food.mealsPerDay} meals — ${formatCents(food.totalCents)} across ${tripNights(intake)} days, already set aside in your budget.`}
      />

      <ResearchNotice state={research} onRetry={onRetry} />
      {research.status === "loading" && options.length === 0 ? (
        <OptionListSkeleton />
      ) : (
        <div className="space-y-10">
          <OptionList
            title="Things to do"
            description="Museums, outdoors, attractions, and experiences matched to your interests."
            emptyMessage="No non-food activities matched this trip."
            options={activities}
            remainingCents={remainingCents}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => <ActivityDetails option={option} />}
          />
          <OptionList
            title="Food"
            description="Meals are priced for the whole party and tracked in their own budget."
            emptyMessage="No restaurants matched this trip."
            options={restaurants}
            remainingCents={remainingCents}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            renderDetails={(option) => <ActivityDetails option={option} />}
          />
        </div>
      )}
    </div>
  );
}
