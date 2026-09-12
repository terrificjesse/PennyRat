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
  scheduleRequestSchema,
  tripIntakeSchema,
  tripOptionSchema,
  type BucketKey,
  type BudgetPlan,
  type Cents,
  type Itinerary,
  type ScheduleRequest,
  type TripIntake,
  type TripOption,
} from "@/lib/types";

export const FIRST_TRIP_STEP = 0;
export const LAST_TRIP_STEP = 5;

type TripDocument = {
  intake: TripIntake | null;
  budgetPlan: BudgetPlan | null;
  selectedIds: string[];
  options: TripOption[];
  currentStep: number;
  itinerary: Itinerary | null;
  excludedIds: string[];
  pinned: SchedulePin[];
};

export type SchedulePin = NonNullable<ScheduleRequest["pinned"]>[number];

export type SavedTrip = Omit<TripDocument, "intake"> & {
  id: string;
  name: string;
  intake: TripIntake;
  updatedAt: number;
};

type PersistedTripState = TripDocument & {
  activeTripId: string | null;
  savedTrips: SavedTrip[];
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
  applyScheduleUpdate: (update: {
    selectedIds: readonly string[];
    excludedIds: readonly string[];
    pinned: readonly SchedulePin[];
    itinerary: unknown;
  }) => void;
  openSavedTrip: (id: string) => void;
  renameSavedTrip: (id: string, name: string) => void;
  deleteSavedTrip: (id: string) => void;
  resetTrip: () => void;
};

const schedulePinsSchema = scheduleRequestSchema.shape.pinned.unwrap();

const tripDocumentSchema = z
  .object({
    intake: tripIntakeSchema.nullable(),
    budgetPlan: budgetPlanSchema.nullable(),
    selectedIds: z.array(z.string().min(1)),
    options: tripOptionSchema.array(),
    currentStep: z.number().int().min(FIRST_TRIP_STEP).max(LAST_TRIP_STEP),
    itinerary: itinerarySchema.nullable().default(null),
    excludedIds: z.array(z.string().min(1)).default([]),
    pinned: schedulePinsSchema.default([]),
  })
  .strict();

const savedTripSchema = tripDocumentSchema.extend({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  intake: tripIntakeSchema,
  updatedAt: z.number().int().nonnegative(),
});

const persistedTripSchema = tripDocumentSchema.extend({
  activeTripId: z.string().min(1).nullable().default(null),
  savedTrips: savedTripSchema.array().default([]),
});

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

function initialTripDocument(): TripDocument {
  return {
    intake: null,
    budgetPlan: null,
    selectedIds: [],
    options: [...fixtureOptions],
    currentStep: FIRST_TRIP_STEP,
    itinerary: null,
    excludedIds: [],
    pinned: [],
  };
}

function initialTripState(): PersistedTripState {
  return {
    ...initialTripDocument(),
    activeTripId: null,
    savedTrips: [],
  };
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return FIRST_TRIP_STEP;
  return Math.min(LAST_TRIP_STEP, Math.max(FIRST_TRIP_STEP, Math.trunc(step)));
}

function createTripId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `trip-${crypto.randomUUID()}`;
  }
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultTripName(intake: TripIntake): string {
  return intake.destination.split(",")[0]?.trim() || intake.destination;
}

function tripDocumentFrom(state: TripStore, changes: Partial<TripDocument>): TripDocument {
  return {
    intake: changes.intake === undefined ? state.intake : changes.intake,
    budgetPlan: changes.budgetPlan === undefined ? state.budgetPlan : changes.budgetPlan,
    selectedIds: changes.selectedIds ?? state.selectedIds,
    options: changes.options ?? state.options,
    currentStep: changes.currentStep ?? state.currentStep,
    itinerary: changes.itinerary === undefined ? state.itinerary : changes.itinerary,
    excludedIds: changes.excludedIds ?? state.excludedIds,
    pinned: changes.pinned ?? state.pinned,
  };
}

function saveActiveTrip(
  state: TripStore,
  changes: Partial<TripDocument>,
): Partial<PersistedTripState> {
  const document = tripDocumentFrom(state, changes);
  if (!document.intake) return changes;

  const activeTripId = state.activeTripId ?? createTripId();
  const existing = state.savedTrips.find((trip) => trip.id === activeTripId);
  const saved: SavedTrip = {
    ...document,
    intake: document.intake,
    id: activeTripId,
    name: existing?.name ?? defaultTripName(document.intake),
    updatedAt: Date.now(),
  };
  const savedTrips = [
    saved,
    ...state.savedTrips.filter((trip) => trip.id !== activeTripId),
  ];

  return { ...changes, activeTripId, savedTrips };
}

