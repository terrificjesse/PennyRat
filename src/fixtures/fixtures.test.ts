import { describe, expect, it } from 'vitest';
import {
  fixtureActivities,
  fixtureFlights,
  fixtureIntake,
  fixtureLodging,
  fixtureOptions,
  fixtureTransit,
} from './index';
import { allocateBuckets, applySelection, canSubmit, tripDateRange } from '@/lib/budget';
import { DAY_KEYS, INTERESTS } from '@/lib/types';

describe('fixture data satisfies the contract', () => {
  it('parses every file through its schema', () => {
    expect(fixtureFlights.length).toBeGreaterThanOrEqual(8);
    expect(fixtureActivities.length).toBeGreaterThanOrEqual(14);
    expect(fixtureLodging.length).toBeGreaterThanOrEqual(10);
    expect(fixtureTransit.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every option a unique, correctly prefixed id', () => {
    const ids = fixtureOptions.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of fixtureOptions) {
      const prefix = { flight: 'flt_', activity: 'act_', lodging: 'lodg_', transit: 'tr_' }[
        option.kind
      ];
      expect(option.id.startsWith(prefix), `${option.id} needs prefix ${prefix}`).toBe(true);
    }
  });
});

describe('flight fixtures', () => {
  it('reports stops consistent with the number of legs', () => {
    for (const flight of fixtureFlights) {
      expect(flight.stops, flight.id).toBe(flight.legs.length - 1);
    }
  });

  it('chains legs so each departure follows the previous arrival', () => {
    for (const flight of fixtureFlights) {
      for (let i = 1; i < flight.legs.length; i += 1) {
        expect(flight.legs[i].from, flight.id).toBe(flight.legs[i - 1].to);
      }
    }
  });

  it('never claims a total shorter than the flying time', () => {
    for (const flight of fixtureFlights) {
      const flying = flight.legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
      expect(flight.totalDurationMinutes, flight.id).toBeGreaterThanOrEqual(flying);
    }
  });

  it('offers both directions, and both nonstop and connecting choices', () => {
    const outbound = fixtureFlights.filter((f) => f.direction === 'outbound');
    const ret = fixtureFlights.filter((f) => f.direction === 'return');
    expect(outbound.length).toBeGreaterThanOrEqual(4);
    expect(ret.length).toBeGreaterThanOrEqual(4);
    for (const group of [outbound, ret]) {
      expect(group.some((f) => f.stops === 0)).toBe(true);
      expect(group.some((f) => f.stops > 0)).toBe(true);
    }
  });

  it('departs outbound on the start date and returns on the end date', () => {
    for (const flight of fixtureFlights) {
      const depart = flight.legs[0].departLocal.slice(0, 10);
      const expected =
        flight.direction === 'return' ? fixtureIntake.endDate : fixtureIntake.startDate;
      expect(depart, flight.id).toBe(expected);

      // A round trip carries the way home itself, and that leaves on the last day.
      if (flight.direction === 'roundtrip') {
        expect(flight.returnLegs, flight.id).toBeDefined();
        expect(flight.returnLegs![0].departLocal.slice(0, 10)).toBe(fixtureIntake.endDate);
      }
    }
  });

  it('offers a round trip that undercuts buying the two one-ways', () => {
    const cheapest = (list: typeof fixtureFlights) =>
      Math.min(...list.map((flight) => flight.costCents));

    const pair =
      cheapest(fixtureFlights.filter((f) => f.direction === 'outbound')) +
      cheapest(fixtureFlights.filter((f) => f.direction === 'return'));
    const roundTrips = fixtureFlights.filter((f) => f.direction === 'roundtrip');

    expect(roundTrips.length).toBeGreaterThanOrEqual(1);
    expect(cheapest(roundTrips)).toBeLessThan(pair);
  });
});

