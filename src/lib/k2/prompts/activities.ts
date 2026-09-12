import { z } from 'zod';
import { activityCategorySchema, interestSchema, type BudgetPlan, type TripIntake } from '../../types';
import {
  HOURS_SHAPE,
  JSON_DISCIPLINE,
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
  closedDates: z.array(z.string()).max(20).optional(),
  bookingRequired: z.boolean(),
  interests: z.array(interestSchema).min(1).max(6),
  sensoryNotes: z.string().max(300).optional(),
  bestTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  confidence: rawConfidenceSchema,
});

export type RawActivity = z.infer<typeof rawActivitySchema>;

export const ACTIVITY_TARGET = 16;

export const activitySystem = [
  'You are a travel researcher who knows specific, real, currently-open venues in the',
  'city you are asked about, and who is candid about the limits of what you know.',
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
    '- At least 3 with category "restaurant" and at least 2 with category "museum".',
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
