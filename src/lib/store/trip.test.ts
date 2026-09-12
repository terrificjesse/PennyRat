import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import {
  fixtureFlights,
  fixtureIntake,
  fixtureOptions,
  fixtureTransit,
} from "@/fixtures";
import { allocateBuckets, setBucket } from "@/lib/budget";
import {
  createTripStorage,
  FIRST_TRIP_STEP,
  LAST_TRIP_STEP,
  useTripStore,
} from "./trip";

const defaultStorage = useTripStore.persist.getOptions().storage;

describe("trip store", () => {
  beforeEach(() => {
    useTripStore.setState({ activeTripId: null, savedTrips: [] });
    useTripStore.getState().resetTrip();
  });

  afterEach(() => {
    useTripStore.persist.setOptions({ storage: defaultStorage });
  });

  it("allocates a fresh budget when intake is saved", () => {
    useTripStore.getState().setIntake(fixtureIntake);

    expect(useTripStore.getState().intake).toEqual(fixtureIntake);
    expect(useTripStore.getState().budgetPlan).toEqual(allocateBuckets(fixtureIntake));
    expect(useTripStore.getState().options).toEqual([]);
    expect(useTripStore.getState().savedTrips).toHaveLength(1);
  });

  it("saves, renames, reopens, and deletes a trip", () => {
    useTripStore.getState().setIntake(fixtureIntake);
    useTripStore.getState().setOptions(fixtureOptions);
    useTripStore.getState().setCurrentStep(3);

    const saved = useTripStore.getState().savedTrips[0];
    expect(saved).toMatchObject({
      name: "Tokyo",
      currentStep: 3,
      intake: fixtureIntake,
    });

    useTripStore.getState().renameSavedTrip(saved.id, "Autumn in Tokyo");
    useTripStore.getState().resetTrip();
    expect(useTripStore.getState().savedTrips[0].name).toBe("Autumn in Tokyo");

    useTripStore.getState().openSavedTrip(saved.id);
    expect(useTripStore.getState()).toMatchObject({
      activeTripId: saved.id,
      currentStep: 3,
      intake: fixtureIntake,
    });

    useTripStore.getState().deleteSavedTrip(saved.id);
    expect(useTripStore.getState().savedTrips).toEqual([]);
    expect(useTripStore.getState().intake).toBeNull();
  });

  it("persists itinerary edits with the active saved trip", () => {
    const option = fixtureOptions[0];
    const itinerary = {
      days: [],
      totalCents: option.costCents,
      unscheduled: [],
      warnings: [],
    };
    const pinned = [
      { id: option.id, date: fixtureIntake.startDate, startMinutes: 9 * 60 },
    ];

    useTripStore.getState().setIntake(fixtureIntake);
    useTripStore.getState().setOptions(fixtureOptions);
    useTripStore.getState().applyScheduleUpdate({
      selectedIds: [option.id],
      excludedIds: [fixtureOptions[1].id],
      pinned,
      itinerary,
    });

    expect(useTripStore.getState()).toMatchObject({
      selectedIds: [option.id],
      excludedIds: [fixtureOptions[1].id],
      pinned,
      itinerary,
    });
    expect(useTripStore.getState().savedTrips[0]).toMatchObject({
      selectedIds: [option.id],
      excludedIds: [fixtureOptions[1].id],
      pinned,
      itinerary,
    });
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

  it("keeps working in memory when localStorage exceeds its quota", () => {
    const quotaStorage: StateStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    useTripStore.persist.setOptions({
      storage: createTripStorage(() => quotaStorage),
    });

    expect(() => useTripStore.getState().setIntake(fixtureIntake)).not.toThrow();
    expect(useTripStore.getState().intake).toEqual(fixtureIntake);
    expect(useTripStore.getState().budgetPlan).toEqual(allocateBuckets(fixtureIntake));
  });

  it("hydrates a fresh trip when the localStorage getter throws", async () => {
    useTripStore.getState().resetTrip();
    useTripStore.persist.setOptions({
      storage: createTripStorage(() => {
        throw new DOMException("Storage access denied.", "SecurityError");
      }),
    });

    await expect(Promise.resolve(useTripStore.persist.rehydrate())).resolves.toBeUndefined();
    expect(useTripStore.getState()).toMatchObject({
      intake: null,
      budgetPlan: null,
      selectedIds: [],
      currentStep: FIRST_TRIP_STEP,
      itinerary: null,
    });
  });
});
