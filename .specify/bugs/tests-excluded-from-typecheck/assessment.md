# Bug Assessment: Test files are excluded from the TypeScript type check, so 120 editor-reported type errors are never gated

- **Slug**: tests-excluded-from-typecheck
- **Created**: 2026-10-07T23:44:37+07:00
- **Source**: pasted text (editor diagnostics report: 120 errors in `src/__tests__/*.test.ts`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Editor diagnostics report 120 errors across the test suite. The errors fall into four
clusters:

1. **Implicit `any` on locals and parameters** — e.g. `let tmpRoot;`, `let previousRoot;`,
   `let openCodePath;` in `installer-config-io.test.ts`, `installer-skill.test.ts`, and
   `installer-registry.test.ts`; parameters `file`, `merged`, `dir`, `relative`, `contents`.
2. **`Object is possibly 'null'` on `getClient(...)`** — `getClient("claude-code").rootKey`,
   `getClient("opencode").entryShape`, `getClient("antigravity").knownConflicts`, and
   `record.configCandidates` in `installer-registry.test.ts`.
3. **Property access on a union type** — `serializeEntry(...)` results are read as both
   shapes: `entry.source` (claude/zed shape), then `entry.type` / `entry.enabled` /
   `entry.environment` / `entry.timeout` (opencode shape), in `installer-config-io.test.ts`.
4. **`string | null` and `unknown` results** — `assert.match(skillVersion(...), ...)`,
   `assert.match(claude, ...)`, `assert.match(target, ...)`, `target.includes(...)` in
   `installer-skill.test.ts` and `installer-registry.test.ts`; `result.code` / `result.stdout`
   on an `unknown` in `verify-accuracy.test.ts`.

One anomaly is reported separately and is **not** a code defect: `Property 'on' does not exist
on type 'ChildProcessWithoutNullStreams'` at `verify-accuracy.test.ts:32`. `ChildProcessWithoutNullStreams`
extends `ChildProcess` which extends `EventEmitter`; `.on` exists. `npm ls` reports
`@types/node@22.20.1` as `deduped invalid`, so this is a type-resolution artifact of the editor
server, not a source error. See Open Questions.

## Symptom

The type checker the project runs (`npm run build` → `tsc`, and `npx tsc --noEmit`) reports zero
errors, while the editor's language server reports 120 errors in the same test files. Expected:
either the tests type-check cleanly, or the type errors fail a command the project runs.

## Reproduction

1. Run `npx tsc --noEmit` at the repo root. Observed: exits 0, no output.
2. Open any `src/__tests__/installer-*.test.ts` in an editor with the TypeScript server. Observed:
   the diagnostics listed above.
3. Confirm the cause by forcing the files into the check:
   `npx tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --esModuleInterop --skipLibCheck src/__tests__/installer-config-io.test.ts src/__tests__/installer-skill.test.ts src/__tests__/installer-registry.test.ts src/__tests__/verify-accuracy.test.ts`
   Observed: **96 `error TS` diagnostics**.
4. Confirm runtime is unaffected: `npm test`. Observed: 83 pass, 0 fail.

## Suspected Code Paths

- `tsconfig.json:18` — `"exclude": [..., "src/__tests__"]`. This is the root cause: the tests are
  outside the program, so no project command type-checks them. The editor server type-checks
  open files regardless of `exclude`, which is why the two disagree.
- `scripts/lib/clients.cjs:158` — `getClient(id)` returns `CLIENTS.find(...) || null`. Callers must
  narrow; the tests dereference the result directly, which is the source of cluster 2.
- `scripts/lib/config-io.cjs:89` — `serializeEntry(record, server, options)` returns one of two
  structurally different object literals (opencode shape at line 92, claude/zed shape at line 103).
  TypeScript infers a union; the tests read fields from both arms off a single value, which is
  cluster 3.
- `scripts/lib/config-io.cjs:316` — `resolveConfigPath` returns `null` when no candidate matches,
  so `chosen.path` / `chosen.created` need narrowing. Same for `skillTargetPath` at
  `scripts/lib/clients.cjs:103`, which returns `null` when `record.skillTarget` is absent.
- `src/__tests__/verify-accuracy.test.ts:21` — `run()` returns `new Promise((resolve) => ...)` with
  no type parameter, so it infers `Promise<unknown>`. `result.code` / `result.stdout` in the tests
  are then `unknown`. Genuine, minor.
- `src/__tests__/installer-config-io.test.ts:39-40`, `installer-skill.test.ts`, `installer-registry.test.ts` — module-level
  `let tmpRoot;` / `let previousRoot;` with no annotation, plus untyped helper parameters. Real but
  mechanical.

## Root Cause Hypothesis

The six installer/verify test files were authored as JavaScript with JSDoc-era conventions and
carried into `.ts` extension without type annotations, while `tsconfig.json` keeps `src/__tests__`
excluded from the compiled program. The result is a standing gap: `tsc` never sees the tests, `tsx`
erases types without checking them, so the only reporter of these errors is the editor. The
diagnostics are genuine type violations rather than false positives — `getClient` really does
return `null` for an unknown id, and `serializeEntry` really does return a union — but the tests
happen to pass at runtime because the ids are valid and the assertions are permissive enough that
the wrong arm satisfies them.

Confidence: **high** for the exclusion being the cause (step 3 above forces the check and
reproduces 96 errors on the same files). Confidence: **high** that clusters 2 and 3 are real
violations rather than inference noise. Confidence: **medium** on the `.on` error being purely an
`@types/node` artifact — it is not reproducible under the project's own resolution.

## Proposed Remediation

**Preferred**: remove `"src/__tests__"` from `tsconfig.json` `exclude` and annotate the tests so
they pass. The exclusion predates the test suite (`npm test` currently references
`installer-contracts.test.ts` and `verify-accuracy.test.ts`, both untracked new files), and keeping
the tests out of the program means the project's own gate cannot protect them. The work splits into
three mechanical passes:

1. Annotate module-level test state and helpers: `let tmpRoot: string;`,
   `let previousRoot: string | undefined;`, `let openCodePath: string;`,
   `function sha(file: string): string`, `function readJson(file: string): any`,
   `function configWrite(merged: { doc: ConfigDocument }): void`, etc. Roughly 15 declarations
   across the three installer test files.
2. Introduce narrowing helpers so cluster 2 disappears without 30 repeated assertions. E.g. in
   `installer-registry.test.ts` a local `const client = (id: string) => { const r = getClient(id);
   assert.ok(r, \`klien ${id} dikenal\`); return r; }` — one assertion, then every `getClient(...)`
   dereference is sound. Same pattern for `resolveConfigPath` / `skillTargetPath` results.
3. Fix cluster 3 at the source rather than in the tests: give `serializeEntry` an explicit return
   type in `scripts/lib/config-io.cjs`, e.g. a `SerializedEntry` type that is the union with all
   fields optional except `command`. This documents the contract in one place and makes the union
   explicit for consumers, rather than having four dozen `as` casts in test code.

Then add `"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.tests.json"` (or simply let
`build` cover the tests via a separate `tsconfig.tests.json` with `noEmit: true`) and wire it into
CI so the gap cannot reopen.

**Alternatives**:

- *Keep the exclusion, add a dedicated `tsconfig.tests.json` with `noEmit` and a `typecheck` script.*
  Lower churn and zero risk to the emitted build, at the cost of a second config to keep in sync —
  and it still requires the same annotations, since the errors are real either way. This is the
  right choice if excluding tests from `build/` output is deliberate (avoiding test `.js` in
  `./build`).
- *Rename the tests to `.test.cjs` and leave them untyped.* Fastest to green, and honest about the
  fact that they exercise untyped `.cjs` modules — but it discards the type coverage permanently
  and gives up the narrowing that would catch a real `getClient` regression.

**Files likely to change**:

- `tsconfig.json` — drop `src/__tests__` from `exclude`, or add `tsconfig.tests.json`
- `src/__tests__/installer-config-io.test.ts` — clusters 1 and 3
- `src/__tests__/installer-registry.test.ts` — clusters 1 and 2
- `src/__tests__/installer-skill.test.ts` — clusters 1 and 2
- `src/__tests__/verify-accuracy.test.ts` — `run()` return type
- `scripts/lib/config-io.cjs` — explicit `serializeEntry` return type (and JSDoc `@typedef`)
- `package.json` — a `typecheck` script, so the gate is runnable in one word

**Tests to add or update**:

- No new behavioural tests are needed; this is a compile-time fix. The 83 existing tests must stay
  green.
- Add one assertion-level guard that the current tests lack: at least one test should assert that
  `getClient("tidak-ada")` returns `null`, so the nullability that these tests are papering over
  is pinned by behaviour rather than by a type assertion in test code.
- If the `typecheck` script is added, it is the regression test: it must fail on the current tree
  and pass after the annotations land.

## Risks & Considerations

- **Removing the exclusion changes `build` output**: `tsc` will emit `./build/__tests__/*.js` and
  their `.d.ts`, since `rootDir` is `./src`. That ships test code in the package. Prefer
  `tsconfig.tests.json` with `noEmit: true` for the gate, or add `"exclude"`-equivalent filtering
  to the build.
- **The `.cjs` modules have no declaration files.** Types reach the tests by inference from the
  JS source (JSDoc + literal widening). Adding a real `serializeEntry` return type is worth doing
  via a JSDoc `@typedef`, which `allowJs` inference will pick up without a `.d.ts`.
- **The union in cluster 3 reflects a real API ambiguity**, not just a typing nuisance. If the fix
  casts rather than models the union, a future change to either entry shape will silently pass tests
  that no longer assert the right field.
- **`@types/node` is reported `invalid` by pnpm.** Independent of this bug, but it is why the `.on`
  diagnostic appears and it will keep producing editor-only noise until resolved.
- **No runtime or user-facing risk today.** `npm test` is green and `build` is green, so this is
  tooling debt and latent risk, not an active regression.

## Open Questions

- [NEEDS CLARIFICATION: Should `build` emit test code? If shipping `./build/__tests__` is
  unacceptable, confirm `tsconfig.tests.json` + `noEmit` as the gate instead of removing the
  exclusion outright.]
- [NEEDS CLARIFICATION: Was the `src/__tests__` exclusion deliberate, to keep tests out of the
  published `build/`? `git log` shows the tests are untracked and the exclusion is already
  committed, so the ordering is ambiguous.]
- [NEEDS CLARIFICATION: should `verify-accuracy.test.ts` stay in `test:integration` only? It is the
  one file in this set that touches the network, which is why it is already split out.]
- [NEEDS CLARIFICATION: the `@types/node` `deduped invalid` state — is that a known environment
  issue, or should it be fixed alongside?]