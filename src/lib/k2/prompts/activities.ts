import { z } from 'zod';
import { activityCategorySchema, type BudgetPlan, type TripIntake } from '../../types';
import {
  HOURS_SHAPE,
  JSON_DISCIPLINE,
  optionalish,
  describeParty,
  describeTripDates,
  rawConfidenceSchema,
  rawOpeningHoursSchema,
  usd,
} from './common';

/** Prompt A: what there is to do, eat and see. */

export const rawActivitySchema = z.object({
  name: z.string().min(2).max(120),
  category: activityCategorySchema,
  neighborhood: z.string().min(2).max(80),
  description: z.string().min(10).max(400),
  costUsdPerPerson: z.number().min(0).max(2000),
  durationMinutes: z.number().int().min(15).max(720),
  openingHours: rawOpeningHoursSchema,
  closedDates: optionalish(z.array(z.string()).max(20)),
  bookingRequired: z.boolean(),
  /** Free text: the model invents tags like "outdoor" and "nature". Mapped in the provider. */
  interests: z.array(z.string().max(40)).min(1).max(8),
  sensoryNotes: optionalish(z.string().max(300)),
  bestTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']),
  /** Any scale — the provider maps it onto five. */
  rating: optionalish(z.number().min(0).max(100)),
  reviewCount: optionalish(z.number().int().min(0)),
  confidence: rawConfidenceSchema,
});

export type RawActivity = z.infer<typeof rawActivitySchema>;

export const ACTIVITY_TARGET = 26;

export const activitySystem = [
  'You are a travel researcher who knows specific, real, currently-open venues in the',
  'city you are asked about, and who is candid about the limits of what you know.',
  'You cover the famous things first and the interesting things second, because a',
  'visitor who misses the landmark will not forgive you for the hidden gem.',
  JSON_DISCIPLINE,
].join(' ');

export function buildActivityPrompt(intake: TripIntake, budget: BudgetPlan): string {
  const perPerson = Math.round(
    (budget.activities + budget.food) / 100 / Math.max(1, intake.travelers),
  );

  return [
    `Find ${ACTIVITY_TARGET} things to do and places to eat in ${intake.destination}.`,
    '',
    describeParty(intake),
    describeTripDates(intake),
    `Their combined activities and food budget is ${usd(budget.activities + budget.food)} for the whole party, about $${perPerson} per person for the trip.`,
    '',
    'Hard requirements on the set you return:',
    `- Exactly ${ACTIVITY_TARGET} entries. Not "around" ${ACTIVITY_TARGET}.`,
    `- At least 2 entries for each of these interests: ${intake.interests.join(', ')}.`,
    '- At least 10 with category "restaurant". Three meals a day across a whole trip',
    '  needs the supply, so this is a floor rather than a suggestion.',
    '- Of those, at least 2 must open by 08:00 and suit breakfast — a bakery, a coffee',
    '  house, a market stall, whatever people there actually eat in the morning.',
    '- Spread the restaurants across neighbourhoods rather than clustering them, so a',
    '  day spent in one part of the city can eat near where it already is.',
    '- At least 2 with category "museum".',
    '- At least 5 of the landmarks a first-time visitor would be disappointed to miss —',
    '  the ones that appear on every postcard and that somebody would be asked "you went',
    '  and did not see it?" about. Washington DC means the Lincoln Memorial and the',
    '  National Mall; Paris means the Eiffel Tower; Rome means the Colosseum. List these',
    '  before anything clever or off the beaten track. A guide that skips the obvious is',
    '  not being sophisticated, it is being unhelpful.',
    '- Then, and only then, the less obvious places worth a visitor\'s time.',
    '- At least 4 that cost under $15 per person, at least 6 between $15 and $50,',
    '  and at least 3 over $50. Free entries count toward the first group.',
    '- No two entries in the same building or chain.',
    '',
    'Rules for each entry:',
    '- Name a specific, real venue. "A local ramen shop" is not an answer; "Ichiran Shibuya" is.',
    '- "costUsdPerPerson" is admission for an attraction, or the typical all-in spend for',
    '  one person for a restaurant, including a drink. Use 0 for free.',
    '- "durationMinutes" is how long a visitor actually spends there, not opening span.',
    '- "description" is at most two sentences and says something concrete a guidebook',
    '  blurb would not: what to order, which trail, which room, when it is quiet.',
    '- "interests" uses only these values: food, hiking, sports, family, sensory_friendly,',
    '  tourist, nightlife, art, history, shopping.',
    intake.interests.includes('sensory_friendly')
      ? '- This traveler asked for sensory-friendly options. For every entry, fill in "sensoryNotes" with the honest noise, crowd and lighting situation, and tag "sensory_friendly" only where it genuinely applies.'
      : '- Fill in "sensoryNotes" only where crowding, noise or lighting would actually change someone’s plans.',
    '- "bookingRequired" is true only if entry is impossible without booking ahead.',
    '- "closedDates" is for known closures inside the trip window, as yyyy-mm-dd.',
    '',
    HOURS_SHAPE,
    '',
    'Schema for each array element:',
    JSON.stringify(
      {
        name: 'string',
        category: 'restaurant | museum | attraction | outdoor | experience | shopping | nightlife',
        neighborhood: 'string',
        description: 'string, at most 2 sentences',
        costUsdPerPerson: 'number',
        durationMinutes: 'number',
        openingHours: { mon: [{ open: 'HH:mm', close: 'HH:mm' }], tue: null },
        closedDates: ['yyyy-mm-dd (optional)'],
        bookingRequired: 'boolean',
        interests: ['string'],
        sensoryNotes: 'string (optional)',
        bestTimeOfDay: 'morning | afternoon | evening | any',
        rating: 'number 0-5 (optional)',
        reviewCount: 'number (optional)',
        confidence: 'low | medium | high',
      },
      null,
      2,
    ),
    '',
    `Return a JSON array of exactly ${ACTIVITY_TARGET} such objects. Output only JSON. No prose, no markdown fence.`,
  ].join('\n');
}
