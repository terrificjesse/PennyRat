import { buildItinerary } from '@/lib/schedule/pack';
import { scheduleRequestSchema, scheduleResponseSchema, type ApiError } from '@/lib/types';

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = scheduleRequestSchema.safeParse(body);

  if (!parsed.success) {
    const error: ApiError = {
      error: 'invalid_request',
      detail: parsed.error.issues[0]?.message ?? 'expected { intake, options, selectedIds }',
    };
    return Response.json(error, { status: 400 });
  }

  const { intake, options, selectedIds } = parsed.data;
  const itinerary = buildItinerary(intake, options, selectedIds);

  return Response.json(scheduleResponseSchema.parse({ itinerary }));
}
