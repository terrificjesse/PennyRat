import {
  BUCKET_KEYS,
  type BucketKey,
  type BudgetPlan,
  type Cents,
  type TripIntake,
  type TripOption,
} from './types';

/**
 * All budget math for the app. Pure, no I/O, no React. Components must call into
 * here rather than summing prices themselves — a second implementation is how a
 * running total starts disagreeing with itself.
 */

const MS_PER_DAY = 86_400_000;

function epochDay(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Nights of lodging: Sep 20 → Sep 24 is 4. */
export function tripNights(intake: Pick<TripIntake, 'startDate' | 'endDate'>): number {
  return Math.max(1, epochDay(intake.endDate) - epochDay(intake.startDate));
}

/** Calendar days on the ground, both endpoints counted: Sep 20 → Sep 24 is 5. */
export function tripDays(intake: Pick<TripIntake, 'startDate' | 'endDate'>): number {
  return tripNights(intake) + 1;
}

/** Every date from startDate to endDate inclusive, as yyyy-mm-dd. */
export function tripDateRange(intake: Pick<TripIntake, 'startDate' | 'endDate'>): string[] {
  const start = epochDay(intake.startDate);
  return Array.from({ length: tripDays(intake) }, (_, i) =>
    new Date((start + i) * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

export function formatCents(value: Cents): string {
  const dollars = value / 100;
  const fractionDigits = Number.isInteger(dollars) ? 0 : 2;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Parses a user-typed dollar amount ("2,400", "$2400.50") into cents. NaN-safe. */
export function parseDollarsToCents(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

const BASE_WEIGHTS: Record<BucketKey, number> = {
  flights: 0.35,
  lodging: 0.3,
  activities: 0.15,
  food: 0.12,
  localTransit: 0.05,
  buffer: 0.03,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Splits `total` across `keys` by weight so the parts sum to exactly `total`.
 * Largest-remainder: floor everything, then hand the leftover cents to whichever
 * keys were rounded down hardest. Weights that sum to zero split evenly.
 */
function allocateExact<K extends string>(
  total: Cents,
  keys: readonly K[],
  weights: Record<K, number>,
): Record<K, Cents> {
  const safeWeight = (key: K) => Math.max(0, weights[key] ?? 0);
  const weightSum = keys.reduce((acc, key) => acc + safeWeight(key), 0);
  const parts = keys.map((key) => {
    const share = weightSum > 0 ? safeWeight(key) / weightSum : 1 / keys.length;
    const exact = total * share;
    const floor = Math.floor(exact);
    return { key, floor, remainder: exact - floor };
  });

  let leftover = total - parts.reduce((acc, part) => acc + part.floor, 0);
  const out = {} as Record<K, Cents>;
  for (const part of [...parts].sort((a, b) => b.remainder - a.remainder)) {
    out[part.key] = part.floor + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover -= 1;
  }
  return out;
}

/**
 * Opening suggestion for how to divide the budget. Flights are a fixed cost, so
 * their share shrinks on longer trips while lodging and food grow; bigger parties
 * share rooms, so lodging gives a little back to food.
 */
export function allocateBuckets(intake: TripIntake): BudgetPlan {
  const nights = tripNights(intake);
  const lengthTilt = clamp((nights - 4) * 0.02, -0.08, 0.12);
  const partyTilt = clamp((intake.travelers - 2) * 0.01, 0, 0.05);

  const weights: Record<BucketKey, number> = {
    ...BASE_WEIGHTS,
    flights: BASE_WEIGHTS.flights - lengthTilt,
    lodging: BASE_WEIGHTS.lodging + lengthTilt * 0.6 - partyTilt,
    food: BASE_WEIGHTS.food + lengthTilt * 0.4 + partyTilt,
  };

  return allocateExact(intake.budgetTotal, BUCKET_KEYS, weights);
}

/** Redistributes the plan when the user drags one bucket's slider. */
export function setBucket(
  plan: BudgetPlan,
  bucket: BucketKey,
  nextValue: Cents,
  total: Cents,
): BudgetPlan {
  const clamped = clamp(Math.round(nextValue), 0, total);
  const others = BUCKET_KEYS.filter((key) => key !== bucket);
  const othersTotal = others.reduce((acc, key) => acc + plan[key], 0);
  const remaining = total - clamped;

  const weights = Object.fromEntries(
    others.map((key) => [key, othersTotal === 0 ? 1 : plan[key]]),
  ) as Record<BucketKey, number>;

  const next = { ...plan, [bucket]: clamped } as BudgetPlan;
  const scaled = allocateExact(remaining, others, weights);
  for (const key of others) next[key] = scaled[key];
  return next;
}

export type BucketStatus = {
  planned: Cents;
  spent: Cents;
  remaining: Cents;
  over: boolean;
};

export type BudgetState = {
  perBucket: Record<BucketKey, BucketStatus>;
  spentTotal: Cents;
  remainingTotal: Cents;
  overBuckets: BucketKey[];
  overTotal: boolean;
};

/**
 * Current standing of the budget given what is checked. A bucket going over is a
 * warning, not a blocker — only the global remainder gates submission.
 */
export function applySelection(
  plan: BudgetPlan,
  total: Cents,
  options: readonly TripOption[],
  selectedIds: readonly string[],
): BudgetState {
  const selected = new Set(selectedIds);
  const spentByBucket = Object.fromEntries(BUCKET_KEYS.map((key) => [key, 0])) as Record<
    BucketKey,
    Cents
  >;

  let spentTotal = 0;
  for (const option of options) {
    if (!selected.has(option.id)) continue;
    spentByBucket[option.bucket] += option.costCents;
    spentTotal += option.costCents;
  }

  const perBucket = Object.fromEntries(
    BUCKET_KEYS.map((key) => {
      const planned = plan[key];
      const spent = spentByBucket[key];
      return [key, { planned, spent, remaining: planned - spent, over: spent > planned }];
    }),
  ) as Record<BucketKey, BucketStatus>;

  return {
    perBucket,
    spentTotal,
    remainingTotal: total - spentTotal,
    overBuckets: BUCKET_KEYS.filter((key) => perBucket[key].over),
    overTotal: spentTotal > total,
  };
}

export type FoodForecast = {
  /** What eating costs the whole party for one day. */
  perDayCents: Cents;
  /** The same across every day on the ground. */
  totalCents: Cents;
  mealsPerDay: number;
};

const MEALS_PER_DAY = 3;

/**
 * What this trip will cost to eat.
 *
 * The planner puts breakfast, lunch and dinner on every day, so that money is going to
 * be spent whether or not anybody budgeted for it. Forecasting it up front is what stops
 * the trip spending its whole budget on attractions and then discovering dinner — which
 * is exactly how every demo trip ended up over.
 *
 * The median researched price is used rather than the mean: one omakase counter should
 * not drag the estimate up for a trip of noodle bars.
 */
export function forecastFood(
  intake: TripIntake,
  options: readonly TripOption[],
): FoodForecast {
  const prices = options
    .filter(
      (option): option is Extract<TripOption, { kind: 'activity' }> =>
        option.kind === 'activity' && option.category === 'restaurant',
    )
    .map((option) => option.costCents)
    .sort((a, b) => a - b);

  // No research yet: a plain per-person guess, so the reserve is never zero.
  const median =
    prices.length === 0
      ? 2_200 * intake.travelers
      : prices[Math.floor(prices.length / 2)];

  const perDayCents = median * MEALS_PER_DAY;
  const days = Math.max(1, tripNights(intake));

  return { perDayCents, totalCents: perDayCents * days, mealsPerDay: MEALS_PER_DAY };
}

export type SubmitCheck = {
  ok: boolean;
  /** Genuinely stops the trip. Only ever one thing: spending more than you have. */
  blockers: string[];
  /** Worth saying, never worth stopping for — the traveler may have other plans. */
  warnings: string[];
  /**
   * @deprecated Blockers and warnings combined, kept so the UI lane can migrate
   * without a red build. Remove once SubmitGate reads the two lists separately.
   */
  reasons: string[];
};

/**
 * The gate on the itinerary step.
 *
 * Only going over budget stops anything. Somebody driving to the coast, or staying
 * with family, still has a trip worth planning — telling them they cannot proceed
 * without a flight and a hotel would be the app misunderstanding its own job.
 */
export function canSubmit(
  intake: TripIntake,
  options: readonly TripOption[],
  selectedIds: readonly string[],
): SubmitCheck {
  const selected = new Set(selectedIds);
  const picked = options.filter((option) => selected.has(option.id));
  const blockers: string[] = [];
  const warnings: string[] = [];

  const spent = picked.reduce((acc, option) => acc + option.costCents, 0);
  if (spent > intake.budgetTotal) {
    blockers.push(`You are ${formatCents(spent - intake.budgetTotal)} over budget.`);
  }

  const flights = picked.filter((option) => option.kind === 'flight');
  const covers = (direction: 'outbound' | 'return') =>
    flights.some(
      (flight) => flight.direction === direction || flight.direction === 'roundtrip',
    );

  if (!covers('outbound')) {
    warnings.push('No flight out — fine if you are driving or already there.');
  }
  if (!covers('return')) {
    warnings.push('No flight home — fine if you are travelling on from here.');
  }
  if (!picked.some((option) => option.kind === 'lodging')) {
    warnings.push('Nowhere to stay picked — fine if you have somewhere already.');
  }
  if (!picked.some((option) => option.kind === 'activity')) {
    warnings.push('Nothing chosen to do yet. We will fill the days in for you.');
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    reasons: [...blockers, ...warnings],
  };
}

/**
 * Unselected options that still fit the remaining budget, priciest first, so the
 * "you still have $180 to spend" nudge can offer something worth doing.
 */
export function suggestFillers(
  options: readonly TripOption[],
  selectedIds: readonly string[],
  remaining: Cents,
  limit = 3,
): TripOption[] {
  if (remaining <= 0) return [];
  const selected = new Set(selectedIds);
  return options
    .filter(
      (option) =>
        !selected.has(option.id) &&
        option.costCents > 0 &&
        option.costCents <= remaining &&
        option.kind === 'activity',
    )
    .sort((a, b) => b.costCents - a.costCents)
    .slice(0, limit);
}
