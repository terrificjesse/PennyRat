# Starter prompts

Paste one of these at the top of each window. Both lanes read AGENTS.md first; these only
say what this window is for.

Six AI windows total, three per lane, running as three concurrent waves with a human commit
between each. Wave 0 is done.

---

## Claude Code — Wave 1 (API lane)

```
You are the API/logic lane on PennyRat. Read AGENTS.md and docs/CONTRACT.md first.

Wave 1 deliverables:
1. src/lib/k2/client.ts — OpenAI-compatible call to {IFM_BASE_URL}/chat/completions,
   bearer IFM_API_KEY, model IFM_MODEL. temperature 1.0, top_p 1.0,
   reasoning_effort 'high', max_tokens 8192, 120s timeout, 2 retries with jitter on
   429/5xx. Log latency and token usage per call. Honor K2_MODE=live|cache|fixture.
2. src/lib/k2/parse.ts — strip <think>/<thinking>/reasoning_content, extract the last
   balanced JSON object or fenced block, Zod parse, drop invalid items individually,
   one repair round-trip if nothing parsed, then normalize: de-dupe on lowercased title,
   clamp prices over 3x the bucket, clamp absurd durations, assign prefixed ids, and
   enforce the cross-field invariants in docs/CONTRACT.md.
3. src/lib/k2/cache.ts — sha256(model + prompt + SCHEMA_VERSION), disk under .k2cache/
   in dev, in-memory LRU in prod.
4. src/lib/k2/prompts/{activities,flights,lodging}.ts — prompt A, B, C per AGENTS.md §8.
   Flights ask for route structure and a seasonal fareBand, never exact fares.
5. src/lib/providers/{flights,lodging,activities}.ts — turn model output into contract
   options. Flights: fareBand + advance purchase + travelers -> costCents, estimated
   true, and discard anything outside the intake's date window. Lodging: nightlyCents x
   nights, enforce a tier spread.
6. The three research routes under src/app/api/research/, replacing the 501 stubs.
7. scripts/probe-k2.ts — report reachability, latency, whether response_format is
   honored, whether <think> blocks appear, and token usage. Wire to npm run probe:k2.
8. Vitest for parse.ts and the providers, against recorded responses. Never call the
   live API from a test.

Done when all three endpoints return contract-valid data in fixture mode with no API key,
and in live mode with one. typecheck and test green.

Your lane: src/lib/{k2,providers,schedule}/**, src/app/api/**, scripts/**.
Do not touch src/components/**, src/app/** outside api/, src/lib/store/**, or the frozen
files (src/lib/types.ts, src/lib/budget.ts, src/fixtures/**).
Never run git. End with the HANDOFF block from AGENTS.md §12.
```

---

## Codex Plus — Wave 1 (UI lane)

```
You are the UI/UX lane on PennyRat. Read AGENTS.md, docs/CONTRACT.md, and
src/lib/types.ts first. There is a note for you in docs/requests/claude-to-codex.md.

The contract, the budget engine and the fixtures are committed and frozen. Build against
src/fixtures — do not wait on the API lane, and do not call /api/* yet (Wave 0 stubs
return 501).

Wave 1 deliverables:
1. src/lib/store/trip.ts — Zustand store persisted to localStorage: intake, budget plan,
   fetched options, selected ids, current step. Selection is a Set of ids; derive all
   money from applySelection.
2. Step 1 intake: origin, destination, start and end date, travelers, total budget,
   interests (all ten from INTERESTS), pace. Validate with tripIntakeSchema and show the
   Zod messages. Read the budget field with parseDollarsToCents.
3. Bucket allocation sliders over BudgetPlan, seeded by allocateBuckets, rebalanced with
   setBucket. Show "Getting around" as its own line — the local transit budget is a
   feature, not a detail.
4. BudgetMeter — total remaining plus a bar per bucket, updating on every checkbox. Mark
   over-budget buckets as a warning, not an error. When money is left, offer
   suggestFillers.
5. SelectableCard and OptionList — generic over TripOption: title, price via formatCents,
   short description, an "AI estimate" badge when estimated is true, a confidence hint
   when confidence is low, and a checkbox.

All money math comes from src/lib/budget.ts. Never sum costCents in a component, and never
multiply nightlyCents or perDayCents — costCents is already the party total for the trip.

Done when the intake form produces a valid TripIntake, the sliders keep summing to the
total, and checking a fixture option moves the meter. typecheck and test green.

Your lane: src/components/**, src/app/** except api/, src/lib/store/**, globals.css.
Do not touch src/lib/{types,budget}.ts, src/fixtures/**, src/lib/{k2,providers,schedule}/**,
or src/app/api/**. Need a contract change or something from the API? Append to
docs/requests/codex-to-claude.md.
Never run git. End with the HANDOFF block from AGENTS.md §12.
```

---

## Wave 2 and 3

Same preamble, swapping the deliverables from the table in AGENTS.md §14. Re-read
`docs/requests/` at the start of every window — that is where the other lane left you
things.
