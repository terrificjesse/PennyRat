import { afterEach, describe, expect, it } from 'vitest';
import { allocateBuckets } from '../budget';
import { buildActivityOptions, researchActivities } from './activities';
import { advanceMultiplier, buildFlightOptions, estimateFare, researchFlights } from './flights';
import { buildLodgingOptions, researchLodging } from './lodging';
import { researchTransit } from './transit';
import type { RawActivity } from '../k2/prompts/activities';
import type { RawFlightRoute } from '../k2/prompts/flights';
import type { RawLodging } from '../k2/prompts/lodging';
import { DAY_KEYS, type TripIntake } from '../types';

const intake: TripIntake = {
  origin: 'ORD',
  destination: 'Tokyo, Japan',
  startDate: '2026-10-12',
  endDate: '2026-10-17',
  travelers: 2,
  budgetTotal: 420_000,
  interests: ['food', 'tourist'],
  pace: 'balanced',
};

const budget = allocateBuckets(intake);

// A fixed "today" so the advance-purchase multiplier does not drift with the clock.
const today = new Date('2026-08-01T00:00:00Z');

function route(overrides: Partial<RawFlightRoute> = {}): RawFlightRoute {
  return {
    direction: 'outbound',
    carrier: 'United Airlines',
    legs: [
      {
        fromIata: 'ORD',
        toIata: 'NRT',
        departLocal: '2026-10-12T11:35',
        arriveLocal: '2026-10-13T14:40',
        durationMinutes: 785,
        flightNo: 'UA881',
      },
    ],
    fareBandUsdPerPerson: { low: 800, typical: 990, high: 1400 },
    baggageIncluded: true,
    confidence: 'medium',
    ...overrides,
  };
}

describe('flight fare estimation', () => {
  it('charges more the closer the departure is', () => {
    expect(advanceMultiplier(3)).toBeGreaterThan(advanceMultiplier(20));
    expect(advanceMultiplier(20)).toBeGreaterThan(advanceMultiplier(60));
    expect(advanceMultiplier(60)).toBeGreaterThan(advanceMultiplier(200));
  });

  it('multiplies the per-person fare out to the whole party, in whole cents', () => {
    const band = { low: 800, typical: 1000, high: 1400 };
    const fare = estimateFare(band, 60, 2);
    expect(fare).toBe(200_000);
    expect(Number.isInteger(fare)).toBe(true);
  });

  it('never strays far outside the band the model gave', () => {
    const band = { low: 800, typical: 1000, high: 1400 };
    for (const daysAhead of [0, 5, 13, 29, 89, 179, 400]) {
      const perPerson = estimateFare(band, daysAhead, 1) / 100;
      expect(perPerson).toBeGreaterThanOrEqual(band.low * 0.85);
      expect(perPerson).toBeLessThanOrEqual(band.high * 1.35);
    }
  });

  it('survives a band the model wrote out of order', () => {
    const fare = estimateFare({ low: 1400, typical: 990, high: 800 }, 60, 1);
    expect(fare).toBeGreaterThan(0);
  });
});

