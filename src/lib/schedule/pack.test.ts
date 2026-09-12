import { describe, expect, it } from 'vitest';
import { buildItinerary } from './pack';
import { dayKeyFor, minutesFromClock } from './hours';
import {
  fixtureActivities,
  fixtureFlights,
  fixtureIntake,
  fixtureLodging,
  fixtureOptions,
  fixtureTransit,
} from '../../fixtures';
import type { ActivityOption, Itinerary, OpeningHours, TripIntake, TripOption } from '../types';

/**
 * The scheduler is the part of the app that is not allowed to be approximately right.
 * These lean on the real Tokyo sample data, which includes nine venues with a closed
 * weekday and a transpacific flight that lands the day after it departs.
 */

const intake = fixtureIntake;

const OUTBOUND = 'flt_out_ua_direct'; // departs 12 Oct 11:35, lands 13 Oct 14:40
const RETURN = 'flt_ret_ua_direct'; // departs 17 Oct 15:45
const STAY = 'lodg_fresa_ginza';

function plan(ids: string[], overrides: Partial<TripIntake> = {}): Itinerary {
  return buildItinerary({ ...intake, ...overrides }, fixtureOptions, ids);
}

function allBlocks(itinerary: Itinerary) {
  return itinerary.days.flatMap((day) => day.blocks.map((block) => ({ ...block, date: day.date })));
}

function blockFor(itinerary: Itinerary, refId: string) {
  return allBlocks(itinerary).find((block) => block.refId === refId);
}

function minutes(localDateTime: string): number {
  return minutesFromClock(localDateTime.slice(11, 16));
}

const base = [OUTBOUND, RETURN, STAY];

describe('the shape of the trip', () => {
  it('covers every calendar day of the trip, in order', () => {
    const itinerary = plan(base);
    expect(itinerary.days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
  });

  it('puts each flight on the day it departs, with the landing time in the note', () => {
    const itinerary = plan(base);

    const outbound = blockFor(itinerary, OUTBOUND)!;
    expect(outbound.date).toBe('2026-10-12');
    expect(outbound.kind).toBe('flight');
    expect(outbound.note).toContain('2026-10-13 14:40');

    expect(blockFor(itinerary, RETURN)!.date).toBe('2026-10-17');
  });

  it('reports a total that matches what the budget meter charged', () => {
    const ids = [...base, 'act_sensoji', 'act_ichiran', 'tr_subway_pass'];
    const expected = fixtureOptions
      .filter((option) => ids.includes(option.id))
      .reduce((acc, option) => acc + option.costCents, 0);

    // `chosenCents` is what the meter charged; `totalCents` also carries whatever the
    // planner added to fill the days out.
    expect(plan(ids).chosenCents).toBe(expected);
  });

  it('spreads lodging and local transport across the days they cover, to the cent', () => {
    const ids = [...base, 'tr_subway_pass'];
    const itinerary = plan(ids);
    const stay = fixtureLodging.find((option) => option.id === STAY)!;
    const transit = fixtureTransit.find((option) => option.id === 'tr_subway_pass')!;
    const flights = fixtureFlights
      .filter((option) => [OUTBOUND, RETURN].includes(option.id))
      .reduce((acc, option) => acc + option.costCents, 0);

    const summed = itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0);
    expect(summed).toBe(
      stay.costCents + transit.costCents + flights + (itinerary.suggestedCents ?? 0),
    );
  });
});

describe('nothing is scheduled while the traveler is in the air', () => {
  it('leaves the departure day free of anything but the flight', () => {
    const itinerary = plan([...base, ...fixtureActivities.map((option) => option.id)]);
    const departureDay = itinerary.days.find((day) => day.date === '2026-10-12')!;

    expect(departureDay.blocks.every((block) => block.kind === 'flight')).toBe(true);
  });

  it('starts the arrival day at least 90 minutes after landing', () => {
    const itinerary = plan([...base, ...fixtureActivities.map((option) => option.id)]);
    const arrivalDay = itinerary.days.find((day) => day.date === '2026-10-13')!;

    const earliest = Math.min(
      ...arrivalDay.blocks
        .filter((block) => block.kind !== 'flight')
        .map((block) => minutes(block.start)),
    );
    expect(earliest).toBeGreaterThanOrEqual(minutesFromClock('14:40') + 90);
  });

  it('stops the departure day well before the flight leaves', () => {
    const itinerary = plan([...base, ...fixtureActivities.map((option) => option.id)]);
    const departureDay = itinerary.days.find((day) => day.date === '2026-10-17')!;

    const latest = Math.max(
      ...departureDay.blocks
        .filter((block) => block.kind !== 'flight')
        .map((block) => minutes(block.end)),
    );
    expect(latest).toBeLessThanOrEqual(minutesFromClock('15:45') - 150);
  });
});

