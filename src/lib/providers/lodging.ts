import { tripNights } from '../budget';
import { fixtureLodging } from '../../fixtures';
import { fixtureMeta, k2Configured, k2Mode, researchItems } from '../k2/client';
import { dedupeByTitle, slugId, truncate } from '../k2/parse';
import {
  LODGING_TARGET,
  buildLodgingPrompt,
  lodgingSystem,
  rawLodgingSchema,
  type RawLodging,
} from '../k2/prompts/lodging';
import {
  lodgingOptionSchema,
  type BudgetPlan,
  type LodgingOption,
  type ResearchMeta,
  type TripIntake,
} from '../types';

/** Lodging research into contract options. Nightly rate times nights, nothing clever. */

export function buildLodgingOptions(
  raw: RawLodging[],
  intake: TripIntake,
): { options: LodgingOption[]; warnings: string[] } {
  const warnings: string[] = [];
  const taken = new Set<string>();
  const nights = tripNights(intake);

  const unique = dedupeByTitle(raw, (item) => item.name);
  if (unique.length < raw.length) {
    warnings.push(`dropped ${raw.length - unique.length} duplicate properties`);
  }

  const options: LodgingOption[] = [];

  for (const item of unique) {
    const nightlyCents = Math.round(item.nightlyUsdForParty * 100);

    const candidate = {
      id: slugId('lodg_', item.name, taken),
      kind: 'lodging' as const,
      bucket: 'lodging' as const,
      title: truncate(item.name, 120),
      costCents: nightlyCents * nights,
      costBasis: 'per_night' as const,
      estimated: true,
      confidence: item.confidence,
      type: item.type,
      tier: item.tier,
      nightlyCents,
      nights,
      neighborhood: truncate(item.neighborhood, 60),
      description: truncate(item.description, 240),
      rating: item.rating,
      amenities: (item.amenities ?? []).slice(0, 12).map((amenity) => truncate(amenity, 40)),
      walkabilityNote: item.walkabilityNote ? truncate(item.walkabilityNote, 160) : undefined,
    };

    const parsed = lodgingOptionSchema.safeParse(candidate);
    if (parsed.success) options.push(parsed.data);
    else warnings.push(`dropped ${item.name} (${parsed.error.issues[0]?.message ?? 'invalid'})`);
  }

  const tiers = new Set(options.map((option) => option.tier));
  if (tiers.size < 3) {
    warnings.push(`only ${tiers.size} comfort tier(s) came back; the range will look thin`);
  }
  if (options.length < LODGING_TARGET) {
    warnings.push(`asked for ${LODGING_TARGET} properties, kept ${options.length}`);
  }

  options.sort((a, b) => a.costCents - b.costCents);

  return { options, warnings };
}

/**
 * The sample data is priced for its own five-night trip. Rescaling to the nights the
 * user actually asked for keeps fixture mode coherent for any intake.
 */
function rescaleFixtures(intake: TripIntake): LodgingOption[] {
  const nights = tripNights(intake);
  return fixtureLodging.map((stay) =>
    stay.nights === nights
      ? stay
      : { ...stay, nights, costCents: stay.nightlyCents * nights },
  );
}

export async function researchLodging(
  intake: TripIntake,
  budget: BudgetPlan,
): Promise<{ options: LodgingOption[]; meta: ResearchMeta }> {
  const started = Date.now();

  if (k2Mode() === 'fixture' || !k2Configured()) {
    return {
      options: rescaleFixtures(intake),
      meta: fixtureMeta(
        started,
        'served the bundled Tokyo sample lodging; set IFM_API_KEY and K2_MODE=live for real research',
      ),
    };
  }

  try {
    const { items, meta } = await researchItems({
      label: 'lodging',
      system: lodgingSystem,
      prompt: buildLodgingPrompt(intake, budget),
      itemSchema: rawLodgingSchema,
    });

    const { options, warnings } = buildLodgingOptions(items, intake);
    if (options.length === 0) throw new Error('no usable properties survived validation');

    return { options, meta: { ...meta, warnings: [...meta.warnings, ...warnings] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      options: rescaleFixtures(intake),
      meta: fixtureMeta(started, `lodging research failed (${reason}); served sample data`),
    };
  }
}
