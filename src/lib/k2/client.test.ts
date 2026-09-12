import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { researchItems } from './client';

/**
 * What the client does when the endpoint misbehaves.
 *
 * Every case here is served by a local stub — the real API is never called. These are
 * the failure modes that decide whether a demo survives a bad minute: a rate limit, a
 * gateway that returns an HTML error page, a reply with no answer in it.
 */

const itemSchema = z.object({ name: z.string(), cost: z.number() });
const GOOD_BODY = JSON.stringify({
  choices: [{ message: { content: '[{"name":"a","cost":1}]' }, finish_reason: 'stop' }],
  usage: { completion_tokens: 40, completion_tokens_details: { reasoning_tokens: 12 } },
});

type Reply = {
  status?: number;
  body?: string;
  contentType?: string;
  /** Milliseconds to stall before answering, for the timeout cases. */
  delayMs?: number;
};

let server: Server;
let baseUrl: string;
let queue: Reply[] = [];
let requests: Record<string, unknown>[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        requests.push(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        requests.push({});
      }

      const reply = queue.shift() ?? { status: 200, body: GOOD_BODY };
      const send = () => {
        res.writeHead(reply.status ?? 200, {
          'content-type': reply.contentType ?? 'application/json',
        });
        res.end(reply.body ?? GOOD_BODY);
      };
      if (reply.delayMs) setTimeout(send, reply.delayMs);
      else send();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
  queue = [];
  requests = [];
});

let unique = 0;

function run(replies: Reply[] = []) {
  vi.stubEnv('K2_MODE', 'live');
  vi.stubEnv('IFM_API_KEY', 'stub-key');
  vi.stubEnv('IFM_BASE_URL', baseUrl);
  vi.stubEnv('NODE_ENV', 'production');
  queue = replies;
  unique += 1;

  return researchItems({
    label: 'test',
    system: 'system',
    // A prompt nothing else has used, so no cache can answer for the stub.
    prompt: `prompt variant ${unique}`,
    itemSchema,
  });
}

function chatBody(content: string, finish = 'stop'): string {
  return JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] });
}

describe('rate limits and server errors', () => {
  it('retries a 429 and succeeds on the next attempt', async () => {
    const result = await run([{ status: 429, body: '{"error":"slow down"}' }]);

    expect(result.items).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(result.meta.warnings.some((w) => w.includes('retrying'))).toBe(true);
  });

  it('retries a 503 and succeeds', async () => {
    const result = await run([{ status: 503, body: 'upstream unavailable' }]);
    expect(result.items).toHaveLength(1);
    expect(requests).toHaveLength(2);
  });

  it('gives up after three attempts rather than hammering the endpoint', async () => {
    const fail = { status: 500, body: 'boom' };
    await expect(run([fail, fail, fail, fail])).rejects.toThrow(/500/);
    expect(requests).toHaveLength(3);
  });

  it('does not retry a 401, which will never start working', async () => {
    await expect(run([{ status: 401, body: '{"error":"bad key"}' }])).rejects.toThrow(/401/);
    expect(requests).toHaveLength(1);
  });

  it('does not retry a 404, which means the URL is wrong', async () => {
    await expect(run([{ status: 404, body: 'not found' }])).rejects.toThrow(/404/);
    expect(requests).toHaveLength(1);
  });
});

describe('bodies that are not what they claim', () => {
  it('fails cleanly on an HTML error page served with a 200', async () => {
    await expect(
      run([{ status: 200, body: '<html><body>Gateway</body></html>', contentType: 'text/html' }]),
    ).rejects.toThrow();
  });

  it('fails cleanly when the JSON has no choices', async () => {
    await expect(run([{ status: 200, body: '{"id":"x"}' }])).rejects.toThrow(/choices/);
  });

  it('fails cleanly when choices is empty', async () => {
    await expect(run([{ status: 200, body: '{"choices":[]}' }])).rejects.toThrow(/choices/);
  });

  it('fails cleanly when the message has no content', async () => {
    await expect(
      run([{ status: 200, body: '{"choices":[{"message":{"role":"assistant"}}]}' }]),
    ).rejects.toThrow(/content/);
  });

  it('treats a whitespace-only answer as no answer', async () => {
    await expect(run([{ status: 200, body: chatBody('   \n  ') }])).rejects.toThrow(/content/);
  });
});

