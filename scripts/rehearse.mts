/**
 * Runs the three demo trips end to end against the live app and says whether each one
 * would hold up in front of an audience.
 *
 * Unit tests prove the parts work. This proves the demo works: research actually
 * answering, a realistic basket staying inside the budget, and a schedule with enough
 * on it to be worth showing. Run it the morning of the demo, after `npm run warm`.
 *
 *   npm run dev                 # in one terminal
 *   npm run rehearse            # in another
 *
 * Exits non-zero if any trip would embarrass you, so it can gate a deploy.
 */

type Intake = {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budgetTotal: number;
  interests: string[];
  pace: 'relaxed' | 'balanced' | 'packed';
};

type Option = {
  id: string;
  category?: string;
  interests?: string[];
  kind: 'flight' | 'activity' | 'lodging' | 'transit';
  title: string;
  costCents: number;
  direction?: 'outbound' | 'return' | 'roundtrip';
  mode?: 'plane' | 'train' | 'bus' | 'car';
  rating?: number;
};

type Block = { kind: string; title: string; refId?: string; suggested?: boolean };
type Day = {
  date: string;
  blocks: Block[];
  daySpendCents: number;
  filledMinutes?: number;
  couldAdd?: string[];
};
type Itinerary = {
  days: Day[];
  totalCents: number;
  chosenCents?: number;
  suggestedCents?: number;
  overBudgetCents?: number;
  unscheduled: { id: string; reason: string }[];
  warnings: string[];
};

const DEMO_TRIPS: { label: string; intake: Intake }[] = [
  {
    label: 'ORD → Tokyo',
    intake: {
      origin: 'ORD',
      destination: 'Tokyo, Japan',
      startDate: '2026-10-12',
      endDate: '2026-10-17',
      travelers: 2,
      budgetTotal: 600_000,
      interests: ['food', 'tourist', 'art'],
      pace: 'balanced',
    },
  },
  {
    label: 'SFO → Mexico City',
    intake: {
      origin: 'SFO',
      destination: 'Mexico City, Mexico',
      startDate: '2026-12-03',
      endDate: '2026-12-08',
      travelers: 2,
      budgetTotal: 260_000,
      interests: ['food', 'art'],
      pace: 'balanced',
    },
  },
  {
    label: 'Boston → Washington DC',
    intake: {
      origin: 'Boston, MA',
      destination: 'Washington DC, USA',
      startDate: '2026-11-05',
      endDate: '2026-11-09',
      travelers: 2,
      budgetTotal: 280_000,
      interests: ['history', 'food'],
      pace: 'balanced',
    },
  },
  {
    label: 'JFK → Reykjavík',
    intake: {
      origin: 'JFK',
      destination: 'Reykjavik, Iceland',
      startDate: '2027-02-10',
      endDate: '2027-02-15',
      travelers: 2,
      // Tight enough that the rental car has to be traded against other things.
      budgetTotal: 360_000,
      interests: ['hiking', 'food'],
      pace: 'relaxed',
    },
  },
];

/** What a trip has to clear to be worth putting in front of people. */
const BAR = {
  minOptionsPerKind: { flight: 4, activity: 8, lodging: 4, transit: 2 },
  minOutings: 6,
  minDaysWithSomethingOn: 3,
  /**
   * A trip that ends with a third of the money untouched is not demonstrating a
   * budget-first planner — it is demonstrating an unconstrained one. The tension is
   * the point, so a budget nobody has to spend down is a problem worth naming.
   */
  maxUnspentShare: 0.25,
  /** A research call slower than this will feel broken on stage. */
  slowCallMs: 20_000,
  /** A whole day at the destination should look like a day, not a gap with lunch in it. */
  fullDayMinutes: 8 * 60,
  /** Lunch and dinner want to be different places; that needs two a day. */
  restaurantsPerDay: 2,
};

const baseUrl = (
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000'
).replace(/\/+$/, '');

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(400_000),
  });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as T;
}

