# Data Model: Multi-Client Onboarding

**Feature**: 001-mcp-client-onboarding | **Date**: 2026-10-07 | **Phase**: 1

Entities come from spec.md Key Entities. No database is involved; every entity below is a file
structure the installer reads or writes. Validation rules trace to the numbered requirements they
enforce.

---

## ClientRecord

The unit of the declarative registry. One record per supported client. All shared installer logic
reads this; no code branches on client identity.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `id` | string | yes | Lowercase slug, unique across the registry. Drives the server entry name. |
| `displayName` | string | yes | Human label shown in prompts and reports. Indonesian. |
| `configCandidates` | string[] | yes | Ordered paths to probe. First existing candidate wins. At least one, or the client is undetectable. |
| `rootKey` | string | yes | The JSON key under which servers live, for example `mcpServers` or `context_servers`. |
| `entryShape` | enum | yes | `claude-style` (command + args array + env), `opencode-style` (command array + enabled + environment), `zed-style` (command + args + env + source). |
| `detection` | predicate | yes | Decides whether the client is installed. Pure. Must not perform writes. |
| `skillTarget` | string or null | yes | Directory for skill installation. Null means the client cannot load skills from the filesystem. All four in-scope clients have one; the field stays nullable so a future client that cannot is representable. |
| `knownConflicts` | string[] | yes | Version or state combinations the installer refuses to write. Empty when none known. |

**Relationships**: one record drives every other entity. The installer never hardcodes a client
id outside the registry.

---

## ServerEntry

The registration written into a client's configuration.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | Fixed server name `kbbi`. Must match the existing `config/*.json` examples. |
| `command` | string | yes | Resolved absolute path to `node`. Must be verified executable before writing, per FR-009. |
| `args` | string[] | yes | Single element: the absolute path to the built server entry. Must be absolute, per the existing config examples. |
| `env` | object | yes | Defaults empty. Never carries secrets. Never carries a CDN base by default, since the server has a working default. |

**Rules**: `args` is absolute. A relative path is rejected rather than written, because every one
of the four clients launches the server from a different working directory. This is the
Windows-spaces edge case: the path is stored as a JSON array element, never concatenated into a
shell string, so spaces need no escaping.

---

## ConfigDocument

The parsed state of one client configuration file.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `path` | string | yes | The candidate that actually resolved. |
| `exists` | boolean | yes | False when the file is absent, meaning first-time install. |
| `raw` | string or null | yes | Original bytes, preserved verbatim for backup. |
| `parsed` | object or null | yes | Null when `exists` is false. |
| `parseError` | string or null | yes | Non-null when the file exists but cannot be parsed. FR-008: abort this client, never overwrite. |
| `servers` | object | yes | Existing entries under `rootKey`, preserved untouched per FR-008. |

**State transitions**

| From | Event | To | Guard |
|------|-------|----|-------|
| absent | install, confirmed | present with entry | Command and args verified resolvable |
| present, no entry | install, confirmed | present with entry added | Parse succeeded |
| present, has entry | install, confirmed | present, entry replaced | No-op if identical, per FR-007 idempotency |
| any | install, declined | unchanged | Never writes, FR-005 |
| any | install, dry run | unchanged | Never writes, FR-004 |
| present with entry | uninstall | present, entry removed | Other entries untouched, FR-020 |
| parse error | any write attempt | parse error | Aborts, FR-008 |
| present with entry | restore | pre-install bytes | Backup must exist |

**Invariant**: a document in `parseError` is never written. This is the single most important
rule in the data model, because an unparseable config is exactly the state a user most needs
preserved.

---

## BackupSnapshot

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `id` | string | yes | Timestamp plus client id. Unique. |
| `sourcePath` | string | yes | The config file backed up. |
| `createdAt` | string | yes | ISO 8601. |
| `bytes` | Buffer or string | yes | Verbatim pre-write contents. |
| `existed` | boolean | yes | Distinguishes "backed up an empty file" from "file did not exist". |

**Rules**: A backup is taken before every write, including a write that only replaces an entry.
Restore is per-client, never global. SC-007 requires restore to be byte-identical, so restore
copies bytes rather than re-serialising parsed JSON. Re-serialising would reorder keys and change
formatting, producing a file that differs from the original even when semantically equal.

---

## SkillPackage

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | Lowercase, hyphens only, matches directory name per the Agent Skills spec. |
| `version` | string | yes | Semver. Compared against any installed copy for upgrade detection. |
| `frontmatter` | object | yes | `name` and `description` required. `description` under 1024 characters per the spec limit. |
| `body` | string | yes | Under 500 lines, per both Zed and Claude guidance. |
| `targets` | ClientRecord[] | yes | Derived from each record's `skillTarget`. Per FR-032 this resolves to three paths: one shared project copy for Zed and Antigravity, plus user-wide paths for Claude Code and OpenCode. |

**Install state per target**: `new`, `current` (same version), `outdated` (older version),
`conflict` (different content, same name, unresolvable).

**Rules**: Upgrading replaces the directory, never merges into it, so a removed line in the new
version actually disappears. Two unrelated skills sharing a name is a conflict to report, not
resolve by overwrite.

---

## CapabilityReference

The documentation entity backing FR-014 and SC-005.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | Must match a registered tool exactly. |
| `family` | enum | yes | `kamus`, `stemmer`, or `pemenggalan`, matching the three registration modules. |
| `purpose` | string | yes | Indonesian. States the task, not the implementation. |
| `exampleInput` | object | yes | A valid argument set for the tool's schema. |
| `expectedOutput` | string | yes | Abbreviated shape of the real response. |
| `bulkAlternative` | string or null | yes | The bulk capability to prefer for mass work, per FR-016. |

**Counts, verified from registration sites at planning time**: kamus 8, stemmer 5, pemenggalan 7,
totalling 21 capabilities; plus 5 workflows. SC-005 requires cross-checking this table against
what the server actually exposes, so a drift check is part of the feature rather than a one-off.

**Invariants**: no capability may appear in the guide without existing on the server, and none
may exist on the server without appearing in the guide. Both directions, because either kind of
drift makes the guide actively misleading.

---

## DefectFinding

Backs Story 4 and FR-024 through FR-030.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `id` | string | yes | Stable identifier for deduplication, per the merged-findings edge case. |
| `target` | string | yes | Capability name or document path. |
| `steps` | string | yes | Reproduction steps. Must be executable by someone else. |
| `expected` | string | yes | Correct behaviour. |
| `actual` | string | yes | Observed behaviour. |
| `status` | enum | yes | `recorded`, `fixed`, `rejected`, `deferred`. Never empty, per SC-011. |
| `regressionTest` | string or null | yes | Required when status is `fixed`, per FR-025. |
| `rejectionReason` | string | yes | Required when status is `rejected`, per FR-028. |
| `docUpdated` | boolean | yes | True when documented behaviour changed, per FR-029. |

**Seed entry**: the `scripts/verify-accuracy.cjs` local-directory read described in D-008, status
`recorded`, target `verify-accuracy.cjs:17`.

**Invariants**: a `fixed` finding without a passing regression test is invalid. A `rejected`
finding without a reason is invalid. A fix that changes a capability name is invalid regardless
of status, per FR-026 and SC-010.