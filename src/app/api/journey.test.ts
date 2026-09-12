import { describe, expect, it } from 'vitest';
import { POST as researchActivities } from './research/activities/route';
import { POST as researchFlights } from './research/flights/route';
import { POST as researchLodging } from './research/lodging/route';
import { POST as researchTransit } from './research/transit/route';
import { POST as buildSchedule } from './schedule/route';
import { fixtureIntake } from '@/fixtures';
import { canSubmit, tripDateRange } from '@/lib/budget';
import { dayKeyFor, minutesFromClock } from '@/lib/schedule/hours';
import {
  itinerarySchema,
  type ActivityOption,
  type FlightOption,
  type Itinerary,
  type LodgingOption,
  type TripIntake,
  type TripOption,
} from '@/lib/types';

/**
 * The whole journey in order: intake, research, a selection a person would actually
 * make, then a schedule.
 *
 * Every part of this is covered in isolation elsewhere. What nothing covered until now
 * is the sequence — and every bug found this week by reading a rendered itinerary
 * (work piling onto the front of the trip, a day mislabelled as travel, check-out
 * overlapping a flight) passed the unit tests that existed at the time.
 *
 * No DOM, no network: the route handlers are called directly and research is served
 * from fixtures.
 */

function post(body: unknown): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function research(intake: TripIntake): Promise<TripOption[]> {
  const handlers = [researchFlights, researchActivities, researchLodging, researchTransit];
  const results = await Promise.all(handlers.map((handler) => handler(post({ intake }))));

  const options: TripOption[] = [];
  for (const response of results) {
    expect(response.status).toBe(200);
    const body = (await response.json()) as { options: TripOption[] };
    options.push(...body.options);
  }
  return options;
}

/**
 * What somebody planning this trip would plausibly pick: the cheapest way there and
 * back, a bed in the middle of the range rather than the very cheapest, a way of
 * getting around, and then things to do, best first, until the money runs low.
 */
function chooseLikeAPerson(options: TripOption[], intake: TripIntake): string[] {
  const of = <K extends TripOption['kind']>(kind: K) =>
    options.filter((option): option is Extract<TripOption, { kind: K }> => option.kind === kind);
  const byPrice = <T extends { costCents: number }>(list: T[]) =>
    [...list].sort((a, b) => a.costCents - b.costCents);

  const flights = of('flight');
  const outbound = byPrice(flights.filter((f) => f.direction === 'outbound'))[0];
  const inbound = byPrice(flights.filter((f) => f.direction === 'return'))[0];
  const lodging = byPrice(of('lodging'));
  const transit = byPrice(of('transit'))[0];

  const fixed: TripOption[] = [outbound, inbound, transit].filter(Boolean) as TripOption[];
  const fixedCost = fixed.reduce((acc, option) => acc + option.costCents, 0);

  // Aim for a bed in the middle of the range, then walk down until one fits. Somebody
  // on a tight budget books a cheaper room rather than abandoning the trip; if even
  // the cheapest is out of reach they take it anyway and the trip comes back over.
  const affordable = lodging.filter((stay) => fixedCost + stay.costCents <= intake.budgetTotal);
  const shortlist = affordable.length > 0 ? affordable : lodging.slice(0, 1);
  const bed = shortlist[Math.min(Math.floor(lodging.length / 2), shortlist.length - 1)];

  const picks = ([...fixed, bed].filter(Boolean) as TripOption[]).map((option) => option.id);

  let left =
    intake.budgetTotal -
    options
      .filter((option) => picks.includes(option.id))
      .reduce((acc, option) => acc + option.costCents, 0);

  for (const activity of [...of('activity')].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.costCents - b.costCents,
  )) {
    if (activity.costCents > left) continue;
    picks.push(activity.id);
    left -= activity.costCents;
  }

  return picks;
}

async function schedule(
  intake: TripIntake,
  options: TripOption[],
  selectedIds: string[],
): Promise<Itinerary> {
  const response = await buildSchedule(post({ intake, options, selectedIds }));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { itinerary: Itinerary };
  expect(itinerarySchema.safeParse(body.itinerary).success).toBe(true);
  return body.itinerary;
}

const minutes = (value: string) => minutesFromClock(value.slice(11, 16));