describe('buildFlightOptions', () => {
  it('keeps a well-formed routing and prices it', () => {
    const { options, warnings } = buildFlightOptions([route()], intake, today);
    expect(options).toHaveLength(1);
    expect(options[0].costCents).toBeGreaterThan(0);
    expect(options[0].stops).toBe(0);
    expect(options[0].estimated).toBe(true);
    expect(options[0].title).toBe('United Airlines · nonstop');
    expect(warnings.some((w) => w.includes('moved'))).toBe(false);
  });

  it('moves a routing the model dated wrongly onto the trip, preserving the times', () => {
    const wrongYear = route({
      legs: [
        {
          fromIata: 'ORD',
          toIata: 'NRT',
          departLocal: '2024-03-05T11:35',
          arriveLocal: '2024-03-06T14:40',
          durationMinutes: 785,
        },
      ],
    });

    const { options, warnings } = buildFlightOptions([wrongYear], intake, today);
    expect(options).toHaveLength(1);
    expect(options[0].legs[0].departLocal).toBe('2026-10-12T11:35');
    // The overnight gap between departure and arrival has to survive the shift.
    expect(options[0].legs[0].arriveLocal).toBe('2026-10-13T14:40');
    expect(warnings.some((w) => w.includes('moved'))).toBe(true);
  });

  it('dates return routings from the end of the trip', () => {
    const back = route({
      direction: 'return',
      legs: [
        {
          fromIata: 'NRT',
          toIata: 'ORD',
          departLocal: '2026-01-01T15:45',
          arriveLocal: '2026-01-01T13:40',
          durationMinutes: 715,
        },
      ],
    });

    const { options } = buildFlightOptions([back], intake, today);
    expect(options[0].legs[0].departLocal.slice(0, 10)).toBe(intake.endDate);
  });

  it('drops a routing whose legs do not join up', () => {
    const broken = route({
      legs: [
        {
          fromIata: 'ORD',
          toIata: 'YVR',
          departLocal: '2026-10-12T08:10',
          arriveLocal: '2026-10-12T10:45',
          durationMinutes: 275,
        },
        {
          fromIata: 'ICN',
          toIata: 'NRT',
          departLocal: '2026-10-13T19:05',
          arriveLocal: '2026-10-13T21:20',
          durationMinutes: 135,
        },
      ],
      layoverMinutes: [95],
    });

    const { options, warnings } = buildFlightOptions([broken], intake, today);
    expect(options).toHaveLength(0);
    expect(warnings.some((w) => w.includes('did not reach'))).toBe(true);
  });

  /**
   * Places are labels now, not airport codes, because stations are not airports. Only
   * something genuinely unusable gets dropped.
   */
  it('accepts a station name where an airport code used to be required', () => {
    const byRail = route({
      mode: 'train',
      carrier: 'Amtrak',
      legs: [
        {
          fromIata: 'Boston South Station',
          toIata: 'New York Penn Station',
          departLocal: '2026-10-12T09:00',
          arriveLocal: '2026-10-12T12:45',
          durationMinutes: 225,
        },
      ],
    });

    const { options } = buildFlightOptions([byRail], intake, today);
    expect(options).toHaveLength(1);
    expect(options[0].legs[0].from).toBe('Boston South Station');
    expect(options[0].mode).toBe('train');
  });

  it('still upper-cases a three-letter airport code', () => {
    const { options } = buildFlightOptions(
      [route({ legs: [{ ...route().legs[0], fromIata: 'ord' }] })],
      intake,
      today,
    );
    expect(options[0].legs[0].from).toBe('ORD');
  });

  it('drops a routing whose place is unusable', () => {
    const bad = route({ legs: [{ ...route().legs[0], toIata: 'x' }] });
    expect(buildFlightOptions([bad], intake, today).options).toHaveLength(0);
  });

  it('prices a drive without inventing a connection warning', () => {
    const drive = route({
      mode: 'car',
      carrier: 'Own car',
      legs: [
        {
          fromIata: 'Boston',
          toIata: 'New York',
          departLocal: '2026-10-12T09:00',
          arriveLocal: '2026-10-12T13:00',
          durationMinutes: 240,
        },
      ],
      fareBandUsdPerPerson: { low: 40, typical: 55, high: 80 },
    });

    const { options } = buildFlightOptions([drive], intake, today);
    expect(options[0].mode).toBe('car');
    expect(options[0].title).toBe('Own car');
    expect(options[0].costCents).toBeGreaterThan(0);
  });

  it('counts layovers into the total and flags a tight connection', () => {
    const connecting = route({
      legs: [
        {
          fromIata: 'ORD',
          toIata: 'ICN',
          departLocal: '2026-10-12T13:00',
          arriveLocal: '2026-10-13T16:55',
          durationMinutes: 835,
        },
        {
          fromIata: 'ICN',
          toIata: 'NRT',
          departLocal: '2026-10-13T17:45',
          arriveLocal: '2026-10-13T20:00',
          durationMinutes: 135,
        },
      ],
      layoverMinutes: [50],
    });

    const { options, warnings } = buildFlightOptions([connecting], intake, today);
    expect(options[0].stops).toBe(1);
    expect(options[0].totalDurationMinutes).toBe(835 + 135 + 50);
    expect(options[0].title).toBe('United Airlines via ICN');
    expect(warnings.some((w) => w.includes('under an hour'))).toBe(true);
  });

  it('assumes a connection time when the model omits it, and says so', () => {
    const connecting = route({
      legs: [
        {
          fromIata: 'ORD',
          toIata: 'ICN',
          departLocal: '2026-10-12T13:00',
          arriveLocal: '2026-10-13T16:55',
          durationMinutes: 835,
        },
        {
          fromIata: 'ICN',
          toIata: 'NRT',
          departLocal: '2026-10-13T18:25',
          arriveLocal: '2026-10-13T20:40',
          durationMinutes: 135,
        },
      ],
      layoverMinutes: undefined,
    });

    const { options, warnings } = buildFlightOptions([connecting], intake, today);
    expect(warnings.some((w) => w.includes('assumed'))).toBe(true);
    expect(options[0].confidence).toBe('low');
  });

  it('never reports a total shorter than the time in the air', () => {
    const { options } = buildFlightOptions([route({ layoverMinutes: [] })], intake, today);
    const flying = options[0].legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
    expect(options[0].totalDurationMinutes).toBeGreaterThanOrEqual(flying);
  });

  it('gives each routing a distinct id', () => {
    const { options } = buildFlightOptions([route(), route(), route()], intake, today);
    expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
  });

  it('lists outbound before return, cheapest first within each', () => {
    const cheapOut = route({ fareBandUsdPerPerson: { low: 400, typical: 500, high: 700 } });
    const dearOut = route({ carrier: 'ANA', fareBandUsdPerPerson: { low: 900, typical: 1100, high: 1500 } });
    const back = route({
      direction: 'return',
      carrier: 'Korean Air',
      legs: [
        {
          fromIata: 'NRT',
          toIata: 'ORD',
          departLocal: '2026-10-17T15:45',
          arriveLocal: '2026-10-17T13:40',
          durationMinutes: 715,
        },
      ],
    });

    const { options } = buildFlightOptions([dearOut, back, cheapOut], intake, today);
    expect(options.map((option) => option.direction)).toEqual(['outbound', 'outbound', 'return']);
    expect(options[0].costCents).toBeLessThan(options[1].costCents);
  });

  it('warns when a whole direction came back unusable', () => {
    const { warnings } = buildFlightOptions([route()], intake, today);
    expect(warnings.some((w) => w.includes('no usable return'))).toBe(true);
  });
});

