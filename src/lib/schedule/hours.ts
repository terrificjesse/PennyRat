import { DAY_KEYS, type ActivityOption, type DayKey, type HoursWindow } from '../types';

/**
 * Opening hours, in minutes from midnight.
 *
 * The scheduler works one local day at a time, so everything here is plain integer
 * arithmetic on a single date. No timezones: the contract stores local wall-clock
 * times and that is what a visitor standing outside a museum reads off the door.
 */

export type Interval = { start: number; end: number };

export const DAY_START = 8 * 60;
export const DAY_END = 22 * 60;

export function dayKeyFor(isoDate: string): DayKey {
  return DAY_KEYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

export function minutesFromClock(clock: string): number {
  const [hour, minute] = clock.split(':').map(Number);
  return hour * 60 + minute;
}

export function clockFromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hour = Math.floor(clamped / 60);
  return `${String(hour).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function localDateTime(isoDate: string, minutes: number): string {
  return `${isoDate}T${clockFromMinutes(minutes)}`;
}

/** Times a venue is open on one date, as intervals. Empty means shut. */
export function openIntervalsOn(activity: ActivityOption, isoDate: string): Interval[] {
  if (activity.closedDates.includes(isoDate)) return [];

  const windows: HoursWindow[] | null = activity.openingHours[dayKeyFor(isoDate)];
  if (!windows) return [];

  return windows
    .map((window) => ({
      start: minutesFromClock(window.open),
      end: minutesFromClock(window.close),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** True when the venue is open for the whole of `slot`, not merely at its start. */
export function isOpenThroughout(
  activity: ActivityOption,
  isoDate: string,
  slot: Interval,
): boolean {
  return openIntervalsOn(activity, isoDate).some(
    (open) => open.start <= slot.start && open.end >= slot.end,
  );
}

/** Whether the venue ever opens during the trip at all. */
export function opensAtAllDuring(activity: ActivityOption, dates: readonly string[]): boolean {
  return dates.some((date) => openIntervalsOn(activity, date).length > 0);
}

/**
 * The earliest start inside `within` that fits `duration` without colliding with
 * anything in `busy`. Busy intervals arrive already widened by whatever travel
 * padding applies, so this stays pure interval arithmetic.
 */
export function earliestFit(
  within: Interval,
  duration: number,
  busy: readonly Interval[],
): number | null {
  if (within.end - within.start < duration) return null;

  const blocking = busy
    .filter((interval) => interval.end > within.start && interval.start < within.end)
    .sort((a, b) => a.start - b.start);

  let candidate = within.start;
  for (const interval of blocking) {
    if (candidate + duration <= interval.start) return candidate;
    candidate = Math.max(candidate, interval.end);
  }

  return candidate + duration <= within.end ? candidate : null;
}

/**
 * The latest start inside `within` that fits `duration` without colliding with
 * anything in `busy`. The mirror of `earliestFit`, for things that want to happen as
 * late as they are allowed to — checking out of a hotel, mainly.
 */
export function latestFit(
  within: Interval,
  duration: number,
  busy: readonly Interval[],
): number | null {
  if (within.end - within.start < duration) return null;

  const blocking = busy
    .filter((interval) => interval.end > within.start && interval.start < within.end)
    .sort((a, b) => b.start - a.start);

  let candidate = within.end - duration;
  for (const interval of blocking) {
    if (candidate >= interval.end) return candidate;
    candidate = Math.min(candidate, interval.start - duration);
  }

  return candidate >= within.start ? candidate : null;
}