describe('activity fixtures', () => {
  it('describes all seven weekdays for every venue', () => {
    for (const activity of fixtureActivities) {
      for (const day of DAY_KEYS) {
        expect(activity.openingHours, `${activity.id} missing ${day}`).toHaveProperty(day);
      }
    }
  });

  it('never closes a window before it opens', () => {
    for (const activity of fixtureActivities) {
      for (const day of DAY_KEYS) {
        for (const window of activity.openingHours[day] ?? []) {
          expect(window.close > window.open, `${activity.id} ${day}`).toBe(true);
        }
      }
    }
  });

  it('covers every interest the intake form can offer', () => {
    const covered = new Set(fixtureActivities.flatMap((activity) => activity.interests));
    expect([...INTERESTS].filter((interest) => !covered.has(interest))).toEqual([]);
  });

  it('spreads across price bands so the budget has room to move', () => {
    const cheap = fixtureActivities.filter((a) => a.costCents < 1500);
    const mid = fixtureActivities.filter((a) => a.costCents >= 1500 && a.costCents < 5000);
    const splurge = fixtureActivities.filter((a) => a.costCents >= 5000);
    expect(cheap.length).toBeGreaterThanOrEqual(3);
    expect(mid.length).toBeGreaterThanOrEqual(5);
    expect(splurge.length).toBeGreaterThanOrEqual(2);
  });

  it('bills restaurants to food and everything else to activities', () => {
    for (const activity of fixtureActivities) {
      const expected = activity.category === 'restaurant' ? 'food' : 'activities';
      expect(activity.bucket, activity.id).toBe(expected);
    }
  });

  it('includes venues that close on a weekday, so the scheduler has to care', () => {
    const withClosures = fixtureActivities.filter((activity) =>
      DAY_KEYS.some((day) => activity.openingHours[day] === null),
    );
    expect(withClosures.length).toBeGreaterThanOrEqual(4);
  });

  it('notes sensory conditions wherever it claims to be sensory friendly', () => {
    for (const activity of fixtureActivities) {
      if (activity.interests.includes('sensory_friendly')) {
        expect(activity.sensoryNotes, activity.id).toBeTruthy();
      }
    }
  });
});

describe('lodging and transit fixtures', () => {
  it('multiplies nightly rates out correctly', () => {
    for (const stay of fixtureLodging) {
      expect(stay.costCents, stay.id).toBe(stay.nightlyCents * stay.nights);
    }
  });

  it('multiplies per-day transit costs out correctly', () => {
    for (const option of fixtureTransit) {
      expect(option.costCents, option.id).toBe(option.perDayCents * option.days);
    }
  });

  it('offers all four comfort tiers', () => {
    const tiers = new Set(fixtureLodging.map((stay) => stay.tier));
    expect([...tiers].sort()).toEqual(['budget', 'comfort', 'mid', 'premium']);
  });

  it('spans hostels through boutique hotels', () => {
    const types = new Set(fixtureLodging.map((stay) => stay.type));
    for (const type of ['hostel', 'hotel', 'airbnb', 'boutique']) {
      expect(types.has(type as never), `missing ${type}`).toBe(true);
    }
  });

  it('books lodging for the nights actually spent in the city', () => {
    const nights = new Set(fixtureLodging.map((stay) => stay.nights));
    expect(nights.size).toBe(1);
  });
});

describe('the sample trip is actually completable', () => {
  it('spans six calendar days', () => {
    expect(tripDateRange(fixtureIntake)).toHaveLength(6);
  });

  it('has at least one in-budget combination that passes the submit gate', () => {
    const cheapest = <T extends { costCents: number }>(list: T[]) =>
      [...list].sort((a, b) => a.costCents - b.costCents)[0];

    const picks = [
      cheapest(fixtureFlights.filter((f) => f.direction === 'outbound')),
      cheapest(fixtureFlights.filter((f) => f.direction === 'return')),
      cheapest(fixtureLodging),
      cheapest(fixtureActivities),
      cheapest(fixtureTransit),
    ].map((option) => option.id);

    const check = canSubmit(fixtureIntake, fixtureOptions, picks);
    expect(check.reasons).toEqual([]);
    expect(check.ok).toBe(true);

    const state = applySelection(
      allocateBuckets(fixtureIntake),
      fixtureIntake.budgetTotal,
      fixtureOptions,
      picks,
    );
    expect(state.remainingTotal).toBeGreaterThan(0);
  });

  it('cannot be completed by picking the most expensive of everything', () => {
    const priciest = <T extends { costCents: number }>(list: T[]) =>
      [...list].sort((a, b) => b.costCents - a.costCents)[0];

    const picks = [
      priciest(fixtureFlights.filter((f) => f.direction === 'outbound')),
      priciest(fixtureFlights.filter((f) => f.direction === 'return')),
      priciest(fixtureLodging),
    ].map((option) => option.id);

    expect(canSubmit(fixtureIntake, fixtureOptions, picks).ok).toBe(false);
  });
});