function activity(overrides: Partial<RawActivity> = {}): RawActivity {
  return {
    name: 'Tokyo National Museum',
    category: 'museum',
    neighborhood: 'Ueno',
    description: 'Samurai armour and Buddhist sculpture, with a quiet garden behind the main hall.',
    costUsdPerPerson: 6.5,
    durationMinutes: 150,
    openingHours: { mon: null, tue: [{ open: '09:30', close: '17:00' }] },
    bookingRequired: false,
    interests: ['history', 'tourist'],
    bestTimeOfDay: 'morning',
    confidence: 'medium',
    ...overrides,
  };
}

describe('buildActivityOptions', () => {
  it('charges per person and multiplies out to the party', () => {
    const { options } = buildActivityOptions([activity()], intake, budget);
    expect(options[0].costCents).toBe(650 * intake.travelers);
    expect(options[0].costBasis).toBe('per_person');
  });

  it('bills a restaurant to food and a museum to activities', () => {
    const { options } = buildActivityOptions(
      [activity(), activity({ name: 'Ichiran', category: 'restaurant' })],
      intake,
      budget,
    );
    expect(options.find((o) => o.category === 'museum')?.bucket).toBe('activities');
    expect(options.find((o) => o.category === 'restaurant')?.bucket).toBe('food');
  });

  it('fills in every weekday, leaving unmentioned days closed', () => {
    const { options } = buildActivityOptions([activity()], intake, budget);
    for (const day of DAY_KEYS) {
      expect(options[0].openingHours).toHaveProperty(day);
    }
    expect(options[0].openingHours.mon).toBeNull();
    expect(options[0].openingHours.wed).toBeNull();
    expect(options[0].openingHours.tue).toEqual([{ open: '09:30', close: '17:00' }]);
  });

  it('accepts long weekday names and unpadded or 12-hour times', () => {
    const loose = activity({
      openingHours: {
        Monday: [{ open: '9:00', close: '5:30pm' }],
        TUE: [{ open: '10am', close: '18:00' }],
      },
    });
    const { options } = buildActivityOptions([loose], intake, budget);
    expect(options[0].openingHours.mon).toEqual([{ open: '09:00', close: '17:30' }]);
    expect(options[0].openingHours.tue).toEqual([{ open: '10:00', close: '18:00' }]);
  });

  it('clips a window that runs past midnight into the same day', () => {
    const bar = activity({
      category: 'nightlife',
      openingHours: { fri: [{ open: '17:00', close: '02:00' }] },
    });
    const { options } = buildActivityOptions([bar], intake, budget);
    expect(options[0].openingHours.fri).toEqual([{ open: '17:00', close: '23:59' }]);
  });

  it('drops a venue with no usable hours rather than inventing them', () => {
    const { options, warnings } = buildActivityOptions(
      [activity({ openingHours: {} })],
      intake,
      budget,
    );
    expect(options).toHaveLength(0);
    expect(warnings.some((w) => w.includes('no usable opening hours'))).toBe(true);
  });

  it('drops a price absurd against the budget', () => {
    const { options, warnings } = buildActivityOptions(
      [activity({ costUsdPerPerson: 1999 })],
      intake,
      budget,
    );
    expect(options).toHaveLength(0);
    expect(warnings.some((w) => w.includes('beyond the budget'))).toBe(true);
  });

  it('keeps only closed dates that fall inside the trip', () => {
    const { options } = buildActivityOptions(
      [activity({ closedDates: ['2026-10-14', '2027-01-01'] })],
      intake,
      budget,
    );
    expect(options[0].closedDates).toEqual(['2026-10-14']);
  });

  it('trims an overlong description to fit the contract', () => {
    const { options } = buildActivityOptions(
      [activity({ description: 'x'.repeat(390) })],
      intake,
      budget,
    );
    expect(options[0].description.length).toBeLessThanOrEqual(240);
  });

  it('drops a duplicate venue and says how many', () => {
    const { options, warnings } = buildActivityOptions(
      [activity(), activity({ name: 'tokyo national museum' })],
      intake,
      budget,
    );
    expect(options).toHaveLength(1);
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  it('warns when a requested interest went unmatched', () => {
    const { warnings } = buildActivityOptions([activity()], intake, budget);
    expect(warnings.some((w) => w.includes('food'))).toBe(true);
  });

  it('treats a free venue as free rather than dropping it', () => {
    const { options } = buildActivityOptions(
      [activity({ name: 'Meiji Jingu', costUsdPerPerson: 0 })],
      intake,
      budget,
    );
    expect(options[0].costCents).toBe(0);
  });
});

function lodging(overrides: Partial<RawLodging> = {}): RawLodging {
  return {
    name: 'Hotel Gracery Shinjuku',
    type: 'hotel',
    tier: 'mid',
    nightlyUsdForParty: 135,
    neighborhood: 'Shinjuku',
    description: 'Mid-size soundproofed rooms in Kabukicho, five minutes from the station.',
    confidence: 'medium',
    ...overrides,
  };
}

describe('buildLodgingOptions', () => {
  it('multiplies the nightly rate by the nights of the trip', () => {
    const { options } = buildLodgingOptions([lodging()], intake);
    expect(options[0].nights).toBe(5);
    expect(options[0].nightlyCents).toBe(13_500);
    expect(options[0].costCents).toBe(13_500 * 5);
  });

  it('sorts cheapest first', () => {
    const { options } = buildLodgingOptions(
      [
        lodging({ name: 'Park Hyatt', nightlyUsdForParty: 550, tier: 'premium' }),
        lodging({ name: 'Nine Hours', nightlyUsdForParty: 58, tier: 'budget' }),
        lodging(),
      ],
      intake,
    );
    expect(options.map((option) => option.title)).toEqual([
      'Nine Hours',
      'Hotel Gracery Shinjuku',
      'Park Hyatt',
    ]);
  });

  it('warns when the comfort range came back thin', () => {
    const { warnings } = buildLodgingOptions([lodging(), lodging({ name: 'Another' })], intake);
    expect(warnings.some((w) => w.includes('comfort tier'))).toBe(true);
  });

  it('caps the amenity list', () => {
    const { options } = buildLodgingOptions(
      [lodging({ amenities: Array.from({ length: 14 }, (_, i) => `thing ${i}`) })],
      intake,
    );
    expect(options[0].amenities.length).toBeLessThanOrEqual(12);
  });
});

/**
 * The demo safety net. A user with no key, a wrong base URL, or an endpoint that is
 * down must still get a usable trip — never an error page. Port 1 refuses instantly,
 * so this exercises the failure path without touching the real API.
 */
describe('falling back when research cannot run', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('serves the sample trip when no key is configured', async () => {
    process.env.K2_MODE = 'live';
    delete process.env.IFM_API_KEY;
    delete process.env.IFM_BASE_URL;

    const result = await researchFlights(intake);
    expect(result.meta.source).toBe('fixture');
    expect(result.options.length).toBeGreaterThan(0);
  });

  it('serves the sample trip when the endpoint refuses the connection', async () => {
    process.env.K2_MODE = 'live';
    process.env.IFM_API_KEY = 'probe-only-not-a-real-key';
    process.env.IFM_BASE_URL = 'http://127.0.0.1:1/v1';

    const result = await researchLodging(intake, budget);
    expect(result.meta.source).toBe('fixture');
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.meta.warnings.join(' ')).toContain('served sample data');
  });

  it('says why it fell back, so the reason is visible in the UI', async () => {
    process.env.K2_MODE = 'live';
    process.env.IFM_API_KEY = 'probe-only-not-a-real-key';
    process.env.IFM_BASE_URL = 'http://127.0.0.1:1/v1';

    const result = await researchActivities(intake, budget);
    expect(result.meta.warnings[0]).toMatch(/failed/i);
  });

  it('rescales the sample stay to the nights actually requested', async () => {
    const longer = { ...intake, endDate: '2026-10-21' };
    const result = await researchLodging(longer, budget);
    expect(result.options.every((stay) => stay.nights === 9)).toBe(true);
    expect(result.options[0].costCents).toBe(result.options[0].nightlyCents * 9);
  });

  it('rescales local transport to the days on the ground', async () => {
    const result = await researchTransit({ ...intake, endDate: '2026-10-15' });
    expect(result.options.every((option) => option.days === 3)).toBe(true);
    expect(result.options[0].costCents).toBe(result.options[0].perDayCents * 3);
  });
});

