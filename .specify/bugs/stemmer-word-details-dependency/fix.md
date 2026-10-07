# Bug Fix: stemmer treats `word-details` as sole authority

- **Slug**: stemmer-word-details-dependency
- **Fixed**: 2026-10-08
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Two reproducible defects in the stemmer family were fixed. Root-word and
derivative/root status are now decided from the flat lexicon
(`root_words.txt` + `derived_to_root.json`) instead of from a per-word
`word-details` article, so a recorded derivative that has no article at all
(`saksikan` -> `saksi`) is answered instead of failing with a CDN 404.
Separately, `daftar_kata_turunan` now collapses derivatives that KBBI repeats
across the senses of one article, so the count can no longer disagree with the
list it describes.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/data/types.ts` | added | Discriminated `KataStatus` (`derived` / `root` / `unknown`) for the shared lexicon lookup. |
| `src/data/training-extractor.ts` | added, modified | Added `lookupKataStatus(kata)`; added `analyzeAffixesFromRoot(kata, kataDasar, pemenggalan)`; removed the now-orphaned `analyzeWordAffixes`. |
| `src/tools/kamus.ts` | modified | `cari_kata_dasar_dari_lexicon` delegates to `lookupKataStatus`; response payload byte-identical. |
| `src/tools/stemmer.ts` | modified | `cari_kata_dasar` and `analisis_imbuhan` are lexicon-driven with `word-details` demoted to `pemenggalan` enrichment via `enrichPemenggalan`; `unknown` is an explicit error; `daftar_kata_turunan` deduplicates; error text no longer embeds the CDN URL; three tool descriptions corrected. |
| `src/__tests__/stemmer-lexicon.test.ts` | added | 10 offline regression tests with stubbed `fetch`. |
| `src/__tests__/tools.integration.test.ts` | modified | 3 live end-to-end assertions guarding the same contracts. |
| `package.json` | modified | New test file added to the `test` script. |
| `docs/USAGE.md` | modified | FR-029 behaviour update for the three capabilities. |
| `scripts/check-capabilities.cjs` | modified | Human-authored `NOTES` entries corrected so the generated reference stays truthful. |
| `docs/capabilities-reference.md` | modified | Regenerated via `npm run docs:check` (T046), not hand-edited. |
| `.agents/skills/kbbi-mcp/references/capabilities.md` | modified | Hand-maintained mirror of the generated table, kept in sync. |
| `docs/DEFECTS.md` | modified | `D-F05` and `D-F06` added (T076), both status `fixed`. |

## Diff Highlights

Judgement now comes from the lexicon, never from the article:

```ts
const status = await lookupKataStatus(kata);
if (status.status === "unknown") { /* explicit not-found error */ }

