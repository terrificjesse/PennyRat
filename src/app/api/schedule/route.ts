import type { ApiError } from '@/lib/types';

/**
 * Stub. Wave 2 replaces this with the deterministic scheduler in lib/schedule.
 */
export async function POST(): Promise<Response> {
  const body: ApiError = {
    error: 'not_implemented',
    detail: 'POST /api/schedule lands in Wave 2.',
  };
  return Response.json(body, { status: 501 });
}
