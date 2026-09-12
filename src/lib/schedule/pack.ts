import { allocateBuckets, formatCents, tripDateRange } from '../budget';
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
  latestFit,
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

/** A day should feel like a day, not a gap with two bookings in it. */
const FULL_DAY_MINUTES = 8 * 60;

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
    suggested: block.suggested,
    alternatives: block.alternatives,
  };
}

/**
 * How much of a day is actually accounted for: time inside blocks, plus the travel
 * between them that the padding already models. Gaps longer than the travel they need
 * are genuinely empty and do not count.
 */
function filledMinutes(day: Day): number {
  const ordered = [...day.placed].sort((a, b) => a.startMin - b.startMin);
  let total = ordered.reduce((acc, block) => acc + (block.endMin - block.startMin), 0);

  for (let i = 1; i < ordered.length; i += 1) {
    const gap = ordered[i].startMin - ordered[i - 1].endMin;
    total += Math.min(Math.max(0, gap), padBetween(ordered[i - 1], ordered[i].neighborhood));
  }

  return total;
}

function buildDays(intake: TripIntake, flights: FlightOption[]): Day[] {
  const dates = tripDateRange(intake);
  // A round trip covers both ends on its own: the way out is `legs`, the way home is
  // `returnLegs`.
  const outbound = flights.find(
    (flight) => flight.direction === 'outbound' || flight.direction === 'roundtrip',
  );
  const back = flights.find(
    (flight) => flight.direction === 'return' || flight.direction === 'roundtrip',
  );
  const homeward = back?.direction === 'roundtrip' ? back.returnLegs : back?.legs;

  const arrival = outbound ? dateOf(outbound.legs.at(-1)!.arriveLocal) : dates[0];
  const arrivalMinutes = outbound ? minutesOf(outbound.legs.at(-1)!.arriveLocal) : null;
  const leaving = homeward ? dateOf(homeward[0].departLocal) : dates.at(-1)!;
  const leavingMinutes = homeward ? minutesOf(homeward[0].departLocal) : null;

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

function placeFlights(
  days: Day[],
  flights: FlightOption[],
): { warnings: string[]; unplaceable: { id: string; reason: string }[] } {
  const warnings: string[] = [];
  const unplaceable: { id: string; reason: string }[] = [];

  for (const flight of flights) {
    const flying = flight.legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
    const ground = flight.totalDurationMinutes - flying;
    if (flight.stops > 0 && ground / flight.stops < TIGHT_CONNECTION) {
      warnings.push(`${flight.title} connects in under an hour — little room if the first leg slips`);
    }

    // A round trip is two journeys under one fare, and each needs its own block.
    const journeys: { legs: typeof flight.legs; label: string; costCents: number }[] = [
      {
        legs: flight.legs,
        label: flight.direction === 'roundtrip' ? 'out' : '',
        costCents: flight.costCents,
      },
    ];
    if (flight.direction === 'roundtrip' && flight.returnLegs) {
      // The fare covers both directions and is charged once, on the way out.
      journeys.push({ legs: flight.returnLegs, label: 'home', costCents: 0 });
    }

    for (const journey of journeys) {
    const departDate = dateOf(journey.legs[0].departLocal);
    const day = days.find((candidate) => candidate.date === departDate);
    const arriveAt = journey.legs.at(-1)!.arriveLocal;

    if (!day) {
      warnings.push(`${flight.title} departs ${departDate}, outside the trip dates`);
      unplaceable.push({
        id: flight.id,
        reason: `departs ${departDate}, which is not a day of this trip`,
      });
      continue;
    }

    const startMin = minutesOf(journey.legs[0].departLocal);
    // Crossing the date line eastbound lands you earlier in the day than elapsed time
    // suggests, so trust the local arrival clock when the landing is the same date.
    const landsSameDay = dateOf(arriveAt) === departDate;
    const journeyMinutes = journey.legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
    const endMin = landsSameDay
      ? Math.max(startMin + 30, minutesOf(arriveAt))
      : Math.min(24 * 60 - 1, startMin + Math.max(journeyMinutes, flight.totalDurationMinutes));

    // Two flights over the same hours means two contradictory choices. The first
    // stays and the rest are handed back with a reason, because a plan that shows a
    // traveler on two aircraft at once is worse than one that says it cannot.
    const clash = day.placed.find(
      (block) => block.kind === 'flight' && block.startMin < endMin && startMin < block.endMin,
    );
    if (clash) {
      unplaceable.push({
        id: flight.id,
        reason: `overlaps ${clash.title}, which you also picked — you can only be on one`,
      });
      continue;
    }

    place(day, {
      start: localDateTime(day.date, startMin),
      end: localDateTime(day.date, endMin),
      kind: 'flight',
      refId: flight.id,
      title: journey.label === 'home' ? `${flight.title} · home` : flight.title,
      note:
        dateOf(arriveAt) === departDate
          ? `Lands ${clockFromMinutes(minutesOf(arriveAt))}`
          : `Lands ${arriveAt.replace('T', ' ')}`,
      costCents: journey.costCents,
      startMin,
      endMin,
      isMeal: false,
      isActivity: false,
    });
    }
  }

  return { warnings, unplaceable };
}

function placeLodging(days: Day[], stay: LodgingOption | undefined): void {
  if (!stay) return;

  const ground = days.filter((day) => day.onTheGround);
  const first = ground[0];
  const last = ground.at(-1);

  if (first) {
    const busy = busyFor(first, stay.neighborhood);
    const window = { start: Math.max(first.frame.start, CHECK_IN), end: 24 * 60 - 1 };
    const startMin = earliestFit(window, CHECK_DURATION, busy) ?? window.start;
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
    const busy = busyFor(last, stay.neighborhood);
    const window = { start: 0, end: Math.min(CHECK_OUT + CHECK_DURATION, deadline) };
    const startMin = Math.max(
      0,
      latestFit(window, CHECK_DURATION, busy) ?? Math.min(CHECK_OUT, deadline - CHECK_DURATION),
    );
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

/**
 * Three meals a day, every day.
 *
 * Previously this seated only restaurants the traveler had ticked, which meant most
 * days had no food on them at all — not a trip anybody would follow. It now draws on
 * everything research returned, preferring what was chosen, then what is near where
 * they are that day.
 *
 * Breakfast is allowed to repeat: the same cafe every morning is what people actually
 * do, and a five-day trip does not need five distinct breakfasts. Lunch and dinner
 * stay distinct.
 */
function placeMeals(
  days: Day[],
  restaurants: ActivityOption[],
  chosen: Set<string>,
  lodgingArea: string | undefined,
): Set<string> {
  const usedForMainMeals = new Set<string>();
  const seated = new Set<string>();

  for (const day of days) {
    if (!day.onTheGround) continue;

    // Wherever the day already takes them, so lunch and dinner are not across town.
    const dayAreas = new Set(
      day.placed.map((block) => block.neighborhood).filter((area): area is string => Boolean(area)),
    );

    for (const slot of MEAL_SLOTS) {
      const wantArea = slot.label === 'Breakfast' ? lodgingArea : undefined;

      const candidates = restaurants
        .filter((option) => slot.label === 'Breakfast' || !usedForMainMeals.has(option.id))
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
        .sort((a, b) => score(b) - score(a));

      function score(option: ActivityOption): number {
        let points = 0;
        if (chosen.has(option.id)) points += 100;
        if (wantArea && option.neighborhood === wantArea) points += 40;
        if (!wantArea && dayAreas.has(option.neighborhood)) points += 30;
        if (option.bestTimeOfDay === slot.fits) points += 20;
        else if (option.bestTimeOfDay === 'any') points += 10;

        // Nobody eats a ninety-dollar omakase three mornings running. Breakfast leans
        // cheap; the money belongs in the evening.
        if (slot.label === 'Breakfast') points -= option.costCents / 400;

        return points + (option.rating ?? 0);
      }

      const chosenPlace = candidates[0];
      if (!chosenPlace) continue;

      place(day, {
        start: localDateTime(day.date, slot.start),
        end: localDateTime(day.date, slot.start + chosenPlace.durationMinutes),
        kind: 'meal',
        refId: chosenPlace.id,
        title: `${slot.label} · ${chosenPlace.title}`,
        note: chosenPlace.bookingRequired ? 'Book ahead' : chosenPlace.neighborhood,
        costCents: chosenPlace.costCents,
        suggested: !chosen.has(chosenPlace.id) || seated.has(chosenPlace.id) || undefined,
        alternatives: candidates
          .slice(1, 5)
          .map((option) => option.id),
        startMin: slot.start,
        endMin: slot.start + chosenPlace.durationMinutes,
        neighborhood: chosenPlace.neighborhood,
        isMeal: true,
        isActivity: false,
      });

      seated.add(chosenPlace.id);
      if (slot.label !== 'Breakfast') usedForMainMeals.add(chosenPlace.id);
    }
  }

  return seated;
}

/**
 * Tops each day up towards a full one.
 *
 * Anything that fits the remaining budget goes in first; after that only free options,
 * which cannot push the trip over. A free option may be used again on another day
 * rather than leave a day looking empty — a park is worth two visits.
 */
function fillDays(
  days: Day[],
  pool: ActivityOption[],
  intake: TripIntake,
  placedIds: Set<string>,
  budgetLeft: number,
): { added: ActivityOption[]; spent: number } {
  const cap = PACE_ACTIVITY_CAP[intake.pace];
  const added: ActivityOption[] = [];
  let left = budgetLeft;

  const matches = (option: ActivityOption) =>
    option.interests.filter((interest) => intake.interests.includes(interest)).length;

  for (const pass of ['affordable', 'free', 'repeat'] as const) {
    for (const day of days) {
      if (!day.onTheGround) continue;

      // The pace the traveler asked for wins over the eight-hour target. Somebody who
      // chose "relaxed" meant two things a day, and a full day is not worth overriding
      // them for — the day simply comes out shorter, and says so.
      while (filledMinutes(day) < FULL_DAY_MINUTES && countActivities(day) < cap) {
        const used = new Set(day.placed.map((block) => block.refId));

        const candidates = pool
          .filter((option) => !used.has(option.id))
          .filter((option) => {
            if (pass === 'affordable') return !placedIds.has(option.id) && option.costCents <= left;
            if (pass === 'free') return !placedIds.has(option.id) && option.costCents === 0;
            return option.costCents === 0;
          })
          .sort((a, b) => matches(b) - matches(a) || (b.rating ?? 0) - (a.rating ?? 0));

        const slot = candidates
          .map((option) => ({ option, at: findSlot(day, option) }))
          .find((entry) => entry.at !== null);

        if (!slot || slot.at === null) break;

        place(day, {
          start: localDateTime(day.date, slot.at),
          end: localDateTime(day.date, slot.at + slot.option.durationMinutes),
          kind: 'activity',
          refId: slot.option.id,
          title: slot.option.title,
          note: slot.option.bookingRequired ? 'Booking required' : slot.option.neighborhood,
          costCents: slot.option.costCents,
          suggested: true,
          alternatives: candidates
            .filter((option) => option.id !== slot.option.id)
            .slice(0, 4)
            .map((option) => option.id),
          startMin: slot.at,
          endMin: slot.at + slot.option.durationMinutes,
          neighborhood: slot.option.neighborhood,
          isMeal: false,
          isActivity: true,
        });

        if (!placedIds.has(slot.option.id)) {
          placedIds.add(slot.option.id);
          added.push(slot.option);
          left -= slot.option.costCents;
        }
      }
    }
  }

  return { added, spent: budgetLeft - left };
}

/** The earliest moment `option` could sit on `day`, or null if it cannot. */
function findSlot(day: Day, option: ActivityOption): number | null {
  const busy = busyFor(day, option.neighborhood);
  for (const open of openIntervalsOn(option, day.date)) {
    const window = intersect(open, day.frame);
    if (!window) continue;
    const at = earliestFit(window, option.durationMinutes, busy);
    if (at !== null) return at;
  }
  return null;
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

    // Emptiest day first. Taking the first day that fits instead would pile
    // everything onto the front of the trip and leave the last days bare.
    const candidates = days
      .filter((day) => day.onTheGround && countActivities(day) < cap)
      .sort((a, b) => countActivities(a) - countActivities(b) || a.date.localeCompare(b.date));

    for (const day of candidates) {
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
  excludedIds: readonly string[] = [],
): Itinerary {
  const selected = new Set(selectedIds);
  const excluded = new Set(excludedIds);
  const picked = options.filter((option) => selected.has(option.id));

  const flights = picked.filter((option): option is FlightOption => option.kind === 'flight');
  const stays = picked.filter((option): option is LodgingOption => option.kind === 'lodging');
  const transit = picked.filter((option): option is TransitOption => option.kind === 'transit');
  const activities = picked.filter(
    (option): option is ActivityOption => option.kind === 'activity',
  );

  const days = buildDays(intake, flights);
  // buildDays frames the trip around the first flight of each direction, so those two
  // get first claim on the day when a contradictory pick collides with them.
  const authoritative = [
    flights.find((flight) => flight.direction === 'outbound'),
    flights.find((flight) => flight.direction === 'return'),
  ].filter((flight): flight is FlightOption => Boolean(flight));
  const ordered = [...authoritative, ...flights.filter((f) => !authoritative.includes(f))];

  const flightResult = placeFlights(days, ordered);
  const warnings = flightResult.warnings;
  placeLodging(days, stays[0]);

  // Everything research returned is fair game for filling the days out, minus whatever
  // the traveler has explicitly thrown away.
  const availableActivities = options.filter(
    (option): option is ActivityOption => option.kind === 'activity' && !excluded.has(option.id),
  );

  const seated = placeMeals(
    days,
    availableActivities.filter((option) => option.category === 'restaurant'),
    selected,
    stays[0]?.neighborhood,
  );
  const { unscheduled: unplacedActivities } = placeActivities(
    days,
    activities.filter((option) => !seated.has(option.id)),
    intake,
  );

  const chosenCents = picked.reduce((acc, option) => acc + option.costCents, 0);
  const placedIds = new Set(
    days.flatMap((day) => day.placed.map((block) => block.refId).filter(Boolean) as string[]),
  );
  for (const id of selected) placedIds.add(id);

  // Restaurants are fill material too once the three meal slots are set — a coffee
  // house or a market is a perfectly good way to spend a short afternoon, and leaving a
  // day thin while one sits available is not a plan anybody wants.
  fillDays(
    days,
    availableActivities,
    intake,
    placedIds,
    Math.max(0, intake.budgetTotal - chosenCents),
  );

  // Derived from what was actually placed rather than from unique options: a breakfast
  // repeated across three mornings is paid for three times, and the repeats are the
  // planner's doing, so they count as suggested.
  const suggestedCents = days
    .flatMap((day) => day.placed)
    .filter((block) => block.suggested)
    .reduce((acc, block) => acc + block.costCents, 0);

  // Filling the days out can rescue something the first pass could not place, so the
  // list is settled against what actually ended up on the plan.
  const onPlan = new Set(
    days.flatMap((day) => day.placed.map((block) => block.refId).filter(Boolean) as string[]),
  );
  const unscheduled = [...flightResult.unplaceable, ...unplacedActivities].filter(
    (miss) => !onPlan.has(miss.id),
  );

  // Lodging and local transport are daily overheads rather than events, so they are
  // spread across the nights and days they actually cover.
  const ground = days.filter((day) => day.onTheGround);
  const nights = Math.max(0, ground.length - 1);
  const lodgingTotal = stays.reduce((acc, stay) => acc + stay.costCents, 0);
  // Land and leave on the same day and there are no nights to spread a room across,
  // but the room was still paid for. Charging it to the one day on the ground keeps
  // the day totals adding up to the trip.
  const nightsCharged =
    lodgingTotal > 0 ? Math.min(ground.length, Math.max(1, nights)) : nights;
  const lodgingPerNight = spread(lodgingTotal, nightsCharged);
  const transitPerDay = spread(
    transit.reduce((acc, option) => acc + option.costCents, 0),
    ground.length,
  );

  for (const day of days) {
    if (day.onTheGround && day.placed.length === 0 && day.frame.end > day.frame.start) {
      place(day, {
        start: localDateTime(day.date, day.frame.start),
        end: localDateTime(day.date, day.frame.end),
        kind: 'free',
        title: 'Nothing booked yet',
        note: 'Time at the destination with no plans against it',
        costCents: 0,
        startMin: day.frame.start,
        endMin: day.frame.end,
        isMeal: false,
        isActivity: false,
      });
    }
  }

  let groundIndex = 0;
  const plans: DayPlan[] = days.map((day) => {
    const blockSpend = day.placed.reduce((acc, block) => acc + block.costCents, 0);
    let overhead = 0;

    if (day.onTheGround) {
      overhead += transitPerDay[groundIndex] ?? 0;
      if (groundIndex < nightsCharged) overhead += lodgingPerNight[groundIndex] ?? 0;
      groundIndex += 1;
    }

    const onPlan = new Set(day.placed.map((block) => block.refId));
    const couldAdd = day.onTheGround
      ? availableActivities
          .filter((option) => !onPlan.has(option.id) && findSlot(day, option) !== null)
          .slice(0, 12)
          .map((option) => option.id)
      : [];

    return {
      date: day.date,
      blocks: day.placed.map(toBlock),
      daySpendCents: blockSpend + overhead,
      warnings: day.warnings,
      couldAdd,
      filledMinutes: filledMinutes(day),
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

  const hasOutbound = flights.some(
    (flight) => flight.direction === 'outbound' || flight.direction === 'roundtrip',
  );
  if (!hasOutbound) {
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

  const totalCents = chosenCents + suggestedCents;
  const overBudgetCents = Math.max(0, totalCents - intake.budgetTotal);
  if (overBudgetCents > 0) {
    warnings.push(
      `filling the days out put you ${formatCents(overBudgetCents)} past your budget`,
    );
  }

  // A day can come up short because the pace caps it, which is the traveler's own
  // choice and not worth a warning.
  const capped = PACE_ACTIVITY_CAP[intake.pace];
  const thin = plans.filter((plan, index) => {
    if (!days[index].onTheGround) return false;
    if ((plan.filledMinutes ?? 0) >= FULL_DAY_MINUTES) return false;
    return plan.blocks.filter((block) => block.kind === 'activity').length < capped;
  });
  if (thin.length > 0) {
    warnings.push(`${thin.length} day(s) could not be filled out — there was nothing else open`);
  }

  return {
    days: plans,
    totalCents,
    chosenCents,
    suggestedCents,
    overBudgetCents,
    unscheduled,
    warnings,
  };
}
