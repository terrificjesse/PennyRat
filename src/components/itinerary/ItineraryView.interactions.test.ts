// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureActivities, fixtureIntake } from "@/fixtures";
import type { Itinerary } from "@/lib/types";
import { ItineraryView } from "./ItineraryView";

afterEach(cleanup);

describe("editable itinerary", () => {
  it("exposes suggestions, maps, swaps, additions, removal, and drag reordering", async () => {
    const [first, replacement, addition] = fixtureActivities.slice(0, 3);
    const itinerary: Itinerary = {
      days: [
        {
          date: "2026-10-14",
          blocks: [
            {
              start: "2026-10-14T09:00",
              end: "2026-10-14T10:30",
              kind: "activity",
              refId: first.id,
              title: first.title,
              costCents: first.costCents,
              suggested: true,
              alternatives: [replacement.id],
            },
            {
              start: "2026-10-14T11:00",
              end: "2026-10-14T12:30",
              kind: "activity",
              refId: replacement.id,
              title: replacement.title,
              costCents: replacement.costCents,
            },
          ],
          daySpendCents: first.costCents + replacement.costCents,
          warnings: [],
          couldAdd: [addition.id],
          filledMinutes: 240,
        },
      ],
      totalCents: first.costCents + replacement.costCents,
      chosenCents: replacement.costCents,
      suggestedCents: first.costCents,
      overBudgetCents: 0,
      unscheduled: [],
      warnings: [],
    };
    const onAddOption = vi.fn();
    const onMoveBlock = vi.fn();
    const onRemoveSuggestion = vi.fn();
    const onSwapBlock = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ItineraryView, {
        itinerary,
        intake: fixtureIntake,
        options: [first, replacement, addition],
        onAddOption,
        onMoveBlock,
        onRemoveSuggestion,
        onSwapBlock,
      }),
    );

    expect(screen.getByText("Suggested")).toBeVisible();
    expect(screen.getAllByRole("link", { name: /View on map/ })).not.toHaveLength(0);
    expect(screen.getByRole("region", { name: "Enjoy your trip" })).toBeVisible();

    await user.click(screen.getByText(`Edit ${first.title}`));
    await user.click(screen.getByRole("button", { name: `Swap for ${replacement.title}` }));
    expect(onSwapBlock).toHaveBeenCalledWith(itinerary.days[0].blocks[0], replacement);

    await user.click(screen.getByRole("button", { name: "Remove suggestion" }));
    expect(onRemoveSuggestion).toHaveBeenCalledWith(itinerary.days[0].blocks[0]);

    await user.click(screen.getByText("Add something to Wednesday, October 14"));
    await user.click(screen.getByRole("button", { name: `Add ${addition.title}` }));
    expect(onAddOption).toHaveBeenCalledWith("2026-10-14", addition);

    const transfer = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => transfer.set(type, value),
      getData: (type: string) => transfer.get(type) ?? "",
    };
    const firstBlock = screen.getByRole("heading", { name: first.title }).closest("li");
    const secondBlock = screen.getByRole("heading", { name: replacement.title }).closest("li");
    expect(firstBlock).not.toBeNull();
    expect(secondBlock).not.toBeNull();
    if (!firstBlock || !secondBlock) return;

    fireEvent.dragStart(firstBlock, { dataTransfer });
    fireEvent.drop(secondBlock, { dataTransfer });
    expect(onMoveBlock).toHaveBeenCalledWith(first.id, "2026-10-14", 11 * 60);
  });
});