describe('the model spending its whole budget thinking', () => {
  it('doubles the token ceiling and tries again when the answer came back empty', async () => {
    const starved = JSON.stringify({
      choices: [
        { message: { content: '', reasoning: 'x'.repeat(500) }, finish_reason: 'length' },
      ],
    });

    const result = await run([{ status: 200, body: starved }]);

    expect(result.items).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].max_tokens).toBe(Number(requests[0].max_tokens) * 2);
    expect(result.meta.warnings.some((w) => w.includes('token budget'))).toBe(true);
  });

  it('says so when a reply was cut off at the ceiling', async () => {
    const result = await run([
      { status: 200, body: chatBody('[{"name":"a","cost":1}]', 'length') },
    ]);
    expect(result.meta.warnings.some((w) => w.includes('cut off'))).toBe(true);
  });
});

describe('an endpoint that does not accept reasoning_effort', () => {
  it('drops the parameter and retries once', async () => {
    const result = await run([
      { status: 400, body: '{"error":{"message":"unknown parameter: reasoning_effort"}}' },
    ]);

    expect(result.items).toHaveLength(1);
    expect(requests[0].reasoning_effort).toBe('medium');
    expect(requests[1].reasoning_effort).toBeUndefined();
    expect(result.meta.warnings.some((w) => w.includes('reasoning_effort'))).toBe(true);
  });

  it('treats an unrelated 400 as fatal rather than blaming the parameter', async () => {
    await expect(
      run([{ status: 400, body: '{"error":{"message":"context length exceeded"}}' }]),
    ).rejects.toThrow(/400/);
    expect(requests).toHaveLength(1);
  });
});

describe('repairing a reply that will not parse', () => {
  it('asks once more, and keeps what comes back', async () => {
    const result = await run([{ status: 200, body: chatBody('I cannot help with that.') }]);

    expect(result.items).toHaveLength(1);
    expect(requests).toHaveLength(2);
    const messages = requests[1].messages as { role: string }[];
    expect(messages.at(-1)?.role).toBe('user');
    expect(result.meta.warnings.some((w) => w.includes('repair'))).toBe(true);
  });

  it('gives up after one repair instead of looping', async () => {
    const junk = { status: 200, body: chatBody('still not JSON') };
    await expect(run([junk, junk, junk])).rejects.toThrow();
    expect(requests).toHaveLength(2);
  });

  it('does not ask for a repair when some items were usable', async () => {
    const mixed = chatBody('[{"name":"a","cost":1},{"name":"b","cost":"nope"}]');
    const result = await run([{ status: 200, body: mixed }]);

    expect(result.items).toHaveLength(1);
    expect(requests).toHaveLength(1);
  });
});

describe('configuration that is missing or wrong', () => {
  it('refuses to call anything without a key', async () => {
    vi.stubEnv('K2_MODE', 'live');
    vi.stubEnv('IFM_BASE_URL', baseUrl);
    vi.stubEnv('IFM_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');

    await expect(
      researchItems({ label: 't', system: 's', prompt: 'no key', itemSchema }),
    ).rejects.toThrow(/IFM_API_KEY|IFM_BASE_URL/);
    expect(requests).toHaveLength(0);
  });

  it('reports a refused connection as a transport failure', async () => {
    vi.stubEnv('K2_MODE', 'live');
    vi.stubEnv('IFM_API_KEY', 'stub-key');
    vi.stubEnv('IFM_BASE_URL', 'http://127.0.0.1:1/v1');
    vi.stubEnv('NODE_ENV', 'production');

    await expect(
      researchItems({ label: 't', system: 's', prompt: 'refused', itemSchema }),
    ).rejects.toThrow(/transport/);
  });

  it('will not reach the network at all in cache mode with nothing cached', async () => {
    vi.stubEnv('K2_MODE', 'cache');
    vi.stubEnv('IFM_API_KEY', 'stub-key');
    vi.stubEnv('IFM_BASE_URL', baseUrl);
    vi.stubEnv('NODE_ENV', 'production');

    await expect(
      researchItems({ label: 't', system: 's', prompt: 'cache only', itemSchema }),
    ).rejects.toThrow(/cache/);
    expect(requests).toHaveLength(0);
  });
});