export const useTripStore = create<TripStore>()(
  persist(
    (set) => ({
      ...initialTripState(),

      setIntake: (intake) => {
        const parsed = tripIntakeSchema.parse(intake);
        set((state) =>
          saveActiveTrip(state, {
            intake: parsed,
            budgetPlan: allocateBuckets(parsed),
            selectedIds: [],
            options: [],
            currentStep: FIRST_TRIP_STEP,
            itinerary: null,
            excludedIds: [],
            pinned: [],
          }),
        );
      },

      adjustBucket: (bucket, nextValue) =>
        set((state) => {
          if (!state.intake || !state.budgetPlan) return state;
          return saveActiveTrip(state, {
            budgetPlan: setBucket(
              state.budgetPlan,
              bucket,
              nextValue,
              state.intake.budgetTotal,
            ),
          });
        }),

      resetBudgetPlan: () =>
        set((state) =>
          state.intake
            ? saveActiveTrip(state, { budgetPlan: allocateBuckets(state.intake) })
            : state,
        ),

      setOptions: (options) => {
        const parsed = tripOptionSchema.array().parse(options);
        const availableIds = new Set(parsed.map((option) => option.id));
        set((state) =>
          saveActiveTrip(state, {
            options: parsed,
            selectedIds: state.selectedIds.filter((id) => availableIds.has(id)),
            excludedIds: state.excludedIds.filter((id) => availableIds.has(id)),
            pinned: state.pinned.filter((pin) => availableIds.has(pin.id)),
            itinerary: null,
          }),
        );
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
          return saveActiveTrip(state, {
            options: nextOptions,
            selectedIds: state.selectedIds.filter((id) => availableIds.has(id)),
            excludedIds: state.excludedIds.filter((id) => availableIds.has(id)),
            pinned: state.pinned.filter((pin) => availableIds.has(pin.id)),
            itinerary: null,
          });
        });
      },

      setItinerary: (itinerary) => {
        const parsed = itinerarySchema.parse(itinerary);
        set((state) => saveActiveTrip(state, { itinerary: parsed }));
      },

      toggleOption: (id, selected) =>
        set((state) => {
          if (!state.options.some((option) => option.id === id)) return state;
          const isSelected = state.selectedIds.includes(id);
          const shouldSelect = selected ?? !isSelected;

          if (shouldSelect === isSelected) return state;
          return saveActiveTrip(state, {
            selectedIds: shouldSelect
              ? [...state.selectedIds, id]
              : state.selectedIds.filter((selectedId) => selectedId !== id),
            itinerary: null,
          });
        }),

      setCurrentStep: (step) =>
        set((state) => saveActiveTrip(state, { currentStep: clampStep(step) })),

      applyScheduleUpdate: (update) => {
        const itinerary = itinerarySchema.parse(update.itinerary);
        const availableIds = new Set(useTripStore.getState().options.map((option) => option.id));
        const selectedIds = [...new Set(update.selectedIds)].filter((id) => availableIds.has(id));
        const excludedIds = [...new Set(update.excludedIds)].filter(
          (id) => availableIds.has(id) && !selectedIds.includes(id),
        );
        const pinned = schedulePinsSchema.parse(update.pinned).filter((pin) =>
          availableIds.has(pin.id),
        );
        set((state) =>
          saveActiveTrip(state, { selectedIds, excludedIds, pinned, itinerary }),
        );
      },

      openSavedTrip: (id) =>
        set((state) => {
          const saved = state.savedTrips.find((trip) => trip.id === id);
          if (!saved) return state;
          return {
            intake: saved.intake,
            budgetPlan: saved.budgetPlan,
            selectedIds: [...saved.selectedIds],
            options: [...saved.options],
            currentStep: saved.currentStep,
            itinerary: saved.itinerary,
            excludedIds: [...saved.excludedIds],
            pinned: [...saved.pinned],
            activeTripId: saved.id,
          };
        }),

      renameSavedTrip: (id, name) => {
        const parsedName = z.string().trim().min(1).max(80).parse(name);
        set((state) => ({
          savedTrips: state.savedTrips.map((trip) =>
            trip.id === id ? { ...trip, name: parsedName, updatedAt: Date.now() } : trip,
          ),
        }));
      },

      deleteSavedTrip: (id) =>
        set((state) => ({
          ...(state.activeTripId === id
            ? { ...initialTripDocument(), activeTripId: null }
            : {}),
          savedTrips: state.savedTrips.filter((trip) => trip.id !== id),
        })),

      resetTrip: () =>
        set((state) => ({
          ...initialTripDocument(),
          activeTripId: null,
          savedTrips: state.savedTrips,
        })),
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
        excludedIds: state.excludedIds,
        pinned: state.pinned,
        activeTripId: state.activeTripId,
        savedTrips: state.savedTrips,
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
        let activeTripId = parsed.data.activeTripId;
        let savedTrips = parsed.data.savedTrips;
        if (parsed.data.intake && !savedTrips.some((trip) => trip.id === activeTripId)) {
          activeTripId = activeTripId ?? createTripId();
          savedTrips = [
            {
              intake: parsed.data.intake,
              budgetPlan: restoredPlan,
              selectedIds: restoredSelectedIds,
              options: parsed.data.options,
              currentStep: parsed.data.currentStep,
              itinerary: lostSelections ? null : parsed.data.itinerary,
              excludedIds: parsed.data.excludedIds,
              pinned: parsed.data.pinned,
              id: activeTripId,
              name: defaultTripName(parsed.data.intake),
              updatedAt: Date.now(),
            },
            ...savedTrips,
          ];
        }

        return {
          ...currentState,
          ...parsed.data,
          budgetPlan: restoredPlan,
          selectedIds: restoredSelectedIds,
          itinerary:
            parsed.data.intake && !lostSelections ? parsed.data.itinerary : null,
          currentStep: parsed.data.intake ? parsed.data.currentStep : FIRST_TRIP_STEP,
          activeTripId: parsed.data.intake ? activeTripId : null,
          savedTrips,
        };
      },
    },
  ),
);
