# Bug Fix: Test files are excluded from the TypeScript type check, so 120 editor-reported type errors are never gated

- **Slug**: tests-excluded-from-typecheck
- **Fixed**: 2026-10-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added `tsconfig.tests.json` (a `noEmit` gate that pulls `src/__tests__` and the
`scripts/lib/*.cjs` modules into the type-checked program) plus an `npm run typecheck`
script, and fixed the 118 errors it surfaced. Cluster 3 was fixed at the source rather
than in the tests: `serializeEntry` now declares a `SerializedEntry` return type, so the
three entry shapes are one documented type instead of an anonymous union that callers
had to guess at.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `tsconfig.tests.json` | added | Gate config. `noEmit: true`, `allowJs: true`, `checkJs: false`, `rootDir: "."`. Covers all 10 files in `src/__tests__` and the 4 `scripts/lib/*.cjs` modules. |
| `package.json` | modified | Added `typecheck` script: `tsc --noEmit && tsc -p tsconfig.tests.json`. |
| `scripts/lib/config-io.cjs` | modified | Added `SerializedEntry` JSDoc `@typedef` and `@returns` on `serializeEntry`. Comments only — no runtime change. |
| `src/__tests__/installer-config-io.test.ts` | modified | Cluster 1 (module state, helper params) and cluster 3 (union arm reads). Added `client()` narrowing helper. |
| `src/__tests__/installer-registry.test.ts` | modified | Cluster 1 and cluster 2. Added `client()` narrowing helper. |
| `src/__tests__/installer-skill.test.ts` | modified | Cluster 1 and cluster 4 (`string \| null` from `skillVersion` / `skillTargetPath` / `match()`). |
| `src/__tests__/verify-accuracy.test.ts` | modified | Cluster 4: `run(): Promise<ScriptResult>` via a named `ScriptResult` interface. |
| `src/__tests__/installer-registry.test.ts` | added test | `getClient mengembalikan null untuk id yang tidak dikenal`. |

`tsconfig.json` was deliberately **not** modified — see Deviations.

## Diff Highlights

The gate itself:

```jsonc
// tsconfig.tests.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "rootDir": ".",
    "allowJs": true,
    "checkJs": false
  },
  "include": ["src/**/*", "scripts/lib/**/*.cjs"],
  "exclude": ["node_modules", "build", "word-details", "wordlist", "word-category", "word-with-peribahasa"]
}
```

`allowJs` is required: the tests import `../../scripts/lib/*.cjs` directly, and without
it those modules do not resolve at all. `checkJs` stays off so the gate scopes errors to
TypeScript sources rather than opening a second front on the untyped `.cjs` modules.

Cluster 3 fixed at the source, in `scripts/lib/config-io.cjs`:

```js
/**
 * @typedef {object} SerializedEntry
 * @property {string|string[]} command
 * @property {string[]} [args]
 * @property {Record<string, string>} [env]
 * @property {'custom'} [source]
 * @property {'local'} [type]
 * @property {boolean} [enabled]
 * @property {Record<string, string>} [environment]
 * @property {number} [timeout]
 */

/** @returns {SerializedEntry} */
function serializeEntry(record, server, options = {}) { ... }
```

Cluster 2 fixed with one assertion per file instead of ~30, in both test files:

```ts
function client(id: string) {
  const found = getClient(id);
  assert.ok(found, `klien ${id} harus dikenal`);
  return found;
}
```

## Tests Added or Updated

- `src/__tests__/installer-registry.test.ts::getClient mengembalikan null untuk id yang tidak dikenal`
  — pins the nullability that `client()` papers over (`"tidak-ada"`, `""`, `"CLAUDE-CODE"`,
  `"claude_code"`), so it is held by behaviour rather than by a type assertion in test code.

No other tests changed behaviourally. Several assertions were *strengthened* while being
made type-safe (see below), and the total went 83 → 84.

## Local Verification

- `npx tsc --noEmit` (baseline, before the fix) → **exit 0**, confirming the gap: the
  project's own gate saw nothing.
- `npx tsc -p tsconfig.tests.json` (before the fix) → **exit 2, 118 `error TS` diagnostics**
  across exactly the 4 files the assessment named: `installer-config-io` 63,
  `installer-registry` 27, `installer-skill` 20, `verify-accuracy` 8. This is the
  regression test the assessment asked for: it fails on the pre-fix tree.
- `npm run typecheck` → **exit 0** (both the existing `tsc --noEmit` and the new tests gate).
- `npm run build` → **exit 0**, and `build/` output is byte-for-byte unaffected; see
  Verification below.
- `npm test` → **84 pass, 0 fail, 0 skipped** (was 83 pass; +1 is the new nullability test).
- Manual: confirmed the new test and each rewritten assertion actually executed and passed,
  rather than being skipped.

## Verification that `build/` is unchanged

`build/__tests__/` exists on disk, but it is **stale, pre-existing output** — every file
in it is timestamped 23:11:57, whereas the build run during this fix was 23:52. The
`src/__tests__` exclusion in `tsconfig.json` is intact and `tsc` emitted nothing into it,
which is the intended behaviour of the `noEmit` gate approach.