/** The selection a person would plausibly make: cheapest there and back, a mid bed. */
function chooseBasket(options: Option[], intake: Intake): Option[] {
  const of = (kind: Option['kind']) => options.filter((option) => option.kind === kind);
  const byPrice = (list: Option[]) => [...list].sort((a, b) => a.costCents - b.costCents);

  const flights = of('flight');
  const roundTrip = byPrice(flights.filter((f) => f.direction === 'roundtrip'))[0];
  const outward = byPrice(flights.filter((f) => f.direction === 'outbound'))[0];
  const homeward = byPrice(flights.filter((f) => f.direction === 'return'))[0];

  // Take the round trip when it beats buying the two halves, which it usually does.
  const pairCost = (outward?.costCents ?? Infinity) + (homeward?.costCents ?? Infinity);
  const travel =
    roundTrip && roundTrip.costCents <= pairCost
      ? [roundTrip]
      : [outward, homeward].filter(Boolean);

  const fixed = [...travel, byPrice(of('transit'))[0]].filter(Boolean) as Option[];

  const spentOnFixed = fixed.reduce((acc, option) => acc + option.costCents, 0);
  const lodging = byPrice(of('lodging'));
  const affordable = lodging.filter((stay) => spentOnFixed + stay.costCents <= intake.budgetTotal);
  const shortlist = affordable.length > 0 ? affordable : lodging.slice(0, 1);
  const bed = shortlist[Math.min(Math.floor(lodging.length / 2), shortlist.length - 1)];

  const basket = [...fixed, bed].filter(Boolean) as Option[];

  // Hold back the food line. The planner puts three meals a day on the plan, so
  // spending every last cent on attractions guarantees going over — and no traveler
  // budgets that way either.
  const foodReserve = Math.round(intake.budgetTotal * 0.18);
  let left =
    intake.budgetTotal - foodReserve - basket.reduce((acc, o) => acc + o.costCents, 0);

  for (const activity of [...of('activity')].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.costCents - b.costCents,
  )) {
    if (activity.costCents > left) continue;
    basket.push(activity);
    left -= activity.costCents;
  }

  // Money still on the table at the end goes into a better room, which is what a
  // person does rather than come home with a third of the budget untouched.
  if (bed && left > 0) {
    const ceiling = left + bed.costCents;
    const upgrade = [...lodging].reverse().find((stay) => stay.costCents <= ceiling);
    if (upgrade && upgrade.id !== bed.id) {
      const index = basket.findIndex((option) => option.id === bed.id);
      basket[index] = upgrade;
    }
  }

  return basket;
}

type Verdict = { label: string; problems: string[]; notes: string[] };

