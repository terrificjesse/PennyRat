import { formatCents } from "@/lib/budget";
import type { TransitOption } from "@/lib/types";
import { OptionList } from "@/components/options/OptionList";
import {
  OptionListSkeleton,
  ResearchNotice,
  type ResearchLoadState,
} from "@/components/trip/ResearchNotice";
import { Badge } from "@/components/ui/Badge";

type TransitStepProps = {
  options: readonly TransitOption[];
  selectedIds: readonly string[];
  onSelectionChange: (id: string, selected: boolean) => void;
  research: ResearchLoadState;
  onRetry: () => void;
};

function TransitDetails({ option }: { option: TransitOption }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="neutral">
          {formatCents(option.perDayCents)} per day · {option.days} days
        </Badge>
      </div>
      {option.coverageNote && (
        <p className="rounded-control bg-muted px-3 py-2 text-xs leading-5">
          <span className="font-semibold text-foreground">Coverage:</span>{" "}
          {option.coverageNote}
        </p>
      )}
    </div>
  );
}

export function TransitStep({
  onRetry,
  onSelectionChange,
  options,
  research,
  selectedIds,
}: TransitStepProps) {
  return (
    <div>
      <div className="mb-5">
        <Badge variant="primary">Protected transit budget</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Choose how you’ll get around
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose one main approach. Its full-trip cost stays separate from food and activities.
        </p>
      </div>

      <ResearchNotice state={research} onRetry={onRetry} />
      {research.status === "loading" && options.length === 0 ? (
        <OptionListSkeleton />
      ) : (
        <OptionList
          title="Local transportation"
          description="Daily pricing is shown only to explain the complete trip total."
          emptyMessage="No local transportation options matched this trip."
          options={options}
          selectedIds={selectedIds}
          onSelectionChange={onSelectionChange}
          renderDetails={(option) => <TransitDetails option={option} />}
        />
      )}
    </div>
  );
}
