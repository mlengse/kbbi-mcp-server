# Implementation Plan: Multi-Client Onboarding, Skill, Installer, dan Perbaikan Temuan

**Branch**: `001-mcp-client-onboarding` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-mcp-client-onboarding/spec.md`

## Summary

Adds a distribution and onboarding layer to the KBBI MCP server: an installer that registers the
server across four AI clients, installation and usage guides, a supporting agent skill, and a
defect-fix loop for whatever problems that work surfaces. The installer is a dependency-free
Node.js script driven by a declarative client registry, because the four clients share one
behaviour and differ only in config shape. Research resolved three blocking unknowns: OpenCode
currently ships two incompatible config schemas, Antigravity has three competing config paths of
which the documented workspace-scoped one is silently ignored due to a known defect, and Claude
Desktop cannot load skills from the filesystem at all and was therefore removed from scope.

## Technical Context

**Language/Version**: Node.js v24.16.0 observed on the target machine. Installer written as
CommonJS `.cjs` to match the three existing scripts.

**Primary Dependencies**: None added. The installer uses only `node:fs`, `node:path`, and
`node:readline`. The existing server dependencies are untouched.

**Storage**: Local client configuration files plus timestamped backup snapshots. No database.

**Testing**: `node:test` executed through `tsx`, matching the existing `npm test` runner. The
installer is testable offline by pointing it at a temporary config root.

**Target Platform**: Windows, macOS, Linux. Windows is the primary verification target since
that is the machine in use. Windows path handling with spaces is an explicit edge case.

**Project Type**: CLI installer plus documentation, alongside an existing MCP server.

**Performance Goals**: Installation of one client completes in under five minutes per SC-001.
In practice this is file operations only, so the real constraint is interaction count, not time.

**Constraints**: Offline-capable per FR-023. No writes without explicit per-client confirmation
per FR-005. No new runtime or test dependencies, per the constitution's dependency constraint.

**Scale**: 5 clients, 21 capabilities, 5 workflows, 1 skill package, 11 functional requirement
groups covering 30 numbered requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Requirement | Verdict |
|-----------|-------------|---------|
| I. Data via CDN, Never Bundled | Installer MUST NOT download, copy, or bundle KBBI data | **PASS**. The installer writes only a registration entry and a skill file. FR-027 forbids bundling in fixes. Research D-008 explicitly redirects `verify-accuracy.cjs` to the CDN reader rather than a local data directory. |
| II. Hybrid Reader Contract | All data access goes through `src/data/reader.ts` | **PASS with a finding**. The feature adds no data access. D-008 identifies an existing violation in `scripts/verify-accuracy.cjs:17`, which reads `word-details/` directly. The fix routes it through the reader, improving compliance. |
| III. MCP Contract Stability | Tool, resource, and prompt identifiers are the public API | **PASS**. FR-026 requires all names be preserved, and SC-010 requires a zero-diff comparison of the exposed list before and after. FR-030 keeps new capabilities out of scope, so no rename can be smuggled in as an addition. |
| IV. Test-First, Network-Isolated | Unit tests offline, no new test dependency, integration separate | **PASS**. The installer is tested by redirecting its config root to a temporary directory, so unit tests stay offline. FR-025 requires a regression test per fix, failing before and passing after. |
| V. Simplicity Over Speculation | No abstraction without a demonstrated second caller | **PASS**. The client registry (D-002) has five real callers from day one, so it clears the bar rather than being speculative. |

**Gate result: PASS.** No unjustified violations. Compliance of the design itself was
independently scored with `jev_decide`: P(violates) = 0.27, well below the 0.70 halt threshold.

### Post-design gate, re-evaluated after Phase 1

Two findings surfaced during design that the pre-research gate could not have caught.

**Finding 1, a spec defect, now resolved.**
FR-015 originally stated the supporting skill can be loaded by all five clients. Claude Desktop
manages skills exclusively through the claude.ai account, distributed as an uploaded ZIP archive.
There is no filesystem location that Claude Desktop reads, confirmed by research D-007 against
vendor documentation. FR-015 was therefore unsatisfiable as written.

Resolved by user decision on 2026-10-07: **Claude Desktop was dropped from scope**, leaving four
clients that all load skills from the filesystem. FR-015 is now satisfiable in full. Shipping
unverifiable support claims was the only option the constitution forbids, since Principle III
treats described behaviour as a contract.

**Finding 2, a constitution gate that cannot currently be run.**
The constitution's quality gate requires `scripts/verify-accuracy.cjs` to show no regression. That
script throws on a missing directory (D-008), so the gate is unrunnable today. The feature's own
Story 4 will fix it, but until that fix lands, the constitution mandates a gate that fails for
everyone. This is recorded rather than worked around, because quietly dropping a gate to make a
build pass is the failure mode the constitution's compliance section exists to prevent.

**Post-design gate result: PASS.** Design is compliant. Finding 1 is closed. Finding 2 remains
open by design: it is assigned to Story 4 and closes when D-008 is fixed.

### Decisions taken during clarification

Recorded here so `/speckit-tasks` reads one consistent set of decisions.

| Decision | Requirement | Rationale |
|----------|-------------|-----------|
| Four clients, Claude Desktop dropped | FR-001, FR-011, FR-015, SC-002 | Only way to keep every claim testable |
| User-wide config is the default scope | FR-031 | A dictionary server has no reason to be tied to one repository. Also avoids a special case, since Antigravity is global-only anyway |
| Shared project skill copy for Zed and Antigravity, user-wide for the other two | FR-032 | Three files instead of four, and keeps the skill under version control beside the existing Spec Kit skills |
| SC-001 split into install time and first connection, OpenCode timeout written | FR-033, SC-001, SC-012 | The original single criterion bundled a fast local operation with a network-dependent one, so a slow network failed a criterion about installer speed |
| SC-006 and SC-007 rewritten as automated checks | SC-006, SC-007 | The original cohort criteria were invented during specification, had no owner, and could not be run at completion |

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-client-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── client-registry.md   # Phase 1 output
│   ├── installer-cli.md     # Phase 1 output
│   └── skill-package.md     # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
scripts/
├── install-clients.cjs       # NEW - installer entry point
├── lib/
│   ├── clients.cjs           # NEW - declarative client registry (5 records)
│   ├── config-io.cjs         # NEW - read, parse, merge, back up, write
│   ├── skill-install.cjs     # NEW - skill package placement and upgrade
│   └── report.cjs            # NEW - per-client status rendering
├── build-browser.cjs         # existing
├── convert-tex-patterns.cjs  # existing
└── verify-accuracy.cjs       # existing - DEFECT FIXED here (D-008)

docs/
├── INSTALL.md                # NEW - FR-011, FR-012, four clients
├── USAGE.md                  # NEW - FR-013, FR-014, 21 capabilities + 5 workflows
└── capabilities-reference.md # NEW - generated, keeps USAGE.md stable

.agents/skills/kbbi-mcp/      # NEW - shared skill for Zed + Antigravity (D-006)
├── SKILL.md
└── references/
    └── capabilities.md

src/__tests__/
├── installer-registry.test.ts  # NEW - registry shape per client
├── installer-config-io.test.ts # NEW - merge, backup, idempotency
└── verify-accuracy.test.ts     # NEW - regression for D-008
```

**Structure Decision**: The installer lives in `scripts/lib/` rather than `src/` because it is
build-time tooling, not part of the shipped MCP server. Keeping it out of `src/` preserves the
four-layer split in Constitution Principle V, which names `src/index.ts`,
`src/tools|resources|prompts`, `src/data`, and `src/data/types.ts` as the server's layers.
Tests still live in `src/__tests__/` because that is where the existing runner expects them, so
`npm test` picks them up without a second test command. The skill goes in `.agents/skills/` at the
repository root because that location is already in use by the nine Spec Kit skills and is read by
both Zed and Antigravity per D-006, so one directory covers two clients.

## Complexity Tracking

No constitution violations requiring justification. The client registry in D-002 has four
demonstrated callers, which satisfies Principle V's requirement for a second caller. No entries
in this table.

## Open Items

None requiring a decision. The two items previously listed here are closed:

1. ~~Amend FR-015 for Claude Desktop~~ — closed 2026-10-07. Claude Desktop dropped from scope, so
   FR-015 is satisfiable across all four remaining clients.
2. **Run the constitution's accuracy gate** once D-008 lands. Not a decision, a consequence: the
   gate stays unrunnable until Story 4 fixes `verify-accuracy.cjs`, and closes when it does.