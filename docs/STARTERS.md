# Starter prompts

Paste one of these at the top of each window. Both lanes read AGENTS.md first; these only
say what this window is for.

Six AI windows total, three per lane, running as three concurrent waves with a human commit
between each. Wave 0 is done.

---

## Where the project is

Both lanes have shipped their waves and a hardening pass each. 339 tests, typecheck,
lint and build clean. The wizard works end to end on live K2 research, the UI is built
around the Penny Rats logo, and the sample trip is priced so a live demo has real
headroom.

Coverage by lane: about 310 tests behind the API, the scheduler and the K2 client; 28
in front of them. The remaining gap is not another unit test on either side — **it is
that nothing exercises the whole journey at once.** Every bug found by looking at
rendered output this week (a day mislabelled "travel day", work piling onto the front
of the trip, check-out overlapping a flight) was invisible to unit tests that passed.

### One decision is blocking the UI lane

Codex has asked twice for `jsdom` and `@testing-library/react` as dev dependencies.
`package.json` is human-owned under AGENTS.md §4, so they correctly stopped rather than
installing. Without them there can be no DOM-level coverage of error states, empty
lists or the submit gate. **Approve or decline before starting the round below** — half
of Codex's work depends on it.

---

## Codex Plus — what the user actually sees

```
You are the UI/UX lane on PennyRat. Read AGENTS.md and
docs/requests/claude-to-codex.md first. Your C1-C4 hardening landed: the client tests
went from 5 to 28 and the request-state extraction is good work.

This round is about the rendered result, not the fetch layer.

1. C5, if the human has approved jsdom and @testing-library/react. If they have not,
   skip to 2 and do not install anything. Cover the states nobody looks at: research
   failed, zero options returned, every option priced beyond the remaining budget, and
   SubmitGate showing its blocked reasons verbatim from canSubmit. Query by accessible
   role and name rather than test ids — it costs nothing and audits the markup as a
   side effect.

2. An accessibility pass over the wizard. It has aria labels and a focus region
   already, so this is verification rather than a rewrite: every control reachable and
   operable by keyboard, the step change announced, the budget meter readable by a
   screen reader rather than colour alone, focus visible against the new cream and
   periwinkle palette, and the over-budget state conveyed by more than a red bar.

3. The itinerary at its edges, with real data rather than the sample. Check a day whose
   only block is kind "free", a day genuinely in the air, an unscheduled list holding a
   flight id, and a plan with fifteen-plus outings. The reason strings are written for
   a traveler — render them verbatim.

4. The print view. globals.css has an @media print block nobody has exercised. A
   printed itinerary should be the plan, not the chrome.

5. Responsive: the wizard at 375px. The budget sidebar and the six-step stepper are
   the two things most likely to be unusable on a phone.

Your lane: src/components/**, src/app/** except api/, src/lib/store/**, globals.css.
Never run git. End with the HANDOFF block from AGENTS.md §12.
```

---

## Claude Code — the journey, end to end

```
You are the API/logic lane on PennyRat. Read AGENTS.md and
docs/requests/codex-to-claude.md first.

Your side is well covered in pieces — 311 tests across the K2 client, the providers,
the routes, the budget and the scheduler. What no test does is run the whole thing in
order. Every bug found by reading rendered output this week passed the unit tests.

1. A full-journey test. One file, no DOM, no network: build an intake, call all four
   research route handlers directly, make a realistic selection the way a person would
   (cheapest flights, a mid-tier bed, things to do until the money runs low), post it
   to the schedule handler, and assert the result is a trip somebody could actually
   take — within budget, every required category present, nothing scheduled while in
   the air, nothing on a day a venue is shut, and the day totals summing to the trip
   total. Then vary it: one night, twelve travelers, a relaxed pace, a destination with
   no cached research. This is the test that would have caught the front-loading.

2. npm run rehearse. A script that runs the three demo trips against the live API end
   to end and prints a per-trip verdict: research source and latency for each endpoint,
   whether a realistic basket stays in budget, how many outings got scheduled, and
   anything unscheduled. Exit non-zero if a trip would embarrass you on stage. This is
   the thing to run the morning of the demo, and it belongs next to warm-cache.mts.

3. Confirm the two contract changes are honoured downstream now that Codex has
   rendered them: a day whose only block is kind "free", and a flight id appearing in
   itinerary.unscheduled. Assert both from the API side so a future change cannot
   silently regress them.

4. Handle anything new in docs/requests/codex-to-claude.md.

Your lane: src/lib/{k2,providers,schedule}/**, src/app/api/**, scripts/**, fixtures
with care. Do not touch src/components/** or src/lib/store/**. Never run git. End with
the HANDOFF block from AGENTS.md §12.
```
