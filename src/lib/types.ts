import { z } from 'zod';

/**
 * The data contract shared by the API lane and the UI lane. Frozen after Wave 0 —
 * see AGENTS.md for how to request a change.
 *
 * Money is integer cents everywhere. Never store dollars as floats; format only at render.
 */
export const SCHEMA_VERSION = 1;

const cents = z.number().int().nonnegative();
export type Cents = number;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-mm-dd');
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'expected yyyy-mm-ddTHH:mm local time, no timezone');
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');

export const interestSchema = z.enum([
  'food',
  'hiking',
  'sports',
  'family',
  'sensory_friendly',
  'tourist',
  'nightlife',
  'art',
  'history',
  'shopping',
]);
export type Interest = z.infer<typeof interestSchema>;
export const INTERESTS = interestSchema.options;

export const paceSchema = z.enum(['relaxed', 'balanced', 'packed']);
export type Pace = z.infer<typeof paceSchema>;

/** How many activity blocks the scheduler will place per full day. */
export const PACE_ACTIVITY_CAP: Record<Pace, number> = { relaxed: 2, balanced: 3, packed: 5 };

export const bucketKeySchema = z.enum([
  'flights',
  'lodging',
  'activities',
  'food',
  'localTransit',
  'buffer',
]);
export type BucketKey = z.infer<typeof bucketKeySchema>;
export const BUCKET_KEYS = bucketKeySchema.options;

export const BUCKET_LABELS: Record<BucketKey, string> = {
  flights: 'Getting there',
  lodging: 'Lodging',
  activities: 'Activities',
  food: 'Food',
  localTransit: 'Getting around',
  buffer: 'Buffer',
};

export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof confidenceSchema>;

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export const tripIntakeSchema = z
  .object({
    origin: z.string().min(2).max(80),
    destination: z.string().min(2).max(80),
    startDate: isoDate,
    endDate: isoDate,
    travelers: z.number().int().min(1).max(12),
    budgetTotal: cents.min(1),
    interests: z.array(interestSchema).min(1).max(INTERESTS.length),
    pace: paceSchema,
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });
export type TripIntake = z.infer<typeof tripIntakeSchema>;

export const budgetPlanSchema = z.object({
  flights: cents,
  lodging: cents,
  activities: cents,
  food: cents,
  localTransit: cents,
  buffer: cents,
});
export type BudgetPlan = z.infer<typeof budgetPlanSchema>;

// ---------------------------------------------------------------------------
// Selectable options
// ---------------------------------------------------------------------------

/**
 * `costCents` is always the total charge for the whole party for the whole trip —
 * already multiplied out. `costBasis` exists so the UI can explain the number
 * ("$96 · $24 per person"), never so a component has to recompute it.
 */
const selectableBase = z.object({
  id: z.string().min(3).max(80),
  bucket: bucketKeySchema,
  title: z.string().min(2).max(120),
  costCents: cents,
  costBasis: z.enum(['per_person', 'per_party', 'per_night', 'per_day']),
  estimated: z.boolean(),
  confidence: confidenceSchema,
});

/** An airport code, a station name, or wherever else a journey starts. */
const placeLabel = z.string().min(2).max(40);

export const flightLegSchema = z.object({
  from: placeLabel,
  to: placeLabel,
  departLocal: localDateTime,
  arriveLocal: localDateTime,
  carrier: z.string().min(2).max(40),
  flightNo: z.string().max(10).optional(),
  durationMinutes: z.number().int().positive().max(1440),
});
export type FlightLeg = z.infer<typeof flightLegSchema>;

export const flightOptionSchema = selectableBase.extend({
  kind: z.literal('flight'),
  bucket: z.literal('flights'),
  /**
   * A `roundtrip` carries the way home in `returnLegs` and satisfies both directions
   * on its own. Two one-ways are almost always dearer than the equivalent round trip,
   * so this is the shape most travelers actually buy.
   */
  direction: z.enum(['outbound', 'return', 'roundtrip']),
  /**
   * How the journey is made; absent means `plane`. Everything here is a `flight` by
   * discriminant because renaming that costs thirty call sites and buys nothing —
   * see AGENTS.md §6. Read it through `travelMode()` rather than testing for undefined.
   */
  mode: z.enum(['plane', 'train', 'bus', 'car']).optional(),
  /** The outward journey. For a one-way `return` option, this *is* the way home. */
  legs: z.array(flightLegSchema).min(1).max(4),
  /** Set only when `direction` is `roundtrip`. */
  returnLegs: z.array(flightLegSchema).min(1).max(4).optional(),
  stops: z.number().int().min(0).max(3),
  totalDurationMinutes: z.number().int().positive().max(4320),
  cabin: z.enum(['economy', 'premium', 'business']),
  baggageIncluded: z.boolean(),
});
export type FlightOption = z.infer<typeof flightOptionSchema>;
/** The name to prefer in new code: not everything that gets you there flies. */
export type TravelOption = FlightOption;
export type TravelMode = NonNullable<FlightOption['mode']>;

