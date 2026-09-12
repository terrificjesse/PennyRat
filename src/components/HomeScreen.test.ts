// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureIntake } from "@/fixtures";
import { allocateBuckets } from "@/lib/budget";
import type { SavedTrip } from "@/lib/store/trip";
import { HomeScreen } from "./HomeScreen";

afterEach(cleanup);

describe("saved trip home", () => {
  it("opens, renames, and confirms deletion by accessible controls", async () => {
    const trip: SavedTrip = {
      id: "trip-tokyo",
      name: "Tokyo",
      intake: fixtureIntake,
      budgetPlan: allocateBuckets(fixtureIntake),
      selectedIds: [],
      options: [],
      currentStep: 2,
      itinerary: null,
      excludedIds: [],
      pinned: [],
      scheduleCelebrated: false,
      updatedAt: 1,
    };
    const onOpenTrip = vi.fn();
    const onRenameTrip = vi.fn();
    const onDeleteTrip = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(HomeScreen, {
        activeTripId: trip.id,
        savedTrips: [trip],
        onOpenTrip,
        onRenameTrip,
        onDeleteTrip,
        onStart: vi.fn(),
        onUseSample: vi.fn(),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Open Tokyo" }));
    expect(onOpenTrip).toHaveBeenCalledWith(trip.id);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const name = screen.getByRole("textbox", { name: "Trip name" });
    await user.clear(name);
    await user.type(name, "Tokyo in autumn");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onRenameTrip).toHaveBeenCalledWith(trip.id, "Tokyo in autumn");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete Tokyo? This cannot be undone.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(onDeleteTrip).toHaveBeenCalledWith(trip.id);
  });
});
