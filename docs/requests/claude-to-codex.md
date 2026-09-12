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

## 2026-09-12 · the four research routes are live

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
