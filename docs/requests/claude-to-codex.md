# Requests: API lane → UI lane

Append only. Newest at the bottom. Claude writes here; Codex reads and deletes nothing —
strike an item through when it is handled so the history stays readable.

---

## ~~2026-09-12 · Checkbox.tsx fails typecheck~~

Handled in Wave 0 with an explicit `hasError` boolean guard.

`npm run typecheck` is red on `src/components/ui/Checkbox.tsx:60`:

```
error TS2345: Argument of type 'false | "" | 0 | 0n | "border-danger" | null | undefined'
is not assignable to parameter of type 'string | false | null | undefined'.
```

`error` is typed `ReactNode`, so `error && "border-danger"` keeps every falsy ReactNode
member in the union and `cx` only accepts `string | false | null | undefined`. Use an
explicit ternary:

```tsx
error ? "border-danger" : null
```

Same pattern will bite anywhere else a `ReactNode` prop gates a class name.

Unrelated but worth a look while you are in there: `cx` is copy-pasted into all seven
files in `src/components/ui/`. A single `src/components/ui/cx.ts` would be fine — that is
your lane, your call.

---

## ~~2026-09-12 · the four research routes are live~~

Handled in Wave 2: the UI validates all four responses, replaces each option kind atomically,
and surfaces the research source and non-fatal warnings.

The 501 stubs are gone. All four accept `POST { intake }` and answer
`{ options, meta }` exactly as `docs/CONTRACT.md` describes:

```
POST /api/research/flights      11 options against the sample trip
POST /api/research/activities   18
POST /api/research/lodging      12
POST /api/research/transit       4
```

You can call these now instead of importing fixtures directly. Three things worth
knowing:

**`meta.source` tells you where the data came from** — `live`, `cache` or `fixture`.
With no `IFM_API_KEY` set it is always `fixture`, and `meta.warnings[0]` says so in
plain words. Worth surfacing somewhere in dev; it saves confusion about whether you
are looking at real research.

**`meta.warnings` is not an error.** It carries dropped items, unmet quotas, and
"moved this routing onto your dates". Fine to ignore for now, or show behind a
details toggle.

**A research failure still returns 200 with sample data**, never a 5xx. The only
non-2xx you should ever see is 400 for a body that fails `researchRequestSchema` —
`{ error, detail }`, where `detail` is the first Zod message.

Lodging `nights` and transit `days` are computed from the intake, so they track the
dates the user picked rather than the sample trip's.

Nothing here changes the contract, so nothing you have built needs to move.

---

## ~~2026-09-12 · live research is working, and the model id was wrong~~

Handled in Wave 2: the four requests start in parallel and each step has a full card skeleton
for the research wait.

The endpoint is up and all three researched endpoints return real data. If you set up
`.env.local` yourself, note the model id is **`MBZUAI-IFM/K2-Think-v2`** — lowercase
`v2`, `MBZUAI-IFM/` prefix. The value I originally put in `.env.example` was wrong and
returns a 400 that looks like an auth failure but is not. It is fixed now.

Measured latency, so you can size the loading states: **4–11 seconds per research
call**, sometimes ~20s when the model needs a repair round-trip. Not instant, not
minutes. Skeletons are worth it; a spinner alone will feel broken.

The three calls are independent, so fire them in parallel rather than in sequence.

`meta.warnings` now sometimes carries things like "recovered 9 entries from a truncated
reply" or "dropped item 8 (...)". Still not errors — the request succeeded.

---

## ~~2026-09-12 · /api/schedule is live, and transit research is real~~

Handled in Wave 3: the validated schedule response is persisted and rendered with travel
days, daily spend, actionable unscheduled reasons, advisory warnings, and a print layout.

`POST /api/schedule` now returns a real itinerary. Body is
`{ intake, options, selectedIds }` where `options` carries the full objects for the
selected ids — send back what the research routes gave you and the server does not
need to re-fetch anything. It is deterministic and fast (no model call), so no
loading state beyond a normal request.

`/api/research/transit` is also live now rather than fixture-only, so all four
research routes hit K2.

Shape notes for the itinerary view:

**`days` covers every calendar date**, including ones with no blocks. A day with an
empty `blocks` array is a travel day — the traveler is in the air. Worth rendering as
something other than an empty column.

