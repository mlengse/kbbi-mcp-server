# Bug Assessment: Stemmer capabilities treat `word-details` as the sole authority, so words missing upstream 404 and derivative lists are counted with duplicates

- **Slug**: stemmer-word-details-dependency
- **Created**: 2026-10-08T01:03:05+07:00
- **Source**: pasted text (no URL supplied, so the URL Trust Policy was not engaged)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim)

> saksikan has no word-details entry — the request 404s — even though it is a recorded derivative of
>saksi. analisis_imbuhan and cari_kata_dasar both fail on it. This is exactly the KBBI incompleteness the
> spec warned about in its Domain Context, and it confirms a design decision: judgement has to rest on
> the derivative map and root_words.txt, never on word-details. Also, daftar_kata_turunan("balak")
> returned 12 entries that are 4 distinct words repeated three times — worth knowing before anyone
> builds training data from it.

The report is internally consistent and both halves reproduce. One correction to the framing: the
report credits `analisis_imbuhan` and `cari_kata_dasar` with "failing on" `saksikan`, which is
accurate, but it does not mention that a *fourth* capability (`cari_kata`) fails identically. That is
out of scope for a fix — `cari_kata` genuinely has nothing to return when there is no word-detail
record — but it is recorded below because it establishes that the gap is systemic, not per-tool.

## Symptom

Three stemmer capabilities are gated on `getWordDetail()`, which fetches a per-word
`word-details/<L>/<word>.json` from the CDN. When that upstream file does not exist, the tool returns
an `isError` result instead of an answer, even for the one question the server can answer from its own
lexicon: what is the root word. `saksikan` is the demonstrated case — it is present in
`lexicon/derived_to_root.json` as a derivative of `saksi`, yet `cari_kata_dasar` and
`analisis_imbuhan` both fail with `CDN fetch failed: 404`. Separately and independently,
`daftar_kata_turunkan` concatenates a `kataTurunan` array from every word-detail entry without
deduplicating, so a word whose entries repeat the same derivative list reports a derivative count
inflated by the number of entries that repeat it.

## Reproduction

All steps below were executed against this workspace on 2026-10-08. Quoted output is verbatim.

### Part A — the 404 on `saksikan`

1. Call `cari_kata` with `kata: "saksikan"`.
   Observed: `Kata "saksikan" tidak ditemukan: CDN fetch failed: 404 https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@main/word-details/S/saksikan.json`, with `isError: true`.
2. Call `analisis_imbuhan` with `kata: "saksikan"`.
   Observed: identical 404 message and `isError: true`. Expected: `prefiks`/`sufiks`/`kataDasar: "saksi"`.
3. Call `cari_kata_dasar` with `kata: "saksikan"`.
   Observed: identical 404 message and `isError: true`. Expected: `kataDasar: "saksi"`.
4. Call `cari_kata_dasar_dari_lexicon` with `kata: "saksikan"`.
   Observed: `{"kata":"saksikan","isKataDasar":false,"isKataTurunan":true,"kataDasar":"saksi"}` — **the answer exists and the server can already produce it.**
5. Establish that no other lookup path can rescue the word, so a wordlist fallback would not help:
   - `cari_kata_awalan` with `awalan: "saksikan"` -> `{"jumlah":0,"kata":[]}`.
   - `cari_pemenggalan` with `kata: "saksikan"` -> `{"ditemukan":false,...}`.
   - `cari_kata_awalan` with `awalan: "saksi"` -> 10 results including `"saksi"`, confirming the root word is a normal, present word.

### Part B — the inflated derivative count

6. Call `daftar_kata_turunan` with `kataDasar: "balak"`.
   Observed: `jumlahTurunan: 12` over `["balakan","membalak","pembalak","pembalakan"]` repeated three times consecutively.
   Expected: `jumlahTurunan: 4` over those four distinct words.
