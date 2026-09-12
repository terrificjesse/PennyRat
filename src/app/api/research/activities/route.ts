import { allocateBuckets } from '@/lib/budget';
import { researchActivities } from '@/lib/providers/activities';
import { activitiesResponseSchema, researchRequestSchema, type ApiError } from '@/lib/types';

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = researchRequestSchema.safeParse(body);

  if (!parsed.success) {
    const error: ApiError = {
      error: 'invalid_request',
      detail: parsed.error.issues[0]?.message ?? 'expected { intake }',
    };
    return Response.json(error, { status: 400 });
  }

  const { intake } = parsed.data;
  const result = await researchActivities(intake, allocateBuckets(intake));
  return Response.json(activitiesResponseSchema.parse(result));
}
