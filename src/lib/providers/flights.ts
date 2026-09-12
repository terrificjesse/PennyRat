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

function iata(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function routeTitle(carrier: string, legs: FlightLeg[]): string {
  if (legs.length === 1) return truncate(`${carrier} · nonstop`, 120);
  const hubs = legs.slice(0, -1).map((leg) => leg.to);
  return truncate(`${carrier} via ${hubs.join(', ')}`, 120);
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

    const parsedTimes = route.legs.map((leg) => ({
      depart: toLocalDateTime(leg.departLocal),
      arrive: toLocalDateTime(leg.arriveLocal),
      from: iata(leg.fromIata),
      to: iata(leg.toIata),
      durationMinutes: leg.durationMinutes,
      flightNo: leg.flightNo,
    }));

    if (parsedTimes.some((leg) => !leg.depart || !leg.arrive || !leg.from || !leg.to)) {
      warnings.push(`dropped ${label} (unreadable times or airport codes)`);
      return;
    }

    // The model routinely returns the right routing on the wrong date — most often a
    // stale year from its training data. Shifting every leg by the same number of days
    // lands it on the trip while preserving the overnight gaps between legs exactly,
    // so the size of the shift does not matter.
    const expectedDate = route.direction === 'outbound' ? intake.startDate : intake.endDate;
    const actualDate = parsedTimes[0].depart!.date;
    const shift = epochDay(expectedDate) - epochDay(actualDate);
    if (shift !== 0) {
      warnings.push(`moved ${label} from ${actualDate} to ${expectedDate}`);
      if (confidence === 'high') confidence = 'medium';
    }

    const legs: FlightLeg[] = parsedTimes.map((leg) => ({
      from: leg.from!,
      to: leg.to!,
      departLocal: `${addDays(leg.depart!.date, shift)}T${leg.depart!.time}`,
      arriveLocal: `${addDays(leg.arrive!.date, shift)}T${leg.arrive!.time}`,
      carrier: truncate(route.carrier, 40),
      flightNo: leg.flightNo?.trim() || undefined,
      durationMinutes: clampInt(leg.durationMinutes, 20, 1200),
    }));

    const broken = legs.findIndex((leg, i) => i > 0 && leg.from !== legs[i - 1].to);
    if (broken > 0) {
      warnings.push(`dropped ${label} (leg ${broken + 1} starts somewhere leg ${broken} did not reach)`);
      return;
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

    const flying = legs.reduce((acc, leg) => acc + leg.durationMinutes, 0);
    const ground = layovers.reduce((acc, minutes) => acc + minutes, 0);

    const tight = layovers.filter((minutes) => minutes < 60);
    if (tight.length > 0) warnings.push(`${label}: connection under an hour`);

    const candidate = {
      id: `flt_${route.direction === 'outbound' ? 'out' : 'ret'}_${slug(route.carrier, legs, taken)}`,
      kind: 'flight' as const,
      bucket: 'flights' as const,
      title: routeTitle(route.carrier, legs),
      costCents: estimateFare(route.fareBandUsdPerPerson, daysAhead, intake.travelers),
      costBasis: 'per_person' as const,
      estimated: true,
      confidence,
      direction: route.direction,
      legs,
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
    if (!options.some((option) => option.direction === direction)) {
      warnings.push(`no usable ${direction} routings`);
    }
  }
  if (options.length < FLIGHT_TARGET) {
    warnings.push(`asked for ${FLIGHT_TARGET} routings, kept ${options.length}`);
  }

  options.sort((a, b) =>
    a.direction === b.direction
      ? a.costCents - b.costCents
      : a.direction === 'outbound'
        ? -1
        : 1,
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

export async function researchFlights(
  intake: TripIntake,
): Promise<{ options: FlightOption[]; meta: ResearchMeta }> {
  const started = Date.now();

  if (k2Mode() === 'fixture' || !k2Configured()) {
    return {
      options: fixtureFlights,
      meta: fixtureMeta(
        started,
        'served the bundled ORD to Tokyo sample flights; set IFM_API_KEY and K2_MODE=live for real research',
      ),
    };
  }

  try {
    const { items, meta } = await researchItems({
      label: 'flights',
      system: flightSystem,
      prompt: buildFlightPrompt(intake),
      itemSchema: rawFlightRouteSchema,
    });

    const { options, warnings } = buildFlightOptions(items, intake);
    if (options.length === 0) throw new Error('no usable routings survived validation');

    return { options, meta: { ...meta, warnings: [...meta.warnings, ...warnings] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      options: fixtureFlights,
      meta: fixtureMeta(started, `flight research failed (${reason}); served sample data`),
    };
  }
}
