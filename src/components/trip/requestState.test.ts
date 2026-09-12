import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixtureActivities,
  fixtureFlights,
  fixtureIntake,
  fixtureOptions,
} from "@/fixtures";
import { useTripStore } from "@/lib/store/trip";
import type { Itinerary, TripIntake } from "@/lib/types";
import { researchCurrentTrip, scheduleCurrentTrip } from "./requestState";

const meta = {
  source: "fixture" as const,
  latencyMs: 4,
  model: "fixture",
  warnings: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function itinerary(totalCents: number): Itinerary {
  return {
    days: [],
    totalCents,
    unscheduled: [],
    warnings: [],
  };
}

describe("trip request state", () => {
  beforeEach(() => {
    useTripStore.getState().resetTrip();
  });

  it("keeps trip B research when trip A resolves last", async () => {
    const tripA = fixtureIntake;
    const tripB: TripIntake = { ...fixtureIntake, destination: "Osaka, Japan" };
    const flightA = { ...fixtureFlights[0], id: "flt_trip_a", title: "Trip A flight" };
    const flightB = { ...fixtureFlights[0], id: "flt_trip_b", title: "Trip B flight" };
    const responseA = deferred<Response>();
    const responseB = deferred<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => responseA.promise)
      .mockImplementationOnce(() => responseB.promise);

    useTripStore.getState().setIntake(tripA);
    const requestA = researchCurrentTrip("flight", tripA, { fetcher });

    useTripStore.getState().setIntake(tripB);
    const requestB = researchCurrentTrip("flight", tripB, { fetcher });

    responseB.resolve(Response.json({ options: [flightB], meta }));
    await expect(requestB).resolves.toMatchObject({ committed: true });
    expect(useTripStore.getState().options).toEqual([flightB]);

    responseA.resolve(Response.json({ options: [flightA], meta }));
    await expect(requestA).resolves.toMatchObject({ committed: false });
    expect(useTripStore.getState().options).toEqual([flightB]);
  });

  it("keeps the fresh schedule when a changed selection makes the old request stale", async () => {
    const firstSelection = fixtureFlights[0].id;
    const secondSelection = fixtureActivities[0].id;
    const oldItinerary = itinerary(1_000);
    const freshItinerary = itinerary(2_000);
    const responseA = deferred<Response>();
    const responseB = deferred<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => responseA.promise)
      .mockImplementationOnce(() => responseB.promise);

    useTripStore.getState().setIntake(fixtureIntake);
    useTripStore.getState().setOptions(fixtureOptions);
    useTripStore.getState().toggleOption(firstSelection, true);
    const stateA = useTripStore.getState();
    const requestA = scheduleCurrentTrip(
      fixtureIntake,
      stateA.options,
      stateA.selectedIds,
      { fetcher },
    );

    useTripStore.getState().toggleOption(secondSelection, true);
    const stateB = useTripStore.getState();
    const requestB = scheduleCurrentTrip(
      fixtureIntake,
      stateB.options,
      stateB.selectedIds,
      { fetcher },
    );

    responseB.resolve(Response.json({ itinerary: freshItinerary }));
    await expect(requestB).resolves.toMatchObject({ committed: true });
    expect(useTripStore.getState().itinerary).toEqual(freshItinerary);

    responseA.resolve(Response.json({ itinerary: oldItinerary }));
    await expect(requestA).resolves.toMatchObject({ committed: false });
    expect(useTripStore.getState().itinerary).toEqual(freshItinerary);
  });

  it("does not write research state if an aborted fetch still resolves", async () => {
    const response = deferred<Response>();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => response.promise);

    useTripStore.getState().setIntake(fixtureIntake);
    useTripStore.getState().setOptions(fixtureFlights);
    const request = researchCurrentTrip("flight", fixtureIntake, {
      signal: controller.signal,
      fetcher,
    });
    controller.abort();
    response.resolve(
      Response.json({
        options: [{ ...fixtureFlights[0], id: "flt_cancelled" }],
        meta,
      }),
    );

    await expect(request).resolves.toMatchObject({ committed: false });
    expect(useTripStore.getState().options).toEqual(fixtureFlights);
  });

  it("does not write an itinerary if an aborted fetch still resolves", async () => {
    const response = deferred<Response>();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => response.promise);
    const existingItinerary = itinerary(3_000);

    useTripStore.getState().setIntake(fixtureIntake);
    useTripStore.getState().setOptions(fixtureOptions);
    const state = useTripStore.getState();
    useTripStore.getState().setItinerary(existingItinerary);
    const request = scheduleCurrentTrip(
      fixtureIntake,
      state.options,
      state.selectedIds,
      { signal: controller.signal, fetcher },
    );
    controller.abort();
    response.resolve(Response.json({ itinerary: itinerary(4_000) }));

    await expect(request).resolves.toMatchObject({ committed: false });
    expect(useTripStore.getState().itinerary).toEqual(existingItinerary);
  });
});
