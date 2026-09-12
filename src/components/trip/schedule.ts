import {
  apiErrorSchema,
  scheduleResponseSchema,
  type Itinerary,
  type TripIntake,
  type TripOption,
} from "@/lib/types";

export async function buildTripSchedule(
  intake: TripIntake,
  options: readonly TripOption[],
  selectedIds: readonly string[],
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Itinerary> {
  const response = await fetcher("/api/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intake, options, selectedIds }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new Error(parsedError.data.detail ?? parsedError.data.error);
    }
    throw new Error(`Scheduling failed with status ${response.status}.`);
  }

  return scheduleResponseSchema.parse(body).itinerary;
}
