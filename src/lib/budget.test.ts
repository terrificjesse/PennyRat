import { describe, expect, it } from 'vitest';
import {
  allocateBuckets,
  applySelection,
  canSubmit,
  formatCents,
  parseDollarsToCents,
  setBucket,
  suggestFillers,
  tripDateRange,
  tripDays,
  tripNights,
} from './budget';
import { BUCKET_KEYS, type ActivityOption, type FlightOption, type LodgingOption, type TripIntake, type TripOption } from './types';

const intake: TripIntake = {
  origin: 'ORD',
  destination: 'Tokyo',
  startDate: '2026-10-12',
  endDate: '2026-10-17',
  travelers: 2,
  budgetTotal: 420_000,
  interests: ['food', 'tourist'],
  pace: 'balanced',
};

function flight(id: string, direction: 'outbound' | 'return', costCents: number): FlightOption {
  return {
    id,
    kind: 'flight',
    bucket: 'flights',
    title: `${direction} flight`,
    costCents,
    costBasis: 'per_party',
    estimated: true,
    confidence: 'medium',
    direction,
    legs: [
      {
        from: 'ORD',
        to: 'NRT',
        departLocal: '2026-10-12T11:00',
        arriveLocal: '2026-10-13T14:30',
        carrier: 'Test Air',
        durationMinutes: 810,
      },
    ],
    stops: 0,
    totalDurationMinutes: 810,
    cabin: 'economy',
    baggageIncluded: true,
  };
}

function lodging(id: string, costCents: number): LodgingOption {
  return {
    id,
    kind: 'lodging',
    bucket: 'lodging',
    title: 'Test hotel',
    costCents,
    costBasis: 'per_night',
    estimated: true,
    confidence: 'medium',
    type: 'hotel',
    tier: 'mid',
    nightlyCents: Math.round(costCents / 5),
    nights: 5,
    neighborhood: 'Shinjuku',
    description: 'A plain test hotel near the station.',
    amenities: [],
  };
}

function activity(id: string, costCents: number, bucket: 'activities' | 'food' = 'activities'): ActivityOption {
  return {
    id,
    kind: 'activity',
    bucket,
    title: `Activity ${id}`,
    costCents,
    costBasis: 'per_party',
    estimated: true,
    confidence: 'medium',
    category: bucket === 'food' ? 'restaurant' : 'museum',
    neighborhood: 'Ueno',
    description: 'Somewhere worth an afternoon of your time.',
    durationMinutes: 90,
    openingHours: {
      sun: [{ open: '09:00', close: '17:00' }],
      mon: null,
      tue: [{ open: '09:00', close: '17:00' }],
      wed: [{ open: '09:00', close: '17:00' }],
      thu: [{ open: '09:00', close: '17:00' }],
      fri: [{ open: '09:00', close: '17:00' }],
      sat: [{ open: '09:00', close: '17:00' }],
    },
    closedDates: [],
    bookingRequired: false,
    interests: ['tourist'],
    bestTimeOfDay: 'any',
  };
}

const catalog: TripOption[] = [
  flight('flt_out', 'outbound', 96_000),
  flight('flt_back', 'return', 94_000),
  lodging('lodg_a', 110_000),
  activity('act_a', 4_400),
  activity('act_b', 9_800),
  activity('act_food', 12_000, 'food'),
];

describe('trip dates', () => {
  it('counts nights and days the way a hotel bill does', () => {
    expect(tripNights(intake)).toBe(5);
    expect(tripDays(intake)).toBe(6);
  });

  it('enumerates every calendar day inclusive', () => {
    const range = tripDateRange(intake);
    expect(range).toHaveLength(6);
    expect(range[0]).toBe('2026-10-12');
    expect(range.at(-1)).toBe('2026-10-17');
  });
});