7. Confirm the shape of the upstream data that produces the repetition by fetching
   `https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@main/word-details/B/balak.json`.
   Observed: the file holds **7** entries. Entries 1, 2 and 3 (ids `7471`, `7472`, `7473` — the senses
   "belang", "wilayah klan", "balok") each carry a byte-identical `terkait.kataTurunan` of the same four
   words. Entries 4–7 (ids `7477`, `145023`, `115310`, `229912`) carry empty `kataTurunan`. Hence
   3 × 4 = 12.

## Suspected Code Paths

- `src/tools/stemmer.ts:23` — `cari_kata_dasar` calls `await getWordDetail(kata)` as its **first**
  statement, inside the `try`. The 404 is thrown before any root-word logic runs, so the tool can only
  fail; it has no lexicon path at all. This is the primary defect.
- `src/tools/stemmer.ts:176` — `analisis_imbuhan` has the identical shape: `await getWordDetail(kata)`
  gates the whole handler, so `analyzeWordAffixes` is unreachable for any word lacking a word-detail record.
- `src/tools/stemmer.ts:185` — the `catch` renders every failure as
  `Kata "..." tidak ditemukan: ...`, which conflates "this word is absent from KBBI" with "the upstream
  per-word file is missing". For `saksikan` the word is *not* absent from KBBI, so the message is wrong
  as well as the outcome. It also leaks the full CDN URL into agent-visible output.
- `src/tools/stemmer.ts:85-90` — `daftar_kata_turunan` calls `getWordDetail(kataDasar)` then
  `turunan.push(...entry.terkait.kataTurunan)` inside a `for (const entry of detail.entries)` loop, with
  no `Set` and no membership check. One array per entry, concatenated.
- `src/tools/stemmer.ts:99` — `jumlahTurunan: turunan.length` reports the un-deduplicated length, so the
  count field is wrong by the same multiplier as the list. This is what makes the defect silently
  corrupting rather than merely noisy.
- `src/data/training-extractor.ts:229` — `analyzeWordAffixes(detail: WordDetail)` takes a `WordDetail`
  and derives everything from `entry.rootWord`. Its signature structurally requires the word-detail
  fetch, so fixing `analisis_imbuhan` means giving it a second input path rather than only changing the
  tool.
- `src/data/reader.ts:136` — `getWordDetail(word)` builds `word-details/<L>/<encodeURIComponent(word)>.json`
  and delegates to `readJsonHybrid`.
- `src/data/reader.ts:51-53` — `fetchCdn` throws a plain `Error` carrying the CDN URL. There is no
  distinct "file absent" signal, so a caller cannot currently tell a missing upstream file from a
  transport failure without string-matching the message.
- `src/data/reader.ts:265` / `:279` — `getRootWords()` reads `lexicon/root_words.txt` and
  `getDerivedToRoot()` reads `lexicon/derived_to_root.json`. These are the working oracles, already
  exposed through the reader.
- `src/tools/kamus.ts:284-327` — `cari_kata_dasar_dari_lexicon` is the **working precedent**: it loads
  both lexicon files in parallel, builds a `Set` from `rootWords`, and reads `derivedToRoot[kata]`. It
  never touches `word-details`. It is the shape the fix should generalise.
- `src/data/types.ts:16` — `Entry.rootWord?: string` is already optional, so the word-detail shape does
  not guarantee a root word even on a successful fetch. This is the second-order reason word-details is
  the wrong authority: absence of `rootWord` currently gets interpreted as "probably a base word"
  (`src/tools/stemmer.ts:54`, `src/tools/stemmer.ts:195`), which is an inference, not a fact.
- `src/data/types.ts:40` — `Terkait.kataTurunan: string[]` is per-entry, which is why per-entry
  concatenation is the natural-but-wrong implementation. The upstream schema makes the repetition
  possible; the tool is responsible for collapsing it.

## Root Cause Hypothesis

The stemmer family resolves *what a word is* by fetching *the word's dictionary article*, and treats a
missing article as "the word does not exist". But in this dataset the article and the morphological
lexicon are independent artifacts with different coverage. `saksikan` is recorded in
`derived_to_root.json` but has no article, no wordlist line, and no hyphenation entry — three separate
datasets disagree about which words exist. Any question that is answerable from morphology alone is
being answered from an artifact that happens to also carry morphology, and therefore inherits that
artifact's coverage gaps. The server already contains the correct query (`cari_kata_dasar_dari_lexicon`)
but it is a separate capability rather than the shared implementation, so the two stemmer tools never
benefit from the lexicon's coverage.

