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
  // Airport codes for flying, station names for rail and coach, place names for a
  // drive. Held to the same width as the contract's place label.
  fromIata: z.string().min(2).max(40),
  toIata: z.string().min(2).max(40),
  departLocal: z.string().min(10).max(25),
  arriveLocal: z.string().min(10).max(25),
  durationMinutes: z.number().int().min(20).max(1200),
  flightNo: optionalish(z.string().max(10)),
});

export const rawFlightRouteSchema = z.object({
  direction: z.enum(['outbound', 'return', 'roundtrip']),
  /** How the journey is made. Absent means flying. */
  mode: optionalish(z.enum(['plane', 'train', 'bus', 'car'])),
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
  'You are a travel analyst covering every way of getting between two places: flying,',
  'rail, coach and driving. You know which operators run which city pairs, which hubs',
  'they connect through, and what each mode tends to cost by season. You never state a',
  'fare as if you had looked it up. You also know when flying is the wrong answer —',
  'nobody flies Boston to New York — and you say so by offering the ground options.',
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
    '- Set "mode" on every entry: "plane", "train", "bus" or "car".',
    '- If this pair is one people sensibly travel overland — a few hundred miles or less,',
    '  or anywhere flying costs more time in airports than it saves in the air — then at',
    '  least half the entries must be ground travel, and include rail, coach and driving',
    '  if all three genuinely exist. Nobody flies Boston to New York; do not pretend they do.',
    '- For a long-haul pair where driving or rail is not realistic, return flights only.',
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
    '- Use operators that genuinely run the route, whatever the mode: the airline, the',
    '  rail company, the coach line. Do not invent a codeshare or a service.',
    '- Price each mode the way it is actually sold. A rail fare is a rail fare. A coach',
    '  ticket is a coach ticket. Driving is fuel plus tolls plus parking at the far end,',
    '  and no ticket at all — put the operator as "Own car" and price the whole journey.',
    '- For a train or coach, "legs" are the stations, not airports: write them as people',
    '  say them ("Boston South Station", "New York Penn Station"). For driving, one leg',
    '  from the origin to the destination.',
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
        mode: 'plane | train | bus | car',
        carrier: 'string — the airline, rail company, coach line, or "Own car"',
        legs: [
          {
            fromIata: 'ORD, or a station name for rail and coach',
            toIata: 'NRT, or a station name',
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
