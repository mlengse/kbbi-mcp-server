# Bug Verification: stemmer treats `word-details` as sole authority

- **Slug**: stemmer-word-details-dependency
- **Tested**: 2026-10-08
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The two assessed defects no longer reproduce. The reproduction was exercised
directly, by booting the local source over `InMemoryTransport` and driving the
assessment's own steps against the live CDN; it was not concluded from the test
suite alone. Both in-scope capabilities that failed with
`CDN fetch failed: 404` on `saksikan` now answer from the lexicon
(`kataDasar: "saksi"`), and `daftar_kata_turunan("balak")` reports 4 instead of
12. No regressions: 94/94 offline tests, 19/19 integration tests, typecheck,
build, docs gate and accuracy gate all pass.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), Part A steps 1-5 | Inline harness over `InMemoryTransport` against live CDN | pass | Steps 2 and 3 now answer; step 1 still fails and was out of scope per the assessment. |
| Reproduction (post-fix), Part B steps 6-7 | Same harness, plus direct fetch of `word-details/B/balak.json` | pass | `jumlahTurunan` 12 -> 4; upstream article shape re-confirmed unchanged. |
| New / updated tests | `npx tsx --test src/__tests__/stemmer-lexicon.test.ts` | pass | 10/10. |
| New / updated tests (live) | `npm run test:integration` | pass | 19/19, includes the 3 assertions added by the fix. |
| Regression suite | `npm test` | pass | 94/94 offline. |
| Lint / type-check | `npm run typecheck` | pass | `tsc --noEmit` and `tsc -p tsconfig.tests.json` clean. |
| Lint / type-check | `npm run build` | pass | `tsc` clean. |
| Docs gate | `npm run docs:check` | pass | 20 capabilities, 5 workflows, no non-Latin characters. |
| Accuracy gate | `node scripts/verify-accuracy.cjs` | pass | 36/42 (86%); gate satisfied. |
| Staleness of connected MCP server | Live calls to the `kbbi` MCP tools in this session | fail (expected) | The connected MCP instance is a pre-fix build and still reports the bug. Not a code defect; see Residual Risks. |

## Output Excerpts

Assessment step 3, `cari_kata_dasar("saksikan")` - was `isError: true` with a
404, now:

```
{ "kata": "saksikan", "kataDasar": "saksi", "pemenggalan": "" }
```

Assessment step 2, `analisis_imbuhan("saksikan")` - was `isError: true` with the
same 404, now:

```
{ "kata": "saksikan", "kataDasar": "saksi", "prefiks": "", "sufiks": "kan", "pemenggalan": "" }
```

Assessment step 6, `daftar_kata_turunan("balak")` - was
`jumlahTurunan: 12`, now:

```
{ "kataDasar": "balak", "jumlahTurunan": 4,
  "kataTurunan": [ "balakan", "membalak", "pembalak", "pembalakan" ] }
```

Assessment step 7, upstream `word-details/B/balak.json` re-fetched live - still
the shape the assessment described, so the unit-test fixture is faithful:

```
entries total: 7
entry 1 id=7471 jumlah_kataTurunan=4
entry 2 id=7472 jumlah_kataTurunan=4
entry 3 id=7473 jumlah_kataTurunan=4
entry 4..7 jumlah_kataTurunan=0
distinct turunan: balakan, membalak, pembalak, pembalakan
```

Suite totals: `npm test` 94/94, `test:integration` 19/19,
`stemmer-lexicon.test.ts` 10/10, docs gate
`OK: dokumentasi sinkron dengan kode, dan bebas karakter asing`, accuracy
`Akurasi kata audit: 36/42 (86%)`.

Behaviour-change confirmation (not part of the original symptom, but the fix
introduces it deliberately): a word in neither lexicon now errors without
leaking infrastructure detail, where it previously returned a lenient guess.

```
Kata "zzqqxx" tidak ditemukan di leksikon morphological   (isError=true)
leaks cdn.jsdelivr.net: false
```

## Residual Risks

- **`cari_kata("saksikan")` still fails** with the original 404 and still leaks
  the CDN URL. This is the assessment's own step 1, and the assessment declared
  it out of scope because nothing can be answered without an article. It is
  recorded here so it is not mistaken for a fixed capability: the bug is fixed
  for `cari_kata_dasar` and `analisis_imbuhan`, not for the `cari_kata` family.
- **The connected `kbbi` MCP server in this session is a stale pre-fix build.**
  It still returns `jumlahTurunan: 12` and the `saksikan` 404. Verification
  therefore had to boot the local source directly. Any consumer still running an
  older installed build will keep observing the old behaviour until it is
  upgraded or reinstalled; this is a deployment matter, not a code defect.
- **Drift from the assessment's step 5:** `cari_kata_awalan("saksi")` returned
  19 results where the assessment recorded 10. This is upstream wordlist growth
  between the assessment and now, not a regression; no assertion depends on the
  exact count.
- **`pemenggalan` enrichment still costs two failing round trips** for
  article-less words, because `word-details` is still consulted for it. Carried
  over as a follow-up from the fix; it affects latency, not correctness.
- **Behaviour change for callers:** words absent from both lexicon files now
  return an error where they previously returned an inferred "likely a base
  word". Any caller depending on the lenient behaviour will start seeing errors.
  This is the intended trade and is documented in `docs/USAGE.md`, but it is a
  contract-visible change worth noting at release time.
- The four `[NEEDS CLARIFICATION]` items from the assessment remain unresolved
  and were not needed to judge this fix. In particular it is still unconfirmed
  whether `saksikan` is genuinely in current KBBI or a harvester gap.

## Recommendation

Close the bug - verified end-to-end against live data, not just against the
test suite. Both in-scope capabilities answer from the lexicon where they
previously returned a CDN 404, the duplicated derivative count is gone, the
upstream data shape that caused it is unchanged, and every gate the constitution
requires is green. Before release, note that consumers on an older installed
build will still see the old behaviour until upgraded, and that `cari_kata`
remains dependent on `word-details` by design. The two follow-ups recorded in
`fix.md` - sourcing `pemenggalan` from the flat hyphenation dictionary, and
revisiting `cari_kata` - belong in separate work items rather than reopening
this one.