import { fixtureFlights } from '../../fixtures';
import { fixtureMeta, k2Configured, k2Mode, researchItems } from '../k2/client';
import { clampInt, truncate } from '../k2/parse';
import {
  FLIGHT_TARGET,
  buildFlightPrompt,
  flightSystem,
  rawFlightRouteSchema,
  type RawFlightRoute,
} from '../k2/prompts/flights';
import {
  flightOptionSchema,
  type Cents,
  type FlightLeg,
  type FlightOption,
  type ResearchMeta,
  type TravelMode,
  type TripIntake,
} from '../types';

/**
 * Flight research into priced options.
 *
 * The model supplies structure and a seasonal fare band; the money is computed here,
 * so the same route always costs the same thing and the number can be explained.
 * Every option is marked `estimated` and the UI badges it.
 */

const MS_PER_DAY = 86_400_000;
const ASSUMED_LAYOVER_MINUTES = 90;

function epochDay(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function addDays(isoDate: string, days: number): string {
  return new Date((epochDay(isoDate) + days) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Accepts `2026-10-12T11:35`, `2026-10-12 11:35:00`, `2026-10-12T11:35Z`. */
function toLocalDateTime(value: string): { date: string; time: string } | null {
  const match = /^\s*(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  return {
    date: match[1],
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/**
 * Fares rise as the date approaches. Booking windows are the one part of airline
 * pricing that behaves predictably enough to model.
 */
export function advanceMultiplier(daysAhead: number): number {
  if (daysAhead < 7) return 1.35;
  if (daysAhead < 14) return 1.22;
  if (daysAhead < 30) return 1.08;
  if (daysAhead < 90) return 1.0;
  if (daysAhead < 180) return 0.94;
  return 0.9;
}

export function estimateFare(
  band: RawFlightRoute['fareBandUsdPerPerson'],
  daysAhead: number,
  travelers: number,
): Cents {
  const low = Math.min(band.low, band.typical, band.high);
  const high = Math.max(band.low, band.typical, band.high);
  const typical = Math.min(high, Math.max(low, band.typical));

  const adjusted = typical * advanceMultiplier(daysAhead);
  const perPerson = Math.min(high * 1.35, Math.max(low * 0.85, adjusted));

  return Math.round(perPerson * 100) * travelers;
}

/**
 * A place a journey starts or ends. An airport code is upper-cased; anything longer is
 * a station or a town and is left as it reads.
 */
function placeLabel(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 40) return null;
  return /^[a-z]{3}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

function routeTitle(carrier: string, legs: FlightLeg[], mode: TravelMode): string {
  if (legs.length === 1) {
    // "Nonstop" belongs to aviation; a car is just a drive.
    const suffix = { plane: ' · nonstop', train: ' · direct', bus: ' · direct', car: '' }[mode];
    return truncate(`${carrier}${suffix}`, 120);
  }
  const hubs = legs.slice(0, -1).map((leg) => leg.to);
  return truncate(`${carrier} via ${hubs.join(', ')}`, 120);
}

type PreparedLegs = { legs: FlightLeg[]; shifted: boolean; problem?: string };

/**
 * Validates one chain of legs and lands it on `expectedDate`.
 *
 * The model routinely returns the right routing on the wrong date — most often a stale
 * year from its training data. Shifting every leg by the same number of days preserves
 * the overnight gaps between them exactly, so the size of the shift does not matter.
 */
function prepareLegs(
  rawLegs: RawFlightRoute['legs'],
  expectedDate: string,
  carrier: string,
): PreparedLegs {
  const parsed = rawLegs.map((leg) => ({
    depart: toLocalDateTime(leg.departLocal),
    arrive: toLocalDateTime(leg.arriveLocal),
    from: placeLabel(leg.fromIata),
    to: placeLabel(leg.toIata),
    durationMinutes: leg.durationMinutes,
    flightNo: leg.flightNo,
  }));

  if (parsed.some((leg) => !leg.depart || !leg.arrive || !leg.from || !leg.to)) {
    return { legs: [], shifted: false, problem: 'unreadable times or airport codes' };
  }

  const shift = epochDay(expectedDate) - epochDay(parsed[0].depart!.date);
  const legs: FlightLeg[] = parsed.map((leg) => ({
    from: leg.from!,
    to: leg.to!,
    departLocal: `${addDays(leg.depart!.date, shift)}T${leg.depart!.time}`,
    arriveLocal: `${addDays(leg.arrive!.date, shift)}T${leg.arrive!.time}`,
    carrier: truncate(carrier, 40),
    flightNo: leg.flightNo?.trim() || undefined,
    durationMinutes: clampInt(leg.durationMinutes, 20, 1200),
  }));

  const broken = legs.findIndex((leg, i) => i > 0 && leg.from !== legs[i - 1].to);
  if (broken > 0) {
    return {
      legs: [],
      shifted: shift !== 0,
      problem: `leg ${broken + 1} starts somewhere leg ${broken} did not reach`,
    };
  }

  return { legs, shifted: shift !== 0 };
}

export function buildFlightOptions(
  raw: RawFlightRoute[],
  intake: TripIntake,
  today = new Date(),
): { options: FlightOption[]; warnings: string[] } {
  const warnings: string[] = [];
  const options: FlightOption[] = [];
  const taken = new Set<string>();
  const daysAhead = Math.max(
    0,
    epochDay(intake.startDate) - Math.floor(today.getTime() / MS_PER_DAY),
  );

  raw.forEach((route, index) => {
    const label = `${route.carrier} ${route.direction} #${index + 1}`;
    let confidence = route.confidence;

    // Two things the model does that are not worth losing an option over: it fills in
    // `returnLegs: []` on a one-way out of tidiness, and on a `return` entry it
    // sometimes puts the journey in `returnLegs` rather than `legs`, which is a
    // reasonable reading of the field name.
    const homewardRaw = route.returnLegs?.length ? route.returnLegs : undefined;
    const outwardRaw = route.legs.length > 0 ? route.legs : homewardRaw;

    if (!outwardRaw || outwardRaw.length === 0) {
      warnings.push(`dropped ${label} (no journey in it)`);
      return;
    }

    // A one-way `return` option is itself the way home, so its legs belong on the end
    // date; everything else starts on the outward date.
    const outwardDate = route.direction === 'return' ? intake.endDate : intake.startDate;
    const outward = prepareLegs(outwardRaw, outwardDate, route.carrier);
    if (outward.problem) {
      warnings.push(`dropped ${label} (${outward.problem})`);
      return;
    }
    if (outward.shifted) {
      warnings.push(`moved ${label} onto ${outwardDate}`);
      if (confidence === 'high') confidence = 'medium';
    }
    const legs = outward.legs;

    let returnLegs: FlightLeg[] | undefined;
    if (route.direction === 'roundtrip') {
      // Only a genuine round trip needs the way home; `outwardRaw` may already have
      // borrowed it if `legs` was the empty one.
      const homewardLegs = outwardRaw === homewardRaw ? undefined : homewardRaw;
      if (!homewardLegs) {
        warnings.push(`dropped ${label} (a round trip with no way home)`);
        return;
      }
      const homeward = prepareLegs(homewardLegs, intake.endDate, route.carrier);
      if (homeward.problem) {
        warnings.push(`dropped ${label} (way home: ${homeward.problem})`);
        return;
      }
      if (homeward.shifted && confidence === 'high') confidence = 'medium';
      returnLegs = homeward.legs;
    }

    const connections = legs.length - 1;
    let layovers = route.layoverMinutes ?? [];
    if (layovers.length !== connections) {
      if (connections > 0) {
        layovers = Array.from({ length: connections }, () => ASSUMED_LAYOVER_MINUTES);
        warnings.push(`${label}: assumed ${ASSUMED_LAYOVER_MINUTES}min connections`);
        if (confidence !== 'low') confidence = 'low';
      } else {
        layovers = [];
      }
    }

    // The advertised duration describes the outward journey; the way home carries its
    // own times on its own legs.
    const flying = legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
    const ground = layovers.reduce((acc, minutes) => acc + minutes, 0);

    const tight = layovers.filter((minutes) => minutes < 60);
    if (tight.length > 0) warnings.push(`${label}: connection under an hour`);

    const candidate = {
      id: `flt_${{ outbound: 'out', return: 'ret', roundtrip: 'rt' }[route.direction]}_${slug(route.carrier, legs, taken)}`,
      kind: 'flight' as const,
      bucket: 'flights' as const,
      title:
        route.direction === 'roundtrip'
          ? `${routeTitle(route.carrier, legs, route.mode ?? 'plane')} · round trip`
          : routeTitle(route.carrier, legs, route.mode ?? 'plane'),
      costCents: estimateFare(route.fareBandUsdPerPerson, daysAhead, intake.travelers),
      costBasis: 'per_person' as const,
      estimated: true,
      confidence,
      direction: route.direction,
      mode: route.mode ?? 'plane',
      legs,
      returnLegs,
      stops: connections,
      totalDurationMinutes: clampInt(flying + ground, flying, 4320),
      cabin: route.cabin ?? ('economy' as const),
      baggageIncluded: route.baggageIncluded,
    };

    const parsed = flightOptionSchema.safeParse(candidate);
    if (parsed.success) options.push(parsed.data);
    else warnings.push(`dropped ${label} (${parsed.error.issues[0]?.message ?? 'invalid'})`);
  });

  for (const direction of ['outbound', 'return'] as const) {
    const covered = options.some(
      (option) => option.direction === direction || option.direction === 'roundtrip',
    );
    if (!covered) warnings.push(`no usable ${direction} routings`);
  }
  if (options.length < FLIGHT_TARGET) {
    warnings.push(`asked for ${FLIGHT_TARGET} routings, kept ${options.length}`);
  }

  const order = { roundtrip: 0, outbound: 1, return: 2 } as const;
  options.sort(
    (a, b) => order[a.direction] - order[b.direction] || a.costCents - b.costCents,
  );

  return { options, warnings };
}

function slug(carrier: string, legs: FlightLeg[], taken: Set<string>): string {
  const base = `${carrier}_${legs.map((leg) => leg.to).join('_')}`
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);

  let id = base;
  let suffix = 2;
  while (taken.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  taken.add(id);
  return id;
}

/**
 * Moves the bundled sample flights onto the dates actually being planned.
 *
 * The sample is an October trip to Tokyo. Served unshifted against a November trip to
 * Washington it lands entirely outside the travel window, every leg gets discarded, and
 * the schedule comes back empty — a silent, total failure that reads like a broken app
 * rather than a fallback. Shifting the legs keeps the fallback usable for any dates.
 */
function rescaleFixtures(intake: TripIntake): FlightOption[] {
  return fixtureFlights.map((flight) => {
    const target = flight.direction === 'return' ? intake.endDate : intake.startDate;
    const shift = epochDay(target) - epochDay(flight.legs[0].departLocal.slice(0, 10));

    const move = (legs: FlightLeg[], days: number): FlightLeg[] =>
      legs.map((leg) => ({
        ...leg,
        departLocal: `${addDays(leg.departLocal.slice(0, 10), days)}T${leg.departLocal.slice(11)}`,
        arriveLocal: `${addDays(leg.arriveLocal.slice(0, 10), days)}T${leg.arriveLocal.slice(11)}`,
      }));

    const returnShift = flight.returnLegs
      ? epochDay(intake.endDate) - epochDay(flight.returnLegs[0].departLocal.slice(0, 10))
      : 0;

    return {
      ...flight,
      legs: move(flight.legs, shift),
      returnLegs: flight.returnLegs ? move(flight.returnLegs, returnShift) : undefined,
    };
  });
}

/** Says plainly that this is the sample trip, not the one that was asked for. */
function sampleNote(intake: TripIntake, what: string): string {
  return (
    `showing the bundled Tokyo sample ${what} moved onto your dates, not real research ` +
    `for ${intake.destination} — set IFM_API_KEY and K2_MODE=live for the real thing`
  );
}

export async function researchFlights(
  intake: TripIntake,
): Promise<{ options: FlightOption[]; meta: ResearchMeta }> {
  const started = Date.now();

  if (k2Mode() === 'fixture' || !k2Configured()) {
    return {
      options: rescaleFixtures(intake),
      meta: fixtureMeta(started, sampleNote(intake, 'flights')),
    };
  }

  try {
    const { items, meta } = await researchItems({
      label: 'flights',
      system: flightSystem,
      prompt: buildFlightPrompt(intake),
      itemSchema: rawFlightRouteSchema,
      maxTokens: 24_576,
    });

    const { options, warnings } = buildFlightOptions(items, intake);
    if (options.length === 0) throw new Error('no usable routings survived validation');

    return { options, meta: { ...meta, warnings: [...meta.warnings, ...warnings] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      options: rescaleFixtures(intake),
      meta: fixtureMeta(started, `flight research failed (${reason}); ${sampleNote(intake, 'flights')}`),
    };
  }
}
