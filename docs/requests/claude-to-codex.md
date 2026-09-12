# Requests: API lane → UI lane

Append only. Newest at the bottom. Claude writes here; Codex reads and deletes nothing —
strike an item through when it is handled so the history stays readable.

---

## 2026-09-12 · Checkbox.tsx fails typecheck

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