The derivative-count defect has a separate and much narrower cause: upstream repeats the same
`kataTurunan` list on several entries of the same article, which is faithful to how the KBBI site
groups derivatives under individual senses. `daftar_kata_turunan` appends one list per entry and never
collapses them, then reports the raw length as `jumlahTurunan`. The information content is correct
(4 distinct derivatives); only the multiplicity and the count are wrong.

Confidence: **high** for both. Part A is reproduced directly and the working lexicon answer is
demonstrated in step 4. Part B is reproduced in step 6 and the exact upstream repetition causing it is
read directly in step 7. Neither depends on inference.

**On the report's claim that this is the incompleteness "the spec warned about in its Domain
Context":** I could not locate a section by that name in this repository. The closest documented
warning is research.md **D-008**, which establishes that `word-details/` is not a local directory in
this project at all and that data arrives only from the CDN, and Constitution **Principle II**, which
mandates a single choke point at `src/data/reader.ts`. Neither states that the upstream per-word
coverage is incomplete. The substantive point stands on its own evidence — I confirmed the gap
directly — but the citation should be corrected before it is carried into a defect-log entry. See
Open Questions.

## Proposed Remediation

**Preferred — make the lexicon authoritative and demote `word-details` to optional enrichment.**

Root-word and derivative/root status are morphological facts, and the project already ships them as
flat, complete-for-this-purpose files: `lexicon/root_words.txt` and `lexicon/derived_to_root.json`, both
reachable through the reader (`getRootWords`, `getDerivedToRoot`) and therefore compliant with
Principle II. The fix is to route `cari_kata_dasar` and `analisis_imbuhan` through those files for the
*judgement*, and consult `word-details` only to enrich the answer — specifically `pemenggalan` from
`entry.nama`, and `kelasKata` where the response already carries it. When the article is absent, the
enrichment is skipped and the morphological answer is still returned.

Concretely: extract the lookup currently inlined in `cari_kata_dasar_dari_lexicon`
(`src/tools/kamus.ts:290-296`) into a shared helper in `src/data/` that returns a discriminated result —
`{ status: "derived", kataDasar }`, `{ status: "root" }`, or `{ status: "unknown" }` — and have all three
callers use it. `cari_kata_dasar_dari_lexicon` keeps its exact current response shape (Principle III:
no identifier or schema change), while `cari_kata_dasar` and `analisis_imbuhan` gain the ability to
answer from the lexicon. `analyzeWordAffixes` gains a sibling that takes `(kata, kataDasar)` so
`analisis_imbuhan` can be driven by the lexicon result; its existing suffix/prefix heuristic at
`src/data/training-extractor.ts:48` already works on that pair and needs no logic change.

Three things must be preserved deliberately, because they are the edges of the change:

1. **The unknown case stays distinguishable.** A word in neither `root_words.txt` nor
   `derived_to_root.json` is not a base word; it is an unknown word. It must return an explicit
   not-found error, not the current "kemungkinan kata dasar" inference, which was only ever a guess
   made because `rootWord` was missing from an article that *was* found.
2. **`pemenggalan` may become empty.** `saksikan` is absent from the hyphenation dict too, so a
   corrected `cari_kata_dasar` returns `kataDasar: "saksi"` with `pemenggalan: ""`. Returning the
   answer with an empty field is correct and strictly better than erroring; the response shape is
   unchanged, so this stays backward compatible.
3. **The error text must stop conflating the two failure modes**, and should not embed the CDN URL.
   A missing upstream file is an upstream data gap; only a word absent from both datasets is genuinely
   "not found".

