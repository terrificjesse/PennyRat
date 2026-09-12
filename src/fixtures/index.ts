import activitiesJson from './activities.json';
import flightsJson from './flights.json';
import intakeJson from './intake.json';
import lodgingJson from './lodging.json';
import transitJson from './transit.json';
import {
  activityOptionSchema,
  flightOptionSchema,
  lodgingOptionSchema,
  transitOptionSchema,
  tripIntakeSchema,
  type ActivityOption,
  type FlightOption,
  type LodgingOption,
  type TransitOption,
  type TripIntake,
  type TripOption,
} from '@/lib/types';

/**
 * A complete sample trip — ORD to Tokyo, two travelers, $4,200, five nights.
 * Used by K2_MODE=fixture, by the tests, and by the UI lane so it never has to
 * wait on a live research call. Parsed through the schemas at import so a bad
 * edit fails loudly instead of halfway through a render.
 */
export const fixtureIntake: TripIntake = tripIntakeSchema.parse(intakeJson);
export const fixtureFlights: FlightOption[] = flightOptionSchema.array().parse(flightsJson);
export const fixtureActivities: ActivityOption[] = activityOptionSchema.array().parse(activitiesJson);
export const fixtureLodging: LodgingOption[] = lodgingOptionSchema.array().parse(lodgingJson);
export const fixtureTransit: TransitOption[] = transitOptionSchema.array().parse(transitJson);

export const fixtureOptions: TripOption[] = [
  ...fixtureFlights,
  ...fixtureActivities,
  ...fixtureLodging,
  ...fixtureTransit,
];
