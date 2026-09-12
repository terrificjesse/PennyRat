import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { allocateBuckets } from '../budget';
import { researchActivities } from '../providers/activities';
import { researchFlights } from '../providers/flights';
import type { TripIntake } from '../types';

/**
 * Exercises the whole live path — HTTP request, auth header, reasoning stripping,
 * JSON extraction, per-item validation, pricing — against a local stand-in that
 * answers the way a reasoning model with no JSON mode does: a think block, a line of
 * prose, the array, and a sign-off.
 *
 * This is not the real API and never calls it. It exists because without a key the
 * live path would otherwise ship unexecuted.
 */

let variant = 0;

/**
 * Each test gets a destination nothing else used, so no call can be quietly served
 * from the cache instead of the stub. Without this, a passing assertion proves only
 * that the cache works.
 */
function freshIntake(): TripIntake {
  variant += 1;
  return { ...intake, destination: `${intake.destination} (case ${variant})` };
}

const intake: TripIntake = {
  origin: 'ORD',
  destination: 'Lisbon, Portugal',
  startDate: '2026-11-05',
  endDate: '2026-11-10',
  travelers: 2,
  budgetTotal: 380_000,
  interests: ['food', 'history'],
  pace: 'balanced',
};

const budget = allocateBuckets(intake);

const ACTIVITY_REPLY = `<think>
The user wants Lisbon. Let me recall specific venues and their hours. I should be
careful about Mondays, when several museums close. Format is a JSON array.
</think>
Here are the venues, ordered roughly by neighbourhood:

\`\`\`json
[
  {
    "name": "Museu Nacional do Azulejo",
    "category": "museum",
    "neighborhood": "Beato",
    "description": "Five centuries of tilework in a former convent, ending in a panoramic view of pre-earthquake Lisbon.",
    "costUsdPerPerson": 6,
    "durationMinutes": 90,
    "openingHours": {
      "Monday": null,
      "Tuesday": [{"open": "10:00", "close": "18:00"}],
      "Wednesday": [{"open": "10:00", "close": "18:00"}],
      "Thursday": [{"open": "10:00", "close": "18:00"}],
      "Friday": [{"open": "10:00", "close": "18:00"}],
      "Saturday": [{"open": "10:00", "close": "18:00"}],
      "Sunday": [{"open": "10:00", "close": "18:00"}]
    },
    "bookingRequired": false,
    "interests": ["history", "art"],
    "bestTimeOfDay": "morning",
    "rating": 4.6,
    "confidence": "high"
  },
  {
    "name": "Time Out Market",
    "category": "restaurant",
    "neighborhood": "Cais do Sodre",
    "description": "Two dozen counters under one roof. Go at 11:30 to get a seat before the queues form.",
    "costUsdPerPerson": 22,
    "durationMinutes": 75,
    "openingHours": {
      "mon": [{"open": "10:00", "close": "12:00am"}],
      "tue": [{"open": "10:00", "close": "24:00"}],
      "wed": [{"open": "10am", "close": "11:30pm"}],
      "thu": [{"open": "10:00", "close": "23:00"}],
      "fri": [{"open": "10:00", "close": "23:00"}],
      "sat": [{"open": "10:00", "close": "23:00"}],
      "sun": [{"open": "10:00", "close": "23:00"}]
    },
    "bookingRequired": false,
    "interests": ["food"],
    "bestTimeOfDay": "any",
    "confidence": "medium"
  },
  {
    "name": "This entry is broken on purpose",
    "category": "not-a-real-category",
    "neighborhood": "Nowhere",
    "description": "Should be dropped without taking the others with it.",
    "costUsdPerPerson": 5,
    "durationMinutes": 60,
    "openingHours": {"mon": null},
    "bookingRequired": false,
    "interests": ["food"],
    "bestTimeOfDay": "any",
    "confidence": "low"
  }
]
\`\`\`

Let me know if you want more options in Alfama.`;

const FLIGHT_REPLY = `<thinking>ORD to LIS. TAP flies it via Lisbon directly seasonally; otherwise connect.</thinking>
[
  {
    "direction": "outbound",
    "carrier": "TAP Air Portugal",
    "legs": [
      {"fromIata": "ord", "toIata": "lis", "departLocal": "2025-11-05T17:40",
       "arriveLocal": "2025-11-06T07:15", "durationMinutes": 515, "flightNo": "TP204"}
    ],
    "fareBandUsdPerPerson": {"low": 420, "typical": 560, "high": 810},
    "baggageIncluded": true,
    "confidence": "high"
  },
  {
    "direction": "return",
    "carrier": "United Airlines",
    "legs": [
      {"fromIata": "LIS", "toIata": "EWR", "departLocal": "2026-11-10T10:05",
       "arriveLocal": "2026-11-10T13:20", "durationMinutes": 495},
      {"fromIata": "EWR", "toIata": "ORD", "departLocal": "2026-11-10T16:00",
       "arriveLocal": "2026-11-10T17:35", "durationMinutes": 155}
    ],
    "layoverMinutes": [160],
    "fareBandUsdPerPerson": {"low": 390, "typical": 520, "high": 760},
    "baggageIncluded": false,
    "confidence": "medium"
  }
]`;

