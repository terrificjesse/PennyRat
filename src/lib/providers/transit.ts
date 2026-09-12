import { tripNights } from '../budget';
import { fixtureTransit } from '../../fixtures';
import { fixtureMeta, k2Configured, k2Mode, researchItems } from '../k2/client';
import { dedupeByTitle, slugId, truncate } from '../k2/parse';
import {
  TRANSIT_TARGET,
  buildTransitPrompt,
  rawTransitSchema,
  transitSystem,
  type RawTransit,
} from '../k2/prompts/transit';
import { transitOptionSchema, type ResearchMeta, type TransitOption, type TripIntake } from '../types';

/**
 * Getting around at the destination — the intertransport budget, held apart from the
 * rest so it does not quietly get eaten by dinner.
 */

/**
 * Days needing local transport: the day you land through the day you leave. For a trip
 * with an overnight flight that equals the number of nights, which is the conservative
 * read. The scheduler knows the exact figure once flights are chosen.
 */
function daysOnGround(intake: TripIntake): number {
  return tripNights(intake);
}

export function buildTransitOptions(
  raw: RawTransit[],
  intake: TripIntake,
): { options: TransitOption[]; warnings: string[] } {
  const warnings: string[] = [];
  const taken = new Set<string>();
  const days = daysOnGround(intake);

  const unique = dedupeByTitle(raw, (item) => item.name);
  if (unique.length < raw.length) {
    warnings.push(`dropped ${raw.length - unique.length} duplicate modes`);
  }

  const options: TransitOption[] = [];

  for (const item of unique) {
    const perDayCents = Math.round(item.perDayUsdForParty * 100);

    const candidate = {
      id: slugId('tr_', item.name, taken),
      kind: 'transit' as const,
      bucket: 'localTransit' as const,
      title: truncate(item.name, 120),
      costCents: perDayCents * days,
      costBasis: 'per_day' as const,
      estimated: true,
      confidence: item.confidence,
      mode: item.mode,
      perDayCents,
      days,
      description: truncate(item.description, 240),
      coverageNote: item.coverageNote ? truncate(item.coverageNote, 160) : undefined,
    };

    const parsed = transitOptionSchema.safeParse(candidate);
    if (parsed.success) options.push(parsed.data);
    else warnings.push(`dropped ${item.name} (${parsed.error.issues[0]?.message ?? 'invalid'})`);
  }

  if (options.length < TRANSIT_TARGET) {
    warnings.push(`asked for ${TRANSIT_TARGET} ways to get around, kept ${options.length}`);
  }

  options.sort((a, b) => a.costCents - b.costCents);

  return { options, warnings };
}

/** The bundled modes are priced for their own trip; rescale to the days requested. */
function rescaleFixtures(intake: TripIntake): TransitOption[] {
  const days = daysOnGround(intake);
  return fixtureTransit.map((option) =>
    option.days === days ? option : { ...option, days, costCents: option.perDayCents * days },
  );
}

export async function researchTransit(
  intake: TripIntake,
): Promise<{ options: TransitOption[]; meta: ResearchMeta }> {
  const started = Date.now();

  if (k2Mode() === 'fixture' || !k2Configured()) {
    return {
      options: rescaleFixtures(intake),
      meta: fixtureMeta(
        started,
        'served the bundled Tokyo transport modes; set IFM_API_KEY and K2_MODE=live for real research',
      ),
    };
  }

  try {
    const { items, meta } = await researchItems({
      label: 'transit',
      system: transitSystem,
      prompt: buildTransitPrompt(intake, daysOnGround(intake)),
      itemSchema: rawTransitSchema,
      maxTokens: 8192,
    });

    const { options, warnings } = buildTransitOptions(items, intake);
    if (options.length === 0) throw new Error('no usable transport modes survived validation');

    return { options, meta: { ...meta, warnings: [...meta.warnings, ...warnings] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      options: rescaleFixtures(intake),
      meta: fixtureMeta(started, `transport research failed (${reason}); served sample data`),
    };
  }
}
