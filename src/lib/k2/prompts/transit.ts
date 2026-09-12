import { z } from 'zod';
import type { TripIntake } from '../../types';
import { JSON_DISCIPLINE, describeParty, optionalish, rawConfidenceSchema } from './common';

/**
 * Prompt D: getting around once you are there.
 *
 * This is the intertransport budget — the line that quietly eats a trip when nobody
 * plans for it. A day pass in Tokyo and a rental car in Iceland are the same field
 * with a twentyfold difference in cost, so it has to be researched per destination
 * rather than assumed.
 */

export const rawTransitSchema = z.object({
  mode: z.enum(['rental_car', 'transit_pass', 'rideshare', 'walk_bike']),
  name: z.string().min(2).max(120),
  perDayUsdForParty: z.number().min(0).max(2000),
  description: z.string().min(10).max(400),
  coverageNote: optionalish(z.string().max(240)),
  confidence: rawConfidenceSchema,
});

export type RawTransit = z.infer<typeof rawTransitSchema>;

export const TRANSIT_TARGET = 4;

export const transitSystem = [
  'You are a local transport analyst. You know what a day of getting around a given city',
  'actually costs, including the parts people forget: parking, tolls, airport transfers,',
  'and whether the cheap option is genuinely usable.',
  JSON_DISCIPLINE,
].join(' ');

export function buildTransitPrompt(intake: TripIntake, days: number): string {
  return [
    `How should a visitor get around ${intake.destination}, and what does each way cost per day?`,
    '',
    describeParty(intake),
    `They are on the ground for ${days} days.`,
    '',
    'Hard requirements:',
    `- Exactly ${TRANSIT_TARGET} options, ordered cheapest first.`,
    '- One must be the cheapest workable option, whether that is walking plus occasional',
    '  fares, a bike hire scheme, or a transit pass.',
    '- One must be a car, if driving is realistic there. If it genuinely is not — an island',
    '  with no roads, a city where visitors cannot park — use the remaining slot for another',
    '  realistic mode and say why in "coverageNote".',
    '',
    'Rules for each option:',
    `- "perDayUsdForParty" covers all ${intake.travelers} travelers for one day.`,
    '- For a car, include fuel, tolls and parking, not just the rental rate. Parking is the',
    '  line that surprises people.',
    '- For a pass, say what it does not cover in "coverageNote" — the airport line, the',
    '  suburban rail, the tourist tram.',
    '- Name the actual product where there is one ("Oyster card", "Navigo Découverte"),',
    '  not just the category.',
    '- "description" is at most two sentences and says when this is the right choice.',
    '',
    'Schema for each array element:',
    JSON.stringify(
      {
        mode: 'rental_car | transit_pass | rideshare | walk_bike',
        name: 'string',
        perDayUsdForParty: 'number',
        description: 'string, at most 2 sentences',
        coverageNote: 'string (optional)',
        confidence: 'low | medium | high',
      },
      null,
      2,
    ),
    '',
    `Return a JSON array of exactly ${TRANSIT_TARGET} such objects. Output only JSON. No prose, no markdown fence.`,
  ].join('\n');
}
