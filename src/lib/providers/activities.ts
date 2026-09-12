import { tripDateRange } from '../budget';
import { fixtureActivities } from '../../fixtures';
import { fixtureMeta, k2Configured, k2Mode, researchItems } from '../k2/client';
import { clampInt, dedupeByTitle, slugId, truncate } from '../k2/parse';
import {
  ACTIVITY_TARGET,
  activitySystem,
  buildActivityPrompt,
  rawActivitySchema,
  type RawActivity,
} from '../k2/prompts/activities';
import {
  DAY_KEYS,
  activityOptionSchema,
  type ActivityCategory,
  type ActivityOption,
  type BudgetPlan,
  type HoursWindow,
  type Interest,
  type OpeningHours,
  type ResearchMeta,
  type TripIntake,
} from '../types';

/**
 * Raw activity research into contract options. Everything the model could get wrong
 * about formatting is repaired here; everything it could get wrong about substance
 * causes the entry to be dropped with a warning rather than shown to a user.
 */

/** Accepts `9:00`, `09:00`, `9am`, `21:30`, `24:00`. Returns HH:mm or null. */
function toClock(value: string): string | null {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(value);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3]?.toLowerCase();

  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  if (hour === 24 && minute === 0) return '23:59';
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Weekday keys are matched on their first three letters, so `Monday`, `MON` and
 * `mon` all land in the same place. A day nobody mentioned stays closed.
 */
function normalizeHours(raw: RawActivity['openingHours']): OpeningHours | null {
  const hours = Object.fromEntries(DAY_KEYS.map((day) => [day, null])) as {
    [K in (typeof DAY_KEYS)[number]]: HoursWindow[] | null;
  };

  let anyOpen = false;

  for (const [key, value] of Object.entries(raw)) {
    const day = key.trim().toLowerCase().slice(0, 3) as (typeof DAY_KEYS)[number];
    if (!DAY_KEYS.includes(day)) continue;
    if (value === null) continue;

    const windows: HoursWindow[] = [];
    for (const window of value) {
      const open = toClock(window.open);
      let close = toClock(window.close);
      if (!open || !close) continue;
      // A bar listed as 17:00-02:00 closes after midnight; the schedule works in
      // single days, so clip it rather than dropping the venue.
      if (close <= open) close = '23:59';
      windows.push({ open, close });
    }

    if (windows.length > 0) {
      hours[day] = windows;
      anyOpen = true;
    }
  }

  return anyOpen ? hours : null;
}

/**
 * Interest tags as the model writes them, mapped onto the ten the app knows.
 *
 * Asked for "hiking" it answers "outdoor" or "nature"; asked for "tourist" it writes
 * "sightseeing". Rejecting the venue over its label lost every hiking option on an
 * Iceland trip, which is the opposite of useful. Unknown tags are dropped, and a
 * venue left with none falls back to what its category implies.
 */
const INTEREST_SYNONYMS: Record<string, Interest> = {
  outdoor: 'hiking',
  outdoors: 'hiking',
  nature: 'hiking',
  hike: 'hiking',
  hiking: 'hiking',
  trekking: 'hiking',
  trail: 'hiking',
  trails: 'hiking',
  adventure: 'hiking',
  walking: 'hiking',
  food: 'food',
  dining: 'food',
  restaurant: 'food',
  cuisine: 'food',
  culinary: 'food',
  gastronomy: 'food',
  foodie: 'food',
  coffee: 'food',
  sport: 'sports',
  sports: 'sports',
  stadium: 'sports',
  athletics: 'sports',
  family: 'family',
  kids: 'family',
  children: 'family',
  family_friendly: 'family',
  kid_friendly: 'family',
  sensory_friendly: 'sensory_friendly',
  sensory: 'sensory_friendly',
  accessible: 'sensory_friendly',
  quiet: 'sensory_friendly',
  calm: 'sensory_friendly',
  tourist: 'tourist',
  sightseeing: 'tourist',
  landmark: 'tourist',
  landmarks: 'tourist',
  scenic: 'tourist',
  views: 'tourist',
  iconic: 'tourist',
  classic: 'tourist',
  nightlife: 'nightlife',
  bar: 'nightlife',
  bars: 'nightlife',
  club: 'nightlife',
  drinks: 'nightlife',
  music: 'nightlife',
  art: 'art',
  arts: 'art',
  gallery: 'art',
  galleries: 'art',
  design: 'art',
  architecture: 'art',
  history: 'history',
  historic: 'history',
  historical: 'history',
  heritage: 'history',
  culture: 'history',
  cultural: 'history',
  museum: 'history',
  museums: 'history',
  archaeology: 'history',
  shopping: 'shopping',
  shop: 'shopping',
  shops: 'shopping',
  market: 'shopping',
  markets: 'shopping',
  souvenirs: 'shopping',
};

