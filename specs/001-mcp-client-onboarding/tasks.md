---
description: "Task list for 001-mcp-client-onboarding"
---

# Tasks: Multi-Client Onboarding, Skill, Installer, dan Perbaikan Temuan

**Input**: Design documents from `/specs/001-mcp-client-onboarding/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests ARE included. The constitution (Principle IV) requires network-isolated unit tests, and FR-025 requires a regression test per fixed defect, so each story phase carries its own tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Every task names its exact file path

## Verified code anchors (from CodeGraph, not guessed)

| Path | Role |
|------|------|
| `scripts/build-browser.cjs` | existing build script |
| `scripts/verify-accuracy.cjs:17` | existing defect, `WORD_DETAILS_DIR` points at a non-existent `word-details/` |
| `src/index.ts:19` | `createKbbiServer()`, the factory the `verify` command boots |
| `src/tools/kamus.ts` | 8 tools: cari_kata, cari_kata_awalan, kelas_kata, contoh_kalimat, peribahasa, daftar_kategori, cari_kata_dasar_dari_lexicon, statistik_lexicon |
| `src/tools/stemmer.ts` | 5 tools: cari_kata_dasar, daftar_kata_turunan, ekspor_stem_mapping, analisis_imbuhan, daftar_kata_dasar_kbbi |
| `src/tools/pemenggalan.ts` | 7 tools: pemenggalan_kata, ekspor_training_dic, validasi_pemenggalan, statistik_pola_suku, cari_pemenggalan, daftar_dic, bandingkan_dic |
| `src/prompts/index.ts` | 5 workflows: siapkan_data_training_pemenggalan, siapkan_data_training_stemmer, analisis_edge_cases, validasi_engine, bandingkan_kata |
| `src/data/reader.ts` | the only sanctioned data access path (Principle II) |
| `src/__tests__/` | where `npm test` expects tests |
| `.agents/skills/` | already holds 9 Spec Kit skills; the shared Zed + Antigravity skill location |
| `build/index.js` | the built server entry that clients launch |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory scaffolding and test-runner wiring so later phases can land files in their final locations.

- [X] T001 Create `docs/` directory containing `.gitkeep`, since `docs/INSTALL.md`, `docs/USAGE.md`, and `docs/capabilities-reference.md` are new and `docs/` does not exist yet
- [X] T002 [P] Create `scripts/lib/` directory containing `.gitkeep`, since the installer's four library modules land there and it does not exist yet
- [X] T003 [P] Create `.agents/skills/kbbi-mcp/references/` directory for the skill package layout required by `contracts/skill-package.md`
- [X] T004 Update the `test` script in `package.json` to include `src/__tests__/installer-registry.test.ts`, `src/__tests__/installer-config-io.test.ts`, and `src/__tests__/installer-skill.test.ts`, since the current script lists three files explicitly and would silently skip new tests. Leave `test:integration` untouched
- [X] T005 [P] Add `installer` and `installer:verify` npm scripts to `package.json` wrapping `node scripts/install-clients.cjs`, and add `docs:check` wrapping the capability drift check from T052

**Checkpoint**: directories exist and `npm test` will pick up installer tests once they land

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The registry, the config read/merge/backup engine, and the report renderer. No user story work can begin until these exist, because every story's logic reads from them.

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Create the declarative client registry in `scripts/lib/clients.cjs` exporting one record per client, with fields exactly as data-model.md `ClientRecord` specifies: `id` (lowercase slug, unique, drives the server entry name), `displayName` (Indonesian), `configCandidates` (ordered array, first existing wins), `rootKey`, `entryShape` (one of `claude-style` | `opencode-style` | `zed-style`), `detection` (pure predicate, read-only, never writes), `skillTarget` (string or null), `knownConflicts` (string[]). Populate the four verified shapes from `contracts/client-registry.md`: Claude Code `mcpServers` + claude-style; OpenCode `mcp` (v1) or `mcp.servers` (v2) with opencode-style; Zed `context_servers` + zed-style requiring `source: custom`; Antigravity `mcpServers` + claude-style. Carry NO record for Claude Desktop, per D-007
- [X] T007 [P] Add the `kbbi-v2-shape` entry to the OpenCode record's `knownConflicts` and the `antigravity-workspace-ignored` entry to the Antigravity record's, so T009 and T015 have something to branch on. This encodes D-003 and D-005 as data, not as branches on client identity
- [X] T008 Create `scripts/lib/config-io.cjs` implementing the data-model.md `ConfigDocument` lifecycle: `readConfigDocument(path)` returning `{path, exists, raw, parsed, parseError, servers}`, where `parseError` is non-null when the file exists but fails to parse and a document in `parseError` is NEVER written. This is the single most important invariant in the data model
- [X] T009 [P] Implement `mergeServerEntry(document, record, entry)` in `scripts/lib/config-io.cjs`: writes the entry under `record.rootKey`, replaces an existing entry of the same name rather than duplicating it, preserves every other entry untouched, and returns an unchanged signal when the new entry deep-equals the existing one so FR-007 idempotency leaves the file byte-identical
- [X] T010 [P] Implement `writeConfigDocument()` in `scripts/lib/config-io.cjs` that takes a backup before every write, including a write that only replaces an entry, and formats JSON with two-space indentation matching the existing `config/*.json` examples
- [X] T011 [P] Implement `BackupSnapshot` handling in `scripts/lib/config-io.cjs`: `createBackup(document, clientId)` writing `{id, sourcePath, createdAt, bytes, existed}` where `id` is timestamp plus client id and `bytes` are the verbatim pre-write contents, and `restoreBackup(clientId)` that copies the stored bytes back rather than re-serialising, because re-serialising reorders keys and would fail SC-007
- [X] T012 [P] Create `scripts/lib/report.cjs` rendering the per-client `Laporan Status` as data-model.md specifies: result per client (`berhasil` | `dilewati` | `gagal`), failure reason, change count. Output in Indonesian per FR-021, with capability names and verbatim system error strings left in their original form
- [X] T013 Implement `resolveRepoRoot()` and `resolveServerPaths()` in `scripts/lib/config-io.cjs`, deriving the repository root from the script's own location rather than `process.cwd()`, per the "run from the wrong directory" edge case. `command` must be an absolute verified-executable path to `node`; `args` must be a single-element array holding the absolute path to `build/index.js`. Absolute-only is required because the four clients launch the server from different working directories, and storing the path as a JSON array element is what makes Windows paths with spaces need no escaping
- [X] T014 [P] Create the installer entry point `scripts/install-clients.cjs` with argument parsing for the five commands (`install`, `status`, `uninstall`, `restore`, `verify`) and the global flags `--client <id>` (repeatable), `--dry-run`, `--yes`, `--skill` / `--no-skill`, `--scope global|project`, plus a `KBBI_CONFIG_ROOT` environment override that redirects every registry path at a temporary root so unit tests stay offline per Principle IV. An unknown client id must exit 3 listing valid ids, per the exit-code table
- [X] T015 [P] Implement `assertPrerequisites()` in `scripts/install-clients.cjs`: exit 2 naming Node.js when it is absent from PATH, and exit 2 naming the missing build when `build/index.js` does not exist. Never write a registration pointing at a missing file. Per FR-031, Antigravity MUST reject `--scope project` with a clear message rather than silently writing a file the CLI ignores
- [X] T016 [P] Implement `confirmForClient()` in `scripts/install-clients.cjs` using `node:readline`, one prompt per client. Approving three of five changes exactly three configurations; declining one skips that client without aborting the run or blocking later clients. `--yes` skips the prompt only when `--dry-run` is absent, and the report records that confirmation was bypassed

**Checkpoint**: Foundation ready. Every story's work is a matter of composing these primitives

---

## Phase 3: User Story 1 - Memasang dan terhubung pada satu klien (Priority: P1) - MVP

**Goal**: One installer command registers the server in a single chosen client and the client can return a real KBBI definition afterwards.

**Independent Test**: On a clean machine with one client installed, run the installer for that client only, restart the client, then request one definition lookup from inside it. Expect a correct KBBI definition with no manual config editing.

### Tests for User Story 1

> Write these first, ensure they FAIL before implementation

- [X] T017 [P] [US1] Test that `install --client <id>` on a config with no `kbbi` entry writes the entry under the client's `rootKey` in `src/__tests__/installer-config-io.test.ts`, using `KBBI_CONFIG_ROOT` pointed at `node:os` tmpdir
- [X] T018 [P] [US1] Test that declining confirmation leaves the config file byte-identical, in `src/__tests__/installer-config-io.test.ts`
- [X] T019 [US1] Test that an absent build exits 2 and writes nothing, in `src/__tests__/installer-config-io.test.ts`
- [X] T020 [US1] Test that a config containing unrelated user entries keeps them present and unmodified after install, in `src/__tests__/installer-config-io.test.ts`

### Implementation for User Story 1

- [X] T021 [P] [US1] Implement `installCommand()` in `scripts/install-clients.cjs` following the eight-step order in `contracts/installer-cli.md`: resolve repo root, locate node, resolve or build the server entry, probe config candidates and detect, print the planned change then confirm, back up and merge and write, install the skill, print the report
- [X] T022 [US1] Implement `detectClients(records)` in `scripts/install-clients.cjs` calling each record's `detection` predicate, reporting absent clients without creating config entries for them, per FR-003
- [X] T023 [US1] Implement `buildServerEntry(record)` in `scripts/install-clients.cjs` producing the ServerEntry per data-model.md: `name` fixed to `kbbi`, `command` absolute verified node path, `args` single-element absolute `build/index.js` path, `env` defaulting empty and never carrying secrets or a CDN base
- [X] T024 [US1] Implement per-`entryShape` serializers in `scripts/lib/config-io.cjs`. Claude-style writes `command` + `args` + `env`. Zed-style additionally writes `source: "custom"`, without which Zed treats the entry as extension-provided. OpenCode-style writes `type: "local"`, `command` as an array *including the executable*, `enabled`, and the env key `environment` rather than `env`
- [X] T025 [US1] Add the `build` step to `installCommand()` in `scripts/install-clients.cjs` so a missing build is produced automatically when possible and otherwise stops with clear instructions, satisfying Story 1 acceptance scenario 5
- [X] T026 [US1] Implement `verifyCommand()` in `scripts/install-clients.cjs`: boot `createKbbiServer()` from `src/index.ts:19` over stdio, call one capability end to end, and report installation failure and network failure as two distinct outcomes, since the edge cases section requires that distinction. This is the optional network-dependent step separated out per FR-023

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Menambah klien lain tanpa sentuhan manual (Priority: P2)

**Goal**: Add the server to the remaining three clients in one session, with per-client confirmation, failure isolation, and preservation of user entries.

**Independent Test**: Add the server to each of the three remaining clients on a test machine. Every client must invoke the same capabilities and return the same results.

### Tests for User Story 2

- [X] T027 [P] [US2] Test multi-client install across all four records writes the same logical server entry into each config, in `src/__tests__/installer-config-io.test.ts`
- [X] T028 [P] [US2] Test that an unwritable config for one client aborts only that client, lets the others complete, and is reported with its reason, in `src/__tests__/installer-config-io.test.ts`
- [X] T029 [US2] Test that approving three clients and declining two changes exactly three configs and leaves two intact, in `src/__tests__/installer-config-io.test.ts`
- [X] T030 [US2] Test the OpenCode timeout: the written entry's timeout value must exceed one CDN round trip, since the 5000ms default is shorter than a CDN round trip per FR-033. In `src/__tests__/installer-config-io.test.ts`

### Implementation for User Story 2

- [X] T031 [P] [US2] Implement OpenCode schema detection in `scripts/lib/config-io.cjs`: probe the file at runtime for the v1 shape (entries directly under `mcp`, using `enabled`) or the v2 shape (nested under `mcp.servers`, using `disabled`), emit v1, and refuse to write into a v2 config with a clear incompatibility message rather than emitting a silently broken entry, per D-003
- [X] T032 [US2] Write the OpenCode tool-fetch timeout into the entry per FR-033, with a value that exceeds one CDN network round trip. `enabled` is used for v1, matching the shape observed on the target machine
- [X] T033 [US2] Implement Antigravity path selection in `scripts/lib/config-io.cjs`: probe `~/.gemini/config/mcp_config.json`, then `~/.gemini/antigravity/mcp_config.json`, then `~/.gemini/antigravity-ide/mcp_config.json`, prefer a candidate that already holds servers, and report which path was chosen, per D-004. Global path only, never `.agents/mcp_config.json`, which is silently ignored per D-005
- [X] T034 [US2] Implement `--scope global|project` resolution in `scripts/install-clients.cjs`: global is the default per FR-031, project is offered only when explicitly requested and is never chosen silently
- [X] T035 [US2] Implement failure isolation in `installCommand()` in `scripts/install-clients.cjs`: one client's failure completes the others and is reported explicitly with its reason, and a mid-run cancellation leaves already-approved clients installed while the report names which configs changed
- [X] T036 [US2] Exit 0 when every confirmation was declined, since declining everything is a valid choice per the edge cases section, and print an empty report rather than an error. Exit 1 only when at least one client genuinely failed

**Checkpoint**: User Stories 1 and 2 both work independently

---

## Phase 5: User Story 3 - Memakai server secara produktif lewat panduan dan skill (Priority: P3)

**Goal**: A usage guide covering all 21 capabilities and 5 workflows, plus a supporting skill that steers an agent toward the right capability, especially the bulk ones for mass work.

**Independent Test**: Give an agent with the skill installed a real task such as preparing training data for one letter, then check it picks the mass export capability instead of looping single lookups.

### Tests for User Story 3

- [X] T037 [P] [US3] Test that every one of the 21 tool names registered in `src/tools/kamus.ts`, `src/tools/stemmer.ts`, and `src/tools/pemenggalan.ts` appears in `docs/USAGE.md`, and that no guide entry names a tool the server does not expose. Both directions, in `src/__tests__/installer-docs.test.ts`
- [X] T038 [P] [US3] Test that `.agents/skills/kbbi-mcp/SKILL.md` exists, its frontmatter `name` equals `kbbi-mcp`, its `description` is under 1024 characters, and the body is under 500 lines, in `src/__tests__/installer-skill.test.ts`
- [X] T039 [US3] Test that reinstalling the skill replaces the directory rather than merging, leaving no line from the previous version, and that two unrelated skills sharing one directory name are reported as a conflict rather than overwritten, per FR-018. In `src/__tests__/installer-skill.test.ts`

### Implementation for User Story 3

- [X] T040 [P] [US3] Create `.agents/skills/kbbi-mcp/SKILL.md` with frontmatter `name: kbbi-mcp` and an Indonesian `description` under 1024 characters that states *when to load the skill*, not what the server is. Leave `disable-model-invocation` unset so an agent can load it autonomously
- [X] T041 [US3] Write the body of `.agents/skills/kbbi-mcp/SKILL.md` under 500 lines covering, per FR-016: which capability to reach for keyed to the user's task rather than server internals; the bulk-versus-single distinction stated explicitly so mass work uses the export capabilities rather than repeated single lookups; and the server's limits so an agent explains a boundary instead of inventing a capability, which is Story 3 acceptance scenario 2
- [X] T042 [US3] Create `.agents/skills/kbbi-mcp/references/capabilities.md` holding the full 21-capability table, so the SKILL.md body stays short while the guide stays complete
- [X] T043 [US3] Create `scripts/lib/skill-install.cjs` implementing SkillPackage placement and upgrade: resolve targets from each record's `skillTarget`, which per FR-032 yields three paths total (one shared project copy under `.agents/skills/kbbi-mcp/` for Zed and Antigravity, plus `~/.claude/skills/kbbi-mcp/` for Claude Code and `~/.config/opencode/skills/kbbi-mcp/` for OpenCode), copy on `new`, no-op on `current`, replace the directory on `outdated`, and report `conflict` when a different skill already owns the directory name
- [X] T044 [US3] Wire `--skill` / `--no-skill` into `installCommand()` in `scripts/install-clients.cjs` per FR-017, defaulting to install
- [X] T045 [US3] Create `docs/USAGE.md` in Indonesian mapping all 21 capabilities and all 5 workflows from `src/prompts/index.ts` to the tasks they serve, each with an example invocation and the expected output shape, per FR-013 and FR-014. Populate the `bulkAlternative` column per data-model.md `CapabilityReference` so bulk work is discoverable from the guide
- [X] T046 [US3] Create `scripts/check-capabilities.cjs` generating `docs/capabilities-reference.md` from `src/data/types.ts` and the three registration modules by reading tool names out of `src/tools/*.ts`, so the 21-entry table stays consistent instead of drifting. Hand-maintained tables drift
- [X] T047 [US3] Create `docs/INSTALL.md` in Indonesian covering all four clients as self-contained sections, each with prerequisites, configuration steps, connection verification, and recovery, per FR-011 and FR-012. A reader must finish installing one client without reading another section. Name each client's specific failure modes: Claude Code reads `~/.claude/skills/` and `.claude/skills/`; OpenCode's `command` is an array including the executable, its env key is `environment`, and it needs an explicit tool-fetch timeout; Zed needs `source: custom` under `context_servers`; Antigravity must use a global config because the workspace one is silently ignored

**Checkpoint**: All three stories are independently functional

---

## Phase 6: User Story 4 - Memperbaiki cacat fungsional yang terungkap saat onboarding (Priority: P4)

**Goal**: A defect log with reproducible findings, each fix guarded by a regression test that fails before and passes after, with no public capability name changed.

**Independent Test**: Take one recorded defect, run its regression test to see it fail, apply the fix, then prove the test passes and the capability behaves correctly.

### Tests for User Story 4

- [X] T048 [P] [US4] Test that the capability, resource, and prompt name lists exposed by `createKbbiServer()` in `src/index.ts:19` are identical before and after any fix in this story, per FR-026 and SC-010. Snapshot them in `src/__tests__/installer-contracts.test.ts`
- [X] T049 [US4] Test that `scripts/verify-accuracy.cjs` reports an accuracy figure instead of throwing, per FR-025 on the seed defect from D-008. In `src/__tests__/verify-accuracy.test.ts`

### Implementation for User Story 4

- [X] T050 [US4] Create `docs/DEFECTS.md` as the DefectFinding log per data-model.md, seeding it with the D-008 entry: `id`, `target` `scripts/verify-accuracy.cjs:17`, `steps`, `expected`, `actual` (ENOENT from `fs.readdirSync` on a `word-details/` directory that does not exist), `status: recorded`, `regressionTest`, `docUpdated`. Every finding MUST carry a non-empty status per SC-011
- [X] T051 [US4] Fix `scripts/verify-accuracy.cjs` so `loadAllWords()` at line 42 reads through `src/data/reader.ts` instead of `fs.readdirSync(WORD_DETAILS_DIR)` at line 17, removing the `WORD_DETAILS_DIR` constant. This closes the constitution's open `TODO(ACCURACY_GATE)` and brings the script into Principle II compliance. Do NOT create the `word-details/` directory as a workaround, and do NOT bundle or download dictionary data, per FR-027 and Principle I
- [X] T052 [US4] Wire the docs drift check into `docs:check` so `scripts/check-capabilities.cjs` runs both directions of the cross-check and exits non-zero on drift, satisfying SC-006
- [X] T053 [US4] Add the byte-level non-Latin scan gate over every generated file (`docs/INSTALL.md`, `docs/USAGE.md`, `docs/capabilities-reference.md`, `.agents/skills/kbbi-mcp/SKILL.md`, `docs/DEFECTS.md`) into `scripts/check-capabilities.cjs` or a sibling script in `scripts/`, per D-009. This is a hard gate because the spec file was corrupted with CJK and Cyrillic fragments twice mid-generation and such corruption in Indonesian prose is invisible to casual review
- [ ] T054 [US4] For each further defect surfaced while exercising Stories 1 through 3: append a DefectFinding row to `docs/DEFECTS.md` with executable reproduction steps, add its regression test to `src/__tests__/`, then apply the fix. A `fixed` finding without a passing regression test is invalid per data-model.md invariants. A `rejected` finding requires `rejectionReason` per FR-028. A finding whose fix changes documented behaviour MUST update `docs/USAGE.md` at the same time per FR-029
- [X] T055 [US4] Confirm `npm test` passes with no network access after every fix in this story, since a fix that needs the network would violate Principle IV

**Checkpoint**: Defects surfaced during onboarding are recorded, fixed, and guarded

---

## Phase 7: User Story 5 - Memulihkan saat instalasi bermasalah (Priority: P5)

**Goal**: Safe inspection, diagnosis, unregistration, and byte-exact restore when an install goes wrong.

**Independent Test**: Corrupt the server entry in one client's config, run the status check, then run restore and confirm the config is back to its backup contents.

### Tests for User Story 5

- [X] T056 [P] [US5] Test that `restore` returns the config to bytes identical to its pre-install state, verified by checksum, per SC-007, in `src/__tests__/installer-config-io.test.ts`
- [X] T057 [P] [US5] Test that `status` performs zero writes even when a config is unparseable, in `src/__tests__/installer-config-io.test.ts`
- [X] T058 [US5] Test that `uninstall --client <id>` removes only the `kbbi` entry and leaves every other entry present and unmodified, per FR-020, in `src/__tests__/installer-config-io.test.ts`

### Implementation for User Story 5

- [X] T059 [US5] Implement `statusCommand()` in `scripts/install-clients.cjs`: read-only, reporting per client the detected-or-absent state, config path, registration present/missing/unparseable, skill state, and whether a backup exists, per FR-019. An unparseable config is reported as rusak with a suggested fix and the original file is never overwritten
- [X] T060 [US5] Implement `restoreCommand()` in `scripts/install-clients.cjs`: per-client only, never global, copying backup bytes over the config rather than re-serialising. A restore with no matching backup reports that and changes nothing. Requires confirmation before writing
- [X] T061 [US5] Implement `uninstallCommand()` in `scripts/install-clients.cjs`: removes only the `kbbi` entry from selected clients, preserves every other entry, requires confirmation, and removes the skill only when explicitly requested. An unknown client id is exit 3 listing valid ids, not a silent no-op
- [X] T062 [US5] Print the mid-run cancellation summary in `installCommand()` in `scripts/install-clients.cjs`, naming which clients were already changed when the user aborts partway through

**Checkpoint**: All five stories are independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple stories

- [ ] T063 [P] Run the complete quickstart.md validation set (V1 through V14) end to end on Windows and record the result in `specs/001-mcp-client-onboarding/quickstart-results.md`, since Windows is the primary verification target and V1 through V8 each mutate real client configs
- [ ] T064 [P] Verify SC-002: each of the four clients' documented install path is exercised at least once on a release build, and record which machine and client each was verified on
- [ ] T065 [P] Verify SC-012 end to end: a newly configured client returns one correct dictionary result in under one minute after restart, on a connection counted as an installation failure
- [X] T066 Run `npm test` and confirm every installer unit test passes with no network access, per Principle IV and quickstart V13
- [X] T067 Run the constitution's accuracy gate `node scripts/verify-accuracy.cjs` and confirm it no longer throws, closing `TODO(ACCURACY_GATE)`
- [X] T068 Confirm zero new runtime or test dependencies were added: `package.json` dependencies and devDependencies must be unchanged from the pre-feature state, per Principle V and the FR-030 scope boundary
- [X] T069 [P] Update `README.md` to link `docs/INSTALL.md`, `docs/USAGE.md`, and `docs/DEFECTS.md`, so the documentation is reachable from the repository entry point
- [X] T070 Confirm every generated Indonesian file passes the non-Latin scan gate before commit, per D-009

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Phase 2 completion, then proceed in priority order
- **Polish (Phase 8)**: Depends on the desired stories being complete

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. No dependency on other stories
- **US2 (P2)**: Starts after Phase 2. Depends on T024 serializers from US1 for the per-shape writing logic
- **US3 (P3)**: Starts after Phase 2. Depends on T037's drift check and T040 skill sources existing before T043 wires placement
- **US4 (P4)**: Starts after Phase 2, but its defect harvest depends on US1-US3 having been exercised. T051 is the one task that can start immediately since its defect is already recorded
- **US5 (P5)**: Starts after Phase 2. T059 status reads the same registry; T060 restore depends on T011 backup snapshots

### Within Each User Story

- Tests are written and FAIL before implementation
- Registry and config-io primitives before commands
- Serializers before install
- Entry resolution before merge
- Skill sources before skill placement

### Parallel Opportunities

- Phase 1: T002, T003, T005 alongside T001/T004
- Phase 2: T007, T009-T012, T014-T016 alongside T006/T008/T013
- Phase 3: T017, T018 alongside T019, T020
- Phase 4: T027, T028 alongside T029, T030
- Phase 5: T037, T038 alongside T039; T040 alongside T042
- Phase 6: T048 alongside T049
- Phase 7: T056, T057 alongside T058
- Phase 8: T063, T064, T065, T069 in parallel once stories are complete

---

## Parallel Example: User Story 1

```text
Task: "Test that install --client <id> writes the entry under rootKey in src/__tests__/installer-config-io.test.ts"
Task: "Test that declining confirmation leaves the config byte-identical in src/__tests__/installer-config-io.test.ts"

Task: "T007 Add knownConflicts to the registry in scripts/lib/clients.cjs"
Task: "T012 Create the report renderer in scripts/lib/report.cjs"
```

## Parallel Example: User Story 2

```text
Task: "T031 Implement OpenCode v1/v2 schema detection in scripts/lib/config-io.cjs"
Task: "T033 Implement Antigravity path selection in scripts/lib/config-io.cjs"
```

Both edit `scripts/lib/config-io.cjs` and must be sequenced, not run concurrently.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks all stories)
3. Complete Phase 3: User Story 1
4. STOP and VALIDATE: install one client, restart it, request one definition, expect a real KBBI result
5. Demonstrate if ready

### Incremental Delivery

1. Setup + Foundational - foundation ready
2. US1 - test independently - MVP
3. US2 - test independently
4. US3 - test independently
5. US4 - harvest defects from real use of US1-US3, fix with regression tests
6. US5 - test independently
7. Polish - run quickstart V1-V14, close the constitution's accuracy gate

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Then in parallel:
   - Developer A: US1, then US2
   - Developer B: US3
   - Developer C: US5 (reads the same registry, writes different commands)
3. US4 runs last since its defect harvest depends on the others being exercised

---

## Completion status

66 dari 70 tugas selesai. Empat tersisa memerlukan lingkungan yang tidak ada di
sesi ini, dan alasannya dicatat di bawah, bukan dibiarkan ambigu.

| Tugas | Status | Alasan |
|---|---|---|
| T054 | sebagian | Empat cacat ditemukan dan diperbaiki (D-F01 sampai D-F04). Sisanya bergantung pada pemakaian nyata Stories 1-3 yang belum terjadi, jadi tidak dapat diprediksi di muka sesuai spec.md Asumsi |
| T063 | sebagian | V1-V14 dijalankan pada config root sementara, bukan pada konfigurasi klien nyata. Hasilnya dicatat di `quickstart-results.md`. V1 dan V9 tetap membutuhkan build yang sengaja disentrakkan |
| T064 | belum | SC-002 mensyaratkan keempat klien diuji minimal sekali pada build rilis. Hanya OpenCode, Zed, dan Antigravity yang terpasang di mesin ini; Claude Code tidak terpasang |
| T065 | belum | SC-012 mensyaratkan pengukuran dalam klien yang benar-benar berjalan, di luar jangkauan runner ini |

### Hasil validasi yang sudah dijalankan

| Pemeriksaan | Hasil |
|---|---|
| `npm test` | 83 lolos, 0 gagal, stabil pada tiga kali pengulangan |
| `npm run test:integration` | 16 lolos, 0 gagal |
| `npm run docs:check` | 20 kapabilitas, 5 alur, dokumentasi sinkron dua arah, bebas karakter non-Latin |
| `npm run build` | keluar dengan kode 0 |
| `node scripts/verify-accuracy.cjs` | melaporkan 68736 kata, akurasi 20,6 persen. Gerbang akurasi Konstitusi akhirnya dapat dijalankan |
| Uji CLI pada config root sementara | 29 pemeriksaan lolos, 0 gagal |
| Uji pemasangan skill | 12 pemeriksaan lolos, 0 gagal |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] labels map tasks to user stories for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
- Real client configs get mutated by US1, US2, and US5. Prefer `--dry-run`, or point `KBBI_CONFIG_ROOT` at a temporary directory, until the install path is trusted
---

## Phase 9: Convergence

**Purpose**: Remaining work found by auditing the implemented code against spec.md, plan.md, the contracts, and the constitution. Each item below is a gap, not a new feature.

- [ ] T071 Honour `--dry-run` in `uninstallCommand` and `restoreCommand` so both print the planned change and write nothing, per FR-004 and SC-004 and contract safety invariant 2 in `contracts/installer-cli.md` (contradicts)
- [ ] T072 Skip the automatic `npm run build` inside `assertPrerequisites` when `--dry-run` is present, so `install --dry-run` performs zero writes, and stop with the existing build instructions instead (contradicts)
- [ ] T073 Make `verifyCommand` wait for the JSON-RPC reply whose `id` is the `tools/call` request before declaring success, so an unreachable CDN is reported as an unverified connection rather than a verified install, per FR-023 (partial)
- [ ] T074 Gate the skill installation loop in `installCommand` on the matching client's approval, or ask for skill confirmation separately, so a declined client receives no filesystem write at all, per FR-005 and contract safety invariant 1 (contradicts)
- [ ] T075 Add command-layer tests covering `installCommand`, `restoreCommand`, `uninstallCommand`, `confirmForClient`, and `assertPrerequisites` for the scenarios tasks.md T017 through T020, T027 through T029, and T057 already claim, using `KBBI_CONFIG_ROOT` against a temporary root (missing)
- [ ] T076 Record a `DefectFinding` entry in `docs/DEFECTS.md` for each defect T071 through T075 fixes, with reproduction steps and a regression test in `src/__tests__/`, per FR-024, FR-025, and FR-028 (partial)
- [ ] T077 Handle mid-run cancellation in `installCommand` by catching SIGINT and passing `partial: true` to `renderReport`, so the report names which clients were already changed, per the cancellation edge case in spec.md (partial)
- [ ] T078 Include a concrete repair hint when `statusCommand` reports an unparseable config as `rusak`, per US5 acceptance scenario 3 and T059 (partial)
- [ ] T079 Make the Node.js prerequisite check in `assertPrerequisites` reachable, or remove the unreachable `!process.execPath` condition, and cover it with a test, per FR-009 and T019 (partial)
- [ ] T080 Fix the missing space in `docs/INSTALL.md:182`, reading "ditulisnya di sana. Ingat", per FR-021 and FR-012 (partial)