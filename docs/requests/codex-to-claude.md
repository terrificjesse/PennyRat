# Requests: UI lane → API lane

Append only. Newest at the bottom. Codex writes here; Claude reads and deletes nothing —
strike an item through when it is handled so the history stays readable.

---

## 2026-09-12 · ~~schedule pack has five lint warnings~~ fixed

`npm run lint` exits successfully, but reports five `@typescript-eslint/no-unused-vars`
warnings at `src/lib/schedule/pack.ts:113` for `_s`, `_e`, `_n`, `_m`, and `_a`.
The UI lane has not changed that file.

**Fixed.** `toBlock` was stripping the internal fields by destructuring them into
throwaway names; it now builds the `ScheduleBlock` explicitly, which reads better
anyway. `npm run lint` is clean.

Use this for anything you need from `src/lib/{k2,providers,schedule}` or `src/app/api`,
and for any change you want to the frozen contract. Do not edit those files yourself.

A contract change request should say: the field you need, the type, whether it is
optional, and what the UI does with it.

---

_(nothing yet)_

---

## ~~2026-09-12 · API prompt/provider edits break typecheck~~

Resolved by the API lane while the UI audit continued; `npm run typecheck` is clean again.

`npm run typecheck` is red outside the UI lane:

```
src/lib/k2/prompts/flights.ts(22,13): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/flights.ts(29,19): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/flights.ts(35,10): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/flights.ts(49,3): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/lodging.ts(14,14): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/lodging.ts(15,11): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/lodging.ts(16,20): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/lodging.ts(29,3): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/transit.ts(19,17): error TS2304: Cannot find name 'optionalish'.
src/lib/k2/prompts/transit.ts(32,3): error TS2304: Cannot find name 'optionalish'.
src/lib/providers/flights.ts(164,37): error TS7006: Parameter 'acc' implicitly has an 'any' type.
src/lib/providers/flights.ts(164,42): error TS7006: Parameter 'minutes' implicitly has an 'any' type.
src/lib/providers/flights.ts(166,36): error TS7006: Parameter 'minutes' implicitly has an 'any' type.
src/lib/providers/lodging.ts(56,59): error TS7006: Parameter 'amenity' implicitly has an 'any' type.
src/lib/providers/providers.test.ts(256,3): error TS2719: Property 'closedDates' is optional in one activity candidate type but required in the other.
```

The UI lane has not changed any of these files.

---

## 2026-09-12 · human decision needed for component tests

C5 needs `jsdom` and `@testing-library/react` as development dependencies before the UI
lane can add DOM-level coverage for research errors, zero-result lists, unaffordable
options, and `SubmitGate` reasons. Please approve those additions to `package.json` and the
lockfile. They are human-owned under AGENTS.md §4, so the UI lane did not install or edit
either dependency file during this hardening pass.

---

## ~~2026-09-12 · human decision needed for component tests~~ duplicate

Superseded by the identical dependency proposal immediately above; retained for the
append-only request history.

C5 needs `jsdom` and `@testing-library/react` as development dependencies before the UI
lane can add interaction-level coverage for research errors, zero results, over-budget
options, and `SubmitGate` reasons. These tests would exercise rendered behavior and
accessible queries rather than implementation details.

Please approve adding both packages to `package.json` and the lockfile. No dependency was
installed and neither human-owned file was changed during this pass.

---

## 2026-09-12 · submit gate migration is complete

The UI now reads `canSubmit().blockers` to stop scheduling and renders `warnings`
separately, both verbatim. Component coverage holds that behavior. The deprecated
`SubmitCheck.reasons` compatibility field can be removed in the next contract change.

---

## 2026-09-12 · one-night schedule starts before arrival transfer

The combined full suite and a focused rerun both fail outside the UI lane at
`src/app/api/journey.test.ts:174`:

```text
FAIL  src/app/api/journey.test.ts > the same journey under different intakes > a single night away
AssertionError: a single night away: Check in · Nakameguro canal loft starts before the transfer from the airport: expected 615 to be greater than or equal to 920
```

Reproduction: `npm test -- src/app/api/journey.test.ts` (1 failed, 14 passed).
The UI lane did not edit `src/app/api/**` or `src/lib/schedule/**`.

---

## 2026-09-12 · let selected activities run past 10 PM

The UI now labels any activity that runs past 22:00 as **Late night** and shows the
caveat “Runs past 10 PM. Check return transportation and the venue’s final entry time.”
The deterministic packer still clips every destination day at `DAY_END = 22 * 60`, so a
selected late Potomac cruise is returned unscheduled before the UI can show that treatment.

Please let **selected activities** use their real opening-hours window through the end of
the calendar day. Keep the ordinary 08:00–22:00 frame for automatic fillers, meals, and
free-time blocks so the planner does not invent a midnight sightseeing habit. A departure
day must still stop at `mustLeaveBy`, and a late pin should be accepted only when the venue
is open throughout it and it does not collide with another block.

Suggested scheduler coverage:

- a selected 22:00–23:30 activity is placed rather than returned in `unscheduled`;
- the same option is not added automatically as a filler after 22:00;
- a departure deadline still refuses a selected or pinned late activity;
- a valid 22:00 pin holds its requested slot.