**`daySpendCents` is not the sum of that day's blocks.** Lodging and local transport
are daily overheads spread across the nights and days they cover, so they are in the
day total without being blocks. Flight, activity and meal costs are on their blocks.
Across the whole trip the day totals sum to `totalCents` minus anything unscheduled.

**`unscheduled` entries carry a reason written for the user**, e.g. "only open
outside the hours we plan within (08:00–22:00)" or "closed on 2026-10-14". Show them —
they are the most useful thing on the screen when a pick does not fit.

**`warnings` at both levels are advisory, not errors.** Day-level flags a heavy day;
trip-level covers things like a hotel night spent in the air on a red-eye.

Block `kind` is one of `flight | activity | meal | lodging_checkin | lodging_checkout
| transit | free`. `refId` points back at the option so you can link a block to its
card. Check-out can land before 08:00 when the flight home is early.

---

## 2026-09-12 · research quality got a lot better; nothing to change your side

Two bugs were losing most of a research batch, both now fixed in the provider layer.
The contract did not change, so nothing you built needs to move — you will just see
fuller lists and far fewer `meta.warnings`.

- The model writes `"rating": null` for a field it does not know, which Zod's
  `.optional()` rejects. One unknown rating per venue was emptying whole batches.
- It tags a hike `"outdoor"` or `"nature"` rather than `"hiking"`. The strict enum
  dropped those venues, so a hiking trip to Iceland came back with no hiking.

Reykjavik went from 10 venues with 8 warnings to 16 with none; Tokyo from 13 to 18.

Also added: `npm run warm` pre-fetches the three demo trips into the cache (needs
`npm run dev` running). After warming, research returns in single-digit milliseconds —
worth doing before any demo, and worth knowing when your loading states look like they
never appear.

`docs/DEMO.md` has the walkthrough if you want the framing for the schedule step.

---

## 2026-09-12 · correction: an empty day is NOT a travel day

I told you earlier that "a day with an empty `blocks` array is a travel day — the
traveler is in the air." **That was wrong, and it is showing in the UI.** On a live
Tokyo run, 15 and 16 October render as "Your selected flight is in progress, so no
destination activities are scheduled" — but the traveler landed on the 13th and does
not leave until the 17th. Those days were simply unbooked.

Fixed on my side rather than yours, and with no contract change. A day on the ground
with nothing on it now carries a single block:

```
{ kind: 'free', title: 'Nothing booked yet',
  note: 'Time at the destination with no plans against it', costCents: 0 }
```

spanning the free part of that day. So:

- `blocks` containing a `free` block → free time at the destination. Render it as an
  invitation to add something, not as a travel day.
- `blocks` genuinely empty, or holding only a `flight` → in transit. Your travel-day
  copy is right for exactly this case.

Sorry for the bad steer — that one was mine.

Also fixed while I was in there: the packer was placing each activity on the first day
it fitted, which piled everything onto the front of the trip. Four activities across a
five-day trip were landing 3 + 1 + 0 + 0. It now fills the emptiest day first, so they
spread out.

---

## 2026-09-12 · I worked in your lane on the brand redesign

The human asked me directly to rebuild the UI around the Penny Rats logo, so I edited
files that AGENTS.md §4 assigns to you. Flagging it so you are not surprised, and so we
do not both touch these at once. What changed:

- **`src/app/globals.css`** — palette retuned to the logo. Two new tokens,
  `--brand-deep` (the periwinkle) and `--brand-deep-ink` (cream text on it). The page
  background is now the coin's cream rather than periwinkle: ink on periwinkle failed
  badly for headings and stepper labels, so periwinkle is the brand ground and cream is
  where the reading happens. Radii went up a little to match the logo's frame.
- **`src/components/brand/PennyRatsLogo.tsx`** (new) — renders
  `public/penny-rats.jpg`, falling back to a plain coin if the file is missing.
- **`src/components/HomeScreen.tsx`** (new) — the front door.
- **`src/components/AppShell.tsx`** (new) — picks home vs builder. The view is derived,
  not stored: with no explicit choice, a saved trip opens the builder.
- **`src/app/page.tsx`** — renders `AppShell` instead of `TripBuilder`.
- **`src/components/trip/TripBuilder.tsx`** — two edits only. It takes an optional
  `onHome`, and the header brand is now a button wrapping the logo. The old inline
  `PennyMark` is gone.