describe('opening hours are respected', () => {
  const everything = [...base, ...fixtureActivities.map((option) => option.id)];

  it('never schedules a venue on a day it is closed', () => {
    const itinerary = plan(everything);

    for (const block of allBlocks(itinerary)) {
      const activity = fixtureActivities.find((option) => option.id === block.refId);
      if (!activity) continue;

      const windows = activity.openingHours[dayKeyFor(block.date)];
      expect(windows, `${activity.title} on ${block.date}`).not.toBeNull();
    }
  });

  it('never schedules a venue outside its hours on the day it did pick', () => {
    const itinerary = plan(everything);

    for (const block of allBlocks(itinerary)) {
      const activity = fixtureActivities.find((option) => option.id === block.refId);
      if (!activity) continue;

      const windows = activity.openingHours[dayKeyFor(block.date)]!;
      const fits = windows.some(
        (window) =>
          minutesFromClock(window.open) <= minutes(block.start) &&
          minutesFromClock(window.close) >= minutes(block.end),
      );
      expect(fits, `${activity.title} at ${block.start}`).toBe(true);
    }
  });

  it('keeps the Monday-closed museum off Monday', () => {
    // 12 Oct 2026 is a Monday, and so is nothing else in this window — but the
    // fixture trip runs Mon to Sat, so the museum has plenty of other days.
    const itinerary = plan([...base, 'act_tokyo_natl_museum']);
    const block = blockFor(itinerary, 'act_tokyo_natl_museum');

    if (block) expect(dayKeyFor(block.date)).not.toBe('mon');
  });

  it('explains itself when a venue cannot be fitted at all', () => {
    // The sumo museum opens weekdays only; a pure weekend trip cannot use it.
    const weekend: Partial<TripIntake> = { startDate: '2026-10-17', endDate: '2026-10-18' };
    const itinerary = buildItinerary(
      { ...intake, ...weekend },
      fixtureOptions,
      ['act_sumo_museum'],
    );

    const miss = itinerary.unscheduled.find((entry) => entry.id === 'act_sumo_museum');
    expect(miss).toBeDefined();
    expect(miss!.reason).toMatch(/only open|closed/);
  });
});

