/**
 * Pre-fetches research for the demo trips so a live demo never waits on the model.
 *
 * Research runs 4–11 seconds per call against K2 Think, and occasionally ~20 when a
 * reply needs repairing. That is fine while building and wrong while someone is
 * watching. Warming writes every response into .k2cache/, after which the same trip
 * comes back instantly and costs nothing.
 *
 *   npm run dev                 # in one terminal, with K2_MODE=live
 *   npm run warm                # in another
 *
 * Re-run it after editing a prompt or bumping SCHEMA_VERSION — both are part of the
 * cache key, so old entries stop matching on purpose.
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

/** Three trips chosen to show different shapes of problem, not three nice cities. */
const DEMO_TRIPS: { label: string; why: string; intake: Intake }[] = [
  {
    label: 'Tokyo',
    why: 'transpacific red-eye, dense transit, many venues that shut one day a week',
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
    label: 'Mexico City',
    why: 'short haul on a tight budget, where the food bucket does the deciding',
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
    why: 'the trip nobody should fly: rail and driving beat the plane on price and time',
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
    label: 'Reykjavik',
    why: 'the trip where renting a car costs more than the hotel',
    intake: {
      origin: 'JFK',
      destination: 'Reykjavik, Iceland',
      startDate: '2027-02-10',
      endDate: '2027-02-15',
      travelers: 2,
      budgetTotal: 360_000,
      interests: ['hiking', 'food'],
      pace: 'relaxed',
    },
  },
];

const ENDPOINTS = ['flights', 'activities', 'lodging', 'transit'] as const;

const baseUrl = (
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000'
).replace(/\/+$/, '');

async function warm(path: string, intake: Intake) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intake }),
    signal: AbortSignal.timeout(400_000),
  });

  if (!response.ok) {
    return { ok: false, ms: Date.now() - started, detail: `HTTP ${response.status}` };
  }

  const payload = (await response.json()) as {
    options: unknown[];
    meta: { source: string; warnings: string[] };
  };

  return {
    ok: true,
    ms: Date.now() - started,
    count: payload.options.length,
    source: payload.meta.source,
    warnings: payload.meta.warnings,
  };
}

async function main(): Promise<void> {
  console.log(`\nWarming the research cache against ${baseUrl}\n`);

  const reachable = await fetch(baseUrl, { signal: AbortSignal.timeout(5_000) })
    .then(() => true)
    .catch(() => false);

  if (!reachable) {
    console.log(`Nothing is listening on ${baseUrl}.\n`);
    console.log('Start the app first, with a key in .env.local and K2_MODE=live:\n');
    console.log('  npm run dev\n');
    console.log('Then run this again. Pass --url=http://localhost:3200 for another port.\n');
    process.exitCode = 1;
    return;
  }

  let served = 0;
  let live = 0;

  for (const trip of DEMO_TRIPS) {
    console.log(`${trip.label} — ${trip.why}`);

    for (const endpoint of ENDPOINTS) {
      const result = await warm(`/api/research/${endpoint}`, trip.intake);

      if (!result.ok) {
        console.log(`  ${endpoint.padEnd(12)} failed: ${result.detail}`);
        continue;
      }

      served += 1;
      if (result.source === 'live') live += 1;

      const noise = result.warnings?.length ? `  (${result.warnings.length} warnings)` : '';
      console.log(
        `  ${endpoint.padEnd(12)} ${String(result.count).padStart(2)} options  ` +
          `${String(result.ms).padStart(6)}ms  ${result.source}${noise}`,
      );

      if (result.source === 'fixture') {
        console.log('               ^ served sample data — check IFM_API_KEY and K2_MODE=live');
      }
    }
    console.log('');
  }

  console.log(
    `${served} of ${DEMO_TRIPS.length * ENDPOINTS.length} calls answered; ${live} hit the model.`,
  );
  console.log('Run it a second time — everything should come back from cache in milliseconds.\n');
}

await main();
