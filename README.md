# PennyRat

A travel planner that starts from what you can spend.

You give it a budget, where you are leaving from, where you want to go, how long, and
what you care about. It splits the budget six ways, researches real flights, venues,
places to stay and ways of getting around, and prices every option next to a checkbox.
Check things off and the money comes down. Once the trip fits, it builds a day-by-day
schedule that respects flight times and opening hours.

## Running it

```bash
npm install
npm run dev
```

That works with no API key — the app ships with a complete sample trip (ORD to Tokyo,
two travelers, $6,000) and serves it whenever research is unavailable.

For real research, put your Institute of Foundation Models key in `.env.local`:

```
IFM_API_KEY=<your key>
IFM_BASE_URL=https://api.k2think.ai/v1
IFM_MODEL=MBZUAI-IFM/K2-Think-v2
K2_MODE=live
```

Then check the endpoint and see what it supports:

```bash
npm run probe:k2
```

## How it works

Research comes from **K2 Think V2**, MBZUAI's 70B reasoning model, over an
OpenAI-compatible API. The model is asked for things it genuinely knows — which
carriers fly a route and through which hubs, which venues exist and when they open,
what a seasonal fare band looks like. It is never asked for a price.

Prices are computed here, deterministically, from the fare band and the booking window,
and every one carries an "AI estimate" badge in the UI.

The schedule involves no model call at all. Packing activities against opening hours,
flight times and travel between neighbourhoods is arithmetic, and a model asked to do
it will eventually put a museum on a Monday.

Everything the model returns is validated one entry at a time, so a malformed venue
costs that venue rather than the batch. A reply cut off mid-array is salvaged object by
object. If nothing parses, the model gets one chance to fix it; if that fails, the
sample trip is served and the UI says where the data came from.

## Commands

```bash
npm run dev          # localhost:3000
npm test             # 329 tests
npm run typecheck
npm run lint
npm run probe:k2     # what the live endpoint actually supports
npm run warm         # pre-fetch the demo trips into .k2cache (needs the dev server up)
```

## Layout

```
src/lib/types.ts        the data contract — Zod schemas, money in integer cents
src/lib/budget.ts       bucket allocation, running totals, the submit gate
src/lib/k2/             the model client, JSON recovery, caching, prompts
src/lib/providers/      model output to priced options
src/lib/schedule/       opening hours and the day packer, both deterministic
src/app/api/            research and schedule routes
src/components/         the wizard
src/fixtures/           the sample trip, used whenever research is unavailable
```

`AGENTS.md` covers the conventions and what was measured about the endpoint.
`docs/CONTRACT.md` explains the data shapes. `docs/DEMO.md` is the walkthrough.