describe('blocks never overlap and leave room to travel', () => {
  it('separates everything on a day by at least the walking time', () => {
    const itinerary = plan([...base, ...fixtureActivities.map((option) => option.id)]);

    for (const day of itinerary.days) {
      const ordered = [...day.blocks].sort((a, b) => minutes(a.start) - minutes(b.start));
      for (let i = 1; i < ordered.length; i += 1) {
        const gap = minutes(ordered[i].start) - minutes(ordered[i - 1].end);
        expect(gap, `${ordered[i - 1].title} then ${ordered[i].title} on ${day.date}`)
          .toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('never ends a block before it starts', () => {
    const itinerary = plan([...base, ...fixtureActivities.map((option) => option.id)]);
    for (const block of allBlocks(itinerary)) {
      expect(minutes(block.end)).toBeGreaterThan(minutes(block.start));
    }
  });
});

describe('pace', () => {
  const everything = [...base, ...fixtureActivities.map((option) => option.id)];

  it('places fewer things a day when the traveler asked to go slowly', () => {
    const relaxed = plan(everything, { pace: 'relaxed' });
    const packed = plan(everything, { pace: 'packed' });

    const count = (itinerary: Itinerary) =>
      allBlocks(itinerary).filter((block) => block.kind === 'activity').length;

    expect(count(relaxed)).toBeLessThan(count(packed));
  });

  it('honours the relaxed cap of two activities a day', () => {
    const itinerary = plan(everything, { pace: 'relaxed' });
    for (const day of itinerary.days) {
      const activities = day.blocks.filter((block) => block.kind === 'activity').length;
      expect(activities, day.date).toBeLessThanOrEqual(2);
    }
  });

  it('gives a reason for everything it could not place', () => {
    const itinerary = plan(everything, { pace: 'relaxed' });
    expect(itinerary.unscheduled.length).toBeGreaterThan(0);
    for (const miss of itinerary.unscheduled) {
      expect(miss.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('meals', () => {
  const everything = [...base, ...fixtureActivities.map((option) => option.id)];

  /**
   * Near the hour, not on it. A meal may slide up to ninety minutes so a busy day still
   * gets fed — lunch at 13:15 is lunch, and going unfed is the worse answer.
   */
  it('seats restaurants around mealtimes rather than mid-afternoon', () => {
    const itinerary = plan(everything);
    const meals = allBlocks(itinerary).filter((block) => block.kind === 'meal');
    const slots = [
      minutesFromClock('08:00'),
      minutesFromClock('12:30'),
      minutesFromClock('19:00'),
    ];

    expect(meals.length).toBeGreaterThan(0);
    for (const meal of meals) {
      const nearest = Math.min(...slots.map((slot) => Math.abs(minutes(meal.start) - slot)));
      expect(nearest, `${meal.title} at ${meal.start.slice(11)}`).toBeLessThanOrEqual(90);
    }
  });

  /**
   * Breakfast is allowed to repeat — the same cafe every morning is what people do, and
   * a five-day trip does not need five distinct breakfasts. Lunch and dinner do not.
   */
  it('never serves the same place for lunch or dinner twice', () => {
    const itinerary = plan(everything);
    const mains = allBlocks(itinerary)
      .filter((block) => block.kind === 'meal' && !block.title.startsWith('Breakfast'))
      .map((block) => block.refId);

    expect(new Set(mains).size).toBe(mains.length);
  });

  it('puts food on every day the traveler is there', () => {
    const itinerary = plan(everything);
    const onTheGround = itinerary.days.filter(
      (day) => day.blocks.length > 0 && day.blocks.some((block) => block.kind !== 'flight'),
    );

    for (const day of onTheGround) {
      expect(
        day.blocks.some((block) => block.kind === 'meal'),
        `${day.date} has nothing to eat`,
      ).toBe(true);
    }
  });

  it('serves at most three meals out per day', () => {
    const itinerary = plan(everything);
    for (const day of itinerary.days) {
      expect(day.blocks.filter((block) => block.kind === 'meal').length).toBeLessThanOrEqual(3);
    }
  });

  /**
   * It may be seated as dinner or picked up as an evening outing — a pricey izakaya now
   * competes with cheaper dinners for the meal budget. Either way it never lands at
   * breakfast, because it does not open until five.
   */
  it('never sends the evening izakaya to breakfast', () => {
    const itinerary = plan(everything);
    const block = blockFor(itinerary, 'act_nakameguro_izakaya');

    if (block) {
      expect(minutes(block.start)).toBeGreaterThanOrEqual(minutesFromClock('17:00'));
      expect(block.title.startsWith('Breakfast')).toBe(false);
    }
  });
});

describe('lodging', () => {
  it('checks in on the day of arrival and out on the day of departure', () => {
    const itinerary = plan(base);
    const checkIn = allBlocks(itinerary).find((block) => block.kind === 'lodging_checkin')!;
    const checkOut = allBlocks(itinerary).find((block) => block.kind === 'lodging_checkout')!;

    expect(checkIn.date).toBe('2026-10-13');
    expect(checkOut.date).toBe('2026-10-17');
    expect(minutes(checkOut.start)).toBeGreaterThanOrEqual(minutesFromClock('11:00'));
  });

  it('says so when no lodging was picked', () => {
    const itinerary = plan([OUTBOUND, RETURN]);
    expect(itinerary.warnings.join(' ')).toContain('no lodging');
  });
});

describe('awkward inputs', () => {
  it('fills the days in itself when nothing is selected', () => {
    const itinerary = plan([]);

    expect(itinerary.days).toHaveLength(6);
    expect(itinerary.chosenCents).toBe(0);
    // Nothing picked is not nothing planned: the traveler gets a trip to edit down.
    expect(allBlocks(itinerary).length).toBeGreaterThan(0);
    expect(allBlocks(itinerary).every((block) => block.suggested)).toBe(true);
  });

  it('assumes the traveler is already there when no outbound flight is picked', () => {
    const itinerary = plan([STAY, 'act_sensoji']);
    expect(itinerary.warnings.join(' ')).toContain('already there');
    expect(blockFor(itinerary, 'act_sensoji')).toBeDefined();
  });

  it('ignores ids that are not in the catalogue', () => {
    expect(() => plan([...base, 'act_does_not_exist'])).not.toThrow();
  });

  it('handles a venue that is open around the clock without looping', () => {
    const allDay: OpeningHours = {
      sun: [{ open: '00:00', close: '23:59' }],
      mon: [{ open: '00:00', close: '23:59' }],
      tue: [{ open: '00:00', close: '23:59' }],
      wed: [{ open: '00:00', close: '23:59' }],
      thu: [{ open: '00:00', close: '23:59' }],
      fri: [{ open: '00:00', close: '23:59' }],
      sat: [{ open: '00:00', close: '23:59' }],
    };
    const always: ActivityOption = {
      ...(fixtureActivities.find((option) => option.id === 'act_sensoji') as ActivityOption),
      id: 'act_always_open',
      openingHours: allDay,
    };
    const options: TripOption[] = [...fixtureOptions, always];

    const itinerary = buildItinerary(intake, options, [...base, 'act_always_open']);
    expect(itinerary.unscheduled).toHaveLength(0);
  });

  it('survives a one-night trip', () => {
    const itinerary = plan([...base, 'act_sensoji'], {
      startDate: '2026-10-12',
      endDate: '2026-10-13',
    });
    expect(itinerary.days).toHaveLength(2);
    expect(itinerary.totalCents).toBeGreaterThan(0);
  });
});

/** Each of these came out of reading a generated itinerary rather than from a spec. */
describe('details that only show up when you read the plan', () => {
  it('ends a same-day landing at the arrival time, not at midnight', () => {
    const itinerary = plan(['flt_ret_ci_tpe']);
    const block = blockFor(itinerary, 'flt_ret_ci_tpe')!;

    // Departs 10:40 and lands 18:50 the same local day, despite 21h in the air.
    expect(block.end.slice(11)).toBe('18:50');
  });

  it('still shows a red-eye consuming its departure day', () => {
    const itinerary = plan(['flt_out_ci_tpe']);
    const block = blockFor(itinerary, 'flt_out_ci_tpe')!;
    expect(block.note).toContain('2026-10-13');
    expect(minutes(block.end)).toBeGreaterThan(minutes(block.start));
  });

  it('finishes checking out before the run to the airport begins', () => {
    const itinerary = plan(base);
    const checkOut = allBlocks(itinerary).find((block) => block.kind === 'lodging_checkout')!;
    const lastDay = itinerary.days.at(-1)!;
    const flight = lastDay.blocks.find((block) => block.kind === 'flight')!;

    expect(minutes(checkOut.end)).toBeLessThanOrEqual(minutes(flight.start) - 150);
  });

  it('points out a hotel night spent in the air', () => {
    // Research prices lodging from the trip dates, before any flight is chosen, so a
    // red-eye leaves the traveler paying for a night they spend over the Pacific.
    const overbooked = fixtureOptions.map((option) =>
      option.id === STAY && option.kind === 'lodging'
        ? { ...option, nights: 5, costCents: option.nightlyCents * 5 }
        : option,
    );
    const itinerary = buildItinerary(intake, overbooked, base);
    expect(itinerary.warnings.join(' ')).toContain('spent in the air');
    expect(itinerary.warnings.join(' ')).toContain('1 night');
  });

  it('says nothing about nights when the stay matches the time on the ground', () => {
    // The bundled stay is already four nights, which is what these flights leave.
    expect(plan(base).warnings.join(' ')).not.toContain('spent in the air');
  });
});

/**
 * An early flight home leaves no room for a civilised check-out. This only showed up
 * on a live Mexico City plan whose return left at 10:15 — the bundled trip departs at
 * 15:45 and has slack the early case does not.
 */
describe('an early flight home', () => {
  const EARLY = 'flt_ret_nh_direct'; // departs 10:55

  it('checks out in time to reach the airport', () => {
    const itinerary = plan([OUTBOUND, EARLY, STAY]);
    const checkOut = allBlocks(itinerary).find((block) => block.kind === 'lodging_checkout')!;

    expect(minutes(checkOut.end)).toBeLessThanOrEqual(minutesFromClock('10:55') - 150);
  });

  it('checks out before the planning day would normally begin', () => {
    const itinerary = plan([OUTBOUND, EARLY, STAY]);
    const checkOut = allBlocks(itinerary).find((block) => block.kind === 'lodging_checkout')!;

    expect(minutes(checkOut.start)).toBeLessThan(minutesFromClock('08:00'));
  });

  it('still checks out at the normal hour when the flight is late enough', () => {
    const itinerary = plan(base);
    const checkOut = allBlocks(itinerary).find((block) => block.kind === 'lodging_checkout')!;
    expect(checkOut.start.slice(11)).toBe('11:00');
  });

  it('schedules nothing on the last day that runs past the airport run', () => {
    const itinerary = plan([OUTBOUND, EARLY, STAY, ...fixtureActivities.map((o) => o.id)]);
    const lastDay = itinerary.days.at(-1)!;

    for (const block of lastDay.blocks) {
      if (block.kind === 'flight') continue;
      expect(minutes(block.end), block.title).toBeLessThanOrEqual(
        minutesFromClock('10:55') - 150,
      );
    }
  });
});

describe('unscheduled reasons name the actual obstacle', () => {
  it('distinguishes a dawn-only activity from a full schedule', () => {
    const dawn: ActivityOption = {
      ...(fixtureActivities.find((o) => o.id === 'act_sensoji') as ActivityOption),
      id: 'act_balloon',
      durationMinutes: 180,
      openingHours: Object.fromEntries(
        (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const).map((day) => [
          day,
          [{ open: '05:00', close: '07:30' }],
        ]),
      ) as OpeningHours,
    };

    const itinerary = buildItinerary(intake, [...fixtureOptions, dawn], [...base, 'act_balloon']);
    const miss = itinerary.unscheduled.find((entry) => entry.id === 'act_balloon')!;

    expect(miss.reason).toContain('outside the hours we plan within');
  });
});

/**
 * A day with no blocks used to mean two different things — in the air, or simply
 * nothing booked — and the UI could not tell them apart. It showed "travel day" for
 * both. Free time now says so in a block of its own.
 */
describe('empty days say which kind of empty they are', () => {
  it('leaves no day on the ground empty now that it fills them in', () => {
    const itinerary = plan([...base, 'act_sensoji']);
    const ground = itinerary.days.filter(
      (day) => day.date > '2026-10-12' && day.date < '2026-10-17',
    );

    for (const day of ground) {
      expect(day.blocks.length, `${day.date} is empty`).toBeGreaterThan(0);
      expect(day.blocks.every((block) => block.kind === 'free')).toBe(false);
    }
  });

  it('leaves a day genuinely spent in the air with no blocks but the flight', () => {
    const itinerary = plan([...base, 'act_sensoji']);
    const departureDay = itinerary.days.find((day) => day.date === '2026-10-12')!;

    expect(departureDay.blocks.every((block) => block.kind === 'flight')).toBe(true);
    expect(departureDay.blocks.some((block) => block.kind === 'free')).toBe(false);
  });

  it('never puts free time on a day that already has something on it', () => {
    const itinerary = plan([...base, ...fixtureActivities.map((option) => option.id)]);
    for (const day of itinerary.days) {
      if (day.blocks.length > 1) {
        expect(day.blocks.some((block) => block.kind === 'free'), day.date).toBe(false);
      }
    }
  });
});

describe('work is spread across the trip rather than piled at the front', () => {
  it('gives four activities four separate days instead of cramming them into two', () => {
    const picks = ['act_sensoji', 'act_meiji_jingu', 'act_kappabashi', 'act_shinjuku_gyoen'];
    const itinerary = plan([...base, ...picks]);

    const daysUsed = itinerary.days.filter((day) =>
      day.blocks.some((block) => block.kind === 'activity'),
    ).length;

    expect(daysUsed).toBeGreaterThanOrEqual(3);
  });

  /**
   * Only the whole days in the middle. The arrival day starts after a 14:40 landing and
   * a 16:10 check-in, by which time most of Tokyo has shut, and the departure day ends
   * before the run to the airport — both are legitimately short.
   */
  it('fills the whole days to eight hours', () => {
    const picks = ['act_sensoji', 'act_meiji_jingu', 'act_kappabashi', 'act_shinjuku_gyoen'];
    const itinerary = plan([...base, ...picks]);

    const middle = itinerary.days.filter(
      (day) => day.date > '2026-10-13' && day.date < '2026-10-17',
    );

    expect(middle.length).toBeGreaterThan(0);
    for (const day of middle) {
      expect(day.filledMinutes ?? 0, `${day.date} is thin`).toBeGreaterThanOrEqual(8 * 60);
      expect(day.blocks.filter((block) => block.kind === 'activity').length).toBeGreaterThan(0);
    }
  });

  it('offers more that would fit, so a day can be added to', () => {
    const itinerary = plan([...base, 'act_sensoji']);
    const middle = itinerary.days.filter(
      (day) => day.date > '2026-10-13' && day.date < '2026-10-17',
    );

    expect(middle.some((day) => (day.couldAdd?.length ?? 0) > 0)).toBe(true);
  });
});

/**
 * Found by the end-to-end journey test on a one-night trip: land and leave on the same
 * day and there are no nights to spread a room across, so the lodging cost fell out of
 * the day totals while staying in the trip total.
 */
describe('a room paid for always lands on a day', () => {
  it('charges a same-day stay to the one day on the ground', () => {
    const oneNight = { ...intake, startDate: '2026-10-12', endDate: '2026-10-13' };
    const itinerary = buildItinerary(oneNight, fixtureOptions, [OUTBOUND, STAY]);

    const summed = itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0);
    expect(summed).toBe(itinerary.totalCents);
  });

  it('still spreads a longer stay across its nights', () => {
    const itinerary = plan([...base, 'tr_subway_pass']);
    const charged = itinerary.days.filter((day) => day.daySpendCents > 0);

    expect(charged.length).toBeGreaterThan(1);
    expect(itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0)).toBe(
      itinerary.totalCents,
    );
  });

  it('charges nothing for lodging when none was picked', () => {
    const itinerary = plan([OUTBOUND, RETURN]);
    const summed = itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0);
    expect(summed).toBe(itinerary.totalCents);
  });
});

/**
 * The planner now proposes a full day, so the traveler's main job is editing it down.
 * A removal has to stick, or the next re-schedule puts it straight back.
 */
describe('editing the plan', () => {
  it('never suggests something the traveler threw away', () => {
    const first = plan([...base, 'act_sensoji']);
    const suggested = allBlocks(first).find((block) => block.suggested && block.refId)!;

    const after = buildItinerary(intake, fixtureOptions, [...base, 'act_sensoji'], [
      suggested.refId!,
    ]);

    expect(allBlocks(after).map((block) => block.refId)).not.toContain(suggested.refId);
  });

  it('still honours something the traveler picked even if it is also excluded', () => {
    const after = buildItinerary(intake, fixtureOptions, [...base, 'act_sensoji'], ['act_sensoji']);
    expect(allBlocks(after).map((block) => block.refId)).toContain('act_sensoji');
  });

  it('offers alternatives for what it suggested, so a swap is possible', () => {
    const itinerary = plan([...base, 'act_sensoji']);
    const suggested = allBlocks(itinerary).filter((block) => block.suggested);

    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.some((block) => (block.alternatives?.length ?? 0) > 0)).toBe(true);
  });

  it('separates what the traveler committed to from what it added', () => {
    const itinerary = plan([...base, 'act_sensoji']);
    const chosen = fixtureOptions
      .filter((option) => [...base, 'act_sensoji'].includes(option.id))
      .reduce((acc, option) => acc + option.costCents, 0);

    expect(itinerary.chosenCents).toBe(chosen);
    expect(itinerary.suggestedCents).toBeGreaterThan(0);
    expect(itinerary.totalCents).toBe(chosen + (itinerary.suggestedCents ?? 0));
  });
});

describe('a round trip covers the whole journey', () => {
  const ROUND = 'flt_rt_ua';

  it('puts both ends of it on the plan', () => {
    const itinerary = plan([ROUND, STAY]);
    const flights = allBlocks(itinerary).filter((block) => block.refId === ROUND);

    expect(flights).toHaveLength(2);
    expect(flights[0].date).toBe('2026-10-12');
    expect(flights[1].date).toBe('2026-10-17');
  });

  it('frames the trip from its outward arrival to its homeward departure', () => {
    const itinerary = plan([ROUND, STAY, 'act_sensoji']);

    for (const day of itinerary.days) {
      for (const block of day.blocks) {
        if (block.kind === 'flight') continue;
        expect(day.date >= '2026-10-13', `${block.title} before landing`).toBe(true);
        expect(day.date <= '2026-10-17', `${block.title} after leaving`).toBe(true);
      }
    }
  });

  it('charges once for both directions', () => {
    const itinerary = plan([ROUND]);
    const fare = fixtureFlights.find((flight) => flight.id === ROUND)!.costCents;
    expect(itinerary.chosenCents).toBe(fare);
  });

  it('does not warn about a missing flight when one fare covers both ways', () => {
    const itinerary = plan([ROUND, STAY]);
    expect(itinerary.warnings.join(' ')).not.toMatch(/no outbound/i);
  });
});

/** One fare buys both directions, and it is charged once. */
describe('a round trip is one price', () => {
  it('charges the fare on the way out and nothing on the way home', () => {
    const itinerary = plan(['flt_rt_ua', STAY]);
    const blocks = allBlocks(itinerary).filter((block) => block.refId === 'flt_rt_ua');
    const fare = fixtureFlights.find((flight) => flight.id === 'flt_rt_ua')!.costCents;

    expect(blocks).toHaveLength(2);
    expect(blocks.reduce((acc, block) => acc + block.costCents, 0)).toBe(fare);
  });

  it('keeps the day totals adding up to the trip total', () => {
    const itinerary = plan(['flt_rt_ua', STAY, 'act_sensoji']);
    const summed = itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0);
    const unplaced = itinerary.unscheduled.reduce((acc, miss) => {
      const option = fixtureOptions.find((candidate) => candidate.id === miss.id);
      return acc + (option?.costCents ?? 0);
    }, 0);

    expect(summed).toBe(itinerary.totalCents - unplaced);
  });
});

/**
 * Dragging a block somewhere is a deliberate instruction. It gets its slot before
 * anything else, and if it genuinely cannot hold it is refused rather than quietly
 * moved — being silently relocated is worse than being told no.
 */
describe('blocks the traveler pinned', () => {
  const MUSEUM = 'act_tokyo_natl_museum'; // closed Mondays, 09:30-17:00 otherwise

  it('puts a pinned block exactly where it was dropped', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: MUSEUM, date: '2026-10-15', startMinutes: minutesFromClock('10:00') },
    ]);

    const block = blockFor(itinerary, MUSEUM)!;
    expect(block.date).toBe('2026-10-15');
    expect(block.start.slice(11)).toBe('10:00');
  });

  it('packs the rest of the day around it without overlapping', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: MUSEUM, date: '2026-10-15', startMinutes: minutesFromClock('10:00') },
    ]);

    const day = itinerary.days.find((entry) => entry.date === '2026-10-15')!;
    const ordered = [...day.blocks].sort((a, b) => minutes(a.start) - minutes(b.start));
    for (let i = 1; i < ordered.length; i += 1) {
      expect(minutes(ordered[i].start)).toBeGreaterThanOrEqual(minutes(ordered[i - 1].end));
    }
    expect(day.blocks.length).toBeGreaterThan(1);
  });

  it('refuses a pin where the venue is shut, and says so', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: MUSEUM, date: '2026-10-15', startMinutes: minutesFromClock('06:00') },
    ]);

    const refused = itinerary.unscheduled.find((miss) => miss.id === MUSEUM);
    expect(refused).toBeDefined();
    expect(refused!.reason).toMatch(/not open|outside the time/i);
  });

  it('refuses a pin on a day the traveler is in the air', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: 'act_sensoji', date: '2026-10-12', startMinutes: minutesFromClock('10:00') },
    ]);

    const refused = itinerary.unscheduled.find((miss) => miss.id === 'act_sensoji')!;
    expect(refused.reason).toMatch(/not at the destination|outside the time/i);
  });

  it('refuses a pin that would run over a flight', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: 'act_sensoji', date: '2026-10-17', startMinutes: minutesFromClock('15:30') },
    ]);

    const refused = itinerary.unscheduled.find((miss) => miss.id === 'act_sensoji')!;
    expect(refused.reason.length).toBeGreaterThan(10);
  });

  it('refuses an id that is not part of this trip', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: 'act_not_real', date: '2026-10-15', startMinutes: 600 },
    ]);

    expect(itinerary.unscheduled.map((miss) => miss.id)).toContain('act_not_real');
  });

  it('keeps the plan sound with several pins at once', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base, [], [
      { id: MUSEUM, date: '2026-10-15', startMinutes: minutesFromClock('10:00') },
      { id: 'act_sensoji', date: '2026-10-16', startMinutes: minutesFromClock('09:00') },
      { id: 'act_meiji_jingu', date: '2026-10-16', startMinutes: minutesFromClock('14:00') },
    ]);

    expect(blockFor(itinerary, 'act_sensoji')!.start.slice(11)).toBe('09:00');
    expect(blockFor(itinerary, 'act_meiji_jingu')!.start.slice(11)).toBe('14:00');
    expect(itinerary.totalCents).toBe(
      (itinerary.chosenCents ?? 0) + (itinerary.suggestedCents ?? 0),
    );
  });
});