/** How a journey is made, defaulting to the one everything used to assume. */
export function travelMode(option: Pick<FlightOption, 'mode'>): TravelMode {
  return option.mode ?? 'plane';
}

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  plane: 'Flight',
  train: 'Train',
  bus: 'Coach',
  car: 'Driving',
};

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const hoursWindowSchema = z.object({ open: clockTime, close: clockTime });
export type HoursWindow = z.infer<typeof hoursWindowSchema>;

/** One entry per weekday. `null` means closed all day. */
export const openingHoursSchema = z.object({
  sun: z.array(hoursWindowSchema).nullable(),
  mon: z.array(hoursWindowSchema).nullable(),
  tue: z.array(hoursWindowSchema).nullable(),
  wed: z.array(hoursWindowSchema).nullable(),
  thu: z.array(hoursWindowSchema).nullable(),
  fri: z.array(hoursWindowSchema).nullable(),
  sat: z.array(hoursWindowSchema).nullable(),
});
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const activityCategorySchema = z.enum([
  'restaurant',
  'museum',
  'attraction',
  'outdoor',
  'experience',
  'shopping',
  'nightlife',
]);
export type ActivityCategory = z.infer<typeof activityCategorySchema>;

export const activityOptionSchema = selectableBase.extend({
  kind: z.literal('activity'),
  /** Restaurants bill to `food`; everything else to `activities`. */
  bucket: z.enum(['activities', 'food']),
  category: activityCategorySchema,
  neighborhood: z.string().min(2).max(60),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  description: z.string().min(10).max(240),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  durationMinutes: z.number().int().min(15).max(720),
  openingHours: openingHoursSchema,
  closedDates: z.array(isoDate).default([]),
  bookingRequired: z.boolean(),
  interests: z.array(interestSchema).min(1),
  sensoryNotes: z.string().max(200).optional(),
  bestTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']),
  /** A maps search link, built from the name and neighbourhood — never from coordinates. */
  mapsUrl: z.string().max(400).optional(),
});
export type ActivityOption = z.infer<typeof activityOptionSchema>;

export const lodgingOptionSchema = selectableBase.extend({
  kind: z.literal('lodging'),
  bucket: z.literal('lodging'),
  type: z.enum(['hotel', 'motel', 'airbnb', 'hostel', 'boutique']),
  tier: z.enum(['budget', 'mid', 'comfort', 'premium']),
  nightlyCents: cents,
  nights: z.number().int().positive().max(60),
  neighborhood: z.string().min(2).max(60),
  description: z.string().min(10).max(240),
  rating: z.number().min(0).max(5).optional(),
  amenities: z.array(z.string().max(40)).max(12).default([]),
  walkabilityNote: z.string().max(160).optional(),
  mapsUrl: z.string().max(400).optional(),
});
export type LodgingOption = z.infer<typeof lodgingOptionSchema>;

export const transitOptionSchema = selectableBase.extend({
  kind: z.literal('transit'),
  bucket: z.literal('localTransit'),
  mode: z.enum(['rental_car', 'transit_pass', 'rideshare', 'walk_bike']),
  perDayCents: cents,
  days: z.number().int().positive().max(60),
  description: z.string().min(10).max(240),
  coverageNote: z.string().max(160).optional(),
});
export type TransitOption = z.infer<typeof transitOptionSchema>;

/**
 * Cross-field invariants (stops === legs.length - 1, costCents === nightlyCents * nights,
 * costCents === perDayCents * days) are enforced by the normalizers in lib/k2/parse.ts
 * rather than by a schema refinement, so these stay plain objects and remain usable
 * inside a discriminated union.
 */
export const tripOptionSchema = z.discriminatedUnion('kind', [
  flightOptionSchema,
  activityOptionSchema,
  lodgingOptionSchema,
  transitOptionSchema,
]);
export type TripOption = z.infer<typeof tripOptionSchema>;
export type OptionKind = TripOption['kind'];

