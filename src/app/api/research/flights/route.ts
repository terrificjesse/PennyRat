import type { ApiError } from '@/lib/types';

/**
 * Stub. Wave 1 replaces this with a K2 Think research call via lib/k2.
 * Returns 501 rather than fake data so the UI lane sees a clear signal.
 */
export async function POST(): Promise<Response> {
  const body: ApiError = {
    error: 'not_implemented',
    detail: 'POST /api/research/flights lands in Wave 1. Read src/fixtures/flights.json meanwhile.',
  };
  return Response.json(body, { status: 501 });
}
