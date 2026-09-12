# Starter prompts

Paste one of these at the top of each window. Both lanes read AGENTS.md first; these only
say what this window is for.

Six AI windows total, three per lane, running as three concurrent waves with a human commit
between each. Wave 0 is done.

---

## Where the project is

416 tests, typecheck, lint and build clean, four demo trips passing `npm run rehearse`.

Of the ten refinements, the API lane's five are done and live: ground travel (Boston to
DC returns bus, train, car and plane), landmark coverage (DC returns the Lincoln
Memorial and the Capitol), food forecast and reserved, `mapsUrl` on every place, and
pinned blocks honoured with a reason when a pin cannot hold.

The remaining five are the UI lane's, and most are part-built: the step order is swapped
and saved trips and the inline budget are in progress; drag-to-reorder, the send-off
image and editing from the itinerary are not started.

**Both images are saved** — `public/penny-rats.PNG` and `public/enjoy-your-trip.PNG`.

---

## Codex Plus — finish the product

```
You are the UI/UX lane on PennyRat. Read AGENTS.md and
docs/requests/claude-to-codex.md first — the last two entries describe everything the
API lane has made available.

Step order and the inline budget are landing; saved trips are part-built. What follows
is the rest, roughly in order of what a demo needs.

1. Finish saved trips on the home screen: list with destination, dates and total, then
   open, rename, delete. The logo stays the way back.

2. Editing from the itinerary, so nobody walks the wizard twice to change one thing.
   block.alternatives and day.couldAdd are populated on every plan. A swap or an add
   re-posts to /api/schedule with updated selectedIds and excludedIds.

3. Drag to reorder. Post the new position as pinned: [{ id, date, startMinutes }]. The
   block claims that slot and the day re-packs around it. A pin that cannot hold comes
   back in unscheduled with a reason written for a traveler — "Tokyo National Museum is
   not open then on 2026-10-15". Snap it back and show that reason verbatim; a refused
   pin is deliberately not re-homed elsewhere.

4. The send-off, using public/enjoy-your-trip.PNG on the finished itinerary. Fade or
   slide, and honour prefers-reduced-motion.

5. Getting there needs to show what it now returns. Boston to Washington DC comes back
   with bus, train, car and plane. Read the mode with travelMode(option) and label it
   with TRAVEL_MODE_LABELS. A round trip is one card covering both directions, priced
   against the two one-ways so the saving shows. Leg from/to carry station names now —
   "Boston South Station" — so an IATA-shaped badge will look wrong.

6. Map links from option.mapsUrl on cards and itinerary blocks. Never build one from
   lat/lng; they are empty.

7. Show forecastFood(intake, options).totalCents on the Explore step: "about $420 on
   food across five days". It is what the planner reserves, so it is not a guess.

Worth knowing: the dev server you have running is in fixture mode, which is right for
UI work. `npm run rehearse` needs live research, so run it against a production build on
another port rather than switching yours.

Your lane: src/components/**, src/app/** except api/, src/lib/store/**, globals.css.
Never run git. End with the HANDOFF block from AGENTS.md §12.
```

---

## Claude Code — quality, not features

```
You are the API/logic lane on PennyRat. Read AGENTS.md and
docs/requests/codex-to-claude.md first.

Every feature item in your last brief is done and rehearsing green. This round is about
the research quality underneath them, which is now the weakest part of the app.

1. Quotas are asked for and not met. Washington DC returned 4 restaurants against a
   floor of 10, which left days unfed until the scheduler started reusing places. The
   prompt asks; the model does not always comply. Add a top-up call in
   providers/activities.ts when a quota is short — restaurants under the floor, or a
   requested interest with nothing against it — asking only for the gap rather than
   re-researching the lot. Cache it under its own key.

2. Audit what the other prompts actually return against what they ask for. Flights was
   silently losing six of ten entries to two shapes the schema rejected; assume lodging
   and transit have their own. A warning that says "asked for 12, kept 4" is a bug
   report nobody read.

3. The rehearsal should check research quality, not just that a trip completes: enough
   restaurants for the days, every requested interest matched, and a landmark-heavy
   destination returning its landmarks.

4. Ground travel only appears when the model volunteers it. Boston to DC works; check a
   few more short-haul pairs and make the prompt's short-haul test explicit if it is
   inconsistent.

5. Fixture mode still shows Tokyo for every destination. That is correct as a fallback,
   but the mismatched dates mean a fixture-mode DC trip schedules nothing at all. Either
   date-shift fixtures onto the requested trip or say clearly in meta.warnings that the
   sample trip is a different city — right now it fails silently.

Your lane: src/lib/{k2,providers,schedule}/**, src/app/api/**, scripts/**, fixtures with
care. Do not touch src/components/** or src/lib/store/**. Never run git. End with the
HANDOFF block from AGENTS.md §12.
```
