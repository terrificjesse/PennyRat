"use client";

import { formatCents } from "@/lib/budget";
import type { TripOption } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";

type SelectableCardProps = {
  option: TripOption;
  selected: boolean;
  onSelectedChange: (id: string, selected: boolean) => void;
};

function optionDescription(option: TripOption): string {
  switch (option.kind) {
    case "flight": {
      const direction = option.direction === "outbound" ? "Outbound" : "Return";
      const stops =
        option.stops === 0
          ? "Nonstop"
          : `${option.stops} stop${option.stops === 1 ? "" : "s"}`;
      const baggage = option.baggageIncluded ? "checked bag included" : "bag not included";
      return `${direction} · ${stops} · ${option.cabin} · ${baggage}`;
    }
    case "activity":
    case "lodging":
    case "transit":
      return option.description;
  }
}

function optionEyebrow(option: TripOption): string {
  switch (option.kind) {
    case "flight":
      return option.legs
        .map((leg) => leg.carrier)
        .filter((carrier, index, carriers) => carriers.indexOf(carrier) === index)
        .join(" + ");
    case "activity":
      return `${option.category} · ${option.neighborhood}`;
    case "lodging":
      return `${option.tier} ${option.type} · ${option.neighborhood}`;
    case "transit":
      return option.mode.replaceAll("_", " ");
  }
}

export function SelectableCard({
  onSelectedChange,
  option,
  selected,
}: SelectableCardProps) {
  const checkboxId = `select-${option.id}`;
  const descriptionId = `${checkboxId}-description`;

  return (
    <label htmlFor={checkboxId} className="block h-full cursor-pointer">
      <Card
        variant={selected ? "selected" : "default"}
        className="h-full focus-within:ring-[3px] focus-within:ring-focus/25 hover:border-border-strong hover:shadow-card"
      >
        <div className="flex h-full items-start gap-4">
          <Checkbox
            id={checkboxId}
            checked={selected}
            onChange={(event) => onSelectedChange(option.id, event.currentTarget.checked)}
            aria-label={`Select ${option.title}`}
            aria-describedby={descriptionId}
            containerClassName="mt-0.5"
          />

          <div className="flex min-w-0 flex-1 flex-col self-stretch">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {optionEyebrow(option)}
              </span>
              {option.estimated && <Badge variant="estimate">AI estimate</Badge>}
            </div>

            <div className="mt-2 flex items-start justify-between gap-4">
              <h3 className="text-base font-semibold leading-6 tracking-[-0.015em] text-foreground">
                {option.title}
              </h3>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatCents(option.costCents)}
                </p>
                <p className="text-xs text-muted-foreground">trip total</p>
              </div>
            </div>

            <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted-foreground">
              {optionDescription(option)}
            </p>
          </div>
        </div>
      </Card>
    </label>
  );
}
