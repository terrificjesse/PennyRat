import { describe, expect, it } from 'vitest';
import { buildItinerary } from './pack';
import { minutesFromClock } from './hours';
import { fixtureIntake, fixtureOptions } from '../../fixtures';
import { itinerarySchema, type ActivityOption, type Itinerary, type TripOption } from '../types';

/**
 * The scheduler handed things no sensible UI would send it.
 *
 * The wizard gates most of this, but the route is public and the store can be edited
 * in devtools. Nothing here may throw, loop, or produce a plan that breaks its own
 * contract.
 */

const intake = fixtureIntake;

function minutes(value: string): number {
  return minutesFromClock(value.slice(11, 16));
}

/** Everything that must be true of any itinerary, whatever went in. */
function assertSound(itinerary: Itinerary, note: string): void {
  expect(itinerarySchema.safeParse(itinerary).success, `${note}: contract`).toBe(true);
  expect(itinerary.totalCents, `${note}: total`).toBeGreaterThanOrEqual(0);
  expect(itinerary.totalCents, `${note}: total is chosen plus suggested`).toBe(
    (itinerary.chosenCents ?? 0) + (itinerary.suggestedCents ?? 0),
  );

  for (const day of itinerary.days) {
    expect(day.daySpendCents, `${note}: ${day.date} spend`).toBeGreaterThanOrEqual(0);

    const ordered = [...day.blocks].sort((a, b) => minutes(a.start) - minutes(b.start));
    for (const block of ordered) {
      expect(block.start.slice(0, 10), `${note}: block on its own day`).toBe(day.date);
      expect(minutes(block.end), `${note}: ${block.title} ends after it starts`).toBeGreaterThan(
        minutes(block.start),
      );
    }

    for (let i = 1; i < ordered.length; i += 1) {
      expect(
        minutes(ordered[i].start),
        `${note}: ${ordered[i - 1].title} overlaps ${ordered[i].title} on ${day.date}`,
      ).toBeGreaterThanOrEqual(minutes(ordered[i - 1].end));
    }
  }

  const scheduled = itinerary.days.flatMap((day) => day.blocks.map((block) => block.refId));
  for (const miss of itinerary.unscheduled) {
    expect(scheduled, `${note}: ${miss.id} both placed and unscheduled`).not.toContain(miss.id);
    expect(miss.reason.length, `${note}: ${miss.id} needs a reason`).toBeGreaterThan(10);
  }
}

const activity = (id: string, patch: Partial<ActivityOption> = {}): ActivityOption => ({
  ...(fixtureOptions.find((o) => o.id === 'act_sensoji') as ActivityOption),
  id,
  ...patch,
});

describe('contradictory flight selections', () => {
  it('survives two outbound flights at once', () => {
    const plan = buildItinerary(intake, fixtureOptions, [
      'flt_out_ua_direct',
      'flt_out_ci_tpe',
      'flt_ret_ua_direct',
    ]);
    assertSound(plan, 'two outbound');
  });

  it('survives every flight in the catalogue selected together', () => {
    const all = fixtureOptions.filter((o) => o.kind === 'flight').map((o) => o.id);
    assertSound(buildItinerary(intake, fixtureOptions, all), 'all flights');
  });

  it('survives a return that leaves before the outbound lands', () => {
    const plan = buildItinerary(intake, fixtureOptions, [
      'flt_out_ci_tpe', // lands 13 Oct 12:45
      'flt_ret_nh_direct', // departs 17 Oct 10:55
      'lodg_fresa_ginza',
    ]);
    assertSound(plan, 'impossible pairing');
  });

  it('survives only a return flight, with no way of getting there', () => {
    assertSound(buildItinerary(intake, fixtureOptions, ['flt_ret_ua_direct']), 'return only');
  });
});

describe('trips of unreasonable shape', () => {
  it('handles a single night', () => {
    const plan = buildItinerary(
      { ...intake, startDate: '2026-10-12', endDate: '2026-10-13' },
      fixtureOptions,
      ['act_sensoji', 'lodg_fresa_ginza'],
    );
    expect(plan.days).toHaveLength(2);
    assertSound(plan, 'one night');
  });

  it('handles two months without slowing to a crawl', () => {
    const started = Date.now();
    const plan = buildItinerary(
      { ...intake, startDate: '2026-10-12', endDate: '2026-12-11' },
      fixtureOptions,
      fixtureOptions.map((option) => option.id),
    );

    expect(plan.days).toHaveLength(61);
    expect(Date.now() - started, 'should be milliseconds, not seconds').toBeLessThan(2000);
    assertSound(plan, 'sixty nights');
  });

  it('handles a party of twelve', () => {
    const plan = buildItinerary({ ...intake, travelers: 12 }, fixtureOptions, [
      'flt_out_ua_direct',
      'act_sensoji',
    ]);
    assertSound(plan, 'twelve travelers');
  });

  it('handles a budget of one cent', () => {
    const plan = buildItinerary({ ...intake, budgetTotal: 1 }, fixtureOptions, ['act_sensoji']);
    assertSound(plan, 'one cent');
  });
});