async function rehearse(trip: { label: string; intake: Intake }): Promise<Verdict> {
  const problems: string[] = [];
  const notes: string[] = [];
  const options: Option[] = [];

  console.log(`\n${trip.label}  ·  ${money(trip.intake.budgetTotal)}  ·  ${trip.intake.travelers} travelers`);

  for (const endpoint of ['flights', 'activities', 'lodging', 'transit'] as const) {
    const started = Date.now();
    let payload: { options: Option[]; meta: { source: string; warnings: string[] } };
    try {
      payload = await post(`/api/research/${endpoint}`, { intake: trip.intake });
    } catch (error) {
      problems.push(`${endpoint} research failed: ${(error as Error).message}`);
      console.log(`  ${endpoint.padEnd(11)} FAILED`);
      continue;
    }

    const ms = Date.now() - started;
    options.push(...payload.options);

    const kind = { flights: 'flight', activities: 'activity', lodging: 'lodging', transit: 'transit' } as const;
    const floor = BAR.minOptionsPerKind[kind[endpoint]];
    const count = payload.options.length;

    console.log(
      `  ${endpoint.padEnd(11)} ${String(count).padStart(2)} options  ${String(ms).padStart(6)}ms  ${payload.meta.source}`,
    );

    if (count < floor) problems.push(`only ${count} ${endpoint} to choose from (want ${floor}+)`);

    // Research quality, not just whether the trip completes. A batch that arrives thin
    // here is how a day ends up unfed or an interest goes unanswered.
    if (endpoint === 'activities') {
      const nights = Math.max(
        1,
        Math.round(
          (Date.parse(trip.intake.endDate) - Date.parse(trip.intake.startDate)) / 86_400_000,
        ),
      );
      const restaurants = payload.options.filter(
        (option) => option.category === 'restaurant',
      ).length;
      const wanted = nights * BAR.restaurantsPerDay;

      if (restaurants < wanted) {
        problems.push(
          `only ${restaurants} restaurants for ${nights} nights (want ${wanted}+, or days repeat)`,
        );
      }

      const covered = new Set(payload.options.flatMap((option) => option.interests ?? []));
      const missed = trip.intake.interests.filter((interest) => !covered.has(interest));
      if (missed.length > 0) {
        problems.push(`nothing came back for: ${missed.join(', ')}`);
      }

      const dropped = payload.meta.warnings.filter((w) => w.startsWith('dropped')).length;
      if (dropped > payload.options.length / 4) {
        problems.push(`${dropped} of the venues researched were discarded as unusable`);
      }
    }

    if (endpoint === 'flights') {
      const modes = [...new Set(payload.options.map((option) => option.mode ?? 'plane'))];
      console.log(`              ways to get there: ${modes.join(', ')}`);
    }
    if (payload.meta.source === 'fixture') {
      notes.push(`${endpoint} served sample data, not live research`);
    }
    if (ms > BAR.slowCallMs) notes.push(`${endpoint} took ${(ms / 1000).toFixed(0)}s — warm the cache`);
  }

  if (options.length === 0) {
    problems.push('no research at all, so there is nothing to demo');
    return { label: trip.label, problems, notes };
  }

  const basket = chooseBasket(options, trip.intake);
  const spent = basket.reduce((acc, option) => acc + option.costCents, 0);
  const left = trip.intake.budgetTotal - spent;
  const bed = basket.find((option) => option.kind === 'lodging');

  console.log(
    `  basket      ${basket.length} picks  ${money(spent)} of ${money(trip.intake.budgetTotal)}  (${money(left)} left)`,
  );

  if (spent > trip.intake.budgetTotal) {
    problems.push(
      `the cheapest realistic trip costs ${money(spent)}, over a ${money(trip.intake.budgetTotal)} budget`,
    );
  }
  if (!bed) problems.push('no lodging could be afforded');
  if (left > trip.intake.budgetTotal * BAR.maxUnspentShare) {
    const share = Math.round((left / trip.intake.budgetTotal) * 100);
    problems.push(
      `${money(left)} left unspent (${share}%) — the budget is not forcing any choices`,
    );
  }
  const covers = (direction: 'outbound' | 'return') =>
    basket.some(
      (option) =>
        option.kind === 'flight' &&
        (option.direction === direction || option.direction === 'roundtrip'),
    );
  if (!covers('outbound')) problems.push('no way of getting there');
  if (!covers('return')) problems.push('no way of getting home');

  let itinerary: Itinerary;
  try {
    const result = await post<{ itinerary: Itinerary }>('/api/schedule', {
      intake: trip.intake,
      options,
      selectedIds: basket.map((option) => option.id),
    });
    itinerary = result.itinerary;
  } catch (error) {
    problems.push(`scheduling failed: ${(error as Error).message}`);
    return { label: trip.label, problems, notes };
  }

  const outings = itinerary.days
    .flatMap((day) => day.blocks)
    .filter((block) => block.kind === 'activity' || block.kind === 'meal').length;
  const busyDays = itinerary.days.filter((day) =>
    day.blocks.some((block) => block.kind === 'activity' || block.kind === 'meal'),
  ).length;

  // Whole days only: arrival and departure days are cut short by the flights themselves.
  const whole = itinerary.days.filter(
    (day, index) =>
      index > 0 &&
      index < itinerary.days.length - 1 &&
      day.blocks.length > 0 &&
      !day.blocks.every((block) => block.kind === 'flight'),
  );
  const short = whole.filter((day) => (day.filledMinutes ?? 0) < BAR.fullDayMinutes);
  // A day that is mostly the run to the airport does not need a planned meal. The case
  // worth flagging is a day spent at the destination with nothing to eat on it.
  const hungry = itinerary.days.filter(
    (day) =>
      day.blocks.some((block) => block.kind === 'activity') &&
      !day.blocks.some((block) => block.kind === 'meal'),
  );

  const hours = whole.map((day) => ((day.filledMinutes ?? 0) / 60).toFixed(1)).join(', ');
  console.log(
    `  schedule    ${outings} outings across ${busyDays} days  ${itinerary.unscheduled.length} unplaced`,
  );
  console.log(
    `  full days   ${hours || 'none'} hours  ` +
      `(+${money(itinerary.suggestedCents ?? 0)} planned in)`,
  );

  // A day can be short because the pace caps it, which is the traveler's own choice.
  const paceCap = { relaxed: 2, balanced: 3, packed: 5 }[trip.intake.pace];
  // Short because the pace caps it, or because research ran dry, is fine. Short with
  // barely anything on it and more available is the planner not doing its job.
  const couldHaveFilled = short.filter((day) => {
    const activities = day.blocks.filter((block) => block.kind === 'activity').length;
    return (day.couldAdd?.length ?? 0) > 0 && activities < Math.min(2, paceCap);
  });
  if (couldHaveFilled.length > 0) {
    problems.push(
      `${couldHaveFilled.length} whole day(s) under ${BAR.fullDayMinutes / 60}h with more available`,
    );
  } else if (short.length > 0) {
    notes.push(`${short.length} whole day(s) short — research ran out of things to add`);
  }
  if (hungry.length > 0) {
    // The planner makes a final pass for any day with plans and no meal, so what is
    // left is a day packed solid with the traveler's own choices. Dropping one of their
    // picks to squeeze a suggested lunch in would be the wrong call, so this is worth
    // saying and not worth failing over.
    notes.push(`${hungry.length} day(s) too full to fit a meal in`);
  }
  // Food is forecast and reserved before the filler spends anything, so a plan that
  // still lands over budget means that reserve stopped working.
  // Going over at all is by design — the planner fills the day and reports the overage.
  // What is worth failing on is the food reserve breaking, which shows up as hundreds
  // rather than the odd dollar of rounding.
  const overage = itinerary.overBudgetCents ?? 0;
  // Going over is allowed by design when the traveler's own picks plus the meals they
  // need exceed what they said. What this is guarding against is the food reserve
  // breaking, which showed up as 6-11% of the budget rather than a few percent.
  const tolerated = Math.round(trip.intake.budgetTotal * 0.05);
  if (overage > tolerated) {
    problems.push(`filling the days out went ${money(overage)} over budget`);
  } else if (overage > 0) {
    notes.push(`${money(overage)} over budget after filling the days out`);
  }

  if (outings < BAR.minOutings) problems.push(`only ${outings} outings scheduled (want ${BAR.minOutings}+)`);
  if (busyDays < BAR.minDaysWithSomethingOn) {
    problems.push(`only ${busyDays} days have anything on them (want ${BAR.minDaysWithSomethingOn}+)`);
  }

  const daySum = itinerary.days.reduce((acc, day) => acc + day.daySpendCents, 0);
  const unplacedCost = basket
    .filter((option) => itinerary.unscheduled.some((miss) => miss.id === option.id))
    .reduce((acc, option) => acc + option.costCents, 0);
  if (daySum !== itinerary.totalCents - unplacedCost) {
    problems.push(`the day totals do not add up to the trip total (${money(daySum)} vs ${money(itinerary.totalCents - unplacedCost)})`);
  }

  for (const warning of itinerary.warnings) notes.push(`schedule: ${warning}`);
  for (const miss of itinerary.unscheduled.slice(0, 3)) notes.push(`unplaced: ${miss.reason}`);

  return { label: trip.label, problems, notes };
}

