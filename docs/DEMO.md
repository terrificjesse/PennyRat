# Demo

## Before you present

```bash
npm install
npm run dev          # leave running
npm run warm         # in a second terminal
```

`warm` pre-fetches research for the three demo trips. After it finishes, everything
comes back from `.k2cache/` in single-digit milliseconds instead of 4–11 seconds. Run
it again and every line should say `cache` — that is your green light.

If the API is down, the key is missing, or the venue wifi eats the request, the app
serves the bundled Tokyo sample trip and says so in the research notice. **The demo
cannot fail on a network problem.** Worth knowing, not worth mentioning on stage.

Check `.env.local` has:

```
IFM_API_KEY=<your key>
IFM_BASE_URL=https://api.k2think.ai/v1
IFM_MODEL=MBZUAI-IFM/K2-Think-v2
K2_MODE=live
```

## The three trips

Each one is chosen to show a different shape of problem, not a different nice city.

| Trip | What it demonstrates |
|---|---|
| **ORD → Tokyo**, 12–17 Oct, 2 people, $4,200 | A red-eye that eats a night, and a city where half the museums shut one day a week. |
| **SFO → Mexico City**, 3–8 Dec, 2 people, $2,600 | A tight budget where a $150-a-head tasting menu is a real tradeoff against three other days of eating. |
| **JFK → Reykjavík**, 10–15 Feb, 2 people, $4,500 | The local transport budget doing actual work: a rental car costs twelve times the bus pass. |

## Five minutes

**1 — The premise (30s).** Most trip planners show you things you cannot afford and
let you find out at checkout. This one starts from the number and never lets you leave
it. Type the budget first.

**2 — The budget splits itself (30s).** Six buckets, summing to exactly the total.
Drag one and the others rebalance — it always sums to the total, never $4,199.99,
because every price in the app is integer cents.

Point at **Getting around**. That bucket is the reason people come home over budget,
and it is held apart on purpose.

**3 — Flights (45s).** Real carriers on real hubs, nonstop and connecting, filtered to
the dates. Every price carries an **AI estimate** badge — K2 supplies the route
structure and the seasonal fare band, and the app prices it deterministically. We are
not pretending to have live fares, and the badge says so.

**4 — Explore (60s).** This is where K2 earns its place. Named venues with opening
hours, durations, and admission — for Mexico City it returned Pujol and Quintonil
correctly closed Sundays and Mondays, and the Museo Nacional de Antropología correctly
closed Mondays.

Check things off and watch the meter. When money is left over, it suggests what fits.

**5 — Stay and get around (45s).** Four comfort tiers from a capsule hotel to a
ryokan. Then, on Reykjavík, open the transport step: the bus pass, and the rental car
at twelve times the price — with the Hvalfjörður tunnel toll and the airport shuttle
exclusion called out. It knows the tunnel toll.

**6 — The schedule (90s).** Submit unlocks once the trip is within budget and has a
flight each way, a bed, and something to do.

The itinerary is **not** a model call. It is deterministic code, and this is the part
worth slowing down for:

- The departure day holds nothing but the flight — you are in the air.
- The arrival day starts 90 minutes after landing, not at 9am.
- The last day ends 150 minutes before takeoff, and check-out moves earlier to match
  an early flight.
- Nothing is ever placed on a day a venue is shut.
- Anything that would not fit says why: *"only open outside the hours we plan within
  (08:00–22:00)"*, not *"no slot"*.

On the Tokyo trip, point out the warning that you are paying for a hotel night you
spend over the Pacific. Nobody asks a planner that question; the scheduler noticed.

## If someone asks

**"Are these real prices?"** No, and the app never claims they are — every estimate is
badged. K2 supplies structure it genuinely knows (who flies the route, which hub, what
a fare band looks like in that season) and the arithmetic is ours, so the same trip
always prices the same.

**"What if the model returns garbage?"** It does, regularly, and that is designed for.
Replies are validated one entry at a time, so a bad venue costs that venue. A truncated
or mis-punctuated array is salvaged object by object. If nothing parses, the model gets
one chance to repair it. If that fails, the sample trip is served and the notice says
so. `.k2cache/failures/` keeps anything that needed repairing.

**"Why not just ask the model for the schedule too?"** Because it would put a museum on
a Monday. Packing against opening hours is arithmetic, and arithmetic should not be
guessed. It is also the only part of the app with no variance between runs.

**"How long does research take?"** Four to eleven seconds a call, three calls in
parallel. Cached, it is instant — which is why we warm it before demoing.

## Numbers worth having ready

- **185 tests**, covering budget arithmetic, model-output parsing, and the scheduler.
- **Integer cents everywhere** — check and uncheck fifty times and the remainder is
  exactly what it started at.
- **`reasoning_effort: medium`** — measured, not guessed. Listing twelve hotels costs
  4,547 reasoning tokens at `high` and 841 at `medium`; at `high` with an 8k ceiling
  the model spent its whole budget thinking and returned nothing at all.
- Two live bugs worth telling honestly, because both are the same lesson — never put a
  strict schema on model output: the model writes `"rating": null` for a field it does
  not know, which Zod's `.optional()` rejects, and it tags a hike `"outdoor"` rather
  than `"hiking"`. Each silently emptied a whole batch. Both are now normalised in
  code, and Reykjavík went from 10 venues with 8 warnings to 16 with none.
