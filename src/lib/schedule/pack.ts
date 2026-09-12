import { allocateBuckets, tripDateRange } from '../budget';
import {
  PACE_ACTIVITY_CAP,
  type ActivityOption,
  type Cents,
  type DayPlan,
  type FlightOption,
  type Itinerary,
  type LodgingOption,
  type ScheduleBlock,
  type TransitOption,
  type TripIntake,
  type TripOption,
} from '../types';
import {
  DAY_END,
  DAY_START,
  clockFromMinutes,
  earliestFit,
  intersect,
  isOpenThroughout,
  localDateTime,
  minutesFromClock,
  openIntervalsOn,
  opensAtAllDuring,
  type Interval,
} from './hours';

/**
 * Turns a set of checked boxes into a day-by-day plan.
 *
 * Entirely deterministic — no model call, ever. This is the part of the app that has
 * to be right: a museum that shuts on Mondays must never appear on a Monday, and
 * nothing may be scheduled while the traveler is in the air.
 */

const TRANSFER_AFTER_LANDING = 90;
const AIRPORT_LEAD_TIME = 150;
const CHECK_IN = 15 * 60;
const CHECK_OUT = 11 * 60;
const CHECK_DURATION = 30;

const PAD_SAME_AREA = 15;
const PAD_CROSS_TOWN = 30;
const PAD_AIRPORT = 90;

const MAX_MEALS_PER_DAY = 2;
const TIGHT_CONNECTION = 60;

const MEAL_SLOTS = [
  { label: 'Dinner', start: 19 * 60, fits: 'evening' },
  { label: 'Lunch', start: 12 * 60 + 30, fits: 'afternoon' },
  { label: 'Breakfast', start: 8 * 60, fits: 'morning' },
] as const;

type Placed = ScheduleBlock & {
  startMin: number;
  endMin: number;
  neighborhood?: string;
  isMeal: boolean;
  isActivity: boolean;
};

type Day = {
  date: string;
  /** When the traveler is actually free at the destination. Empty while in transit. */
  frame: Interval;
  placed: Placed[];
  warnings: string[];
  onTheGround: boolean;
  /** Latest minute the traveler can still be at the lodging, when a flight leaves today. */
  mustLeaveBy: number | null;
};

function dateOf(localDateTimeValue: string): string {
  return localDateTimeValue.slice(0, 10);
}

function minutesOf(localDateTimeValue: string): number {
  return minutesFromClock(localDateTimeValue.slice(11, 16));
}

/** Splits `total` into `count` whole cents that sum back to exactly `total`. */
function spread(total: Cents, count: number): Cents[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const parts = Array.from({ length: count }, () => base);
  let leftover = total - base * count;
  for (let i = 0; leftover > 0; i += 1, leftover -= 1) parts[i] += 1;
  return parts;
}

function padBetween(block: Placed, neighborhood: string | undefined): number {
  if (block.kind === 'flight') return PAD_AIRPORT;
  if (!block.neighborhood || !neighborhood) return PAD_CROSS_TOWN;
  return block.neighborhood === neighborhood ? PAD_SAME_AREA : PAD_CROSS_TOWN;
}

/** Occupied time on a day, widened by the travel time to and from `neighborhood`. */
function busyFor(day: Day, neighborhood: string | undefined): Interval[] {
  return day.placed.map((block) => {
    const pad = padBetween(block, neighborhood);
    return { start: block.startMin - pad, end: block.endMin + pad };
  });
}

function place(day: Day, block: Placed): void {
  day.placed.push(block);
  day.placed.sort((a, b) => a.startMin - b.startMin);
}

function toBlock(block: Placed): ScheduleBlock {
  return {
    start: block.start,
    end: block.end,
    kind: block.kind,
    refId: block.refId,
    title: block.title,
    note: block.note,
    costCents: block.costCents,
  };
}