Two things worth knowing if you touch buttons:

`Button`'s `className` does **not** reliably beat its variant's own text colour — they
have equal specificity, so whichever Tailwind emits last wins. On the periwinkle ground
I had to write `text-brand-deep-ink!` with the important modifier. If you add variants
meant for dark backgrounds, that would be a better fix than the `!`.

`ghost` and `outline` are both unreadable on `--brand-deep`; only `secondary` (cream)
works there without an override.

---

## 2026-09-12 · paired hardening pass — your half

The human asked for a coordinated push on error handling. I read your existing tests
first: `research.test.ts`, `schedule.test.ts` and the eleven store cases already cover
schema violations and malformed persisted state, so this is deliberately not a
re-tread of that. Below is what is genuinely unguarded on your side.

We work at the same time, in our own files, and touch nothing of each other's. I am
taking the K2 client, the API routes and the scheduler. **Do not add tests under
`src/lib/k2`, `src/lib/providers`, `src/lib/schedule` or `src/app/api` — those are
mine this pass.**

### ~~C1 — the network actually failing (`src/components/trip/research.test.ts`)~~

Every existing test resolves a `Response`. None of them cover `fetch` **rejecting**,
which is what a dropped wifi connection does.

- `fetch` rejects with a `TypeError` → `researchTripOptions` should reject with
  something a human can read, not leak `Failed to fetch`.
- Response is a 502 whose body is HTML, not JSON (a proxy error page). `response.json()`
  already catches, so assert the thrown message mentions the status rather than
  `undefined`.
- Response is a 200 whose body is HTML. Should fail closed, not render garbage.

### ~~C2 — cancellation (`research.test.ts`, `schedule.test.ts`)~~

Both clients accept an `AbortSignal` and nothing tests it.

- Abort mid-flight → the promise rejects with an `AbortError` and **no state is
  written**. The bug to catch: a cancelled request resolving after the user has moved
  on and overwriting fresher options.
- Assert the signal is actually forwarded to `fetch`.

### ~~C3 — the stale response race (`TripBuilder`, or a focused unit test)~~

This is the one I would prioritise. Change the intake while research is in flight:
two requests are now running and the slower one can land last.

- Fire research for trip A, then for trip B, resolve A **after** B → the store must
  hold B's options.
- Same for `/api/schedule`: change a selection mid-build and the itinerary that lands
  must match the current selection, not the one in flight.

### ~~C4 — localStorage that refuses to play~~

`persist` writes on every change and can throw.

- Writing throws `QuotaExceededError` → the app keeps working in memory, no crash.
- `localStorage` getter throws outright (Safari private mode) → hydration falls back to
  a fresh trip rather than an error boundary.

### ~~C5 — the empty and error states actually rendering~~

Optional, and it needs a dependency decision from the human: component tests would
need `jsdom` and `@testing-library/react`. **Do not add them yourself** — AGENTS.md §4
puts `package.json` with the human. Propose it and wait.

If approved, the states worth asserting are the ones nobody looks at: research failed,
zero options returned, every option priced beyond the remaining budget, and
`SubmitGate` showing its blocked reasons verbatim from `canSubmit`.

Handled in the UI lane: the rendered research failure, empty list, unaffordable list,
and verbatim submit-gate states now have accessible component coverage.

### What I am doing in parallel

K2 client HTTP failure modes (429, 500, timeouts, empty choices, non-JSON bodies),
an invariant that no API route can answer 5xx, adversarial scheduler inputs, and
budget arithmetic at the extremes.

Report back here with anything you find that crosses into my files rather than fixing
it, and I will do the same.

---

## 2026-09-12 · my half of the hardening pass is done — two scheduler bugs found

129 new tests, 319 total. Both bugs came out of a randomised sweep rather than a case
anyone wrote deliberately, which is worth knowing when you write C3.

**Flights could overlap each other.** Select two outbound flights and the plan put the
traveler on both aircraft at once. `placeFlights` pushed blocks in without checking
what was already on the day — only activities and meals were collision-aware. The
first flight now wins and the rest come back in `unscheduled` with the reason
"overlaps X, which you also picked — you can only be on one".

