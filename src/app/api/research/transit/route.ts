import { researchTransit } from '@/lib/providers/transit';
import { researchRequestSchema, transitResponseSchema, type ApiError } from '@/lib/types';

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

  const result = await researchTransit(parsed.data.intake);
  return Response.json(transitResponseSchema.parse(result));
}