describe('allocateBuckets', () => {
  it('splits to exactly the total, never a cent more or less', () => {
    for (const budgetTotal of [1, 99, 100_000, 420_000, 1_337_777, 99_999_999]) {
      const plan = allocateBuckets({ ...intake, budgetTotal });
      const sum = BUCKET_KEYS.reduce((acc, key) => acc + plan[key], 0);
      expect(sum, `budget ${budgetTotal}`).toBe(budgetTotal);
    }
  });

  it('produces only whole non-negative cents', () => {
    const plan = allocateBuckets({ ...intake, budgetTotal: 333_333 });
    for (const key of BUCKET_KEYS) {
      expect(Number.isInteger(plan[key])).toBe(true);
      expect(plan[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it('shifts money from flights toward lodging on a longer trip', () => {
    const short = allocateBuckets({ ...intake, endDate: '2026-10-14' });
    const long = allocateBuckets({ ...intake, endDate: '2026-10-26' });
    expect(long.flights).toBeLessThan(short.flights);
    expect(long.lodging).toBeGreaterThan(short.lodging);
  });

  it('gives a larger party more food and less lodging', () => {
    const pair = allocateBuckets({ ...intake, travelers: 2 });
    const group = allocateBuckets({ ...intake, travelers: 6 });
    expect(group.food).toBeGreaterThan(pair.food);
    expect(group.lodging).toBeLessThan(pair.lodging);
  });
});

describe('setBucket', () => {
  it('keeps the plan summing to the total after a slider drag', () => {
    const plan = allocateBuckets(intake);
    const next = setBucket(plan, 'localTransit', 60_000, intake.budgetTotal);
    expect(next.localTransit).toBe(60_000);
    expect(BUCKET_KEYS.reduce((acc, key) => acc + next[key], 0)).toBe(intake.budgetTotal);
  });

  it('clamps a drag past the whole budget and zeroes the rest', () => {
    const plan = allocateBuckets(intake);
    const next = setBucket(plan, 'flights', intake.budgetTotal * 2, intake.budgetTotal);
    expect(next.flights).toBe(intake.budgetTotal);
    expect(BUCKET_KEYS.reduce((acc, key) => acc + next[key], 0)).toBe(intake.budgetTotal);
  });
});

describe('applySelection', () => {
  const plan = allocateBuckets(intake);

  it('returns the exact starting remainder after checking then unchecking', () => {
    const before = applySelection(plan, intake.budgetTotal, catalog, []);
    const ids = catalog.map((option) => option.id);
    const during = applySelection(plan, intake.budgetTotal, catalog, ids);
    const after = applySelection(plan, intake.budgetTotal, catalog, []);

    expect(during.remainingTotal).not.toBe(before.remainingTotal);
    expect(after.remainingTotal).toBe(before.remainingTotal);
    expect(after.remainingTotal).toBe(intake.budgetTotal);
    expect(after.spentTotal).toBe(0);
  });

  it('survives many toggles without drift', () => {
    const ids = catalog.map((option) => option.id);
    let selected: string[] = [];
    for (let round = 0; round < 50; round += 1) {
      const id = ids[round % ids.length];
      selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
      const state = applySelection(plan, intake.budgetTotal, catalog, selected);
      expect(Number.isInteger(state.remainingTotal)).toBe(true);
      expect(state.spentTotal + state.remainingTotal).toBe(intake.budgetTotal);
    }
  });

  it('bills restaurants to food and museums to activities', () => {
    const state = applySelection(plan, intake.budgetTotal, catalog, ['act_food', 'act_a']);
    expect(state.perBucket.food.spent).toBe(12_000);
    expect(state.perBucket.activities.spent).toBe(4_400);
  });

  it('flags an over-spent bucket without declaring the whole trip over', () => {
    const tight = { ...plan, activities: 1_000 };
    const state = applySelection(tight, intake.budgetTotal, catalog, ['act_b']);
    expect(state.overBuckets).toContain('activities');
    expect(state.overTotal).toBe(false);
  });

  it('ignores ids that are not in the catalog', () => {
    const state = applySelection(plan, intake.budgetTotal, catalog, ['nope_1']);
    expect(state.spentTotal).toBe(0);
  });
});

describe('canSubmit', () => {
  const complete = ['flt_out', 'flt_back', 'lodg_a', 'act_a'];

  it('passes with nothing to say once the trip is whole and affordable', () => {
    const check = canSubmit(intake, catalog, complete);
    expect(check.ok).toBe(true);
    expect(check.blockers).toEqual([]);
    expect(check.warnings).toEqual([]);
  });

  /**
   * Somebody driving to the coast, or staying with family, still has a trip worth
   * planning. Missing travel or a missing bed is worth saying and not worth stopping
   * for — only spending money you do not have is a real blocker.
   */
  it('warns about a missing flight home without stopping the trip', () => {
    const check = canSubmit(intake, catalog, ['flt_out', 'lodg_a', 'act_a']);
    expect(check.ok).toBe(true);
    expect(check.blockers).toEqual([]);
    expect(check.warnings.join(' ')).toContain('flight home');
  });

  it('warns about a missing bed without stopping the trip', () => {
    const check = canSubmit(intake, catalog, ['flt_out', 'flt_back', 'act_a']);
    expect(check.ok).toBe(true);
    expect(check.warnings.join(' ')).toMatch(/stay/i);
  });

  it('collects every warning at once when almost nothing is picked', () => {
    const check = canSubmit(intake, catalog, []);
    expect(check.ok).toBe(true);
    expect(check.warnings).toHaveLength(4);
    expect(check.blockers).toEqual([]);
  });

  it('blocks only on money, which is the one thing it cannot let pass', () => {
    const check = canSubmit({ ...intake, budgetTotal: 50_000 }, catalog, complete);
    expect(check.ok).toBe(false);
    expect(check.blockers).toHaveLength(1);
    expect(check.blockers[0]).toContain('over budget');
  });

  it('treats a round trip as covering both directions', () => {
    const roundTrip = { ...flight('flt_rt', 'outbound', 180_000), direction: 'roundtrip' as const };
    const check = canSubmit(intake, [...catalog, roundTrip], ['flt_rt', 'lodg_a', 'act_a']);

    expect(check.warnings.join(' ')).not.toContain('flight out');
    expect(check.warnings.join(' ')).not.toContain('flight home');
  });

  it('allows a bucket to be over as long as the total is not', () => {
    const check = canSubmit(intake, catalog, [...complete, 'act_b', 'act_food']);
    expect(check.ok).toBe(true);
  });
});

describe('suggestFillers', () => {
  it('offers the priciest unselected activity that still fits', () => {
    const fillers = suggestFillers(catalog, ['flt_out'], 10_000);
    expect(fillers[0]?.id).toBe('act_b');
    expect(fillers.every((option) => option.costCents <= 10_000)).toBe(true);
  });

  it('offers nothing when there is nothing left to spend', () => {
    expect(suggestFillers(catalog, [], 0)).toEqual([]);
  });

  it('never re-offers something already checked', () => {
    const fillers = suggestFillers(catalog, ['act_b'], 50_000);
    expect(fillers.map((option) => option.id)).not.toContain('act_b');
  });
});

describe('money formatting', () => {
  it('drops cents on whole dollars and keeps them otherwise', () => {
    expect(formatCents(420_000)).toBe('$4,200');
    expect(formatCents(4_450)).toBe('$44.50');
    expect(formatCents(0)).toBe('$0');
  });

  it('round-trips typed dollar amounts', () => {
    expect(parseDollarsToCents('2,400')).toBe(240_000);
    expect(parseDollarsToCents('$1200.50')).toBe(120_050);
    expect(parseDollarsToCents('0')).toBe(0);
  });

  it('rejects junk instead of guessing', () => {
    expect(parseDollarsToCents('abc')).toBeNull();
    expect(parseDollarsToCents('12.345')).toBeNull();
    expect(parseDollarsToCents('')).toBeNull();
  });
});

/**
 * Money at the edges. Integer cents make most of this safe, but the allocator divides
 * and the gate compares, and both have to hold at values a user can actually type.
 */
describe('budgets at the extremes', () => {
  it('splits a single cent without losing or inventing one', () => {
    const plan = allocateBuckets({ ...intake, budgetTotal: 1 });
    expect(BUCKET_KEYS.reduce((acc, key) => acc + plan[key], 0)).toBe(1);
    expect(BUCKET_KEYS.every((key) => plan[key] >= 0)).toBe(true);
  });

  it('splits a budget that cannot divide evenly six ways', () => {
    for (const total of [7, 13, 101, 999_999_997]) {
      const plan = allocateBuckets({ ...intake, budgetTotal: total });
      expect(BUCKET_KEYS.reduce((acc, key) => acc + plan[key], 0), `total ${total}`).toBe(total);
    }
  });

  it('keeps every bucket a whole number for a large budget', () => {
    const plan = allocateBuckets({ ...intake, budgetTotal: 50_000_000 });
    expect(BUCKET_KEYS.every((key) => Number.isSafeInteger(plan[key]))).toBe(true);
  });

  it('holds the total when a slider is dragged to either end', () => {
    const plan = allocateBuckets(intake);
    for (const key of BUCKET_KEYS) {
      for (const value of [0, intake.budgetTotal]) {
        const next = setBucket(plan, key, value, intake.budgetTotal);
        expect(
          BUCKET_KEYS.reduce((acc, bucket) => acc + next[bucket], 0),
          `${key} at ${value}`,
        ).toBe(intake.budgetTotal);
      }
    }
  });

  it('survives a slider drag on a one-cent budget', () => {
    const total = 1;
    const plan = allocateBuckets({ ...intake, budgetTotal: total });
    const next = setBucket(plan, 'flights', 1, total);
    expect(BUCKET_KEYS.reduce((acc, key) => acc + next[key], 0)).toBe(total);
  });

  it('blocks submission when a single cent over', () => {
    const spent = catalog.reduce((acc, option) => acc + option.costCents, 0);
    const check = canSubmit(
      { ...intake, budgetTotal: spent - 1 },
      catalog,
      catalog.map((option) => option.id),
    );
    expect(check.ok).toBe(false);
    expect(check.blockers[0]).toContain('$0.01');
  });

  it('allows submission at exactly the budget', () => {
    const required = ['flt_out', 'flt_back', 'lodg_a', 'act_a'];
    const spent = catalog
      .filter((option) => required.includes(option.id))
      .reduce((acc, option) => acc + option.costCents, 0);

    expect(canSubmit({ ...intake, budgetTotal: spent }, catalog, required).ok).toBe(true);
  });

  it('never suggests a filler that would push the trip over', () => {
    for (const remaining of [0, 1, 4_399, 4_400, 100_000]) {
      for (const filler of suggestFillers(catalog, [], remaining)) {
        expect(filler.costCents, `remaining ${remaining}`).toBeLessThanOrEqual(remaining);
      }
    }
  });

  it('formats a cent and a large sum without mangling either', () => {
    expect(formatCents(1)).toBe('$0.01');
    expect(formatCents(99)).toBe('$0.99');
    expect(formatCents(50_000_000)).toBe('$500,000');
  });

  it('refuses dollar input that would silently lose precision', () => {
    expect(parseDollarsToCents('1.999')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
    expect(parseDollarsToCents('1e5')).toBeNull();
    expect(parseDollarsToCents('  ')).toBeNull();
  });
});