export const ID_PREFIX: Record<OptionKind, string> = {
  flight: 'flt_',
  activity: 'act_',
  lodging: 'lodg_',
  transit: 'tr_',
};

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export const scheduleBlockSchema = z.object({
  start: localDateTime,
  end: localDateTime,
  kind: z.enum([
    'flight',
    'activity',
    'meal',
    'lodging_checkin',
    'lodging_checkout',
    'transit',
    'free',
  ]),
  refId: z.string().optional(),
  title: z.string().min(1).max(160),
  note: z.string().max(240).optional(),
  costCents: cents,
  /** The planner put this here; the traveler did not choose it. */
  suggested: z.boolean().optional(),
  /** Option ids that could take this slot instead, for a one-tap swap. */
  alternatives: z.array(z.string()).max(8).optional(),
});
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;

export const dayPlanSchema = z.object({
  date: isoDate,
  blocks: z.array(scheduleBlockSchema),
  daySpendCents: cents,
  warnings: z.array(z.string()),
  /** Option ids that would genuinely fit somewhere on this day, for the add control. */
  couldAdd: z.array(z.string()).max(12).optional(),
  /** Blocks plus the travel padding between them, so the UI can show how full a day is. */
  filledMinutes: z.number().int().nonnegative().optional(),
});
export type DayPlan = z.infer<typeof dayPlanSchema>;

export const itinerarySchema = z.object({
  days: z.array(dayPlanSchema),
  /** Everything on the plan, chosen and suggested alike. */
  totalCents: cents,
  /** What the traveler actually ticked. */
  chosenCents: cents.optional(),
  /** What the planner added to fill the days out. */
  suggestedCents: cents.optional(),
  /** How far `totalCents` runs past the budget, or zero. */
  overBudgetCents: cents.optional(),
  unscheduled: z.array(z.object({ id: z.string(), reason: z.string() })),
  warnings: z.array(z.string()),
});
export type Itinerary = z.infer<typeof itinerarySchema>;

// ---------------------------------------------------------------------------
// API contract
// ---------------------------------------------------------------------------

export const researchSourceSchema = z.enum(['live', 'cache', 'fixture']);
export type ResearchSource = z.infer<typeof researchSourceSchema>;

export const researchMetaSchema = z.object({
  source: researchSourceSchema,
  latencyMs: z.number().int().nonnegative(),
  model: z.string(),
  /** Non-fatal problems worth surfacing: dropped items, unmet quotas, repaired JSON. */
  warnings: z.array(z.string()),
});
export type ResearchMeta = z.infer<typeof researchMetaSchema>;

/** POST body for every /api/research/* route. */
export const researchRequestSchema = z.object({ intake: tripIntakeSchema });
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

export const flightsResponseSchema = z.object({
  options: z.array(flightOptionSchema),
  meta: researchMetaSchema,
});
export const activitiesResponseSchema = z.object({
  options: z.array(activityOptionSchema),
  meta: researchMetaSchema,
});
export const lodgingResponseSchema = z.object({
  options: z.array(lodgingOptionSchema),
  meta: researchMetaSchema,
});
export const transitResponseSchema = z.object({
  options: z.array(transitOptionSchema),
  meta: researchMetaSchema,
});
export type FlightsResponse = z.infer<typeof flightsResponseSchema>;
export type ActivitiesResponse = z.infer<typeof activitiesResponseSchema>;
export type LodgingResponse = z.infer<typeof lodgingResponseSchema>;
export type TransitResponse = z.infer<typeof transitResponseSchema>;

/** POST body for /api/schedule. `options` carries the full objects for `selectedIds`. */
export const scheduleRequestSchema = z.object({
  intake: tripIntakeSchema,
  options: z.array(tripOptionSchema),
  /** Must appear on the plan. */
  selectedIds: z.array(z.string()),
  /** Never suggest these — the traveler removed them and meant it. */
  excludedIds: z.array(z.string()).optional(),
  /**
   * Dragged into place by the traveler. These are laid down before anything else and
   * the day is packed around them; one that cannot hold comes back in `unscheduled`.
   */
  pinned: z
    .array(
      z.object({
        id: z.string(),
        date: isoDate,
        startMinutes: z.number().int().min(0).max(24 * 60 - 1),
      }),
    )
    .max(60)
    .optional(),
});
export type ScheduleRequest = z.infer<typeof scheduleRequestSchema>;

export const scheduleResponseSchema = z.object({ itinerary: itinerarySchema });
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;

/** Shape of a non-2xx JSON body from any route in this app. */
export const apiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
