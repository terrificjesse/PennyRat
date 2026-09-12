import { beforeEach, describe, expect, it } from "vitest";
import {
  fixtureFlights,
  fixtureIntake,
  fixtureOptions,
  fixtureTransit,
} from "@/fixtures";
import { allocateBuckets, setBucket } from "@/lib/budget";
import { FIRST_TRIP_STEP, LAST_TRIP_STEP, useTripStore } from "./trip";

describe("trip store", () => {
  beforeEach(() => {
    useTripStore.getState().resetTrip();
  });

  it("allocates a fresh budget when intake is saved", () => {
    useTripStore.getState().setIntake(fixtureIntake);

    expect(useTripStore.getState().intake).toEqual(fixtureIntake);
    expect(useTripStore.getState().budgetPlan).toEqual(allocateBuckets(fixtureIntake));
    expect(useTripStore.getState().options).toEqual([]);
  });

  it("uses the shared budget helper when a bucket changes", () => {
    useTripStore.getState().setIntake(fixtureIntake);
    const original = useTripStore.getState().budgetPlan;
    expect(original).not.toBeNull();
    if (!original) return;

    useTripStore.getState().adjustBucket("localTransit", 25_000);

    expect(useTripStore.getState().budgetPlan).toEqual(
      setBucket(original, "localTransit", 25_000, fixtureIntake.budgetTotal),
    );
  });

  it("toggles known options without duplicating ids", () => {
    const optionId = fixtureOptions[0].id;

    useTripStore.getState().toggleOption(optionId, true);
    useTripStore.getState().toggleOption(optionId, true);
    expect(useTripStore.getState().selectedIds).toEqual([optionId]);

    useTripStore.getState().toggleOption(optionId, false);
    expect(useTripStore.getState().selectedIds).toEqual([]);
  });

  it("drops selections that are absent from a replacement option set", () => {
    const retainedId = fixtureFlights[0].id;
    const removedId = fixtureOptions.find((option) => option.kind === "activity")?.id;
    expect(removedId).toBeDefined();
    if (!removedId) return;

    useTripStore.getState().toggleOption(retainedId, true);
    useTripStore.getState().toggleOption(removedId, true);
    useTripStore.getState().setOptions(fixtureFlights);

    expect(useTripStore.getState().selectedIds).toEqual([retainedId]);
  });

  it("replaces one option kind without losing concurrent research results", () => {
    useTripStore.getState().setOptions(fixtureFlights);
    useTripStore.getState().setOptionsForKind("transit", fixtureTransit);

    expect(useTripStore.getState().options).toEqual([
      ...fixtureFlights,
      ...fixtureTransit,
    ]);
  });

  it("rejects options that do not match the requested kind", () => {
    expect(() =>
      useTripStore.getState().setOptionsForKind("flight", fixtureTransit),
    ).toThrow("Expected only flight options.");
  });

  it("validates a schedule and invalidates it when a choice changes", () => {
    const itinerary = {
      days: [],
      totalCents: 0,
      unscheduled: [],
      warnings: [],
    };
    useTripStore.getState().setItinerary(itinerary);

    expect(useTripStore.getState().itinerary).toEqual(itinerary);
    useTripStore.getState().toggleOption(fixtureOptions[0].id, true);
    expect(useTripStore.getState().itinerary).toBeNull();
  });

  it("keeps a built itinerary when refreshed research is unchanged", () => {
    const itinerary = {
      days: [],
      totalCents: 0,
      unscheduled: [],
      warnings: [],
    };
    useTripStore.getState().setItinerary(itinerary);
    useTripStore.getState().setOptionsForKind("flight", fixtureFlights);

    expect(useTripStore.getState().itinerary).toEqual(itinerary);
  });

  it("clamps navigation to the wizard bounds", () => {
    useTripStore.getState().setCurrentStep(-4);
    expect(useTripStore.getState().currentStep).toBe(FIRST_TRIP_STEP);

    useTripStore.getState().setCurrentStep(99);
    expect(useTripStore.getState().currentStep).toBe(LAST_TRIP_STEP);
  });

  it("rejects malformed localStorage state during hydration", () => {
    const merge = useTripStore.persist.getOptions().merge;
    const currentState = useTripStore.getState();

    expect(merge?.({ intake: { budgetTotal: "4200" } }, currentState)).toBe(currentState);
  });

  it("repairs a missing persisted plan with the shared allocator", () => {
    const merge = useTripStore.persist.getOptions().merge;
    const merged = merge?.(
      {
        intake: fixtureIntake,
        budgetPlan: null,
        selectedIds: [],
        options: fixtureOptions,
        currentStep: 2,
        itinerary: null,
      },
      useTripStore.getState(),
    );

    expect(merged?.budgetPlan).toEqual(allocateBuckets(fixtureIntake));
    expect(merged?.currentStep).toBe(2);
  });

  it("hydrates pre-itinerary persisted state", () => {
    const merge = useTripStore.persist.getOptions().merge;
    const merged = merge?.(
      {
        intake: fixtureIntake,
        budgetPlan: allocateBuckets(fixtureIntake),
        selectedIds: [],
        options: fixtureOptions,
        currentStep: 1,
      },
      useTripStore.getState(),
    );

    expect(merged?.itinerary).toBeNull();
  });

  it("drops a persisted itinerary when one of its selections is missing", () => {
    const merge = useTripStore.persist.getOptions().merge;
    const merged = merge?.(
      {
        intake: fixtureIntake,
        budgetPlan: allocateBuckets(fixtureIntake),
        selectedIds: [fixtureFlights[0].id, "missing_option"],
        options: fixtureOptions,
        currentStep: 5,
        itinerary: {
          days: [],
          totalCents: 0,
          unscheduled: [],
          warnings: [],
        },
      },
      useTripStore.getState(),
    );

    expect(merged?.selectedIds).toEqual([fixtureFlights[0].id]);
    expect(merged?.itinerary).toBeNull();
  });
});