For the second defect, **fix `daftar_kata_turunkan` with an explicit dedup** that preserves first-seen
order, and compute `jumlahTurunan` from the deduplicated list so the count and the list can never
disagree again. Deduplication must happen in the tool rather than in the reader, because repetition is a
property of the upstream article shape, not of the data-access layer. A single new shared helper
returning an ordered, deduplicated `string[]` is warranted here because, once the first fix lands, the
lexicon path also needs to emit a derivative list — that is the demonstrated second caller Principle V
requires.

**Alternatives**:

- *Keep `word-details` primary, add a lexicon fallback only on 404.* Smaller diff, and preserves
  current behaviour wherever an article exists. Rejected: it leaves two divergent code paths per tool,
  it still cannot answer for a word that has an article but no `rootWord` (the case
  `src/data/types.ts:16` makes optional), and the scored comparison favoured the lexicon-first shape at
  P=0.83 versus P=0.10. It also does not address `pemenggalan` being unfetchable.
- *Fix only the duplicate count; document the 404 as an accepted upstream gap.* Rejected at P=0.06. It
  leaves three capabilities failing on a word the server can already answer, which is the worse failure
  mode: a loud error where a correct answer exists.
- *Fix the 404 by adding `saksikan` and friends to the upstream wordlist and hyphenation data.* Out of
  scope: that is data work in a different repository, and it would fix only the words someone happened to
  notice. FR-027 also forbids this project from taking the data payload, so the fix must live in code.

**Files likely to change**:

- `src/data/training-extractor.ts` — add the shared lexicon status lookup; add an
  `analyzeAffixesFromRoot(kata, kataDasar)`-shaped sibling to `analyzeWordAffixes` (line 229) so the tool
  is not forced through a `WordDetail`.
- `src/tools/kamus.ts` — `cari_kata_dasar_dari_lexicon` (line 284) delegates to the shared helper while
  returning an identical payload.
- `src/tools/stemmer.ts` — `cari_kata_dasar` (line 17) and `analisis_imbuhan` (line 170) become
  lexicon-driven with word-details enrichment; `daftar_kata_turunan` (line 79) deduplicates and derives
  `jumlahTurunan` from the deduplicated list; both `catch` handlers stop embedding the CDN URL.
- `src/data/types.ts` — a status type for the shared lookup result, if it is not inferred.
- `docs/USAGE.md` — required by FR-029, because documented behaviour changes: these capabilities can now
  answer for words with no dictionary article, and `pemenggalan` may be empty.
- `docs/capabilities-reference.md` — regenerated via `npm run docs:check` (T046); regenerate rather than
  hand-edit, per D-F02.
- `docs/DEFECTS.md` — the new `DefectFinding` entry (T076), status `fixed`, per FR-024 and FR-025.
- `src/__tests__/` — regression tests (below).

**Tests to add or update**:

- `cari_kata_dasar("saksikan")` returns `kataDasar: "saksi"` and does **not** set `isError`. Must fail
  today with the 404. This is the FR-025 red-before-green test for Part A.