/**
 * From a live Reykjavik reply that tagged every hike "outdoor" and "nature". The
 * strict enum rejected each one, so a hiking trip came back with no hiking.
 */
describe('interest tags the model invented', () => {
  it('maps outdoor and nature onto hiking instead of dropping the venue', () => {
    const hike = activity({
      name: 'Reykjadalur hot spring trail',
      category: 'outdoor',
      interests: ['outdoor', 'nature'] as never,
    });
    const { options } = buildActivityOptions([hike], intake, budget);

    expect(options).toHaveLength(1);
    expect(options[0].interests).toEqual(['hiking']);
  });

  it('reads sightseeing as tourist and cultural as history', () => {
    const { options } = buildActivityOptions(
      [activity({ interests: ['sightseeing', 'cultural'] as never })],
      intake,
      budget,
    );
    expect(options[0].interests).toEqual(['tourist', 'history']);
  });

  it('tolerates spacing and capitalisation', () => {
    const { options } = buildActivityOptions(
      [activity({ interests: ['Family Friendly', ' ART '] as never })],
      intake,
      budget,
    );
    expect(options[0].interests).toEqual(['family', 'art']);
  });

  it('falls back to what the category implies when no tag is recognisable', () => {
    const { options } = buildActivityOptions(
      [activity({ category: 'restaurant', interests: ['gourmet_experience'] as never })],
      intake,
      budget,
    );
    expect(options[0].interests).toEqual(['food']);
  });

  it('does not repeat an interest reached by two different words', () => {
    const { options } = buildActivityOptions(
      [activity({ interests: ['museum', 'heritage', 'history'] as never })],
      intake,
      budget,
    );
    expect(options[0].interests).toEqual(['history']);
  });

  it('keeps a venue whose tags were already correct', () => {
    const { options } = buildActivityOptions(
      [activity({ interests: ['food', 'tourist'] as never })],
      intake,
      budget,
    );
    expect(options[0].interests).toEqual(['food', 'tourist']);
  });
});