let server: Server;
let baseUrl: string;
const seenAuth: string[] = [];
const seenBodies: Record<string, unknown>[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      seenAuth.push(req.headers.authorization ?? '');
      const parsed = JSON.parse(body) as Record<string, unknown>;
      seenBodies.push(parsed);

      const prompt = JSON.stringify(parsed.messages);
      const content = prompt.includes('routings') ? FLIGHT_REPLY : ACTIVITY_REPLY;

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content } }],
          usage: { prompt_tokens: 812, completion_tokens: 1940 },
        }),
      );
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
});

function useStub(): void {
  vi.stubEnv('K2_MODE', 'live');
  vi.stubEnv('IFM_API_KEY', 'stub-key');
  vi.stubEnv('IFM_BASE_URL', baseUrl);
  vi.stubEnv('IFM_MODEL', 'IFM/K2-Think-V2');
  // Keeps the cache in memory so a previous run's .k2cache cannot answer for the stub.
  vi.stubEnv('NODE_ENV', 'production');
}

/** Fails if the call under test did not actually reach the stub server. */
function expectRequestMade(before: number): void {
  expect(seenBodies.length, 'expected a request to the stub, got a cache hit').toBe(before + 1);
}

describe('the live research path, end to end', () => {
  it('reads venues out of a reasoning-model reply and marks them live', async () => {
    useStub();
    const before = seenBodies.length;
    const { options, meta } = await researchActivities(freshIntake(), budget);
    expectRequestMade(before);

    expect(meta.source).toBe('live');
    expect(options.map((option) => option.title)).toEqual([
      'Museu Nacional do Azulejo',
      'Time Out Market',
    ]);
  });

  it('drops the one malformed entry and keeps the rest, with a warning', async () => {
    useStub();
    const before = seenBodies.length;
    const { options, meta } = await researchActivities(freshIntake(), budget);
    expectRequestMade(before);

    expect(options).toHaveLength(2);
    expect(meta.warnings.some((warning) => warning.includes('dropped item 3'))).toBe(true);
  });

  it('normalizes long weekday names and every time format the model used', async () => {
    useStub();
    const before = seenBodies.length;
    const { options } = await researchActivities(freshIntake(), budget);
    expectRequestMade(before);

    const museum = options[0];
    expect(museum.openingHours.mon).toBeNull();
    expect(museum.openingHours.tue).toEqual([{ open: '10:00', close: '18:00' }]);

    const market = options[1];
    expect(market.openingHours.wed).toEqual([{ open: '10:00', close: '23:30' }]);
    // "12:00am" and "24:00" both mean the end of the day, not the start of it.
    expect(market.openingHours.mon).toEqual([{ open: '10:00', close: '23:59' }]);
    expect(market.openingHours.tue).toEqual([{ open: '10:00', close: '23:59' }]);
  });

  it('bills the market to food and the museum to activities', async () => {
    useStub();
    const before = seenBodies.length;
    const { options } = await researchActivities(freshIntake(), budget);
    expectRequestMade(before);
    expect(options[0].bucket).toBe('activities');
    expect(options[1].bucket).toBe('food');
    expect(options[1].costCents).toBe(2200 * intake.travelers);
  });

  it('sends the key as a bearer token and the settings measured against the endpoint', async () => {
    useStub();
    const before = seenBodies.length;
    await researchActivities(freshIntake(), budget);
    expectRequestMade(before);

    expect(seenAuth.at(-1)).toBe('Bearer stub-key');
    const body = seenBodies.at(-1)!;
    expect(body.model).toBe('IFM/K2-Think-V2');
    expect(body.temperature).toBe(1);
    expect(body.top_p).toBe(1);
    expect(body.reasoning_effort).toBe('medium');
    expect(body.max_tokens).toBe(16_384);
    expect(body.response_format).toBeUndefined();
  });

  it('prices flights from the fare band and lands them on the trip dates', async () => {
    useStub();
    const before = seenBodies.length;
    const { options, meta } = await researchFlights(freshIntake());
    expectRequestMade(before);

    expect(meta.source).toBe('live');
    expect(options).toHaveLength(2);

    const outbound = options.find((option) => option.direction === 'outbound')!;
    expect(outbound.legs[0].from).toBe('ORD');
    expect(outbound.legs[0].to).toBe('LIS');
    expect(outbound.costCents).toBeGreaterThan(0);
    expect(outbound.estimated).toBe(true);

    // The stub dated the outbound 2025; it has to be moved onto the 2026 trip while
    // keeping the overnight arrival.
    expect(outbound.legs[0].departLocal).toBe('2026-11-05T17:40');
    expect(outbound.legs[0].arriveLocal).toBe('2026-11-06T07:15');
    expect(meta.warnings.some((warning) => warning.includes('moved'))).toBe(true);
  });

  it('keeps the connection and its ground time on a two-leg return', async () => {
    useStub();
    const before = seenBodies.length;
    const { options } = await researchFlights(freshIntake());
    expectRequestMade(before);

    const back = options.find((option) => option.direction === 'return')!;
    expect(back.stops).toBe(1);
    expect(back.title).toBe('United Airlines via EWR');
    expect(back.totalDurationMinutes).toBe(495 + 155 + 160);
    expect(back.baggageIncluded).toBe(false);
  });
});
