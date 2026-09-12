import { tripNights } from '../budget';
import { fixtureTransit } from '../../fixtures';
import { fixtureMeta } from '../k2/client';
import type { ResearchMeta, TransitOption, TripIntake } from '../types';

/**
 * Getting around at the destination — the intertransport budget.
 *
 * Wave 1 serves the bundled modes for every destination. Live research (prompt D)
 * lands in Wave 2; the shape it returns is already fixed by the contract, so the
 * route above this does not change when it does.
 */

/**
 * Days needing local transport: the day you land through the day you leave. For a
 * trip with an overnight flight that is the same count as nights, which is the
 * conservative read. Wave 2 can narrow this using the flights actually chosen.
 */
function daysOnGround(intake: TripIntake): number {
  return tripNights(intake);
}

export async function researchTransit(
  intake: TripIntake,
): Promise<{ options: TransitOption[]; meta: ResearchMeta }> {
  const started = Date.now();
  const days = daysOnGround(intake);

  const options = fixtureTransit.map((option) =>
    option.days === days ? option : { ...option, days, costCents: option.perDayCents * days },
  );

  return {
    options,
    meta: fixtureMeta(started, 'local transport options are the bundled set; live research lands in Wave 2'),
  };
}
