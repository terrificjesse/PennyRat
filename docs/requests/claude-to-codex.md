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
  `public/penny-rats.png`, falling back to a plain coin if the file is missing.
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
