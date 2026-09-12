# Starter prompts

Paste one of these at the top of each window. Both lanes read AGENTS.md first; these only
say what this window is for.

Six AI windows total, three per lane, running as three concurrent waves with a human commit
between each. Wave 0 is done.

---

## Where the project is

Both lanes have shipped their three waves. The wizard works end to end against live
K2 research: intake, flights, activities, lodging, local transport, schedule. 319
tests, typecheck, lint and build all clean. The UI has been rebuilt around the Penny
Rats logo.

Test coverage is lopsided on purpose right now — about 300 tests behind the API and
the scheduler, and a dozen in front of them. The current round evens that up.

---

## Codex Plus — browser-side hardening

```
You are the UI/UX lane on PennyRat. Read AGENTS.md, docs/CONTRACT.md and
docs/requests/claude-to-codex.md before writing code. The last three entries in that
request file are for you and describe this work in detail.

Context: the API lane just finished a hardening pass — 129 new tests covering K2
failure modes, an invariant that no route can answer 5xx, and adversarial scheduler
inputs. It found two real bugs. Your side of the fetch has almost no equivalent
coverage: research.test.ts has 3 tests, schedule.test.ts has 2, and every one of them
resolves a Response successfully.

Your tasks, in priority order:

C3 — the stale response race. Change the intake while research is in flight and the
slower request can land last, overwriting fresher options. Fire research for trip A,
then trip B, resolve A after B, and assert the store holds B. Same for /api/schedule
when a selection changes mid-build. This is the one I would do first: the API lane's
two bugs were both ordering bugs in code that already had tests.

C1 — the network actually failing. Cover fetch rejecting (a dropped connection), a
502 whose body is an HTML error page, and a 200 whose body is HTML. Assert the thrown
message is readable rather than a bare "Failed to fetch" or an undefined status.

C2 — cancellation. Both clients take an AbortSignal and nothing tests it. Assert the
signal reaches fetch, that aborting rejects, and that a cancelled request writes no
state.

C4 — localStorage refusing to work. A write that throws QuotaExceededError must not
crash the app, and a getter that throws outright (Safari private mode) must fall back
to a fresh trip rather than an error boundary.

One contract change to handle: itinerary.unscheduled can now contain flight ids, not
only activity ids. If the itinerary view assumes otherwise, fix it. Render the reason
strings verbatim — they are written for a traveler to read.

C5 (component tests for error and empty states) needs jsdom and
@testing-library/react. package.json belongs to the human per AGENTS.md §4 — propose
it and wait rather than installing.

Your lane: src/components/**, src/app/** except api/, src/lib/store/**, globals.css.
Do not add tests under src/lib/{k2,providers,schedule} or src/app/api — the API lane
owns those this round. Never run git. End with the HANDOFF block from AGENTS.md §12.
```

---

## Claude Code — demo readiness

```
You are the API/logic lane on PennyRat. Read AGENTS.md and
docs/requests/codex-to-claude.md first.

Your hardening pass is done: 319 tests, two scheduler bugs found and fixed. This round
is about the app surviving a live demo.

1. The sample trip cannot be completed with live prices. The bundled Tokyo intake is
   $4,200, but live ORD to Tokyo research returns fares of $1,900-$2,800 per party, so
   the cheapest round trip alone is $3,900. Completing it means a hostel and four free
   temples. Either raise the sample budget or move the sample to a shorter-haul city —
   Mexico City at $2,600 has real headroom and demos better. src/fixtures/intake.json
   is frozen shared state and src/fixtures/fixtures.test.ts asserts against it, so
   whatever you change, keep that test meaningful rather than loosening it.

2. docs/DEMO.md is out of date. It claims 185 tests (now 319) and predates the
   scheduler fixes, the free-day block and the interest-tag normalisation. The "if
   someone asks" answers are the valuable part — keep them honest and current.

3. Re-warm the cache for whatever demo trips you settle on, and confirm a second
   npm run warm comes back entirely from cache.

4. Read docs/requests/codex-to-claude.md and handle anything the UI lane has filed.

Your lane: src/lib/{k2,providers,schedule}/**, src/app/api/**, scripts/**, and the
frozen fixtures with the care noted above. Do not touch src/components/** or
src/lib/store/**. Never run git. End with the HANDOFF block from AGENTS.md §12.
```
