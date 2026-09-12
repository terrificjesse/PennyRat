import {
  apiErrorSchema,
  scheduleRequestSchema,
  scheduleResponseSchema,
  type Itinerary,
  type ScheduleRequest,
  type TripIntake,
  type TripOption,
} from "@/lib/types";
import { postJson } from "./jsonRequest";

export type ScheduleEdits = Pick<ScheduleRequest, "excludedIds" | "pinned">;

export async function buildTripSchedule(
  intake: TripIntake,
  options: readonly TripOption[],
  selectedIds: readonly string[],
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
  edits: ScheduleEdits = {},
): Promise<Itinerary> {
  const request = scheduleRequestSchema.parse({
    intake,
    options,
    selectedIds,
    ...(edits.excludedIds?.length ? { excludedIds: edits.excludedIds } : {}),
    ...(edits.pinned?.length ? { pinned: edits.pinned } : {}),
  });
  const { response, body } = await postJson(
    "/api/schedule",
    request,
    {
      network: "Scheduling could not connect to PennyRat. Check your connection and try again.",
      unreadable: "Scheduling returned an unreadable response. Please try again.",
      status: (status) => `Scheduling failed with status ${status}.`,
    },
    signal,
    fetcher,
  );

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new Error(parsedError.data.detail ?? parsedError.data.error);
    }
    throw new Error(`Scheduling failed with status ${response.status}.`);
  }

  return scheduleResponseSchema.parse(body).itinerary;
}