/** Everything that has to be true for this to be a trip somebody could take. */
function assertTakeable(
  intake: TripIntake,
  options: TripOption[],
  picks: string[],
  itinerary: Itinerary,
  note: string,
): void {
  const chosen = options.filter((option) => picks.includes(option.id));
  const spent = chosen.reduce((acc, option) => acc + option.costCents, 0);

  expect(spent, `${note}: what the traveler picked is within budget`).toBeLessThanOrEqual(
    intake.budgetTotal,
  );
  expect(itinerary.chosenCents, `${note}: chosen matches the basket`).toBe(spent);
  expect(itinerary.totalCents, `${note}: total is chosen plus suggested`).toBe(
    spent + (itinerary.suggestedCents ?? 0),
  );
  expect(itinerary.overBudgetCents, `${note}: overage reported honestly`).toBe(
    Math.max(0, itinerary.totalCents - intake.budgetTotal),
  );
  const gate = canSubmit(intake, options, picks);
  expect(gate.ok, `${note}: the gate would let this through`).toBe(true);
  expect(gate.blockers, `${note}: nothing blocking`).toEqual([]);

  expect(itinerary.days.map((day) => day.date), `${note}: every day of the trip`).toEqual(
    tripDateRange(intake),
  );

  // The day totals account for everything except what could not be fitted in.
  const unscheduledCost = chosen
    .filter((option) => itinerary.unscheduled.some((miss) => miss.id === option.id))
    .reduce((acc, option) => acc + option.costCents, 0);
  const daySum = itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0);
  expect(daySum, `${note}: days add up to the trip minus what did not fit`).toBe(
    itinerary.totalCents - unscheduledCost,
  );

  const flights = chosen.filter((o): o is FlightOption => o.kind === 'flight');
  const outbound = flights.find((f) => f.direction === 'outbound');
  const inbound = flights.find((f) => f.direction === 'return');
  const arrival = outbound?.legs.at(-1)!.arriveLocal;
  const activities = chosen.filter((o): o is ActivityOption => o.kind === 'activity');

  for (const day of itinerary.days) {
    for (const block of day.blocks) {
      expect(block.start.slice(0, 10), `${note}: block sits on its own day`).toBe(day.date);
      expect(minutes(block.end), `${note}: ${block.title} ends after it starts`).toBeGreaterThan(
        minutes(block.start),
      );

      // Nothing at the destination before the plane lands or after it leaves.
      if (arrival && block.kind !== 'flight') {
        expect(day.date >= arrival.slice(0, 10), `${note}: ${block.title} before landing`).toBe(
          true,
        );
        if (day.date === arrival.slice(0, 10)) {
          expect(
            minutes(block.start),
            `${note}: ${block.title} starts before the transfer from the airport`,
          ).toBeGreaterThanOrEqual(minutes(arrival) + 90);
        }
      }
      if (inbound && block.kind !== 'flight') {
        const departure = inbound.legs[0].departLocal;
        expect(day.date <= departure.slice(0, 10), `${note}: ${block.title} after leaving`).toBe(
          true,
        );
        if (day.date === departure.slice(0, 10)) {
          expect(
            minutes(block.end),
            `${note}: ${block.title} runs into the airport run`,
          ).toBeLessThanOrEqual(minutes(departure) - 150);
        }
      }

      // Never on a day the place is shut, never outside its hours.
      const venue = activities.find((option) => option.id === block.refId);
      if (!venue) continue;

      const windows = venue.openingHours[dayKeyFor(day.date)];
      expect(windows, `${note}: ${venue.title} on a closed day`).not.toBeNull();
      expect(venue.closedDates, `${note}: ${venue.title} on a closed date`).not.toContain(day.date);
      expect(
        windows!.some(
          (window) =>
            minutesFromClock(window.open) <= minutes(block.start) &&
            minutesFromClock(window.close) >= minutes(block.end),
        ),
        `${note}: ${venue.title} outside its hours`,
      ).toBe(true);
    }

    // Blocks never collide.
    const ordered = [...day.blocks].sort((a, b) => minutes(a.start) - minutes(b.start));
    for (let i = 1; i < ordered.length; i += 1) {
      expect(
        minutes(ordered[i].start),
        `${note}: ${ordered[i - 1].title} overlaps ${ordered[i].title}`,
      ).toBeGreaterThanOrEqual(minutes(ordered[i - 1].end));
    }
  }

  for (const miss of itinerary.unscheduled) {
    expect(miss.reason.length, `${note}: ${miss.id} needs a reason worth reading`).toBeGreaterThan(
      10,
    );
  }
}

