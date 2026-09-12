import { useTripStore } from "@/lib/store/trip";
import type {
  Itinerary,
  OptionKind,
  TripIntake,
  TripOption,
} from "@/lib/types";
import { researchTripOptions, type ResearchResult } from "./research";
import { buildTripSchedule, type ScheduleEdits } from "./schedule";

type RequestControls = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  canCommit?: () => boolean;
};

type ScheduleRequestControls = RequestControls & ScheduleEdits;

export function intakeRequestKey(intake: TripIntake | null): string {
  return intake ? JSON.stringify(intake) : "";
}

export function scheduleRequestKey(
  intake: TripIntake | null,
  options: readonly TripOption[],
  selectedIds: readonly string[],
  excludedIds: readonly string[] = [],
  pinned: NonNullable<ScheduleEdits["pinned"]> = [],
): string {
  return JSON.stringify({ intake, options, selectedIds, excludedIds, pinned });
}

export function isIntakeRequestCurrent(requestedKey: string): boolean {
  const currentIntake = useTripStore.getState().intake;
  return currentIntake !== null && intakeRequestKey(currentIntake) === requestedKey;
}

export function isScheduleRequestCurrent(requestedKey: string): boolean {
  const current = useTripStore.getState();
  return (
    scheduleRequestKey(
      current.intake,
      current.options,
      current.selectedIds,
      current.excludedIds,
      current.pinned,
    ) === requestedKey
  );
}

export async function researchCurrentTrip(
  kind: OptionKind,
  intake: TripIntake,
  controls: RequestControls = {},
): Promise<{ result: ResearchResult; committed: boolean }> {
  const requestedKey = intakeRequestKey(intake);
  const result = await researchTripOptions(
    kind,
    intake,
    controls.signal,
    controls.fetcher,
  );

  if (
    controls.signal?.aborted ||
    controls.canCommit?.() === false ||
    !isIntakeRequestCurrent(requestedKey)
  ) {
    return { result, committed: false };
  }

  useTripStore.getState().setOptionsForKind(kind, result.options);
  return { result, committed: true };
}

export async function scheduleCurrentTrip(
  intake: TripIntake,
  options: readonly TripOption[],
  selectedIds: readonly string[],
  controls: ScheduleRequestControls = {},
): Promise<{ itinerary: Itinerary; committed: boolean }> {
  const excludedIds = controls.excludedIds ?? [];
  const pinned = controls.pinned ?? [];
  const requestedKey = scheduleRequestKey(
    intake,
    options,
    selectedIds,
    excludedIds,
    pinned,
  );
  const itinerary = await buildTripSchedule(
    intake,
    options,
    selectedIds,
    controls.signal,
    controls.fetcher,
    { excludedIds, pinned },
  );

  if (
    controls.signal?.aborted ||
    controls.canCommit?.() === false ||
    !isScheduleRequestCurrent(requestedKey)
  ) {
    return { itinerary, committed: false };
  }

  useTripStore.getState().setItinerary(itinerary);
  return { itinerary, committed: true };
}
