import { formatCents } from "@/lib/budget";
import type { LodgingOption } from "@/lib/types";
import { OptionList } from "@/components/options/OptionList";
import {
  OptionListSkeleton,
  ResearchNotice,
  type ResearchLoadState,
} from "@/components/trip/ResearchNotice";
import { Badge } from "@/components/ui/Badge";

type LodgingStepProps = {
  options: readonly LodgingOption[];
  selectedIds: readonly string[];
  onSelectionChange: (id: string, selected: boolean) => void;
  research: ResearchLoadState;
  onRetry: () => void;
};

function LodgingDetails({ option }: { option: LodgingOption }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="neutral">
          {formatCents(option.nightlyCents)} per night · {option.nights} nights
        </Badge>
        {option.rating !== undefined && (
          <Badge variant="neutral">{option.rating.toFixed(1)} rating</Badge>
        )}
      </div>
      {option.amenities.length > 0 && (
        <p className="text-xs leading-5">
          <span className="font-semibold text-foreground">Includes:</span>{" "}
          {option.amenities.join(" · ")}
        </p>
      )}
      {option.walkabilityNote && (
        <p className="rounded-control bg-muted px-3 py-2 text-xs leading-5">
          <span className="font-semibold text-foreground">Getting around:</span>{" "}
          {option.walkabilityNote}
        </p>
      )}
    </div>
  );
}

export function LodgingStep({
  onRetry,
  onSelectionChange,
  options,
  research,
  selectedIds,
}: LodgingStepProps) {
  return (
    <div>
      <div className="mb-5">
        <Badge variant="primary">Full-stay totals</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Choose where to stay
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Compare budget through premium stays. Selecting a new stay replaces your previous choice.
        </p>
      </div>

      <ResearchNotice state={research} onRetry={onRetry} />
      {research.status === "loading" && options.length === 0 ? (
        <OptionListSkeleton />
      ) : (
        <OptionList
          title="Places to recharge"
          description="The large price is the complete stay; the nightly rate is context only."
          emptyMessage="No lodging matched this trip."
          options={options}
          selectedIds={selectedIds}
          onSelectionChange={onSelectionChange}
          renderDetails={(option) => <LodgingDetails option={option} />}
        />
      )}
    </div>
  );
}