describe('planning the sample trip the way a person would', () => {
  it('produces a trip somebody could actually take', async () => {
    const options = await research(fixtureIntake);
    const picks = chooseLikeAPerson(options, fixtureIntake);
    const itinerary = await schedule(fixtureIntake, options, picks);

    assertTakeable(fixtureIntake, options, picks, itinerary, 'sample');
  });

  it('spends down until nothing else would fit', async () => {
    const options = await research(fixtureIntake);
    const picks = chooseLikeAPerson(options, fixtureIntake);
    const spent = options
      .filter((option) => picks.includes(option.id))
      .reduce((acc, option) => acc + option.costCents, 0);
    const left = fixtureIntake.budgetTotal - spent;

    const skipped = options.filter(
      (option) => option.kind === 'activity' && !picks.includes(option.id),
    );
    for (const option of skipped) {
      expect(option.costCents, `${option.title} would have fitted`).toBeGreaterThan(left);
    }
  });

  it('spreads the outings across the trip instead of stacking them at the start', async () => {
    const options = await research(fixtureIntake);
    const picks = chooseLikeAPerson(options, fixtureIntake);
    const itinerary = await schedule(fixtureIntake, options, picks);

    const perDay = itinerary.days
      .map((day) => day.blocks.filter((block) => block.kind === 'activity').length)
      .filter((count) => count > 0);

    // The bug this catches: everything landing on the first two days because the
    // packer took the first day that fitted rather than the emptiest one.
    expect(perDay.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...perDay) - Math.min(...perDay)).toBeLessThanOrEqual(2);
  });

  it('books a bed for every night on the ground', async () => {
    const options = await research(fixtureIntake);
    const picks = chooseLikeAPerson(options, fixtureIntake);
    const stay = options.find(
      (option): option is LodgingOption => option.kind === 'lodging' && picks.includes(option.id),
    )!;

    const itinerary = await schedule(fixtureIntake, options, picks);
    const kinds = itinerary.days.flatMap((day) => day.blocks.map((block) => block.kind));

    expect(kinds).toContain('lodging_checkin');
    expect(kinds).toContain('lodging_checkout');
    expect(stay.nights).toBeGreaterThan(0);
  });
});

describe('the same journey under different intakes', () => {
  const variants: [string, Partial<TripIntake>][] = [
    ['a single night away', { startDate: '2026-10-12', endDate: '2026-10-13' }],
    ['a party of twelve', { travelers: 12, budgetTotal: 2_500_000 }],
    ['a relaxed pace', { pace: 'relaxed' }],
    ['a packed pace', { pace: 'packed' }],
    ['a fortnight', { endDate: '2026-10-26', budgetTotal: 1_200_000 }],
    ['one traveler', { travelers: 1, budgetTotal: 350_000 }],
    ['somewhere nobody has researched', { destination: 'Ulaanbaatar, Mongolia' }],
    // The cheapest possible basket on the sample data is about $2,650, so this is
    // as tight as the trip can be and still exist.
    ['a budget with nothing to spare', { budgetTotal: 280_000 }],
  ];

  for (const [label, patch] of variants) {
    it(label, async () => {
      const intake = { ...fixtureIntake, ...patch };
      const options = await research(intake);
      const picks = chooseLikeAPerson(options, intake);
      const itinerary = await schedule(intake, options, picks);

      assertTakeable(intake, options, picks, itinerary, label);
    });
  }
});

describe('the shapes the itinerary view has to render', () => {
  it('fills the days in rather than leaving them blank', async () => {
    const options = await research(fixtureIntake);
    // One flight each way, a bed, and a single thing to do: the planner does the rest.
    const flights = options.filter((o): o is FlightOption => o.kind === 'flight');
    const picks = [
      flights.find((f) => f.direction === 'outbound')!.id,
      flights.find((f) => f.direction === 'return')!.id,
      options.find((o) => o.kind === 'lodging')!.id,
      options.find((o) => o.kind === 'activity')!.id,
    ];

    const itinerary = await schedule(fixtureIntake, options, picks);
    const onTheGround = itinerary.days.filter(
      (day) => day.blocks.length > 0 && day.blocks.some((block) => block.kind !== 'flight'),
    );

    expect(onTheGround.length).toBeGreaterThan(0);
    for (const day of onTheGround) {
      expect(day.blocks.some((block) => block.kind === 'meal'), `${day.date} has no food`).toBe(
        true,
      );
      expect(day.blocks.some((block) => block.suggested), `${day.date} was not filled in`).toBe(
        true,
      );
    }
  });

  it('leaves a day spent in the air without free time on it', async () => {
    const options = await research(fixtureIntake);
    const picks = chooseLikeAPerson(options, fixtureIntake);
    const itinerary = await schedule(fixtureIntake, options, picks);

    const inTheAir = itinerary.days.filter(
      (day) => day.blocks.length > 0 && day.blocks.every((block) => block.kind === 'flight'),
    );

    expect(inTheAir.length).toBeGreaterThan(0);
    for (const day of inTheAir) {
      expect(day.blocks.some((block) => block.kind === 'free')).toBe(false);
    }
  });

  it('puts a flight in the unscheduled list when two of them collide', async () => {
    const options = await research(fixtureIntake);
    const outbound = options.filter(
      (o): o is FlightOption => o.kind === 'flight' && o.direction === 'outbound',
    );

    // Two ways there at once is contradictory; one has to come back with a reason.
    const picks = outbound.slice(0, 3).map((flight) => flight.id);
    const itinerary = await schedule(fixtureIntake, options, picks);

    const missedFlights = itinerary.unscheduled.filter((miss) => miss.id.startsWith('flt_'));
    expect(missedFlights.length).toBeGreaterThan(0);
    expect(missedFlights[0].reason).toMatch(/overlaps|one/i);

    const placed = itinerary.days
      .flatMap((day) => day.blocks)
      .filter((block) => block.kind === 'flight');
    expect(placed, 'only one of the colliding flights is on the plan').toHaveLength(1);
  });
});