**Check-in and check-out ignored the day.** Check-out sat at 11:00 regardless of a
flight already occupying that hour. Both now search for a free slot; check-out takes
the latest one that still clears the airport run.

**Two things for you specifically:**

`itinerary.unscheduled` can now contain **flight** ids, not just activities. If your
itinerary view assumes everything in that list is an activity, it needs to handle a
flight id too.

The reasons are written for a traveler to read, so render them verbatim rather than
mapping them to your own copy.

Nothing else in the contract moved.

### Where that leaves your half

~~C1, C2, C3 and C4 are untouched and still worth doing~~ — all four are now covered by
the UI lane's request clients, store-aware race guard, and resilient persistence tests. None
of them were covered by
what I added, because they all live on the browser side of the fetch. C3 is the one I
would still prioritise: my sweep found two ordering bugs in code I had already tested,
and a stale-response race is the same class of problem.

On C5, the dependency question still needs the human.

---

## 2026-09-12 · sample budget raised to $6,000, and a third schema bug

**The sample trip is now $6,000, not $4,200.** `src/fixtures/intake.json` changed, so
anything you have hard-coded against the old figure needs a look — the "Use Tokyo
sample" button reads the fixture, so it should follow automatically.

The reason: research prices the real world, and a real ORD–Tokyo round trip for two is
about $3,900. At $4,200 the only completable trip was a hostel and four free temples.
At $6,000 the same live research affords the cheapest flights, a **mid-tier hotel**,
local transport and 16 things to do, all scheduled, with $248 left over.
`fixtures.test.ts` now fails if the budget stops leaving that much room, so it cannot
quietly drift back.

**A third instance of the schema-too-strict bug.** The model returns hotel ratings on
a ten-point scale, and the contract caps at five, so ten of twelve Tokyo hotels were
dropped — the Stay step was showing two. Ratings are now converted in the provider
(ten-point halved, percentages divided by twenty, nonsense discarded). Same cached
reply, 2 options became 12 with a full tier spread.

Nothing in the contract changed. `rating` is still `0-5` on the option you receive —
it is simply populated far more often now.

Your four tasks are unaffected. Still worth doing, and C3 still first.

---

## 2026-09-12 · a journey test, a rehearsal script, and one accounting bug

**`npm run rehearse`** is new and worth knowing about. It plays all three demo trips
through to a finished itinerary against the running app and prints a verdict per trip,
exiting non-zero if one would not hold up. Run it after `npm run warm`. It is a better
last check before showing anything than any unit test, because it is the only thing
that exercises research, selection and scheduling in sequence.

It already earned its keep: the Reykjavík demo trip was leaving 31% of its budget
unspent, which quietly undercuts the whole premise of a budget-first planner. That
trip is now $3,600 rather than $4,500, tight enough that the rental car has to be
traded against other things — which is the point that trip exists to make.

**A full-journey test** now lives at `src/app/api/journey.test.ts`: intake, all four
research routes, a realistic basket, then a schedule, asserting the result is a trip
somebody could take. It runs eight intake variants. This is the test that would have
caught the front-loading bug.

**One real bug it found.** On a trip where you land and leave the same day there are no
nights to spread a room across, so the lodging cost dropped out of `daySpendCents`
while staying in `totalCents`. If your itinerary view sums the day totals and compares
them to the trip total, that would have looked like an app that cannot add up. Fixed,
with a test.

**Two things confirmed from the API side**, so a future change cannot regress what you
built: a day on the ground with nothing booked carries exactly one `free` block and
nothing else, and a flight id appears in `unscheduled` with a readable reason when two
flights collide. Both assert against the real route handlers now.

No contract changes. 362 tests.

The `jsdom` / `@testing-library/react` decision is still with the human — I have not
touched `package.json` beyond adding the `rehearse` script.

---

## 2026-09-12 · contract extended for the feature revision — start here

The human approved a feature round: full days with meals planned in, an editable
itinerary, round-trip flights, and a submit gate that warns instead of blocking. The
contract for all of it has landed and is green. **Everything below is additive — your
build is not broken and you can migrate at your own pace.**

### `canSubmit` now separates blockers from warnings

```ts
type SubmitCheck = {
  ok: boolean;        // false only when over budget
  blockers: string[]; // genuinely stops the trip. Only ever money.
  warnings: string[]; // worth saying, never worth stopping for
  reasons: string[];  // DEPRECATED: both lists combined, so your build stays green
};
```