function buildDays(intake: TripIntake, flights: FlightOption[]): Day[] {
  const dates = tripDateRange(intake);
  const outbound = flights.find((flight) => flight.direction === 'outbound');
  const back = flights.find((flight) => flight.direction === 'return');

  const arrival = outbound ? dateOf(outbound.legs.at(-1)!.arriveLocal) : dates[0];
  const arrivalMinutes = outbound ? minutesOf(outbound.legs.at(-1)!.arriveLocal) : null;
  const leaving = back ? dateOf(back.legs[0].departLocal) : dates.at(-1)!;
  const leavingMinutes = back ? minutesOf(back.legs[0].departLocal) : null;

  return dates.map((date) => {
    // Before landing or after take-off the traveler is not at the destination at all.
    const onTheGround = date >= arrival && date <= leaving;
    if (!onTheGround) {
      return {
        date,
        frame: { start: 0, end: 0 },
        placed: [],
        warnings: [],
        onTheGround,
        mustLeaveBy: null,
      };
    }

    let start = DAY_START;
    let end = DAY_END;
    if (date === arrival && arrivalMinutes !== null) {
      start = Math.max(start, arrivalMinutes + TRANSFER_AFTER_LANDING);
    }
    if (date === leaving && leavingMinutes !== null) {
      end = Math.min(end, leavingMinutes - AIRPORT_LEAD_TIME);
    }

    return {
      date,
      frame: { start, end: Math.max(start, end) },
      placed: [],
      warnings: [],
      onTheGround,
      mustLeaveBy:
        date === leaving && leavingMinutes !== null
          ? leavingMinutes - AIRPORT_LEAD_TIME
          : null,
    };
  });
}

function placeFlights(days: Day[], flights: FlightOption[]): string[] {
  const warnings: string[] = [];

  for (const flight of flights) {
    const departDate = dateOf(flight.legs[0].departLocal);
    const day = days.find((candidate) => candidate.date === departDate);
    const arriveAt = flight.legs.at(-1)!.arriveLocal;

    const flying = flight.legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
    const ground = flight.totalDurationMinutes - flying;
    if (flight.stops > 0 && ground / flight.stops < TIGHT_CONNECTION) {
      warnings.push(`${flight.title} connects in under an hour — little room if the first leg slips`);
    }

    if (!day) {
      warnings.push(`${flight.title} departs ${departDate}, outside the trip dates`);
      continue;
    }

    const startMin = minutesOf(flight.legs[0].departLocal);
    // Crossing the date line eastbound lands you earlier in the day than elapsed time
    // suggests, so trust the local arrival clock when the landing is the same date.
    const landsSameDay = dateOf(arriveAt) === departDate;
    const endMin = landsSameDay
      ? Math.max(startMin + 30, minutesOf(arriveAt))
      : Math.min(24 * 60 - 1, startMin + flight.totalDurationMinutes);

    place(day, {
      start: localDateTime(day.date, startMin),
      end: localDateTime(day.date, endMin),
      kind: 'flight',
      refId: flight.id,
      title: flight.title,
      note:
        dateOf(arriveAt) === departDate
          ? `Lands ${clockFromMinutes(minutesOf(arriveAt))}`
          : `Lands ${arriveAt.replace('T', ' ')}`,
      costCents: flight.costCents,
      startMin,
      endMin,
      isMeal: false,
      isActivity: false,
    });
  }

  return warnings;
}

function placeLodging(days: Day[], stay: LodgingOption | undefined): void {
  if (!stay) return;

  const ground = days.filter((day) => day.onTheGround);
  const first = ground[0];
  const last = ground.at(-1);

  if (first) {
    const startMin = Math.max(first.frame.start, CHECK_IN);
    place(first, {
      start: localDateTime(first.date, startMin),
      end: localDateTime(first.date, startMin + CHECK_DURATION),
      kind: 'lodging_checkin',
      refId: stay.id,
      title: `Check in · ${stay.title}`,
      note: stay.neighborhood,
      costCents: 0,
      startMin,
      endMin: startMin + CHECK_DURATION,
      neighborhood: stay.neighborhood,
      isMeal: false,
      isActivity: false,
    });
  }

  if (last && last !== first) {
    const deadline = last.mustLeaveBy ?? last.frame.end;
    const startMin = Math.max(0, Math.min(CHECK_OUT, deadline - CHECK_DURATION));
    place(last, {
      start: localDateTime(last.date, startMin),
      end: localDateTime(last.date, startMin + CHECK_DURATION),
      kind: 'lodging_checkout',
      refId: stay.id,
      title: `Check out · ${stay.title}`,
      costCents: 0,
      startMin,
      endMin: startMin + CHECK_DURATION,
      neighborhood: stay.neighborhood,
      isMeal: false,
      isActivity: false,
    });
  }
}

