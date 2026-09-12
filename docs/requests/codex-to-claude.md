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
