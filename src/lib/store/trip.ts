"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";
import { fixtureOptions } from "@/fixtures";
import { allocateBuckets, setBucket } from "@/lib/budget";
import {
  budgetPlanSchema,
  tripIntakeSchema,
  tripOptionSchema,
  type BucketKey,
  type BudgetPlan,
  type Cents,
  type TripIntake,
  type TripOption,
} from "@/lib/types";

export const FIRST_TRIP_STEP = 0;
export const LAST_TRIP_STEP = 5;

type PersistedTripState = {
  intake: TripIntake | null;
  budgetPlan: BudgetPlan | null;
  selectedIds: string[];
  options: TripOption[];
  currentStep: number;
};

export type TripStore = PersistedTripState & {
  setIntake: (intake: TripIntake) => void;
  setBudgetPlan: (plan: BudgetPlan) => void;
  adjustBucket: (bucket: BucketKey, nextValue: Cents) => void;
  resetBudgetPlan: () => void;
  setOptions: (options: unknown) => void;
  toggleOption: (id: string, selected?: boolean) => void;
  setCurrentStep: (step: number) => void;
  resetTrip: () => void;
};

const persistedTripSchema = z
  .object({
    intake: tripIntakeSchema.nullable(),
    budgetPlan: budgetPlanSchema.nullable(),
    selectedIds: z.array(z.string().min(1)),
    options: tripOptionSchema.array(),
    currentStep: z.number().int().min(FIRST_TRIP_STEP).max(LAST_TRIP_STEP),
  })
  .strict();

const serverStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const storage = createJSONStorage<PersistedTripState>(() =>
  typeof window === "undefined" ? serverStorage : window.localStorage,
);

function initialTripState(): PersistedTripState {
  return {
    intake: null,
    budgetPlan: null,
    selectedIds: [],
    options: [...fixtureOptions],
    currentStep: FIRST_TRIP_STEP,
  };
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return FIRST_TRIP_STEP;
  return Math.min(LAST_TRIP_STEP, Math.max(FIRST_TRIP_STEP, Math.trunc(step)));
}

export const useTripStore = create<TripStore>()(
  persist(
    (set) => ({
      ...initialTripState(),

      setIntake: (intake) => {
        const parsed = tripIntakeSchema.parse(intake);
        set({
          intake: parsed,
          budgetPlan: allocateBuckets(parsed),
          selectedIds: [],
          currentStep: FIRST_TRIP_STEP,
        });
      },

      setBudgetPlan: (plan) => set({ budgetPlan: budgetPlanSchema.parse(plan) }),

      adjustBucket: (bucket, nextValue) =>
        set((state) => {
          if (!state.intake || !state.budgetPlan) return state;
          return {
            budgetPlan: setBucket(
              state.budgetPlan,
              bucket,
              nextValue,
              state.intake.budgetTotal,
            ),
          };
        }),

      resetBudgetPlan: () =>
        set((state) =>
          state.intake ? { budgetPlan: allocateBuckets(state.intake) } : state,
        ),

      setOptions: (options) => {
        const parsed = tripOptionSchema.array().parse(options);
        const availableIds = new Set(parsed.map((option) => option.id));
        set((state) => ({
          options: parsed,
          selectedIds: state.selectedIds.filter((id) => availableIds.has(id)),
        }));
      },

      toggleOption: (id, selected) =>
        set((state) => {
          if (!state.options.some((option) => option.id === id)) return state;
          const isSelected = state.selectedIds.includes(id);
          const shouldSelect = selected ?? !isSelected;

          if (shouldSelect === isSelected) return state;
          return {
            selectedIds: shouldSelect
              ? [...state.selectedIds, id]
              : state.selectedIds.filter((selectedId) => selectedId !== id),
          };
        }),

      setCurrentStep: (step) => set({ currentStep: clampStep(step) }),

      resetTrip: () => set(initialTripState()),
    }),
    {
      name: "pennyrat-trip-v1",
      version: 1,
      storage,
      skipHydration: true,
      partialize: (state): PersistedTripState => ({
        intake: state.intake,
        budgetPlan: state.budgetPlan,
        selectedIds: state.selectedIds,
        options: state.options,
        currentStep: state.currentStep,
      }),
      merge: (persistedState, currentState) => {
        const parsed = persistedTripSchema.safeParse(persistedState);
        if (!parsed.success) return currentState;

        const optionIds = new Set(parsed.data.options.map((option) => option.id));
        return {
          ...currentState,
          ...parsed.data,
          budgetPlan: parsed.data.intake ? parsed.data.budgetPlan : null,
          selectedIds: parsed.data.selectedIds.filter((id) => optionIds.has(id)),
          currentStep: parsed.data.intake ? parsed.data.currentStep : FIRST_TRIP_STEP,
        };
      },
    },
  ),
);
