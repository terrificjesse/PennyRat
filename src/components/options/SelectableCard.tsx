"use client";

import { formatCents } from "@/lib/budget";
import type { ReactNode } from "react";
import { TRAVEL_MODE_LABELS, travelMode, type TripOption } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";

type SelectableCardProps = {
  option: TripOption;
  selected: boolean;
  onSelectedChange: (id: string, selected: boolean) => void;
  details?: ReactNode;
  overRemaining?: boolean;
};

function optionDescription(option: TripOption): string {
  switch (option.kind) {
    case "flight": {
      const direction =
        option.direction === "roundtrip"
          ? "Round trip"
          : option.direction === "outbound"
            ? "Getting there"
            : "Coming home";
      const stops =
        option.stops === 0
          ? "Nonstop"
          : `${option.stops} stop${option.stops === 1 ? "" : "s"}`;
      const baggage = option.baggageIncluded ? "checked bag included" : "bag not included";
      return `${direction} · ${TRAVEL_MODE_LABELS[travelMode(option)]} · ${stops} · ${option.cabin} · ${baggage}`;
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
      return `${TRAVEL_MODE_LABELS[travelMode(option)]} · ${option.legs
        .map((leg) => leg.carrier)
        .filter((carrier, index, carriers) => carriers.indexOf(carrier) === index)
        .join(" + ")}`;
    case "activity":
      return `${option.category} · ${option.neighborhood}`;
    case "lodging":
      return `${option.tier} ${option.type} · ${option.neighborhood}`;
    case "transit":
      return option.mode.replaceAll("_", " ");
  }
}

export function SelectableCard({
  details,
  onSelectedChange,
  option,
  overRemaining = false,
  selected,
}: SelectableCardProps) {
  const checkboxId = `select-${option.id}`;
  const descriptionId = `${checkboxId}-description`;
  const mapsUrl =
    option.kind === "activity" || option.kind === "lodging" ? option.mapsUrl : undefined;

  return (
    <Card
      variant={selected ? "selected" : "default"}
      className="h-full focus-within:ring-[3px] focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background hover:border-border-strong hover:shadow-card"
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
          <label htmlFor={checkboxId} className="block cursor-pointer">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {optionEyebrow(option)}
              </span>
              {option.estimated && <Badge variant="estimate">AI estimate</Badge>}
              {overRemaining && <Badge variant="warning">Over what’s left</Badge>}
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
          </label>

          {details && (
            <div className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              {details}
            </div>
          )}

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 w-fit rounded-control text-sm font-semibold text-primary underline decoration-2 underline-offset-4 hover:text-primary-hover"
            >
              View {option.title} on map
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
