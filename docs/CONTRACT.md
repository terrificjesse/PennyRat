# The contract

`src/lib/types.ts` is the source of truth. This file explains it. Both were frozen in
Wave 0 — to change either, see AGENTS.md §5.

## The one rule

**Money is integer cents.** `420000` is $4,200. Never store dollars, never use a float,
never `parseFloat` a price. Render with `formatCents` and read user input with
`parseDollarsToCents`, both from `src/lib/budget.ts`.

## Intake

`TripIntake` is step 1:

```ts
{
  origin: 'ORD',                 // IATA or city name
  destination: 'Tokyo, Japan',
  startDate: '2026-10-12',       // yyyy-mm-dd, the day they leave home
  endDate: '2026-10-17',         // the day they head back
  travelers: 2,                  // 1-12
  budgetTotal: 420000,           // cents, everything in
  interests: ['food', 'tourist', 'art'],
  pace: 'balanced',              // relaxed | balanced | packed
}
```

`endDate` must be after `startDate`; the schema enforces it.

## Buckets

The budget divides six ways: `flights`, `lodging`, `activities`, `food`, `localTransit`,
`buffer`. `localTransit` is the intertransport allowance — subway passes, rideshare, a
rental car — held apart so it does not get eaten by dinner.

`allocateBuckets(intake)` suggests a split that sums to **exactly** `budgetTotal`.
`setBucket` rebalances when the user drags a slider, preserving that total.

A bucket going over is a warning. Only the global remainder blocks submission.

## Options

Everything checkable is a `TripOption`, a discriminated union on `kind`. Every member has:

| Field | Meaning |
|---|---|
| `id` | stable, prefixed: `flt_`, `act_`, `lodg_`, `tr_` |
| `bucket` | which budget bucket it draws from |
| `title` | what the card shows |
| `costCents` | **total for the whole party for the whole trip, already multiplied out** |
| `costBasis` | `per_person` / `per_party` / `per_night` / `per_day` — for explaining the number, not recomputing it |
| `estimated` | true ⇒ the UI must badge it "AI estimate" |
| `confidence` | `low` / `medium` / `high`, self-rated by the model |

That `costCents` rule is the one most likely to get broken. A $124-a-night hotel for four
nights is `costCents: 49600`, `nightlyCents: 12400`, `nights: 4`, `costBasis: 'per_night'`.
The card may render "$496 · $124 a night". It may not multiply anything.

### FlightOption

`direction` (`outbound` / `return`), `legs[]`, `stops`, `totalDurationMinutes`, `cabin`,
`baggageIncluded`. `stops === legs.length - 1`. `totalDurationMinutes` includes layovers, so
it is ≥ the sum of leg durations.

Times are **local to each airport**, `yyyy-mm-ddTHH:mm`, no timezone suffix. Eastbound
transpacific returns legitimately arrive at an earlier local time than they departed — do
not "fix" that.

### ActivityOption

`category`, `neighborhood`, `description` (≤240 chars), `durationMinutes`, `openingHours`,
`closedDates`, `bookingRequired`, `interests`, `bestTimeOfDay`, optional `rating`,
`reviewCount`, `sensoryNotes`, `lat`/`lng`.

Restaurants bill to the `food` bucket. Everything else bills to `activities`.

`openingHours` has all seven weekday keys (`sun`…`sat`). A day is either an array of
`{ open, close }` windows in `HH:mm`, or `null` for closed:

```ts
{ sun: [{ open: '09:30', close: '17:00' }], mon: null, tue: [...], ... }
```

Map a date to a key with `DAY_KEYS[new Date(date).getDay()]`.

### LodgingOption

`type` (`hotel` / `motel` / `airbnb` / `hostel` / `boutique`), `tier` (`budget` / `mid` /
`comfort` / `premium`), `nightlyCents`, `nights`, `neighborhood`, `description`, `amenities`,
optional `rating`, `walkabilityNote`. `costCents === nightlyCents * nights`.

`nights` is hotel nights, which is not always trip nights — a red-eye spends one of them in
the air.

### TransitOption

`mode` (`rental_car` / `transit_pass` / `rideshare` / `walk_bike`), `perDayCents`, `days`,
`description`, optional `coverageNote`. `costCents === perDayCents * days`. `days` is days
on the ground, not calendar days of the trip.

## Itinerary

`Itinerary` is `days: DayPlan[]`, each a `date` plus `blocks: ScheduleBlock[]`,
`daySpendCents`, and `warnings`. A block has `start`/`end` local datetimes, a `kind`
(`flight` / `activity` / `meal` / `lodging_checkin` / `lodging_checkout` / `transit` /
`free`), a `title`, an optional `refId` back to the option, and `costCents`.

`unscheduled` carries `{ id, reason }` for anything that would not fit. The reason is shown
to the user, so it has to be actionable: "closed Mondays", not "no slot available".

## Routes

Every research route takes `{ intake }` and answers `{ options, meta }`.

```
POST /api/research/flights      → { options: FlightOption[],   meta }
POST /api/research/activities   → { options: ActivityOption[], meta }
POST /api/research/lodging      → { options: LodgingOption[],  meta }
POST /api/research/transit      → { options: TransitOption[],  meta }
POST /api/schedule              → { itinerary }
```

`meta` is `{ source: 'live' | 'cache' | 'fixture', latencyMs, model, warnings: string[] }`.
Show `source` somewhere in dev — knowing whether you are looking at real research or fixtures
saves a lot of confusion. `warnings` covers dropped items and unmet quotas; it is not an error.

`/api/schedule` takes `{ intake, options, selectedIds }` where `options` holds the full
objects for the selected ids, so the server never has to re-fetch research.

Errors are `{ error, detail? }` with a non-2xx status. The Wave 0 stubs return 501.

## Fixtures

`src/fixtures/` is a complete sample trip: ORD to Tokyo, two travelers, $4,200, 12 Oct
to 17 Oct 2026. 11 flights, 18 activities, 12 stays, 4 transit modes.

Import through `src/fixtures/index.ts` — it parses everything through the schemas at import,
so a bad edit fails loudly instead of halfway through a render:

```ts
import { fixtureOptions, fixtureIntake } from '@/fixtures';
```

The sample trip is provably completable within budget, and provably not completable if you
pick the most expensive of everything. `src/fixtures/fixtures.test.ts` holds both.
