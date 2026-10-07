# Contract: Installer CLI

**Feature**: 001-mcp-client-onboarding | **Date**: 2026-10-07

Five commands. One registry (see `client-registry.md`) drives all of them. No writes happen
outside `install` and `restore`, and `install` requires confirmation per client.

---

## Commands

| Command | Purpose | Writes |
|---------|---------|--------|
| `install` | Register the server, optionally install the skill | Yes, after confirmation |
| `status` | Report registration and skill state per client | No |
| `uninstall` | Remove the server entry from selected clients | Yes, after confirmation |
| `restore` | Return a client config to its pre-install bytes | Yes, after confirmation |
| `verify` | Boot the server and call one capability | No |

## Global flags

| Flag | Effect |
|------|--------|
| `--client <id>` | Restrict to one client. Repeatable. Defaults to every detected client |
| `--dry-run` | Print the plan, write nothing |
| `--yes` | Skip confirmation. Only honoured with `--dry-run` absent, and the report records that confirmation was bypassed |
| `--skill` / `--no-skill` | Include or exclude skill installation |
| `--scope global\|project` | Config scope. Antigravity ignores `project` per D-005 |

---

## install

Order of operations, which matters because several steps can fail without blocking the rest:

1. Resolve the repository root from the script location, not the working directory. The
   "run from the wrong directory" edge case is handled here.
2. Locate `node`. If absent, fail fast with a message naming Node.js. FR-009.
3. Resolve the built server entry. If absent, build it or stop with instructions. Never write a
   registration pointing at a missing file. FR-009.
4. Probe each selected client's config candidates and detect installation. FR-003.
5. For each detected client, print the planned change, then request confirmation. FR-005.
6. For each confirmed client: back up, merge, write. FR-006.
7. Install the skill to each target whose record has a non-null `skillTarget`. FR-017.
8. Print the per-client report. FR-010.

**Confirmation is per client.** Approving three of five must change exactly three configurations.
Declining one must not abort the run, and must not stop later clients from being processed.

**Idempotency.** If the existing entry equals the entry to be written, the file is left untouched
and reported as already correct. FR-007, verified by SC-003 as a byte-level diff.

**Example**

```bash
node scripts/install-clients.cjs install --client opencode --client zed --dry-run
```

Expected output shows the resolved paths and the exact entry to be written, and the checksum of
every candidate file is unchanged afterwards. SC-004.

---

## status

Read-only. Per client, reports: detected or absent, config path, registration present or missing
or unparseable, skill state, and whether a backup exists. Never writes. FR-019.

```bash
node scripts/install-clients.cjs status
```

---

## uninstall

Removes only the `kbbi` entry, only from selected clients. Every other entry is preserved. The
skill is removed only when explicitly requested. FR-020.

```bash
node scripts/install-clients.cjs uninstall --client cursor-not-a-client
```

An unknown client id is an error listing the valid ids, not a silent no-op.

---

## restore

Copies backup bytes back over the client config. Byte-for-byte, not re-serialised, because
re-serialising reorders keys and changes formatting, producing a file that differs from the
original even when semantically equal. SC-007.

Restores are per client. A restore with no matching backup reports that and changes nothing.

---

## verify

Boots the server through `createKbbiServer()` and calls one capability end to end. This is the
optional connection check separated out per FR-023, because it is the only step that needs the
network. It reports installation failure and network failure as different outcomes, since the
edge cases section requires that distinction.

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | All selected clients succeeded, or were correctly skipped or declined |
| 1 | At least one client failed. Per-client detail is in the report |
| 2 | A prerequisite failed. Nothing was written |
| 3 | An unknown client id or invalid flag was supplied |

Exit 0 for "everything declined" is deliberate. Declining every confirmation is a valid choice,
not a failure, and the edge cases section requires the report to show an empty result rather than
an error.

## Output language

Indonesian for all installer output, per FR-020. Capability names and verbatim system error
strings stay in their original form.

## Safety invariants

These hold for every command and are what the constitution's compliance review checks:

1. No filesystem write occurs without a preceding successful confirmation, except under `--yes`
   which is recorded in the report.
2. `--dry-run` performs zero writes. Verified by checksum comparison in SC-004.
3. A config that cannot be parsed is never written.
4. Backup precedes write, always.
5. No other entry in a config file is ever removed or reordered beyond what the merge requires.
6. No KBBI dictionary data is ever written to disk. Constitution Principle I.
7. No new dependency is installed or imported.