/**
 * The sample trip has to survive a live demo, which is a harder bar than being
 * arithmetically completable.
 *
 * Research prices the real world, and the real world is dearer than the bundled
 * sample: live ORD-to-Tokyo fares came back between $1,900 and $2,800 for a party of
 * two, making the cheapest round trip $3,900 where the fixture's cheapest is $2,330.
 * A budget tuned to the fixtures alone leaves a demo picking a hostel and free
 * temples. These lock in the headroom.
 */
describe('the sample budget stands up to live prices', () => {
  /** The cheapest round trip live research actually returned for this pair. */
  const OBSERVED_LIVE_ROUND_TRIP = 390_000;

  const cheapest = <T extends { costCents: number }>(list: T[]) =>
    [...list].sort((a, b) => a.costCents - b.costCents)[0];

  it('covers a real round trip with room left for the rest of the trip', () => {
    const left = fixtureIntake.budgetTotal - OBSERVED_LIVE_ROUND_TRIP;

    // Enough for a mid-tier bed, local transport and a week of eating and doing.
    expect(left).toBeGreaterThanOrEqual(150_000);
  });

  it('affords a mid-tier stay rather than only the cheapest bed', () => {
    const byPrice = [...fixtureLodging].sort((a, b) => a.costCents - b.costCents);
    const midTier = byPrice[Math.floor(byPrice.length / 2)];
    const transit = cheapest(fixtureTransit);

    const committed = OBSERVED_LIVE_ROUND_TRIP + midTier.costCents + transit.costCents;
    expect(committed).toBeLessThan(fixtureIntake.budgetTotal);
  });

  it('leaves enough after flights and a bed for a proper week of doing things', () => {
    const midTier = [...fixtureLodging].sort((a, b) => a.costCents - b.costCents)[
      Math.floor(fixtureLodging.length / 2)
    ];
    const spare =
      fixtureIntake.budgetTotal - OBSERVED_LIVE_ROUND_TRIP - midTier.costCents;

    // The ten cheapest things to do, which is a full itinerary at a balanced pace.
    const tenThings = [...fixtureActivities]
      .sort((a, b) => a.costCents - b.costCents)
      .slice(0, 10)
      .reduce((acc, option) => acc + option.costCents, 0);

    expect(spare).toBeGreaterThan(tenThings);
  });

  it('still cannot buy the most expensive of everything', () => {
    const priciest = <T extends { costCents: number }>(list: T[]) =>
      [...list].sort((a, b) => b.costCents - a.costCents)[0];

    const blowout =
      priciest(fixtureFlights.filter((f) => f.direction === 'outbound')).costCents +
      priciest(fixtureFlights.filter((f) => f.direction === 'return')).costCents +
      priciest(fixtureLodging).costCents;

    // If this ever flips, the budget stopped forcing a choice and the demo loses
    // the moment it is built around.
    expect(blowout).toBeGreaterThan(fixtureIntake.budgetTotal);
  });
});

/**
 * Map links are built from a search query rather than coordinates. `lat`/`lng` come back
 * empty on every researched venue because the model does not fill them, and one it
 * invents puts a pin in the sea.
 */
describe('every place can be found on a map', () => {
  it('gives each activity and stay a maps link', () => {
    for (const option of [...fixtureActivities, ...fixtureLodging]) {
      expect(option.mapsUrl, `${option.title} has no map link`).toBeTruthy();
      expect(option.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search/);
    }
  });

  it('puts the name and the city into the query', () => {
    const sensoji = fixtureActivities.find((option) => option.id === 'act_sensoji')!;
    const query = decodeURIComponent(new URL(sensoji.mapsUrl!).searchParams.get('query') ?? '');

    expect(query).toContain('Asakusa');
    expect(query).toContain('Tokyo');
  });

  it('does not rely on coordinates, which research never fills in', () => {
    expect(fixtureActivities.every((option) => option.lat === undefined)).toBe(true);
  });
});
