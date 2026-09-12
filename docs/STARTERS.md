# Starter prompts

Paste one of these at the top of each window. Both lanes read AGENTS.md first; these only
say what this window is for.

Six AI windows total, three per lane, running as three concurrent waves with a human commit
between each. Wave 0 is done.

---

## Where the project is

The app plans a whole trip: live K2 research, round-trip fares, a planner that fills
every day with three meals and eight hours of activity, an editable itinerary contract,
and a demo rehearsal that gates on all of it. 380 tests, typecheck, lint and build clean.

This round is mostly about the shape of the product. The wizard asks for things in the
wrong order, front-loads a budget screen nobody wants, misses obvious landmarks, plans
food without budgeting for it, and offers no way back to yesterday's trip.

**The contract for this round has already landed and is green** — travel modes,
`mapsUrl`, `pinned` and `forecastFood` are all in `src/lib/types.ts` and
`src/lib/budget.ts`, and every one of them is additive, so nothing either lane has built
is broken. Both prompts below can start immediately.

**Needed from the human:** save the send-off image to `public/enjoy-your-trip.jpg`.

---

## Codex Plus — the shape of the product

```
You are the UI/UX lane on PennyRat. Read AGENTS.md and
docs/requests/claude-to-codex.md first.

This round is about the shape of the product, not its correctness. The planner already
fills every day with meals and activities, marks what it suggested, and hands you
alternatives and couldAdd for editing. Almost none of that is visible yet.

1. Swap Explore and Stay. The order becomes Plan, Getting there, Stay, Explore, Around,
   Schedule. Somewhere to sleep outranks sightseeing.

2. Kill the budget allocation screen. No per-category sliders before anybody has seen a
   price. Each step shows what is left and lets money move into that category in place,
   while looking at the options it buys. The six buckets still exist underneath.

3. The home screen becomes a list of saved trips. Trips save as they are planned and
   appear with destination, dates and total; open, rename, delete. localStorage, wrapping
   the state the store already persists. The logo stays the way back to it.

4. Editing at the end must not send anyone back through the wizard. block.alternatives
   and day.couldAdd are already populated — build the swap and add controls onto the
   itinerary itself.

5. Drag to reorder. Post the new position as `pinned` on /api/schedule and re-render. A
   pin the scheduler rejects comes back in `unscheduled` with a reason: snap it back and
   show that reason rather than inventing copy.

6. A map link on every activity and lodging card and on itinerary blocks, from the
   `mapsUrl` the providers now supply. Do not build it from lat/lng — those are empty.

7. The send-off: an "enjoy your trip" reveal on the finished itinerary using
   public/enjoy-your-trip.jpg, fading or sliding in. Honour prefers-reduced-motion.

8. Round trips are in the data and invisible in the UI. One card covering both
   directions, with the saving against two one-ways shown.

The contract is already in and green, so all of this is real today:

- `option.mode` is 'plane' | 'train' | 'bus' | 'car'. Absent means plane — read it with
  travelMode(option) from @/lib/types and label it with TRAVEL_MODE_LABELS. Build
  "Getting there" around the mode rather than assuming a plane.
- A leg's from/to are place labels now, 2 to 40 characters, not airport codes. Anything
  rendering them as an IATA badge has to cope with "Boston South Station".
- BUCKET_LABELS.flights already reads "Getting there", so a step titled from the bucket
  label updates itself.
- forecastFood(intake, options) from @/lib/budget gives you the food number for the
  Explore step: "about $420 on food across five days".
- mapsUrl and pinned exist in the contract; I am populating and honouring them now, so
  they may be absent for a little longer. Build against them.

Your lane: src/components/**, src/app/** except api/, src/lib/store/**, globals.css.
Never run git. End with the HANDOFF block from AGENTS.md §12.
```

---

## Claude Code — research, pricing, the planner

```
You are the API/logic lane on PennyRat. Read AGENTS.md and
docs/requests/codex-to-claude.md first.

The contract is done and green: mode, mapsUrl, pinned and forecastFood are all in, all
additive, and filed to Codex. 390 tests pass. This is the work behind those fields.

1. Getting there, not just flights. The contract carries mode already; nothing
   researches it yet. Prompt B should ask for trains, coaches and driving when the pair
   is short enough to make flying silly, each priced the way it is really sold: a rail
   fare, a coach ticket, fuel plus tolls plus parking for a car. providers/flights.ts
   sets mode and reuses estimateFare and the existing round-trip branch — a train round
   trip is the same shape as a flight round trip. Leg from/to are place labels now, so
   stations pass validation where they used to be dropped.

2. The landmarks problem. A Washington DC trip came back with no monuments. Prompt A
   needs an explicit floor on the places a first-time visitor would be disappointed to
   miss, named as such, before anything clever. DC must return the Lincoln Memorial and
   the Mall. Raise the attraction quota alongside the existing 10-restaurant floor.

3. Food has to be in the budget. Add forecastFood(intake, options) to lib/budget.ts —
   median researched restaurant price times three meals times days on the ground —
   reserve it during auto-fill, and expose it so the Explore step can say "about $420 on
   food across five days". This is the fix for the $150-$300 overage rehearse reports on
   every trip right now.

4. mapsUrl on activities and lodging, built in the providers from name, neighbourhood
   and destination as a maps search query. Never from lat/lng: they are empty on all 28
   fixture activities because the model does not fill them, and a hallucinated
   coordinate drops a pin in the sea.

5. Pinned blocks in schedule/pack.ts. /api/schedule takes
   pinned?: {id, date, startMinutes}[]. Place pins first, pack around them, and return
   any that cannot hold in `unscheduled` with a reason the UI can show.

6. Tests and rehearsal: ground travel priced and placed, a pin honoured and an
   impossible pin rejected, the food forecast matching what the planner actually spends,
   and npm run rehearse asserting the overage is gone.

Your lane: src/lib/{k2,providers,schedule}/**, src/app/api/**, scripts/**, fixtures with
care. Do not touch src/components/** or src/lib/store/**. Never run git. End with the
HANDOFF block from AGENTS.md §12.
```