- `analisis_imbuhan("saksikan")` returns a result with `kataDasar: "saksi"` and a non-empty `prefiks`
  (`s` + `aksi` => `se-`, so assert the heuristic's actual output rather than assuming), again with no
  `isError`.
- `cari_kata_dasar(kata)` for a word in **neither** lexicon file still errors, and the message does not
  contain `cdn.jsdelivr.net`. Pins the unknown case and the third requirement above.
- A word that **is** in `root_words.txt` is reported as a base word via the lexicon rather than via the
  missing-`rootWord` inference. Guards against over-correcting into the opposite error.
- `daftar_kata_turunan("balak")` returns `jumlahTurunan: 4` and four distinct entries, with the first
  occurrence of each preserved in upstream order. Must fail today returning 12.
- A regression asserting the invariant that `jumlahTurunan === kataTurunan.length` **and** that
  `new Set(kataTurunan).size === kataTurunan.length`, so the count and the list cannot drift apart
  again.
- Per Constitution Principle IV these MUST stub `fetch`; they must not reach the live CDN from `npm test`.
  Because this fix touches tool contracts, `npm run test:integration` is also required to stay green per
  the constitution's gate 5.

## Risks & Considerations

- **Principle III (contract stability) is load-bearing here.** No tool, resource, or prompt may be
  renamed, and no input schema may be narrowed. All three touched tools keep their names, their
  parameter lists, and their `zod` descriptions. The change is to output *values*, and `cari_kata_dasar`
  gains only an additive optional field at most. SC-010's zero-diff name check must still pass; T048
  already snapshots the exposed list in `src/__tests__/installer-contracts.test.ts`.
- **Tool descriptions are the agent's only contract** (Principle III). `cari_kata_dasar`'s current
  description states it "Menggunakan field rootWord dari KBBI", which becomes false after the fix. The
  description MUST be updated in the same change, and the updated text will flow into
  `docs/capabilities-reference.md`.
- **The `unknown` state is a genuine semantic change.** Today "no `rootWord` found" silently means
  "probably a base word". After the fix, absence from both datasets is an error. Some callers relying on
  the old lenient behaviour will start receiving errors. That is the correct trade — the old behaviour
  asserted a fact the server had not established — but it is a behaviour change and belongs in the
  FR-029 documentation update.
- **`pemenggalan` becomes optional in practice.** For `saksikan`-class words present only in the lexicon,
  it will be `""`. Downstream consumers building stemmer training data must tolerate that, and the
  hyphenation dataset has the same coverage gap as `word-details`. Worth noting that
  `scripts/verify-accuracy.cjs` already reports 20.6% accuracy over 68,736 words, so a low hyphenation
  hit rate is an existing, separate concern — this fix must not be evaluated against that baseline.
- **Latency improves, not worsens.** The lexicon is two small text/JSON files fetched once and reusable,
  replacing a per-word article fetch for the judgement. This matters directly against FR-033, whose whole
  purpose is that OpenCode's 5,000 ms default is shorter than a CDN round trip.
- **Observability.** If the fix makes `word-details` optional, upstream article coverage silently
  degrading becomes invisible: results stay correct but lose their `pemenggalan`. Logging a
  `sumber: "lexicon" | "word-detail"` marker would let this be monitored without changing any contract.
  Recommend it; it is optional, not required for correctness.
- **Scope.** Both defects are reproducible defects in existing capabilities, so both sit inside FR-030.
  Adding a new capability to work around either would be out of scope and is explicitly not proposed.
- **Defect-log placement.** Per the merged-findings edge case in spec.md, these two share one root
  premise ("`word-details` is not the authority") but need two separate code changes and two separate
  regression tests. They may be logged as one `DefectFinding` with two tests or as two findings sharing
  a premise; either satisfies SC-011 as long as neither is left without a status.

## Open Questions

- [NEEDS CLARIFICATION: the report cites "the spec warned about in its Domain Context". No section by
  that name exists in `specs/001-mcp-client-onboarding/`, `.specify/memory/constitution.md`, or the
  speckit templates in this repository. research.md D-008 and Constitution Principle II are the nearest
  real precedents but neither states that upstream per-word coverage is incomplete. Which document was
  meant, so the defect-log entry can cite it accurately instead of asserting a warning that isn't there?]
- [NEEDS CLARIFICATION: is `saksikan` genuinely in current KBBI, or is it a harvester gap? The lexicon
  asserts it, but so does the absence of a wordlist line. This does not change the fix — graceful
  degradation is correct either way — but it determines whether the empty-`pemenggalan` outcome is
  expected or itself worth chasing upstream in `kbbi-harvester-cdn`.]
- [NEEDS CLARIFICATION: should the unknown-word case error, or return a distinct third state that says
  "not in the morphological lexicon" without an `isError` flag? The former is simpler and matches
  current semantics; the latter is friendlier to an agent that is mid-conversation. This changes the
  contract, so it should be a deliberate decision rather than a default.]
- [NEEDS CLARIFICATION: is `word-details` coverage known to be broadly sparse beyond `saksikan`, or is
  this an isolated word? A quick sample across several letters would tell us whether the fix converts a
  handful of failures into successes or a broad class of them, which changes how urgently the
  `cari_kata`-family tools should be revisited separately.]