const CATEGORY_INTEREST: Record<ActivityCategory, Interest> = {
  restaurant: 'food',
  museum: 'history',
  attraction: 'tourist',
  outdoor: 'hiking',
  experience: 'tourist',
  shopping: 'shopping',
  nightlife: 'nightlife',
};

function normalizeInterests(raw: string[], category: ActivityCategory): Interest[] {
  const mapped = raw
    .map((tag) => INTEREST_SYNONYMS[tag.trim().toLowerCase().replace(/[\s-]+/g, '_')])
    .filter((interest): interest is Interest => Boolean(interest));

  const unique = [...new Set(mapped)];
  return unique.length > 0 ? unique : [CATEGORY_INTEREST[category]];
}

export function buildActivityOptions(
  raw: RawActivity[],
  intake: TripIntake,
  budget: BudgetPlan,
): { options: ActivityOption[]; warnings: string[] } {
  const warnings: string[] = [];
  const taken = new Set<string>();
  const withinTrip = new Set(tripDateRange(intake));
  const ceiling = (budget.activities + budget.food) * 3;

  const unique = dedupeByTitle(raw, (item) => item.name);
  if (unique.length < raw.length) {
    warnings.push(`dropped ${raw.length - unique.length} duplicate venues`);
  }

  const options: ActivityOption[] = [];

  for (const item of unique) {
    const openingHours = normalizeHours(item.openingHours);
    if (!openingHours) {
      warnings.push(`dropped ${item.name} (no usable opening hours)`);
      continue;
    }

    const costCents = Math.round(item.costUsdPerPerson * 100) * intake.travelers;
    if (costCents > ceiling) {
      warnings.push(`dropped ${item.name} (priced far beyond the budget)`);
      continue;
    }

    const candidate = {
      id: slugId('act_', item.name, taken),
      kind: 'activity' as const,
      bucket: item.category === 'restaurant' ? ('food' as const) : ('activities' as const),
      title: truncate(item.name, 120),
      costCents,
      costBasis: 'per_person' as const,
      estimated: true,
      confidence: item.confidence,
      category: item.category,
      neighborhood: truncate(item.neighborhood, 60),
      description: truncate(item.description, 240),
      rating: item.rating,
      reviewCount: item.reviewCount,
      durationMinutes: clampInt(item.durationMinutes, 15, 720),
      openingHours,
      closedDates: (item.closedDates ?? []).filter((date) => withinTrip.has(date)),
      bookingRequired: item.bookingRequired,
      interests: normalizeInterests(item.interests, item.category),
      sensoryNotes: item.sensoryNotes ? truncate(item.sensoryNotes, 200) : undefined,
      bestTimeOfDay: item.bestTimeOfDay,
    };

    const parsed = activityOptionSchema.safeParse(candidate);
    if (parsed.success) options.push(parsed.data);
    else warnings.push(`dropped ${item.name} (${parsed.error.issues[0]?.message ?? 'invalid'})`);
  }

  const missing = intake.interests.filter(
    (interest) => !options.some((option) => option.interests.includes(interest)),
  );
  if (missing.length > 0) {
    warnings.push(`no options matched: ${missing.join(', ')}`);
  }
  if (options.length < ACTIVITY_TARGET) {
    warnings.push(`asked for ${ACTIVITY_TARGET} venues, kept ${options.length}`);
  }

  return { options, warnings };
}

export async function researchActivities(
  intake: TripIntake,
  budget: BudgetPlan,
): Promise<{ options: ActivityOption[]; meta: ResearchMeta }> {
  const started = Date.now();

  if (k2Mode() === 'fixture' || !k2Configured()) {
    return {
      options: fixtureActivities,
      meta: fixtureMeta(
        started,
        'served the bundled Tokyo sample activities; set IFM_API_KEY and K2_MODE=live for real research',
      ),
    };
  }

  try {
    const { items, meta } = await researchItems({
      label: 'activities',
      system: activitySystem,
      prompt: buildActivityPrompt(intake, budget),
      itemSchema: rawActivitySchema,
    });

    const { options, warnings } = buildActivityOptions(items, intake, budget);
    if (options.length === 0) throw new Error('no usable activities survived validation');

    return { options, meta: { ...meta, warnings: [...meta.warnings, ...warnings] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      options: fixtureActivities,
      meta: fixtureMeta(started, `activity research failed (${reason}); served sample data`),
    };
  }
}
