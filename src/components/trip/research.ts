import {
  activitiesResponseSchema,
  apiErrorSchema,
  flightsResponseSchema,
  lodgingResponseSchema,
  transitResponseSchema,
  type OptionKind,
  type ResearchMeta,
  type TripIntake,
  type TripOption,
} from "@/lib/types";

export type ResearchResult = {
  options: TripOption[];
  meta: ResearchMeta;
};

const endpoints: Record<OptionKind, string> = {
  flight: "/api/research/flights",
  activity: "/api/research/activities",
  lodging: "/api/research/lodging",
  transit: "/api/research/transit",
};

function parseResearchResult(kind: OptionKind, body: unknown): ResearchResult {
  switch (kind) {
    case "flight":
      return flightsResponseSchema.parse(body);
    case "activity":
      return activitiesResponseSchema.parse(body);
    case "lodging":
      return lodgingResponseSchema.parse(body);
    case "transit":
      return transitResponseSchema.parse(body);
  }
}

export async function researchTripOptions(
  kind: OptionKind,
  intake: TripIntake,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ResearchResult> {
  const response = await fetcher(endpoints[kind], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intake }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new Error(parsedError.data.detail ?? parsedError.data.error);
    }
    throw new Error(`Research request failed with status ${response.status}.`);
  }

  return parseResearchResult(kind, body);
}
