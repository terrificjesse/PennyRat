// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixtureActivities,
  fixtureFlights,
  fixtureIntake,
  fixtureLodging,
  fixtureOptions,
} from "@/fixtures";
import { allocateBuckets } from "@/lib/budget";
import { useTripStore } from "@/lib/store/trip";
import type { Itinerary } from "@/lib/types";
import { TripBuilder } from "./TripBuilder";

const itinerary: Itinerary = {
  days: [
    {
      date: fixtureIntake.startDate,
      blocks: [],
      daySpendCents: 0,
      warnings: [],
    },
  ],
  totalCents: 100_000,
  unscheduled: [],
  warnings: [],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    ),
  );

  const roundTrip = fixtureFlights.find((option) => option.direction === "roundtrip");
  if (!roundTrip) throw new Error("The fixture needs a round-trip option.");

  useTripStore.setState({
    activeTripId: null,
    budgetPlan: allocateBuckets(fixtureIntake),
    currentStep: 5,
    excludedIds: [],
    intake: fixtureIntake,
    itinerary,
    options: [...fixtureOptions],
    pinned: [],
    savedTrips: [],
    scheduleCelebrated: true,
    selectedIds: [roundTrip.id, fixtureLodging[0].id, fixtureActivities[0].id],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("schedule celebration", () => {
  it("plays for an existing schedule, on re-entry, and after a rebuild", async () => {
    vi.useFakeTimers();
    render(createElement(TripBuilder));

    await act(async () => Promise.resolve());
    expect(screen.getByRole("status", { name: "Enjoy your trip" })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.queryByRole("status", { name: "Enjoy your trip" })).not.toBeInTheDocument();

    act(() => useTripStore.getState().setCurrentStep(4));
    await act(async () => Promise.resolve());
    act(() => useTripStore.getState().setCurrentStep(5));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status", { name: "Enjoy your trip" })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    act(() =>
      useTripStore.getState().setItinerary({
        ...itinerary,
        totalCents: itinerary.totalCents + 1,
      }),
    );
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status", { name: "Enjoy your trip" })).toBeVisible();
  });
});