describe('options that are individually absurd', () => {
  it('places nothing for a venue closed every day of the trip', () => {
    const shut = activity('act_never_open', {
      openingHours: {
        sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null,
      },
    });
    const plan = buildItinerary(intake, [...fixtureOptions, shut], ['act_never_open']);

    expect(plan.unscheduled.map((miss) => miss.id)).toContain('act_never_open');
    assertSound(plan, 'never open');
  });

  it('places nothing for a venue whose closedDates swallow the trip', () => {
    const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
    const closed = activity('act_closed_all', { closedDates: dates });
    const plan = buildItinerary(intake, [...fixtureOptions, closed], ['act_closed_all']);

    const miss = plan.unscheduled.find((entry) => entry.id === 'act_closed_all');
    expect(miss?.reason).toMatch(/closed/);
    assertSound(plan, 'closed every date');
  });

  it('reports a twelve-hour visit that no day can hold', () => {
    const marathon = activity('act_marathon', {
      durationMinutes: 720,
      openingHours: {
        sun: [{ open: '09:00', close: '17:00' }],
        mon: [{ open: '09:00', close: '17:00' }],
        tue: [{ open: '09:00', close: '17:00' }],
        wed: [{ open: '09:00', close: '17:00' }],
        thu: [{ open: '09:00', close: '17:00' }],
        fri: [{ open: '09:00', close: '17:00' }],
        sat: [{ open: '09:00', close: '17:00' }],
      },
    });
    const plan = buildItinerary(intake, [...fixtureOptions, marathon], ['act_marathon']);

    expect(plan.unscheduled.map((miss) => miss.id)).toContain('act_marathon');
    assertSound(plan, 'twelve-hour visit');
  });

  it('survives a free option with no cost at all', () => {
    const plan = buildItinerary(intake, fixtureOptions, ['act_sensoji', 'act_meiji_jingu']);
    expect(plan.chosenCents).toBe(0);
    assertSound(plan, 'all free');
  });

  it('survives duplicate ids in the catalogue', () => {
    const doubled = [...fixtureOptions, ...fixtureOptions];
    assertSound(buildItinerary(intake, doubled, ['act_sensoji']), 'duplicated catalogue');
  });

  it('survives an empty catalogue with ids selected against it', () => {
    assertSound(buildItinerary(intake, [], ['act_sensoji', 'flt_out_ua_direct']), 'no catalogue');
  });
});

describe('every pace, every selection size', () => {
  for (const pace of ['relaxed', 'balanced', 'packed'] as const) {
    it(`holds together at a ${pace} pace with everything selected`, () => {
      const plan = buildItinerary(
        { ...intake, pace },
        fixtureOptions,
        fixtureOptions.map((option) => option.id),
      );
      assertSound(plan, pace);
    });
  }
});

/**
 * A deterministic sweep over random selections. The fixed seed means a failure is
 * reproducible; the point is to reach combinations nobody thought to write down.
 */
describe('random selections all produce a sound plan', () => {
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it('holds across two hundred random baskets', () => {
    const random = seeded(20261012);
    const ids = fixtureOptions.map((option) => option.id);

    for (let run = 0; run < 200; run += 1) {
      const picked = ids.filter(() => random() < 0.4);
      const pace = (['relaxed', 'balanced', 'packed'] as const)[Math.floor(random() * 3)];
      const travelers = 1 + Math.floor(random() * 6);

      const plan = buildItinerary({ ...intake, pace, travelers }, fixtureOptions, picked);

      assertSound(plan, `run ${run}`);

      const expected = fixtureOptions
        .filter((option) => picked.includes(option.id))
        .reduce((acc, option) => acc + option.costCents, 0);
      expect(plan.chosenCents, `run ${run}: chosen matches the basket`).toBe(expected);
    }
  });

  it('never schedules a venue outside its hours, across the sweep', () => {
    const random = seeded(77);
    const activities = fixtureOptions.filter(
      (option): option is ActivityOption => option.kind === 'activity',
    );
    const ids: TripOption[] = fixtureOptions;

    for (let run = 0; run < 60; run += 1) {
      const picked = ids.filter(() => random() < 0.6).map((option) => option.id);
      const plan = buildItinerary(intake, fixtureOptions, picked);

      for (const day of plan.days) {
        for (const block of day.blocks) {
          const venue = activities.find((option) => option.id === block.refId);
          if (!venue) continue;

          const key = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[
            new Date(`${day.date}T00:00:00Z`).getUTCDay()
          ];
          const windows = venue.openingHours[key];

          expect(windows, `run ${run}: ${venue.title} on a closed ${key}`).not.toBeNull();
          expect(venue.closedDates, `run ${run}: ${venue.title} on a closed date`).not.toContain(
            day.date,
          );
          expect(
            windows!.some(
              (window) =>
                minutesFromClock(window.open) <= minutes(block.start) &&
                minutesFromClock(window.close) >= minutes(block.end),
            ),
            `run ${run}: ${venue.title} outside its hours`,
          ).toBe(true);
        }
      }
    }
  });
});