function placeMeals(days: Day[], restaurants: ActivityOption[]): Set<string> {
  const seated = new Set<string>();

  for (const day of days) {
    if (!day.onTheGround) continue;
    let served = 0;

    for (const slot of MEAL_SLOTS) {
      if (served >= MAX_MEALS_PER_DAY) break;

      const candidates = restaurants
        .filter((option) => !seated.has(option.id))
        .filter((option) => {
          const window = { start: slot.start, end: slot.start + option.durationMinutes };
          return (
            window.end <= day.frame.end &&
            window.start >= day.frame.start &&
            isOpenThroughout(option, day.date, window) &&
            earliestFit(window, option.durationMinutes, busyFor(day, option.neighborhood)) ===
              slot.start
          );
        })
        // A place the model called an evening spot goes to dinner before it goes to lunch.
        .sort((a, b) => {
          const fit = (option: ActivityOption) =>
            option.bestTimeOfDay === slot.fits ? 0 : option.bestTimeOfDay === 'any' ? 1 : 2;
          return fit(a) - fit(b) || (b.rating ?? 0) - (a.rating ?? 0);
        });

      const chosen = candidates[0];
      if (!chosen) continue;

      place(day, {
        start: localDateTime(day.date, slot.start),
        end: localDateTime(day.date, slot.start + chosen.durationMinutes),
        kind: 'meal',
        refId: chosen.id,
        title: `${slot.label} · ${chosen.title}`,
        note: chosen.bookingRequired ? 'Book ahead' : chosen.neighborhood,
        costCents: chosen.costCents,
        startMin: slot.start,
        endMin: slot.start + chosen.durationMinutes,
        neighborhood: chosen.neighborhood,
        isMeal: true,
        isActivity: false,
      });
      seated.add(chosen.id);
      served += 1;
    }
  }

  return seated;
}

function countActivities(day: Day): number {
  return day.placed.filter((block) => block.isActivity).length;
}

/**
 * Places the remaining activities, hardest first.
 *
 * Ordering by how few days a venue could possibly go on matters more than it looks:
 * a gallery open Thursday to Sunday has to claim its slot before a park that is open
 * all week takes the only afternoon that would have worked.
 */
function placeActivities(
  days: Day[],
  activities: ActivityOption[],
  intake: TripIntake,
): { unscheduled: { id: string; reason: string }[] } {
  const dates = days.filter((day) => day.onTheGround).map((day) => day.date);
  const cap = PACE_ACTIVITY_CAP[intake.pace];
  const unscheduled: { id: string; reason: string }[] = [];

  const openDayCount = new Map<string, number>();
  for (const activity of activities) {
    openDayCount.set(
      activity.id,
      dates.filter((date) => openIntervalsOn(activity, date).length > 0).length,
    );
  }

  const ordered = [...activities].sort((a, b) => {
    const constraint = openDayCount.get(a.id)! - openDayCount.get(b.id)!;
    if (constraint !== 0) return constraint;

    const match = (option: ActivityOption) =>
      option.interests.filter((interest) => intake.interests.includes(interest)).length;
    return match(b) - match(a) || (b.rating ?? 0) - (a.rating ?? 0);
  });

  for (const activity of ordered) {
    if (!opensAtAllDuring(activity, dates)) {
      unscheduled.push({
        id: activity.id,
        reason: closedReason(activity, dates),
      });
      continue;
    }

    let placedIt = false;
    let sawCapacity = false;

    for (const day of days) {
      if (!day.onTheGround) continue;
      if (countActivities(day) >= cap) continue;
      sawCapacity = true;

      const busy = busyFor(day, activity.neighborhood);
      for (const open of openIntervalsOn(activity, day.date)) {
        const window = intersect(open, day.frame);
        if (!window) continue;

        const start = earliestFit(window, activity.durationMinutes, busy);
        if (start === null) continue;

        place(day, {
          start: localDateTime(day.date, start),
          end: localDateTime(day.date, start + activity.durationMinutes),
          kind: 'activity',
          refId: activity.id,
          title: activity.title,
          note: activity.bookingRequired ? 'Booking required' : activity.neighborhood,
          costCents: activity.costCents,
          startMin: start,
          endMin: start + activity.durationMinutes,
          neighborhood: activity.neighborhood,
          isMeal: false,
          isActivity: true,
        });
        placedIt = true;
        break;
      }

      if (placedIt) break;
    }

    if (!placedIt) {
      unscheduled.push({
        id: activity.id,
        reason: !sawCapacity
          ? `every day is already full at a ${intake.pace} pace`
          : outsidePlanningHours(activity, dates)
            ? `only open outside the hours we plan within (${clockFromMinutes(DAY_START)}–${clockFromMinutes(DAY_END)})`
            : 'no open window long enough on the days that still had room',
      });
    }
  }

  return { unscheduled };
}

