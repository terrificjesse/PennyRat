import { z } from 'zod';
import type { BudgetPlan, TripIntake } from '../../types';
import {
  JSON_DISCIPLINE,
  describeParty,
  describeTripDates,
  optionalish,
  rawConfidenceSchema,
  usd,
} from './common';

/** Prompt C: where to sleep, across the whole comfort range. */

export const rawLodgingSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['hotel', 'motel', 'airbnb', 'hostel', 'boutique']),
  tier: z.enum(['budget', 'mid', 'comfort', 'premium']),
  nightlyUsdForParty: z.number().min(5).max(5000),
  neighborhood: z.string().min(2).max(80),
  description: z.string().min(10).max(400),
  amenities: optionalish(z.array(z.string().max(40)).max(14)),
  rating: optionalish(z.number().min(0).max(5)),
  walkabilityNote: optionalish(z.string().max(240)),
  confidence: rawConfidenceSchema,
});

export type RawLodging = z.infer<typeof rawLodgingSchema>;

export const LODGING_TARGET = 12;

export const lodgingSystem = [
  'You are a hotel researcher who knows named, real properties in the city you are asked',
  'about, across every price level, and who quotes nightly rates as ranges rather than',
  'pretending to have live availability.',
  JSON_DISCIPLINE,
].join(' ');

export function buildLodgingPrompt(intake: TripIntake, budget: BudgetPlan): string {
  return [
    `Find ${LODGING_TARGET} places to stay in ${intake.destination}.`,
    '',
    describeParty(intake),
    describeTripDates(intake),
    `Their lodging budget is ${usd(budget.lodging)} for the whole stay, but return options`,
    'well above and well below that so the tradeoff is visible.',
    '',
    'Hard requirements on the set you return:',
    `- Exactly ${LODGING_TARGET} entries.`,
    '- At least 3 in tier "budget", 3 in "mid", 3 in "comfort" and 2 in "premium".',
    '- At least one each of type "hostel", "hotel", "airbnb" and "boutique".',
    '- At least 4 different neighborhoods.',
    '- Order cheapest first.',
    '',
    'Rules for each entry:',
    `- "nightlyUsdForParty" is the nightly cost to house all ${intake.travelers} travelers,`,
    '  not a per-person rate. For a hostel that means the beds they would actually book.',
    '- Name a real property. Use "airbnb" as the type for a whole apartment or house,',
    '  described generically ("one-bedroom apartment in Koenji") since individual listings',
    '  come and go; set confidence to "low" for those.',
    '- "description" is at most two sentences and says what the room or building is actually',
    '  like, not how the marketing reads.',
    '- "walkabilityNote" is what is within walking distance and how far the nearest transit is.',
    '',
    'Schema for each array element:',
    JSON.stringify(
      {
        name: 'string',
        type: 'hotel | motel | airbnb | hostel | boutique',
        tier: 'budget | mid | comfort | premium',
        nightlyUsdForParty: 'number',
        neighborhood: 'string',
        description: 'string, at most 2 sentences',
        amenities: ['string (optional)'],
        rating: 'number 0-5 (optional)',
        walkabilityNote: 'string (optional)',
        confidence: 'low | medium | high',
      },
      null,
      2,
    ),
    '',
    `Return a JSON array of exactly ${LODGING_TARGET} such objects. Output only JSON. No prose, no markdown fence.`,
  ].join('\n');
}
