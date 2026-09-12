"use client";

import type { TripOption } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { SelectableCard } from "./SelectableCard";

type OptionListProps = {
  options: readonly TripOption[];
  selectedIds: readonly string[];
  onSelectionChange: (id: string, selected: boolean) => void;
  title: string;
  description?: string;
  emptyMessage?: string;
};

export function OptionList({
  description,
  emptyMessage = "No options match this part of the trip yet.",
  onSelectionChange,
  options,
  selectedIds,
  title,
}: OptionListProps) {
  const selected = new Set(selectedIds);

  return (
    <section aria-labelledby="option-list-title">
      <div className="mb-5">
        <h2
          id="option-list-title"
          className="text-2xl font-semibold tracking-[-0.03em] text-foreground"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {options.length > 0 ? (
        <ul className="grid gap-4" role="list">
          {options.map((option) => (
            <li key={option.id}>
              <SelectableCard
                option={option}
                selected={selected.has(option.id)}
                onSelectedChange={onSelectionChange}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Card variant="muted" className="text-center text-sm text-muted-foreground">
          {emptyMessage}
        </Card>
      )}
    </section>
  );
}