/**
 * From a live Tokyo reply that returned twelve good hotels and kept two. The model
 * answers in whatever rating scale the source it is thinking of uses — 8.7 out of ten
 * for one property, 4.4 out of five for the next — and the five-point cap rejected
 * every one that overshot.
 */
describe('ratings on whatever scale the model felt like', () => {
  it('halves a ten-point rating instead of dropping the property', () => {
    const { options } = buildLodgingOptions([lodging({ rating: 8.6 })], intake);
    expect(options).toHaveLength(1);
    expect(options[0].rating).toBe(4.3);
  });

  it('leaves a five-point rating alone', () => {
    const { options } = buildLodgingOptions([lodging({ rating: 4.4 })], intake);
    expect(options[0].rating).toBe(4.4);
  });

  it('reads a percentage as a percentage', () => {
    const { options } = buildLodgingOptions([lodging({ rating: 92 })], intake);
    expect(options[0].rating).toBe(4.6);
  });

  it('keeps the property when the rating is nonsense, just without one', () => {
    const { options } = buildLodgingOptions([lodging({ rating: -3 })], intake);
    expect(options).toHaveLength(1);
    expect(options[0].rating).toBeUndefined();
  });

  it('applies the same conversion to activities', () => {
    const { options } = buildActivityOptions([activity({ rating: 9.2 })], intake, budget);
    expect(options[0].rating).toBe(4.6);
  });

  it('keeps a whole batch that answered in ten-point scale', () => {
    const batch = Array.from({ length: 12 }, (_, i) =>
      lodging({ name: `Hotel ${i}`, rating: 7 + i * 0.2 }),
    );
    const { options } = buildLodgingOptions(batch, intake);

    expect(options).toHaveLength(12);
    expect(options.every((stay) => (stay.rating ?? 0) <= 5)).toBe(true);
  });
});

