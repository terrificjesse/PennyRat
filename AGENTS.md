# PennyRat — agent guide

Read this before writing code. It is canonical for every agent on this repo;
`CLAUDE.md` only points here.

---

## 1. What we are building

A budget-first travel planner. The user says where they are leaving from, where they want
to go, how long, how much they have, and what they care about. The app then walks five
steps, and every option it shows carries a price:

1. **Flights** — nonstop and connecting, priced, filtered to the trip's dates.
2. **Activities** — restaurants, museums, attractions, hikes, with hours and admission.
3. **Lodging** — hostels through premium, four comfort tiers.
4. **Getting around** — the local transit budget: subway pass, rideshare, rental car.
5. **Schedule** — a day-by-day itinerary built from what they picked.

Everything selectable is a checkbox with a price. Checking one moves a live budget meter.
The itinerary step unlocks when the trip is within budget and has at least one outbound
flight, one return flight, somewhere to stay, and one thing to do.

Travel research comes from **K2 Think V2** (MBZUAI's Institute of Foundation Models) over
an OpenAI-compatible API. Prices it produces are estimates and the UI always says so.

---

## 2. Non-negotiables

- **Money is integer cents.** Never a float, never a dollar string, never `parseFloat`.
  Format only at render, with `formatCents` from `src/lib/budget.ts`.
- **Zod at every boundary.** Anything arriving from the network or from the model gets
  parsed, not cast. `as` on external data is a bug.
- **`K2_MODE=fixture` must always work with no API key.** A fresh clone, `npm i`,
  `npm run dev` has to walk the whole wizard. This is the demo's safety net; do not let it
  rot.
- **No agent runs git.** See §12.
- **Stay in your lane.** See §4. A merge conflict on hackathon day costs more than any
  feature it buys.
- **`npm run typecheck` and `npm test` are green before every handoff.** Not "green except
  for the other lane's file" — if the other lane broke it, log it per §5 and say so.

---

## 3. Stack and commands

Next.js 16.3 (App Router) · React 19.2 · TypeScript 5 (strict) · Tailwind 4 ·
Zustand 5 · Zod 4 · Vitest 5. Node 24.

```bash
npm run dev          # localhost:3000
npm test             # vitest run
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run lint
npm run probe:k2     # Wave 1: check what the real IFM endpoint supports
```

**Next 16 is not the Next.js in your training data.** Before using a framework API you
have not used in this repo, read the relevant page under `node_modules/next/dist/docs/`.
The `nextjs-agent-rules` block at the bottom of this file is written by `next dev` — leave
it there and commit it with your work.

---

## 4. Lane ownership

| Path | Owner | The other lane |
|---|---|---|
| `src/lib/k2/**`, `src/lib/providers/**`, `src/lib/schedule/**` | **Claude** | read only |
| `src/app/api/**`, `scripts/**` | **Claude** | read only |
| `src/components/**` | **Codex** | read only |
| `src/app/**` except `api/`, `src/app/globals.css` | **Codex** | read only |
| `src/lib/store/**` | **Codex** | read only |
| `src/lib/types.ts`, `src/lib/budget.ts`, `src/fixtures/**` | **frozen** | read only, both |
| `AGENTS.md`, `docs/CONTRACT.md`, `package.json`, `README.md` | **human** | propose, don't edit |

`AGENTS.md`, `docs/CONTRACT.md` and the frozen files were authored during the Wave 0
bootstrap and are human-owned from that point on.

Adding a dependency is a human decision — put it in a request file with the reason.

Never `git checkout`, `git stash`, or revert anything. If a file you do not own is broken,
you log it; you do not fix it.

---

## 5. Talking to the other lane

Two append-only files, one per direction, so the channel itself can never conflict:

- `docs/requests/claude-to-codex.md`
- `docs/requests/codex-to-claude.md`

Newest entry at the bottom, dated, with a heading. Include the exact error text and the
file and line. When you handle someone's request, strike it through rather than deleting it.

**Contract changes** go through the human. Write down the field you need, its type, whether
it is optional, and what you do with it. Do not edit `src/lib/types.ts`.

---

## 6. The contract

`src/lib/types.ts` is the whole contract: Zod schemas plus inferred types, frozen in
Wave 0. `docs/CONTRACT.md` is the prose version — read that first.

Shapes you will use constantly:

- `TripIntake` — what the user typed on step 1.
- `BudgetPlan` — `Record<BucketKey, Cents>` over `flights | lodging | activities | food | localTransit | buffer`.
- `TripOption` — discriminated union on `kind` of `FlightOption | ActivityOption | LodgingOption | TransitOption`. Every member carries `id`, `bucket`, `title`, `costCents`, `costBasis`, `estimated`, `confidence`.
- `Itinerary` — `DayPlan[]` of `ScheduleBlock[]`, plus `unscheduled` with a reason per item.
- Request/response schemas for every route, so neither lane has to guess a payload.

`costCents` is **always the total for the whole party for the whole trip**, already
multiplied out. `costBasis` exists so the UI can explain the number ("$496 · $124 a night"),
never so a component recomputes it.

**Travel is not only flying.** `FlightOption` carries a `mode` of `plane`, `train`,
`bus` or `car`, and a leg's `from`/`to` are place labels rather than strict IATA codes,
because stations are not airports. The discriminant is still `kind: 'flight'` and the
bucket key is still `flights` — renaming both touches around thirty call sites across
two active lanes for no behavioural gain. **This is deliberate debt, recorded rather than
hidden.** Prefer the `TravelOption` alias in new code, and the bucket's user-facing label
is "Getting there". A `direction: 'roundtrip'` option carries the way home in
`returnLegs`, satisfies both directions on its own, and is charged once — on the outward
block, with the homeward block costing zero.

Cross-field invariants — `stops === legs.length - 1`, `costCents === nightlyCents * nights`,
`costCents === perDayCents * days` — are enforced by the normalizers in `lib/k2/parse.ts`,
not by schema refinements, so the option schemas stay plain objects and remain usable inside
a discriminated union. Tests in `src/fixtures/fixtures.test.ts` hold the line.

---

## 7. K2 Think integration rules

Environment (see `.env.example`):

```
IFM_API_KEY=      IFM_BASE_URL=https://api.k2think.ai/v1      IFM_MODEL=MBZUAI-IFM/K2-Think-v2
K2_MODE=fixture | cache | live
```

What the model is, and what it is not:

Measured against the real endpoint on 12 Sep 2026 with `npm run probe:k2`. These are
observations, not guesses — re-run the probe if anything here stops matching.

- OpenAI-compatible `POST {IFM_BASE_URL}/chat/completions`, bearer auth. `GET /models`
  works and lists exactly one model.
- **The served model id is `MBZUAI-IFM/K2-Think-v2`** — note the `MBZUAI-IFM/` prefix and
  the lowercase `v2`. It matches neither HuggingFace repo name (`IFM/K2-Think-V2`,
  `LLM360/K2-Think-V2`). A wrong id returns `400 token model is not configured for token
  management`, which reads like an auth problem and is not one.
- `response_format: json_object` is **accepted but not honored** — the body still needs
  extraction. Tool calling is still undocumented. `parse.ts` is not optional.
- `temperature: 1.0`, `top_p: 1.0` are the evaluated settings. Leave them.
- **`reasoning_effort` is `medium`, deliberately.** These prompts recall and list; they do
  not solve. Listing 12 hotels cost 4,547 reasoning tokens at `high`, 841 at `medium`, 22
  at `low`. At `high` with an 8k ceiling the trace consumed the entire budget and the
  answer came back empty. `low` is cheaper still but drops commas and nests objects where
  it should write properties. `medium` is the setting that holds.
- **Reasoning is returned in `message.reasoning`, not in `content`** and not as `<think>`
  tags. We read `content` only. The tag-stripping in `parse.ts` stays as insurance for a
  deployment that behaves differently.
- Budget 16k output tokens. An empty answer next to a long `reasoning` means the trace ate
  the budget; the client doubles it and retries once.
- It is fast: 4–11s per research call, not the minute-plus a 70B reasoner suggests.
- Expect roughly one reply in five to need the repair round-trip. That is model variance,
  not a prompt bug — a first reply that forces a repair is written to
  `.k2cache/failures/` so it can be read rather than guessed at.

Every response goes through `lib/k2/parse.ts`: strip traces → take the last balanced JSON
object or fenced block → Zod parse → drop individual invalid items rather than failing the
batch → one repair round-trip echoing the validation error back if nothing parsed at all →
normalize (de-dupe on lowercased title, clamp prices above 3× the bucket, clamp absurd
durations, assign prefixed ids).

**Map links are built from a search query, never from coordinates.** `lat`/`lng` come
back empty on every researched venue, and a coordinate the model invents puts a pin in
the sea. `mapsUrl` is assembled in the providers from name, neighbourhood and
destination, which always resolves.

Caching is not optional. Key on `sha256(model + prompt + SCHEMA_VERSION)`. Disk in dev
(`.k2cache/`, gitignored), in-memory LRU in prod.

**Never call the live API from a test.** Tests run on fixtures and on recorded responses.

---

## 8. Writing prompts

The research prompts live in `src/lib/k2/prompts/`. Rules, learned the hard way:

- Put the schema **last** and end with "Output only JSON. No prose, no markdown fence."
- Ask for an **exact count**. "Several" gets you four.
- Force variety with **explicit slot quotas** — "3 under $15 per person, 5 mid, 4 splurge",
  "at least 2 per requested interest". Hoping for a spread does not produce one.
- Ban vagueness. Named venues only; "a local ramen shop" is a failed response.
- Require a self-rated `confidence`, and forbid inventing opening hours — if it is unsure,
  it must say `low`.
- Cap free text (`description` is 240 characters) to bound cost and latency.
- **Validate every hard constraint in code.** Date windows, counts, price sanity, arithmetic.
  A prompt is a request, not a guarantee.
- Fan the calls out in parallel. One big prompt is slower and blurs the quotas.

On prices: the model must not invent exact fares. Ask for structure — which carriers fly the
pair, realistic layover hubs, leg durations, and a seasonal `fareBand` — then compute
`costCents` deterministically in `lib/providers/`, set `estimated: true`, and let the UI badge
it.

---

## 9. Budget rules

All money math lives in `src/lib/budget.ts`. Components call it; they never sum prices
themselves. A second implementation is how a running total starts disagreeing with itself.

- `allocateBuckets` splits the budget so the parts sum to **exactly** the total
  (largest-remainder). Any future split must keep that property — there is a test.
- A bucket going over is a **warning**, not a blocker. Only the global remainder gates
  submission, via `canSubmit`.
- `canSubmit` requires: within budget, one outbound flight, one return flight, one lodging,
  one activity. It returns human-readable reasons; show them, do not paraphrase them.
- Restaurants bill to the `food` bucket; every other activity bills to `activities`.
- When money is left over, `suggestFillers` offers the priciest activities that still fit.
- **Food is forecast, not discovered.** `forecastFood` estimates three meals a day across
  the days on the ground from the median researched restaurant price. The planner reserves
  it before filling days out, and the Explore step shows it. Without that reserve the
  planner spends the whole budget on attractions and then adds meals on top, which is how
  every demo trip ended up over.

---

## 10. Scheduler rules

`src/lib/schedule/` is deterministic. **No LLM call, ever.** It is the part of the app that
must be right, and it is fully unit-testable.

1. Day frames come from the chosen flights: the arrival day starts 90 minutes after landing,
   the departure day ends 150 minutes before takeoff.
2. Fixed blocks go in first — flights, lodging check-in 15:00, check-out 11:00.
3. Meal slots at 08:00, 12:30, 19:00, filled with selected restaurants whose hours cover them.
4. Remaining activities are greedy-packed, sorted by interest match, then rating, then
   `bestTimeOfDay` fit.
5. A block may only be placed inside a window that `openingHours[dayKey]` fully contains,
   on a date not in `closedDates`. `DAY_KEYS[new Date(date).getDay()]` maps date to key.
6. Travel padding: 30 minutes between neighborhoods, 15 within one.
7. Per-day activity caps come from `PACE_ACTIVITY_CAP`.
8. Anything that cannot be placed goes to `unscheduled` **with a reason the user can act on**
   — "closed Mondays", not "no slot".
9. `warnings` for a day over its share of the budget, and for connections under 90 minutes.
10. **Pins come first.** `/api/schedule` accepts `pinned` — a traveler dragged this block
    to this time — and those are placed before anything else, with the day packed around
    them. A pin that cannot hold, because the venue is shut then, comes back in
    `unscheduled` with a reason so the UI can snap it back rather than silently moving it.
11. The pace the traveler chose beats the eight-hour fullness target. A relaxed day stops
    at two activities and comes out shorter, and that is correct.

---

## 11. Code style

Write like the person whose name is on the commits. Concretely:

- Comment the surprising, not the obvious. No comment on every line, no `// Step 1:` ladders,
  no docstring restating a function's name.
- No emoji in source. No `console.log('✅ done')`.
- No `utils.ts` dumping ground. A module is named for what it does.
- Don't wrap everything in try/catch. Catch where you can actually do something about it.
- No "in a real app we would…" comments. Either do it or leave it alone.
- Don't create files the task did not ask for — no speculative abstractions, no barrel files
  nobody imports, no README sections nobody asked for.
- Match the naming and shape of the code already around you.
- Delete dead code rather than commenting it out.

---

## 12. Commits are human

**Agents never run `git add`, `git commit`, `git push`, `git checkout`, `git stash`, or
`git reset`.** Not once, not "just to be safe". The human stages and commits everything.

End every window with exactly this block:

```
HANDOFF
Files touched:      <paths, grouped>
What works:         <verified, with the command that proves it>
What is stubbed:    <and which wave picks it up>
Blocked on:         <or "nothing">
Suggested commits:
  1. <subject>  — <which files>
  2. ...
```

Commit subjects: imperative, lowercase, under 60 characters, no trailing period, no
attribution trailers, no tool names. Two to four small commits beat one large one.

Good: `add k2 client with json repair` · `wire budget meter to selection store` ·
`handle closed-day venues in scheduler`
Bad: `feat(api): implement comprehensive K2 Think integration layer 🤖`

---

## 13. Done means

- `npm run typecheck` clean.
- `npm test` green, with new tests for the logic you added.
- `npm run dev` walks the wizard in `K2_MODE=fixture` with no API key set.
- Nothing outside your lane modified (`git status` proves it).
- A HANDOFF block printed.

---

## 14. Where the work is

The original three waves are long done. The lanes now run continuously, in their own
directories, with the human committing between rounds.

| Lane | Owns | Currently |
|---|---|---|
| **Claude** | research, pricing, the planner, the routes | ground travel modes, landmark coverage, the food forecast, map URLs, pinned blocks |
| **Codex** | the wizard, the itinerary, the store, the look | step order, inline budgeting, saved trips, editing in place, drag to reorder, the send-off |

A contract change lands **alone and committed** before either lane builds on it. That is
the one hard sequencing rule; everything else is concurrent.

`npm run rehearse` is the acceptance gate for a round: all three demo trips READY.


## 15. Troubleshooting

**K2 call times out.** Unexpected — calls run 4–11s. Confirm with `npm run probe:k2`.

**`400 token model is not configured for token management`.** The model id is wrong, not
the key. It must be `MBZUAI-IFM/K2-Think-v2`; `GET /models` lists what is served.

**An empty answer with a long `reasoning`.** The trace used the whole token budget. The
client doubles `max_tokens` and retries; if it recurs, the prompt is asking for too much
in one call.

**Model returned prose, not JSON.** Normal. `parse.ts` handles it. If the repair round-trip
also fails, log the raw text to `.k2cache/failures/` and fall back to fixtures — never throw
into the UI.

**Zod rejects a model item.** Correct behavior. Drop the item, add a `meta.warnings` entry,
carry on. Only fail the request if nothing survives.

**Stale research after a prompt edit.** Bump `SCHEMA_VERSION` in `src/lib/types.ts` — it is
part of the cache key — or delete `.k2cache/`.

**`npm run typecheck` fails in a file you do not own.** Log it per §5, say so in your
HANDOFF, and keep working. Do not fix it.

**Port 3000 busy.** Another lane is running `next dev`. Use it, or `PORT=3001 npm run dev`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
