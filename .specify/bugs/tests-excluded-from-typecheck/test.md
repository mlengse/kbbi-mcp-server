# Bug Verification: Test files are excluded from the TypeScript type check

- **Slug**: tests-excluded-from-typecheck
- **Tested**: 2026-10-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original symptom no longer reproduces. The tests are now inside a type-checked
program (`tsconfig.tests.json`) and that gate reports zero diagnostics, where the same
check reported 118 errors before the fix. No regressions: `npm test` is 84 pass / 0 fail
(was 83 pass, +1 is the new nullability test), `npm run build` exits 0, and `build/`
output is unchanged.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction step 1 — baseline gate | `npx tsc --noEmit` | pass | Exit 0, no output. Unchanged by design; the tests gate is a separate config. |
| Reproduction step 2 — editor diagnostics | Open `src/__tests__/installer-*.test.ts` in an editor with the TS server | not-run | No editor/language server in this environment. The substantive equivalent was exercised deterministically below, which is a stronger check than an editor report. |
| Reproduction step 3 — forced check of the 4 named files | `npx tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --esModuleInterop --skipLibCheck src/__tests__/installer-{config-io,skill,registry}.test.ts src/__tests__/verify-accuracy.test.ts` | partial | Still exits 2 with **10** diagnostics (was 96). See "Forced check" below — all 10 are artifacts of this command omitting `allowJs`. |
| Forced check, `--allowJs` added | same command + `--allowJs` | pass | **Exit 0, zero diagnostics** on the identical file list. Proves the 10 above are flag artifacts, not source defects. |
| New gate (the regression test) | `npx tsc -p tsconfig.tests.json` | pass | **Exit 0.** Was exit 2 / 118 `error TS` on the pre-fix tree. |
| Gate actually covers the tests | `npx tsc -p tsconfig.tests.json --listFiles` | pass | All 10 files in `src/__tests__` plus the 4 `scripts/lib/*.cjs` modules are in the program. Proves the gate is not vacuously green. |
| `typecheck` script | `npm run typecheck` | pass | Exit 0 (`tsc --noEmit && tsc -p tsconfig.tests.json`). |
| New / updated tests | `npm test` | pass | **84 pass, 0 fail, 0 cancelled, 0 skipped**, exit 0. Confirmed `getClient mengembalikan null untuk id yang tidak dikenal` executed and passed (1.523ms), not skipped. |
| Regression — build | `npm run build` | pass | Exit 0. `build/__tests__/` file count 32 before and after, all still timestamped `2026-10-07T23:11:57` — nothing new emitted. |
| Regression — integration suite | `npm run test:integration` | skipped | Network-dependent (`tools.integration.test.ts`, `verify-accuracy.test.ts`); not run without consent. Note `verify-accuracy.test.ts` *is* covered by the type gate. |
| Lint | — | not-run | No linter configured: `package.json` has no `lint` script, and no `eslint.config.*` / `biome.json` in the repo. |

## Output Excerpts

Gate, post-fix:

```
$ npx tsc -p tsconfig.tests.json
EXIT_gate=0
```

Gate coverage (`--listFiles`), trimmed to the relevant entries:

```
src/__tests__/extractors.test.ts          scripts/lib/clients.cjs
src/__tests__/installer-config-io.test.ts scripts/lib/config-io.cjs
src/__tests__/installer-contracts.test.ts scripts/lib/skill-install.cjs
src/__tests__/installer-docs.test.ts      scripts/lib/report.cjs
src/__tests__/installer-registry.test.ts
src/__tests__/installer-skill.test.ts
src/__tests__/reader.test.ts
src/__tests__/tools.integration.test.ts
src/__tests__/training-extractor.test.ts
src/__tests__/verify-accuracy.test.ts
```

Assessment step 3, verbatim command (10 residual diagnostics):

