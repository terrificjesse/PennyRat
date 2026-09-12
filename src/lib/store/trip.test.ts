import { beforeEach, describe, expect, it } from "vitest";
import { fixtureFlights, fixtureIntake, fixtureOptions } from "@/fixtures";
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
});
