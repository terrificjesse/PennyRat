import { allocateBuckets } from '@/lib/budget';
import { researchLodging } from '@/lib/providers/lodging';
import { lodgingResponseSchema, researchRequestSchema, type ApiError } from '@/lib/types';

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
  const result = await researchLodging(intake, allocateBuckets(intake));
  return Response.json(lodgingResponseSchema.parse(result));
}