// Leksikon sudah menentukan jawabannya. word-details hanya menambah pemenggalan;
// artikel yang hilang tidak boleh menggagalkan jawaban.
const pemenggalan = await enrichPemenggalan(kata);
```

Enrichment degrades silently, and the shared lookup is the single authority:

```ts
async function enrichPemenggalan(kata: string): Promise<string> {
  try {
    const detail = await getWordDetail(kata);
    const entry = detail.entries.find((e) => e.rootWord) ?? detail.entries[0];
    return entry?.nama || "";
  } catch {
    return "";
  }
}
```

Derivatives collapse with first-seen order preserved, and the count is derived
from the same list so the two cannot drift apart:

```ts
const seen = new Set<string>();
const turunan: string[] = [];
for (const entry of detail.entries) {
  for (const kata of entry.terkait?.kataTurunan ?? []) {
    if (seen.has(kata)) continue;
    seen.add(kata);
    turunan.push(kata);
  }
}
jumlahTurunan: turunan.length,
```

## Tests Added or Updated

- `src/__tests__/stemmer-lexicon.test.ts::cari_kata_dasar 'saksikan' menjawab dari leksikon walau artikel 404` — pins the primary defect: answer exists with no article.
- `src/__tests__/stemmer-lexicon.test.ts::cari_kata_dasar 'membantu' tetap melengkapi pemenggalan dari artikel` — pins that enrichment still populates `pemenggalan`.
- `src/__tests__/stemmer-lexicon.test.ts::cari_kata_dasar 'pintar' melaporkan kata dasar dari leksikon` — guards against over-correcting into the opposite error: a lexicon root word is reported as a base word by fact, not by the missing-`rootWord` inference.
- `src/__tests__/stemmer-lexicon.test.ts::cari_kata_dasar kata tak dikenal error tanpa membocorkan URL CDN` — pins the `unknown` case and the removal of the CDN URL from agent-visible output.
- `src/__tests__/stemmer-lexicon.test.ts::analisis_imbuhan 'saksikan' mengurai imbuhan walau artikel 404` — pins affix analysis without an article.
- `src/__tests__/stemmer-lexicon.test.ts::analisis_imbuhan 'membantu' masih mengurai prefiks 'mem'` — pins unchanged behaviour for the common case.
- `src/__tests__/stemmer-lexicon.test.ts::cari_kata_dasar_dari_lexicon tidak berubah bentuk keluarannya` — Principle III guard on the refactored third caller.
- `src/__tests__/stemmer-lexicon.test.ts::daftar_kata_turunan 'balak' menghitung 4, bukan 12` — pins the inflated count; must fail today returning 12.
- `src/__tests__/stemmer-lexicon.test.ts::daftar_kata_turunan menjaga jumlah dan daftar tetap sinkron` — invariant: `jumlahTurunan === kataTurunan.length` and no duplicates.
- `src/__tests__/tools.integration.test.ts` (3 tests) — live end-to-end for `cari_kata_dasar`, `analisis_imbuhan`, and the `daftar_kata_turunan` no-duplicate invariant.

## Local Verification

- `npm run typecheck` -> clean (`tsc --noEmit` and `tsc -p tsconfig.tests.json`).
- `npm run build` -> clean.
- `npm test` -> 94/94 pass, offline, no new dependencies.
- `npm run test:integration` -> 19/19 pass.
- `npm run docs:check` -> `OK: dokumentasi sinkron dengan kode, dan bebas karakter asing` (20 capabilities, 5 workflows).
- `node scripts/verify-accuracy.cjs` -> `Akurasi kata audit: 36/42 (86%)`, gate satisfied.
- Red-before-green verified by stashing only the four source files and re-running the new test file: **7 of 10 failed** before the fix, all 10 pass after. This is the FR-025 evidence for D-F05 and D-F06.
- Manual checks against live data: `saksikan` confirmed present in `derived_to_root.json` (root `saksi`) and confirmed to have no `word-details` article; `balak` confirmed to report 12 pre-fix.

## Deviations from Assessment

1. **The ordered-dedup helper was not extracted as a shared helper.** The
   assessment proposed a shared `string[]` helper justified by "the lexicon
   path also needs to emit a derivative list", i.e. a demonstrated second
   caller under Constitution Principle V. After this fix there is exactly one
   caller: the `daftar_kata_turunan` loop. The proposed second caller is a
   future, unwritten caller, so the helper stays inlined in the tool. The
   assessment's own reasoning for it (dedup belongs in the tool, not the
   reader, because repetition is a property of the upstream article shape) is
   preserved. `jev_decide` scored the extraction question at P=0.657, below
   the constitution's 0.70 halt threshold but too low-confidence to
   authorise, so the determinate written rule of Principle V decided it.
2. **`analyzeWordAffixes` was removed rather than left in place.** Its only
   caller was `analisis_imbuhan`; this change orphaned it, and keeping an
   unused export is exactly the speculative generality Principle V rejects.
3. **`scripts/check-capabilities.cjs` was edited, not just re-run.** The
   assessment said to regenerate `capabilities-reference.md`; that file is
   generated from a human-authored `NOTES` map, so regenerating without
   correcting `NOTES` would have published the now-false "memakai field
   rootWord KBBI" wording. Regenerating from corrected notes was the only way
   to satisfy FR-029 and D-F02.
4. **Two pre-existing documentation inaccuracies were corrected while in the
   file.** `cari_kata_dasar_dari_lexicon` documented its output as
   `{ kata, status, kataDasar }` when it has always returned
   `{ kata, isKataDasar, isKataTurunan, kataDasar }`; `analisis_imbuhan`
   documented `infiks`, which the implementation never produced, and omitted
   `pemenggalan`. Both are now truthful. These were drifts that predated this
   bug.
5. **The assessment's `prefiks` expectation for `saksikan` did not hold.** The
   assessment speculated `se-` and asked for the heuristic's actual output.
   Measured: the suffix loop matches `kan` first, and the remainder `saksi`
   equals the root exactly, so no prefix is detected. The test asserts
   `prefiks: ""`, `sufiks: "kan"`. Behaviour was not changed to fit the guess.
6. **`enrichPemenggalan` still fetches `word-details`,** as the assessment
   specified ("consult `word-details` only to enrich the answer, specifically
   `pemenggalan` from `entry.nama`"). `getHyphenationDict()` would have removed
   the two failing round trips this causes for article-less words, but swapping
   the source would silently change `pemenggalan` values for many existing
   words, which is a larger behaviour change than the assessment authorised.
   Left as a follow-up.

## Follow-ups

- Remove the last per-word `word-details` fetch by sourcing `pemenggalan` from
  the flat hyphenation dictionary, which is one reusable file instead of two
  round trips per call. This matters for FR-033, whose premise is that
  OpenCode's 5,000 ms default is shorter than a CDN round trip. Decide
  deliberately, because it changes existing `pemenggalan` values.
- Consider the observability marker the assessment recommended but treated as
  optional: a `sumber: "lexicon" | "word-detail"` field would let upstream
  article-coverage degradation be monitored now that the article is optional.
  Skipped here to keep the change minimal.
- `cari_kata` still fails for `saksikan`-class words. It is out of scope by the
  assessment's own reasoning (nothing can be answered without an article), but
  it is the fourth capability in the same family and the same gap.
- Unresolved from the assessment, and not blocking: which document was meant by
  "the spec warned about in its Domain Context" (no such section exists; the
  D-F05 entry therefore cites the reproduced behaviour, not a warning), and
  whether `saksikan` is genuinely in current KBBI or a harvester gap. Worth
  raising upstream in `kbbi-harvester-cdn` if the empty-`pemenggalan` outcome
  for such words is itself a problem.
- Downstream consumers building stemmer training data must now tolerate an
  empty `pemenggalan`. Noted in `docs/USAGE.md`.