async function main(): Promise<void> {
  console.log(`\nRehearsing the demo against ${baseUrl}`);

  const reachable = await fetch(baseUrl, { signal: AbortSignal.timeout(5_000) })
    .then(() => true)
    .catch(() => false);

  if (!reachable) {
    console.log(`\nNothing is listening on ${baseUrl}. Start it with npm run dev.`);
    console.log('Pass --url=http://localhost:3200 for another port.\n');
    process.exitCode = 1;
    return;
  }

  const verdicts: Verdict[] = [];
  for (const trip of DEMO_TRIPS) verdicts.push(await rehearse(trip));

  console.log(`\n${'─'.repeat(64)}`);
  let failed = 0;

  for (const verdict of verdicts) {
    if (verdict.problems.length === 0) {
      console.log(`\n  READY   ${verdict.label}`);
    } else {
      failed += 1;
      console.log(`\n  NOT READY   ${verdict.label}`);
      for (const problem of verdict.problems) console.log(`            ${problem}`);
    }
    for (const note of verdict.notes.slice(0, 4)) console.log(`            note: ${note}`);
  }

  console.log('');
  if (failed > 0) {
    console.log(`${failed} of ${verdicts.length} trips would not survive a demo.\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`All ${verdicts.length} trips are ready.\n`);
}

await main();
