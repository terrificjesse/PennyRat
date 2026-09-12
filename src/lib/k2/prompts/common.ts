import { z } from 'zod';
import { confidenceSchema, type TripIntake } from '../../types';
import { tripDateRange, tripNights } from '../../budget';

/**
 * Shared prompt scaffolding. The raw schemas here are deliberately looser than the
 * contract in `lib/types.ts`: the model is allowed to write `9:00` or `Monday`, and
 * the providers tighten it. Rejecting a good venue over a missing leading zero
 * would be a bad trade.
 */

export const JSON_DISCIPLINE = [
  'You answer only with JSON. No preamble, no explanation, no markdown fence.',
  'Never wrap the array in an object. The first character you emit is [ and the last is ].',
  'Every field in the schema is required unless marked optional.',
  'Never invent a fact to fill a field. If you are not confident about a detail,',
  'set "confidence" to "low" so it can be checked.',
].join(' ');

export const HOURS_SHAPE = [
  '"openingHours" is an object with one key per weekday, using the keys',
  'sun, mon, tue, wed, thu, fri, sat. Each value is either null, meaning closed',
  'all day, or an array of {"open": "HH:mm", "close": "HH:mm"} windows in 24-hour',
  'local time. A place that shuts for the afternoon has two windows.',
  'Do not guess these. If you do not know a venue’s hours, do not include the venue.',
].join(' ');

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function describeDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

/**
 * Spells out which weekday each date falls on. Without this the model has no way to
 * reason about a museum that closes on Mondays, and the scheduler later will.
 */
export function describeTripDates(intake: TripIntake): string {
  const dates = tripDateRange(intake);
  const year = intake.startDate.slice(0, 4);
  const days = dates.map((date) => `${describeDay(date)} (${date})`).join(', ');
  return (
    `The trip runs ${describeDay(intake.startDate)} to ${describeDay(intake.endDate)} ${year}: ` +
    `${dates.length} calendar days and ${tripNights(intake)} nights. ` +
    `The dates and their weekdays are: ${days}.`
  );
}

export function describeParty(intake: TripIntake): string {
  const who = intake.travelers === 1 ? '1 traveler' : `${intake.travelers} travelers`;
  return `${who} departing from ${intake.origin}, interested in ${intake.interests.join(', ')}, at a ${intake.pace} pace.`;
}

export function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** A time the model wrote, before the providers normalize it. */
const looseTime = z.string().min(3).max(8);

export const rawHoursWindowSchema = z.object({ open: looseTime, close: looseTime });

/** Weekday keys are read case-insensitively and by prefix, so `Monday` is fine. */
export const rawOpeningHoursSchema = z.record(
  z.string(),
  z.union([z.array(rawHoursWindowSchema), z.null()]),
);

export const rawConfidenceSchema = confidenceSchema;
