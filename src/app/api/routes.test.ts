import { describe, expect, it } from 'vitest';
import { POST as researchActivities } from './research/activities/route';
import { POST as researchFlights } from './research/flights/route';
import { POST as researchLodging } from './research/lodging/route';
import { POST as researchTransit } from './research/transit/route';
import { POST as buildSchedule } from './schedule/route';
import { fixtureIntake, fixtureOptions } from '@/fixtures';
import { apiErrorSchema, itinerarySchema, researchMetaSchema } from '@/lib/types';

/**
 * The contract every route keeps, whatever it is handed.
 *
 * The rule that matters most: **a route never answers 5xx.** Research failing is not
 * an error the traveler can act on, so a failure serves the sample trip and says so
 * in `meta`. A 4xx is reserved for a body that genuinely does not parse. If this file
 * ever goes red, the demo has lost its safety net.
 */

type Handler = (request: Request) => Promise<Response>;

const RESEARCH: [string, Handler][] = [
  ['flights', researchFlights],
  ['activities', researchActivities],
  ['lodging', researchLodging],
  ['transit', researchTransit],
];

const ALL: [string, Handler][] = [...RESEARCH, ['schedule', buildSchedule]];

function post(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

const validSchedule = {
  intake: fixtureIntake,
  options: fixtureOptions,
  selectedIds: ['flt_out_ua_direct', 'flt_ret_ua_direct', 'lodg_fresa_ginza', 'act_sensoji'],
};

/** Bodies a confused client, a bad proxy or a fuzzer might send. */
const MALFORMED: [string, string][] = [
  ['empty body', ''],
  ['not json', 'this is not json'],
  ['html error page', '<html><body>502</body></html>'],
  ['json null', 'null'],
  ['json array', '[]'],
  ['json string', '"intake"'],
  ['json number', '42'],
  ['empty object', '{}'],
  ['intake null', '{"intake":null}'],
  ['intake wrong type', '{"intake":"Tokyo"}'],
  ['intake empty', '{"intake":{}}'],
];

describe('a malformed body is always a 400, never a crash', () => {
  for (const [name, handler] of ALL) {
    for (const [label, raw] of MALFORMED) {
      it(`${name}: ${label}`, async () => {
        const response = await handler(post(undefined, raw));

        expect(response.status, `${name} / ${label}`).toBe(400);
        const body: unknown = await response.json();
        const parsed = apiErrorSchema.safeParse(body);
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data.error).toBe('invalid_request');
      });
    }
  }
});

describe('an intake that breaks its own rules is a 400', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['return before departure', { startDate: '2026-10-17', endDate: '2026-10-12' }],
    ['same day there and back', { startDate: '2026-10-12', endDate: '2026-10-12' }],
    ['no travelers', { travelers: 0 }],
    ['negative travelers', { travelers: -3 }],
    ['a coachload', { travelers: 400 }],
    ['no budget', { budgetTotal: 0 }],
    ['negative budget', { budgetTotal: -50_000 }],
    ['fractional cents', { budgetTotal: 4200.5 }],
    ['no interests', { interests: [] }],
    ['an interest we do not have', { interests: ['time_travel'] }],
    ['a pace we do not have', { pace: 'frantic' }],
    ['dates in the wrong format', { startDate: '12/10/2026' }],
    ['empty origin', { origin: '' }],
  ];

  for (const [label, patch] of cases) {
    it(label, async () => {
      const response = await researchFlights(post({ intake: { ...fixtureIntake, ...patch } }));
      expect(response.status, label).toBe(400);
    });
  }
});

describe('a well-formed request always answers 200 with contract-valid data', () => {
  for (const [name, handler] of RESEARCH) {
    it(`${name} returns options and meta`, async () => {
      const response = await handler(post({ intake: fixtureIntake }));

      expect(response.status).toBe(200);
      const body = (await response.json()) as { options: unknown[]; meta: unknown };
      expect(Array.isArray(body.options)).toBe(true);
      expect(body.options.length).toBeGreaterThan(0);
      expect(researchMetaSchema.safeParse(body.meta).success).toBe(true);
    });
  }

  it('schedule returns an itinerary', async () => {
    const response = await buildSchedule(post(validSchedule));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { itinerary: unknown };
    expect(itinerarySchema.safeParse(body.itinerary).success).toBe(true);
  });
});

describe('research never reports a failure as a server error', () => {
  it('serves the sample trip for a destination nobody has researched', async () => {
    const response = await researchActivities(
      post({ intake: { ...fixtureIntake, destination: 'Nowhere, Antarctica' } }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { meta: { source: string; warnings: string[] } };
    expect(body.meta.source).toBe('fixture');
    expect(body.meta.warnings.length).toBeGreaterThan(0);
  });

  it('rescales the sample stay to a very long trip instead of giving up', async () => {
    const response = await researchLodging(
      post({ intake: { ...fixtureIntake, endDate: '2026-11-20' } }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { options: { nights: number }[] };
    expect(body.options.every((stay) => stay.nights === 39)).toBe(true);
  });
});

describe('the schedule route survives a hostile payload', () => {
  it('ignores selected ids that are not in the options it was given', async () => {
    const response = await buildSchedule(
      post({ ...validSchedule, selectedIds: ['nope', 'also_nope'] }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { itinerary: { totalCents: number } };
    expect(body.itinerary.totalCents).toBe(0);
  });

  it('accepts an empty selection', async () => {
    const response = await buildSchedule(post({ ...validSchedule, selectedIds: [] }));
    expect(response.status).toBe(200);
  });

  it('rejects options that are not options', async () => {
    const response = await buildSchedule(
      post({ ...validSchedule, options: [{ id: 'x', kind: 'teleport' }] }),
    );
    expect(response.status).toBe(400);
  });

  it('does not choke on the same id selected many times', async () => {
    const response = await buildSchedule(
      post({ ...validSchedule, selectedIds: Array.from({ length: 500 }, () => 'act_sensoji') }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      itinerary: { days: { blocks: { refId?: string }[] }[] };
    };
    const placed = body.itinerary.days
      .flatMap((day) => day.blocks)
      .filter((block) => block.refId === 'act_sensoji');
    expect(placed).toHaveLength(1);
  });

  it('handles a large catalogue without falling over', async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      fixtureOptions.map((option) => ({ ...option, id: `${option.id}_${index}` })),
    ).flat();

    const response = await buildSchedule(
      post({ intake: fixtureIntake, options: many, selectedIds: many.map((o) => o.id) }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { itinerary: { unscheduled: unknown[] } };
    // Far more than could ever fit, so most must come back with a reason.
    expect(body.itinerary.unscheduled.length).toBeGreaterThan(0);
  });
});