/**
 * Washington DC research came back with four restaurants for a five-day trip, which
 * left the last three days with no dinner. Distinct lunches and dinners are the ideal,
 * not a rule worth going hungry over.
 */
describe('feeding a trip on a short list of restaurants', () => {
  function withOnly(count: number) {
    const restaurants = fixtureActivities
      .filter((option) => option.category === 'restaurant')
      .slice(0, count);
    const rest = fixtureOptions.filter(
      (option) => option.kind !== 'activity' || option.category !== 'restaurant',
    );
    return [...rest, ...restaurants];
  }

  it('never seats the same place twice in one day', () => {
    for (const supply of [2, 4, 8, 14]) {
      const itinerary = buildItinerary(intake, withOnly(supply), base);
      for (const day of itinerary.days) {
        const ids = day.blocks.filter((block) => block.kind === 'meal').map((b) => b.refId);
        expect(new Set(ids).size, `${supply} restaurants, ${day.date}`).toBe(ids.length);
      }
    }
  });

  it('still feeds every day when there are only three places to eat', () => {
    const itinerary = buildItinerary(intake, withOnly(3), base);
    const onTheGround = itinerary.days.filter(
      (day) => day.blocks.length > 0 && day.blocks.some((block) => block.kind !== 'flight'),
    );

    for (const day of onTheGround) {
      expect(
        day.blocks.some((block) => block.kind === 'meal'),
        `${day.date} has nothing to eat`,
      ).toBe(true);
    }
  });

  it('keeps lunches and dinners distinct while the supply allows it', () => {
    const itinerary = buildItinerary(intake, fixtureOptions, base);
    const mains = itinerary.days
      .flatMap((day) => day.blocks)
      .filter((block) => block.kind === 'meal' && !block.title.startsWith('Breakfast'))
      .map((block) => block.refId);

    expect(new Set(mains).size).toBe(mains.length);
  });
});