/**
 * Two shapes the model produces that used to cost an option each. Mexico City was
 * returning four routings out of ten because six of them tripped one of these.
 */
describe('flight entries the model shapes oddly', () => {
  it('ignores an empty returnLegs on a one-way', () => {
    const tidy = { ...route(), returnLegs: [] as RawFlightRoute['legs'] };
    const { options } = buildFlightOptions([tidy], intake, today);

    expect(options).toHaveLength(1);
    expect(options[0].returnLegs).toBeUndefined();
  });

  it('reads a return journey the model filed under returnLegs', () => {
    const misfiled: RawFlightRoute = {
      ...route(),
      direction: 'return',
      legs: [],
      returnLegs: [
        {
          fromIata: 'NRT',
          toIata: 'ORD',
          departLocal: '2026-10-17T15:45',
          arriveLocal: '2026-10-17T13:40',
          durationMinutes: 715,
        },
      ],
    };

    const { options } = buildFlightOptions([misfiled], intake, today);
    expect(options).toHaveLength(1);
    expect(options[0].direction).toBe('return');
    expect(options[0].legs[0].from).toBe('NRT');
    expect(options[0].legs[0].departLocal.slice(0, 10)).toBe(intake.endDate);
  });

  it('still refuses a round trip with no way home', () => {
    const broken: RawFlightRoute = { ...route(), direction: 'roundtrip', returnLegs: [] };
    const { options, warnings } = buildFlightOptions([broken], intake, today);

    expect(options).toHaveLength(0);
    expect(warnings.some((w) => w.includes('no way home'))).toBe(true);
  });

  it('drops an entry with no journey in it at all', () => {
    const empty: RawFlightRoute = { ...route(), legs: [], returnLegs: [] };
    expect(buildFlightOptions([empty], intake, today).options).toHaveLength(0);
  });
});
