"use client";

import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type PersistStorage,
  type StateStorage,
} from "zustand/middleware";
import { z } from "zod";
import { fixtureOptions } from "@/fixtures";
import { allocateBuckets, setBucket } from "@/lib/budget";
import {
  budgetPlanSchema,
  itinerarySchema,
  tripIntakeSchema,
  tripOptionSchema,
  type BucketKey,
  type BudgetPlan,
  type Cents,
  type Itinerary,
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
  itinerary: Itinerary | null;
};

export type TripStore = PersistedTripState & {
  setIntake: (intake: TripIntake) => void;
  adjustBucket: (bucket: BucketKey, nextValue: Cents) => void;
  resetBudgetPlan: () => void;
  setOptions: (options: unknown) => void;
  setOptionsForKind: (kind: TripOption["kind"], options: unknown) => void;
  setItinerary: (itinerary: unknown) => void;
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
    itinerary: itinerarySchema.nullable().default(null),
  })
  .strict();

const serverStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function createTripStorage(
  getStorage: () => StateStorage,
): PersistStorage<PersistedTripState> {
  const resilientStorage: StateStorage = {
    getItem: (name) => {
      try {
        return getStorage().getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        getStorage().setItem(name, value);
      } catch {
        // Persistence is an enhancement; the in-memory trip must remain usable.
      }
    },
    removeItem: (name) => {
      try {
        getStorage().removeItem(name);
      } catch {
        // A blocked storage backend should not prevent starting a fresh trip.
      }
    },
  };
  const jsonStorage = createJSONStorage<PersistedTripState>(() => resilientStorage);
  if (!jsonStorage) throw new Error("Could not initialize trip storage.");
  return jsonStorage;
}

const storage = createTripStorage(() =>
  typeof window === "undefined" ? serverStorage : window.localStorage,
);

function initialTripState(): PersistedTripState {
  return {
    intake: null,
    budgetPlan: null,
    selectedIds: [],
    options: [...fixtureOptions],
    currentStep: FIRST_TRIP_STEP,
    itinerary: null,
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
          options: [],
          currentStep: FIRST_TRIP_STEP,
          itinerary: null,
        });
      },

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
          itinerary: null,
        }));
      },

      setOptionsForKind: (kind, options) => {
        const parsed = tripOptionSchema.array().parse(options);
        if (parsed.some((option) => option.kind !== kind)) {
          throw new Error(`Expected only ${kind} options.`);
        }

        set((state) => {
          const previous = state.options.filter((option) => option.kind === kind);
          if (JSON.stringify(previous) === JSON.stringify(parsed)) return state;

          const nextOptions = [
            ...state.options.filter((option) => option.kind !== kind),
            ...parsed,
          ];
          const availableIds = new Set(nextOptions.map((option) => option.id));
          return {
            options: nextOptions,
            selectedIds: state.selectedIds.filter((id) => availableIds.has(id)),
            itinerary: null,
          };
        });
      },

      setItinerary: (itinerary) => set({ itinerary: itinerarySchema.parse(itinerary) }),

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
            itinerary: null,
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
        itinerary: state.itinerary,
      }),
      merge: (persistedState, currentState) => {
        const parsed = persistedTripSchema.safeParse(persistedState);
        if (!parsed.success) return currentState;

        const optionIds = new Set(parsed.data.options.map((option) => option.id));
        const restoredSelectedIds = parsed.data.selectedIds.filter((id) => optionIds.has(id));
        const lostSelections = restoredSelectedIds.length !== parsed.data.selectedIds.length;
        const restoredPlan = parsed.data.intake
          ? (parsed.data.budgetPlan ?? allocateBuckets(parsed.data.intake))
          : null;
        return {
          ...currentState,
          ...parsed.data,
          budgetPlan: restoredPlan,
          selectedIds: restoredSelectedIds,
          itinerary:
            parsed.data.intake && !lostSelections ? parsed.data.itinerary : null,
          currentStep: parsed.data.intake ? parsed.data.currentStep : FIRST_TRIP_STEP,
        };
      },
    },
  ),
);
