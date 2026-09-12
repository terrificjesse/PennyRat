// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureFlights, fixtureIntake } from "@/fixtures";
import { allocateBuckets, applySelection } from "@/lib/budget";
import type { TravelOption } from "@/lib/types";
import { FlightStep } from "./FlightStep";

afterEach(cleanup);

describe("Getting there step", () => {
  it("shows a round trip, travel mode, long place labels, and separate-ticket comparison", () => {
    const roundTrip = fixtureFlights.find((option) => option.direction === "roundtrip");
    const outbound = fixtureFlights.find((option) => option.direction === "outbound");
    const returning = fixtureFlights.find((option) => option.direction === "return");
    if (!roundTrip || !outbound || !returning) {
      throw new Error("Travel fixtures need round-trip and one-way choices.");
    }

    const train: TravelOption = {
      ...roundTrip,
      id: "flt_train_roundtrip",
      title: "Northeast Regional round trip",
      mode: "train",
      legs: roundTrip.legs.map((leg) => ({
        ...leg,
        from: "Boston South Station",
        to: "New York Penn Station",
        carrier: "Amtrak",
      })),
      returnLegs: roundTrip.returnLegs?.map((leg) => ({
        ...leg,
        from: "New York Penn Station",
        to: "Boston South Station",
        carrier: "Amtrak",
      })),
    };
    const options = [train, outbound, returning];
    const plan = allocateBuckets(fixtureIntake);
    const budget = applySelection(plan, fixtureIntake.budgetTotal, options, []);

    render(
      createElement(FlightStep, {
        options,
        selectedIds: [],
        onSelectionChange: vi.fn(),
        research: { status: "ready" },
        onRetry: vi.fn(),
        remainingCents: budget.remainingTotal,
        budget,
        plan,
        total: fixtureIntake.budgetTotal,
        onBucketChange: vi.fn(),
      }),
    );

    const roundTrips = screen.getByRole("region", { name: "Round trips" });
    expect(
      within(roundTrips).getByRole("checkbox", { name: `Select ${train.title}` }),
    ).toBeEnabled();
    expect(within(roundTrips).getAllByText("Train").length).toBeGreaterThan(0);
    expect(
      within(roundTrips).getAllByText("Boston South Station → New York Penn Station").length,
    ).toBeGreaterThan(0);
    expect(within(roundTrips).getByText(/Save \$1,910:/)).toBeVisible();
  });
});