/** True when every window the venue has falls outside the planning day. */
function outsidePlanningHours(activity: ActivityOption, dates: readonly string[]): boolean {
  const day = { start: DAY_START, end: DAY_END };
  return dates.every((date) =>
    openIntervalsOn(activity, date).every((open) => {
      const overlap = intersect(open, day);
      return overlap === null || overlap.end - overlap.start < activity.durationMinutes;
    }),
  );
}

/** Says which closure actually got in the way, so the user can do something about it. */
function closedReason(activity: ActivityOption, dates: readonly string[]): string {
  const blockedByDate = dates.filter((date) => activity.closedDates.includes(date));
  if (blockedByDate.length > 0) {
    return `closed on ${blockedByDate.join(', ')}`;
  }

  const openDays = Object.entries(activity.openingHours)
    .filter(([, windows]) => windows !== null)
    .map(([day]) => day);

  return openDays.length === 0
    ? 'no opening hours on record'
    : `only open ${openDays.join(', ')} — none of which fall in your trip`;
}

export function buildItinerary(
  intake: TripIntake,
  options: readonly TripOption[],
  selectedIds: readonly string[],
): Itinerary {
  const selected = new Set(selectedIds);
  const picked = options.filter((option) => selected.has(option.id));

  const flights = picked.filter((option): option is FlightOption => option.kind === 'flight');
  const stays = picked.filter((option): option is LodgingOption => option.kind === 'lodging');
  const transit = picked.filter((option): option is TransitOption => option.kind === 'transit');
  const activities = picked.filter(
    (option): option is ActivityOption => option.kind === 'activity',
  );

  const days = buildDays(intake, flights);
  const warnings = placeFlights(days, flights);
  placeLodging(days, stays[0]);

  const seated = placeMeals(
    days,
    activities.filter((option) => option.category === 'restaurant'),
  );
  const { unscheduled } = placeActivities(
    days,
    activities.filter((option) => !seated.has(option.id)),
    intake,
  );

  // Lodging and local transport are daily overheads rather than events, so they are
  // spread across the nights and days they actually cover.
  const ground = days.filter((day) => day.onTheGround);
  const nights = Math.max(0, ground.length - 1);
  const lodgingPerNight = spread(
    stays.reduce((acc, stay) => acc + stay.costCents, 0),
    nights,
  );
  const transitPerDay = spread(
    transit.reduce((acc, option) => acc + option.costCents, 0),
    ground.length,
  );

  let groundIndex = 0;
  const plans: DayPlan[] = days.map((day) => {
    const blockSpend = day.placed.reduce((acc, block) => acc + block.costCents, 0);
    let overhead = 0;

    if (day.onTheGround) {
      overhead += transitPerDay[groundIndex] ?? 0;
      if (groundIndex < nights) overhead += lodgingPerNight[groundIndex] ?? 0;
      groundIndex += 1;
    }

    return {
      date: day.date,
      blocks: day.placed.map(toBlock),
      daySpendCents: blockSpend + overhead,
      warnings: day.warnings,
    };
  });

  const dailyCeiling = Math.round(
    (allocateBuckets(intake).activities + allocateBuckets(intake).food) /
      Math.max(1, ground.length),
  );
  for (const plan of plans) {
    const onEvents = plan.blocks
      .filter((block) => block.kind === 'activity' || block.kind === 'meal')
      .reduce((acc, block) => acc + block.costCents, 0);
    if (dailyCeiling > 0 && onEvents > dailyCeiling * 2) {
      plan.warnings.push('a heavy day — food and activities here cost double a typical day');
    }
  }

  if (!flights.some((flight) => flight.direction === 'outbound')) {
    warnings.push('no outbound flight picked, so the first day assumes you are already there');
  }
  if (stays.length === 0) {
    warnings.push('no lodging picked');
  } else {
    const booked = stays.reduce((acc, stay) => acc + stay.nights, 0);
    if (booked > nights) {
      const spare = booked - nights;
      warnings.push(
        `your stay covers ${booked} nights but these flights leave you ${nights} on the ground — ` +
          `you are paying for ${spare} night${spare > 1 ? 's' : ''} spent in the air`,
      );
    }
  }
  if (unscheduled.length > 0) {
    warnings.push(`${unscheduled.length} of your picks could not be fitted in`);
  }

  return {
    days: plans,
    totalCents: picked.reduce((acc, option) => acc + option.costCents, 0),
    unscheduled,
    warnings,
  };
}