`SubmitGate` should stop submission on `blockers` and merely show `warnings`. Somebody
driving to the coast or staying with family still has a trip worth planning — missing
flights or lodging must not stop them. The warning copy is written for exactly that
person ("No flight home — fine if you are travelling on from here"), so render it
verbatim. I will drop `reasons` once you have migrated; tell me here when you have.

### Round trips are one option, not two

`FlightOption.direction` now includes `'roundtrip'`, with the way home in an optional
`returnLegs: FlightLeg[]`. One card, one checkbox, one price, covering both directions.
Worth showing the saving against the cheapest one-way pair — that is the whole point of
adding them.

### The itinerary is editable

`ScheduleBlock` gains `suggested?: boolean` (the planner added it, the traveler did not
pick it) and `alternatives?: string[]` (option ids that fit the same slot, for a swap).
`DayPlan` gains `couldAdd?: string[]` (ids that would fit somewhere on that day) and
`filledMinutes?: number` (blocks plus travel padding, so you can show how full a day is).

Ids only — you already hold the full option objects.

To apply an edit, re-post to `/api/schedule`. The request now takes
`excludedIds?: string[]` alongside `selectedIds`: selected means *must appear*, excluded
means *never suggest*. Removing a suggested block means adding its option id to
`excludedIds` and re-posting.

### The meter can tell the two apart

`Itinerary` gains `chosenCents`, `suggestedCents` and `overBudgetCents`. `totalCents`
stays the sum of everything on the plan. Filling a day out is allowed to push past the
budget, so `overBudgetCents` needs to be visible rather than hidden.

### What I am building now

The planner side: round-trip research and pricing, more restaurants in research, and a
scheduler that puts breakfast, lunch and dinner on every day and fills each day to eight
hours — preferring things that fit the budget, then free options, repeating a free one
rather than leaving a gap. Everything it adds comes back `suggested: true` with
`alternatives` populated.

Until that lands, the new fields are optional and simply absent. Build against them
now; they will start arriving populated shortly.

`jsdom` and `@testing-library/react` are approved by the human — C5 is unblocked.

---

## 2026-09-12 · the planner now fills the days — new fields are populated

Everything from the contract note above is live. The scheduler no longer waits to be
told what to do.

**What you will see.** Pick four things — a flight each way, a bed, one temple — and a
Tokyo plan comes back with breakfast, lunch and dinner on every day and 9+ hours on the
whole days. On the sample trip that is $4,404 chosen and about $700 planned in on top.

- `block.suggested` is set on everything the planner added. Roughly two thirds of a
  typical plan. These want to read as a proposal, not a commitment.
- `block.alternatives` is populated on suggestions — up to four option ids that fit the
  same slot, for a one-tap swap.
- `day.couldAdd` carries up to twelve ids that would genuinely fit somewhere on the day.
- `day.filledMinutes` is how full the day is, travel included. Whole days aim for 480.
- `itinerary.chosenCents` / `suggestedCents` / `overBudgetCents` are all populated.

**Filling the days can push past the budget**, by design — typically $150–$300 on the
demo trips. `overBudgetCents` needs to be visible rather than swallowed; it is the one
number that tells the traveler the plan costs more than they said.

**Removing a suggestion**: add its `refId` to `excludedIds` and re-post. It will not
come back. A selected option always wins over an exclusion, so a user cannot accidentally
delete something they explicitly picked.

**Round trips are in the fixtures now** (`flt_rt_ua`, `flt_rt_ke`, `flt_rt_mu`), so
fixture mode shows them without a key. The cheapest round trip is $1,990 against $2,330
for the two cheapest one-ways — worth surfacing that saving on the card. A round trip
produces two flight blocks sharing one `refId`; the fare is charged on the outward one
and the homeward block costs zero, so do not sum them as two fares.

**A pace note**: the eight-hour target never overrides the pace the traveler chose. A
relaxed day stops at two activities and comes out shorter, and that is correct.

`npm run rehearse` now checks all of this — full days, food on every day at the
destination, and the overage. All three demo trips are READY.

---

## 2026-09-12 · contract for the refinement round — additive, start now

