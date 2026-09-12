import { z } from 'zod';
import type { TripIntake } from '../../types';
import { JSON_DISCIPLINE, describeTripDates, optionalish, rawConfidenceSchema } from './common';

/**
 * Prompt B: flight structure, not prices.
 *
 * A language model does not have today's fares and cannot look them up, so asking
 * for one would produce a confident number with nothing behind it. What it does know
 * is which carriers fly a city pair, which hubs they connect through, roughly how
 * long the legs take, and what a seasonal economy fare tends to run. We ask for that,
 * then price it deterministically in lib/providers/flights.ts and badge the result as
 * an estimate.
 */

export const rawFlightLegSchema = z.object({
  fromIata: z.string().min(3).max(4),
  toIata: z.string().min(3).max(4),
  departLocal: z.string().min(10).max(25),
  arriveLocal: z.string().min(10).max(25),
  durationMinutes: z.number().int().min(20).max(1200),
  flightNo: optionalish(z.string().max(10)),
});

export const rawFlightRouteSchema = z.object({
  direction: z.enum(['outbound', 'return', 'roundtrip']),
  carrier: z.string().min(2).max(40),
  legs: z.array(rawFlightLegSchema).min(1).max(4),
  /** Only for a roundtrip: the way home. */
  returnLegs: optionalish(z.array(rawFlightLegSchema).min(1).max(4)),
  layoverMinutes: optionalish(z.array(z.number().int().min(0).max(1500)).max(3)),
  fareBandUsdPerPerson: z.object({
    low: z.number().min(20).max(20000),
    typical: z.number().min(20).max(20000),
    high: z.number().min(20).max(20000),
  }),
  cabin: optionalish(z.enum(['economy', 'premium', 'business'])),
  baggageIncluded: z.boolean(),
  confidence: rawConfidenceSchema,
});

export type RawFlightRoute = z.infer<typeof rawFlightRouteSchema>;

export const FLIGHT_TARGET = 10;
export const ROUNDTRIP_TARGET = 4;

export const flightSystem = [
  'You are an airline route analyst. You know which carriers operate which city pairs,',
  'which hubs they connect through, and what economy fares on those routes tend to run',
  'by season. You never state a fare as if you had looked it up.',
  JSON_DISCIPLINE,
].join(' ');

export function buildFlightPrompt(intake: TripIntake): string {
  return [
    `Give ${FLIGHT_TARGET} realistic one-way routings between ${intake.origin} and ${intake.destination}.`,
    '',
    describeTripDates(intake),
    `Party of ${intake.travelers}, economy.`,
    '',
    'Hard requirements:',
    `- Exactly ${FLIGHT_TARGET} entries: ${ROUNDTRIP_TARGET} with direction "roundtrip",`,
    `  then 3 with direction "outbound" and 3 with direction "return".`,
    '- A "roundtrip" is a single fare covering both directions. Put the outward journey',
    '  in "legs" and the way home in "returnLegs", and price the whole thing in',
    '  "fareBandUsdPerPerson". Round trips are normally cheaper than the two one-ways',
    '  added together — price them as the airline actually sells them, not as a sum.',
    `- Outward journeys depart ${intake.origin} on ${intake.startDate}.`,
    `- Ways home depart ${intake.destination} on ${intake.endDate}.`,
    '- In each direction, include at least one nonstop if the pair has one, and at least',
    '  two routings with a connection. Vary the carrier and the connecting hub.',
    '- Order each direction cheapest first.',
    '',
    'Rules for each routing:',
    '- Use carriers that genuinely operate the route. Do not invent a codeshare.',
    '- One entry in "legs" per flight. For a connection, the second leg departs from the',
    '  same airport the first leg arrives at.',
    '- "departLocal" and "arriveLocal" are local time at their own airport, formatted',
    '  yyyy-mm-ddTHH:mm with no timezone suffix. Crossing the date line eastbound can',
    '  land you at an earlier local time than you left; that is expected, write it as it is.',
    '- "durationMinutes" is time in the air for that leg only.',
    '- "layoverMinutes" lists the ground time at each connection, in order. A realistic',
    '  connection is 60 to 240 minutes; an overnight one is fine if that is how the route works.',
    '- "fareBandUsdPerPerson" is the range a one-way seat on this routing typically sells',
    '  for in this season, per person. Do not pretend to know today’s price: low and high',
    '  should be far enough apart to be honest. Set "confidence" to "low" if you are unsure',
    '  the route is still operating.',
    '- "baggageIncluded" is whether a checked bag is in the fare.',
    '',
    'Schema for each array element:',
    JSON.stringify(
      {
        direction: 'roundtrip | outbound | return',
        carrier: 'string',
        legs: [
          {
            fromIata: 'ORD',
            toIata: 'NRT',
            departLocal: 'yyyy-mm-ddTHH:mm',
            arriveLocal: 'yyyy-mm-ddTHH:mm',
            durationMinutes: 'number',
            flightNo: 'string (optional)',
          },
        ],
        returnLegs: ['same shape as legs — roundtrip only'],
        layoverMinutes: ['number (optional, one per connection)'],
        fareBandUsdPerPerson: { low: 'number', typical: 'number', high: 'number' },
        cabin: 'economy',
        baggageIncluded: 'boolean',
        confidence: 'low | medium | high',
      },
      null,
      2,
    ),
    '',
    `Return a JSON array of exactly ${FLIGHT_TARGET} such objects. Output only JSON. No prose, no markdown fence.`,
  ].join('\n');
}