```
src/__tests__/installer-config-io.test.ts(27,8): error TS7016: Could not find a declaration file
  for module '../../scripts/lib/config-io.cjs' ... implicitly has an 'any' type.
src/__tests__/installer-registry.test.ts(96,33): error TS7006: Parameter 'c' implicitly has an 'any' type.
... (6 further TS7016 / TS7006 of the same two kinds)
EXIT_repro=2
```

Same command plus `--allowJs`:

```
EXIT_repro_allowjs=0
```

`npm test`:

```
ℹ tests 84
ℹ pass 84
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
✔ getClient mengembalikan null untuk id yang tidak dikenal (1.523ms)
```

## Forced check: why 10 diagnostics remain

The assessment's step-3 command passes the `.ts` files directly on the command line, so
TypeScript never loads `tsconfig.tests.json` and therefore never picks up `allowJs`.
Without it, `../../scripts/lib/*.cjs` has no declaration file and resolves to `any`
(TS7016), which in turn makes every callback parameter over those values implicitly
`any` (TS7006). Re-running the identical file list with `--allowJs` yields exit 0.

So the forced check reproduces 10 diagnostics instead of 96, and those 10 are attributable
to the command's flags, not to the tree. The project's own gate — the one the fix
introduced and the one a developer or CI would run — is clean. Fixing this properly would
mean `scripts/lib/*.cjs` carrying real JSDoc parameter types (already recorded as a
follow-up in `fix.md`), which is out of scope here.

## Confirmations of specific fix claims

- **`SerializedEntry` typedef is present and applied at source** — `serializeEntry` carries
  `@returns {SerializedEntry}` (`scripts/lib/config-io.cjs:112`) and the claude/zed arm
  carries `/** @type {SerializedEntry} */` (`config-io.cjs:128`). The union is documented
  in one place, not guessed at by callers. Comments only; no runtime change.
- **Deviation 1 holds — `tsconfig.json` was not modified by the fix.** The `src/__tests__`
  exclusion is still present (`tsconfig.json:18`) and `git diff tsconfig.json` shows it as
  a pre-existing *uncommitted* working-tree edit, exactly as deviation 6 describes. Build
  output is provably unaffected (see the build check).
- **Deviation 3 holds — `sha()` annotated honestly.** `checksum()` genuinely returns
  `null` for a missing file, so `string | null` is the correct signature; the assessment's
  proposed `string` would have been wrong.
- **Deviation 6's `.on` anomaly did not reproduce** under the project's own resolution,
  consistent with the assessment's medium-confidence read that it is an editor artifact.

## Residual Risks

- **Editor diagnostics were not directly observed** (no language server here). The
  substantive claim — "the tests have type errors" — was exercised deterministically
  instead, via the project gate and the forced check, which is a stronger signal than an
  editor report. Noted here so the record is not read as "the editor was confirmed clean."
- **`npm run typecheck` is not wired into CI.** The gate exists but nothing runs it
  automatically, so the gap can silently reopen. This is the assessment's remaining
  remediation item and the one thing that could let the bug return; it is recorded as a
  follow-up in `fix.md`, not as part of this fix.
- **`checkJs` is off**, so the `.cjs` sources are not themselves checked; only their
  inferred types reach the tests. Parameter boundaries remain `any`.
- **Stale `build/__tests__/` artifacts remain** (32 files, gitignored, all timestamped
  before this work). `tsc` does not clean `outDir`, so a future reader could mistake them
  for shipped output. Verified above that nothing new is emitted there.
- **`npm run test:integration` was not run** (network-dependent). Its type-correctness is
  covered by the gate; its runtime behaviour is unverified in this pass.

## Recommendation

Close the bug — verified end-to-end. The gate is real (it demonstrably includes the test
files, and it failed on the pre-fix tree with 118 errors), it is green now, the full unit
suite passes at 84/84 including the new nullability test, and `build/` output is provably
unchanged. Do the two cheap follow-ups before considering this area closed: wire
`npm run typecheck` into CI so the gate is enforced rather than merely available, and clean
up the stale `build/__tests__/` directory.