The human approved ten refinements. The contract for the ones that cross lanes has
landed and is green. **All of it is additive: nothing you have built breaks.** Your
brief is in `docs/STARTERS.md`.

### Travel is no longer only flying

`FlightOption` gains `mode?: 'plane' | 'train' | 'bus' | 'car'`. **Absent means plane** —
read it through `travelMode(option)` from `@/lib/types` rather than testing for
undefined, and label it with `TRAVEL_MODE_LABELS`.

A leg's `from`/`to` are no longer three-letter airport codes. They are place labels, 2 to
40 characters, because stations are not airports. Anything rendering them as an IATA
badge needs to cope with "Boston South Station".

The discriminant is still `kind: 'flight'` and the bucket key is still `flights`. That is
deliberate debt — renaming costs thirty call sites across two active lanes and buys
nothing — and it is recorded in AGENTS.md §6. Prefer the `TravelOption` alias in new
code. `BUCKET_LABELS.flights` now reads **"Getting there"**, so a step titled from the
bucket label updates itself.

### Map links

`ActivityOption` and `LodgingOption` gain `mapsUrl?: string`. Render it as a link and
nothing more. **Do not build your own from `lat`/`lng`** — those come back empty on every
researched venue because the model does not fill them, and an invented coordinate drops a
pin in the sea.

### Dragging a block

`/api/schedule` accepts `pinned?: { id, date, startMinutes }[]`. Post the new position
after a drag and re-render. Pins are laid down before anything else and the day packs
around them. A pin that cannot hold comes back in `unscheduled` with a reason — snap the
block back and show that reason rather than writing your own.

### Food has a number now

`forecastFood(intake, options)` in `@/lib/budget` returns
`{ perDayCents, totalCents, mealsPerDay }` — three meals a day across the days on the
ground, from the median researched restaurant price. That is the number for the Explore
step: "about $420 on food across five days". It is also what the planner will reserve, so
the overage you may have seen in `overBudgetCents` should shrink to nothing shortly.

### Still coming from my side

Ground travel actually being researched, better landmark coverage, `mapsUrl` populated,
and pins honoured by the scheduler. The fields are all optional until then, so build
against them now.

---

## 2026-09-12 · ground travel, landmarks, food and pins are all live

Everything the contract promised is now populated and honoured. 403 tests.

**`mode` is real.** Boston to Washington DC now returns driving at $240 round trip and
Amtrak Acela at $340 against $460 for the cheapest flight — the ground options are the
sensible ones and they come back first. Read it with `travelMode(option)` and label it
with `TRAVEL_MODE_LABELS`.

Leg `from`/`to` really do carry things like "Boston South Station" and "Washington Union
Station" now, so anything rendering them as a three-letter badge will look wrong. A
three-letter code is still upper-cased for you; anything longer is left as it reads.

A drive comes back as one leg with the operator "Own car" and no connection warnings,
because a stop on a drive is not a missed connection.

**The landmarks problem is fixed.** Washington DC now returns the Lincoln Memorial, the
Washington Monument, the Capitol Visitor Center and two Smithsonian museums. Prompt A has
an explicit floor on the places a first-time visitor would be disappointed to miss, and
the target rose to 26 entries.

**`mapsUrl` is populated** on every activity and lodging option, and on all 40 fixture
entries so it works with no key. Render it as a link and nothing else.

**Food is reserved before the filler spends anything**, so `overBudgetCents` is now zero
on all three demo trips. `npm run rehearse` fails if that ever comes back. The number for
the Explore step is `forecastFood(intake, options).totalCents`.

**Pins are honoured.** Post `pinned: [{ id, date, startMinutes }]` and the block claims
that slot before anything else, with the day packed around it. A pin that cannot hold
comes back in `unscheduled` with a reason written for the traveler — "Tokyo National
Museum is not open then on 2026-10-15", "that would run over United 882". **A refused pin
is not re-homed somewhere else**: the traveler asked for a specific time, so the honest
answer is no with a reason rather than a silent relocation. Snap it back and show the
reason verbatim.

### One thing on your side

`npm run typecheck` is currently red at `src/components/trip/TripBuilder.tsx:397` —
`FlightStep` gained `budget`, `plan`, `total` and `onBucketChange` but the call site has
not caught up. Mid-edit on your inline-budget work, I assume. Nothing in my lane, and I
have not touched it.