## Deviations from Assessment

1. **Took the second alternative, not the preferred one.** The assessment's *preferred*
   remediation was to drop `src/__tests__` from `tsconfig.json` `exclude`, but its own
   *Risks* section warns this makes `npm run build` emit `./build/__tests__/*.js` and
   `.d.ts` into the published package, and its first `[NEEDS CLARIFICATION]` asks for a
   decision on exactly that. With no clarification on record, the non-destructive branch
   was taken: `tsconfig.tests.json` with `noEmit: true`, which closes the same gap, changes
   no build output, and is fully reversible. The assessment itself names this as "the
   right choice if excluding tests from `build/` output is deliberate". `tsconfig.json` is
   untouched.

2. **Error count is 118, not the 120/96 in the assessment.** 118 is what the new gate
   reports. The assessment's 120 was an editor diagnostic count and its 96 came from a
   hand-rolled `tsc` invocation with different flags; neither is directly comparable, and
   all four clusters were reproduced. Not a discrepancy in substance.

3. **`sha()` is annotated `string | null`, not `string`.** The assessment proposed
   `function sha(file: string): string`, but `checksum()` genuinely returns `null` for a
   missing file (`config-io.cjs:341-344`), so the assessment's signature would have been
   wrong. Annotated with the honest type; every call site only feeds `assert.equal`.

4. **Two assertions were rewritten rather than annotated**, both because `assert.deepEqual`
   and `assert.match` are TypeScript *assertion signatures* that narrow their operands,
   which made the original expressions ill-typed rather than merely untyped:
   - `installer-config-io.test.ts`: `assert.equal(entry.source, undefined)` became
     `Object.keys(entry).includes("source") === false`. The preceding `assert.deepEqual`
     narrows `entry` to exactly `{command, args, env}`, so reading `.source` off it is
     unreachable by construction. The key-absence check states the same intent and is
     actually stricter.
   - `installer-skill.test.ts`: `text.match(/^description:…$/m)[1]` became `?.[1]` guarded by
     `assert.ok(description, …)`; `assert.match(skillVersion(…), …)` guarded by
     `assert.ok(version, …)`. `skillVersion` legitimately returns `string | null`.

   In both cases the rewrite preserves the original assertion's intent and turns an
   implicit assumption into an explicit one.

5. **`installer-registry.test.ts` got two `.find()` guards it did not strictly need.**
   `configCandidates.find(...)` yields `T | undefined`, but `candidatePath()`'s parameter
   is implicitly `any` (the `.cjs` has no JSDoc on it), so no error was raised. Adding
   `assert.ok(candidate, …)` was taken anyway: it removes a latent crash
   (`candidate.scope` on `undefined`) and pins the "every record has a global candidate"
   invariant.

6. **Answering the assessment's open questions, for the record:**
   - *Should `build` emit test code?* No — hence `noEmit` gate. If that later flips, deleting
     `tsconfig.tests.json` and dropping `"src/__tests__"` from `tsconfig.json` `exclude` is
     the whole migration.
   - *Was the exclusion deliberate?* Effectively no. `git diff tsconfig.json` shows the
     `src/__tests__` exclusion is an **uncommitted** working-tree edit in the same
     uncommitted change that added `scripts/lib/` and the installer tests to `package.json`
     scripts. It is incidental scaffolding from the feature work, not a committed policy —
     which supports closing the gap rather than enshrining it.
   - *Should `verify-accuracy.test.ts` stay in `test:integration` only?* Left as-is. It is
     the only file that reaches the network, and moving it is out of scope for this fix.
   - *The `@types/node` `deduped invalid` state?* Not fixed, and not needed to be. The
     assessment's separate `.on`-on-`ChildProcessWithoutNullStreams` anomaly did **not**
     reproduce under the project's own resolution — consistent with the assessment's
     "medium confidence" that it is an editor artifact. It needs an independent
     environment fix; `npm ls @types/node` is still worth checking separately.

## Follow-ups

- **Wire `npm run typecheck` into CI.** The gate now exists but nothing runs it, so the gap
  can silently reopen the next time someone adds an unannotated `let`. This is the
  remaining half of the assessment's remediation and the only reason the bug could return.
- **Stale `build/__tests__/` artifacts.** Left in place (pre-existing, gitignored). `tsc`
  never cleans `outDir`; worth a `rimraf build` pre-`build` step or a one-time manual
  delete so a future reader is not misled into thinking tests ship in the package.
- **`scripts/lib/*.cjs` remain untyped at their boundaries** — `candidatePath`,
  `serializeEntry`'s parameters, `mergeServerEntry`, `skillVersion` and friends have no
  JSDoc parameter types, so their parameters are `any` and callers get no help. The
  `SerializedEntry` return type is a good precedent; extending it to parameters would
  tighten the remaining errors.
- **`checkJs` is off.** Turning it on later would type-check the installer `.cjs` sources
  themselves, which is the natural next step but a larger piece of work.