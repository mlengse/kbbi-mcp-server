<!--
SYNC IMPACT REPORT — temporary scratch material for human review.
Remove this comment before committing the amended constitution.

Version change: (none / unfilled template) → 1.0.0
Bump rationale: First ratification. No prior ratified constitution existed, so this
is a baseline, not an amendment. Jev scoring ranked 1.0.0 (0.41) above 0.1.0 (0.25)
and 0.0.1 (0.34); 1.0.0 signals binding governance from day one, which is intended —
every plan/spec/implement cycle reads this file as a constraint.

Modified principles: none (all 5 are new)
Added sections:
  - Core Principles I–V
  - Technical Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: none

Follow-up TODOs:
  - TODO(GUIDANCE_FILE): runtime development guidance file is not yet authored; the
    project relies on README.md until it exists. Deferred deliberately — governance
    text must not reference a file that does not exist.
  - TODO(ACCURACY_GATE): a numeric accuracy threshold for scripts/verify-accuracy.cjs
    is not defined. Deferred — requires a measured baseline run first.
-->

# KBBI MCP Server Constitution

## Core Principles

### I. Data via CDN, Never Bundled (NON-NEGOTIABLE)

Data KBBI (~415 MB, 112K+ word-detail files) MUST NOT be committed, vendored, bundled,
or embedded in this repository. The server reads data at runtime from the external
`kbbi-harvester-cdn` repository through jsDelivr. Any change that adds a data payload
to `git`, to a build artifact, or to the npm package is a constitutional violation.

**Rationale:** The dataset's size and its independent update cadence make bundling
technically infeasible and operationally wrong. Data changes without code changes, and
the code ships as a tiny installable package.

### II. Hybrid Reader Contract

All data access MUST go through `src/data/reader.ts`. The reader's resolution order is
fixed: local file first, then CDN primary base, then CDN fallback base. Tool, resource,
and prompt code MUST NOT call `fetch` or `fs` against data paths directly.

The CDN base MUST be overridable via the `KBBI_CDN_BASE` environment variable so a
deployment can pin a stable data tag. The automatic fallback to a pinned tag MUST
remain in place when the primary base is not already pinned.

**Rationale:** A single choke point is what makes offline development, CDN pinning,
and test stubbing possible. Direct access from tool code would scatter that policy.

### III. MCP Contract Stability (NON-NEGOTIABLE)

Tool, resource, and prompt identifiers are the public API of this server and are consumed
by external agent configurations in `config/`. Renaming or removing an identifier
(`cari_kata`, `pemenggalan_kata`, `ekspor_training_dic`, `kbbi://aturan/*`, …) is a
breaking change and MUST NOT occur without a MAJOR version bump and a documented
migration in the README.

Input schemas MUST stay backward compatible: parameters MAY gain optional fields or
defaults, MUST NOT be removed, and MUST NOT have their types narrowed. Descriptions
MUST remain accurate — a tool description is the agent's only contract.

**Rationale:** Consumers cannot be redeployed in lockstep with this server, so silently
renaming a tool breaks working client setups with no compile-time signal.

### IV. Test-First, Network-Isolated

Unit tests MUST run with no network access and no new test dependency. The runner is
Node's built-in `node:test` executed through `tsx`. Network behaviour MUST be exercised
by stubbing `fetch`, never by hitting the live CDN from a unit test.

Tests MUST cover pure logic (extractors, `dotToHyphen`, syllable parsing), the hybrid
reader's resolution order including the fallback branch, and every tool contract in
`src/tools/`.

`npm run test:integration` boots the real server via `createKbbiServer()` over
`InMemoryTransport` and is permitted — indeed required — to use the network. It MUST
remain a separate script from `npm test`.

**Rationale:** A dictionary server whose tests depend on a third-party CDN is
unverifiable offline and fails unpredictably in CI.

### V. Simplicity Over Speculation

Start with the smallest design that satisfies the requirement (YAGNI). Before adding an
abstraction, caching layer, configuration surface, or new module boundary, there MUST be a
demonstrated second caller for it. Speculative generality is a rejected change.

Changes stay inside the existing four-layer split — `src/index.ts` (transport/wiring),
`src/tools|resources|prompts` (MCP surface), `src/data` (reader, index-builder,
extractor), `src/data/types.ts` (types). Adding a layer or moving files between layers
requires justification in the plan, not in the code comment.

Unresolved structural questions (e.g. relocating `patterns/id.cjs` to a `pattern/`
directory) MUST be tracked as open TODOs rather than half-migrated.

**Rationale:** This is a single-purpose server under active extraction from a larger
codebase; structural churn costs more than it buys.

## Technical Constraints

- **Runtime**: Node.js with native ESM (`"type": "module"`), TypeScript compiled by
  `tsc` to `build/`. Imports MUST use the `.js` extension for relative ESM paths.
- **Dependencies**: runtime deps stay minimal — `@modelcontextprotocol/sdk`, `zod`, and
  `hypher`. Adding a runtime dependency MUST be justified in the plan; adding a test or
  build dependency MUST be avoided in favour of the Node standard library.
- **Schemas**: tool inputs are validated with `zod`. Every parameter MUST carry a
  `.describe()` in Indonesian, because that text is what the consuming agent reads.
- **Transports**: stdio is the default; `--http` serves stateless Streamable HTTP on
  `PORT` (default 3000) at `/mcp`. Any other path MUST return 404.
- **Data pinning**: production deployments MUST set `KBBI_CDN_BASE` to the verified
  stable tag. The floating `@main` default is a development convenience, not a
  production posture.
- **Licensing**: the project is GPL-3.0. Vendored or copied source from
  `kbbi-harvester-cdn` MUST retain GPL-3.0 compatibility.
- **Protocol hygiene**: stdout is reserved for the stdio transport. All diagnostics MUST
  go to stderr (`console.error` / `console.warn`).

## Development Workflow & Quality Gates

1. **Specify** — the feature gets a spec with user scenarios and acceptance criteria.
2. **Plan** — the plan MUST state which constitutional principles it touches. If it
   cannot, the feature is not ready to plan.
3. **Tasks** — tasks are ordered and each maps to a verifiable outcome.
4. **Implement** — red-green-refactor. Tests for new behaviour are written and observed
   failing before implementation.
5. **Gate** — before a change is considered done, all of the following MUST pass:
   - `npm test` — green, offline, no new dependencies.
   - `npm run test:integration` — green when the change touches a tool contract, the
     reader's resolution order, or CDN behaviour.
   - `tsc` — no type errors.
   - `node scripts/verify-accuracy.cjs` — no regression against the recorded baseline,
     for changes touching extraction or hyphenation logic.
   - A manual check that Principle III (contract stability) is respected: no identifier
     renamed, no input schema narrowed.
6. **Report** — deviations are reported explicitly rather than absorbed silently.

Rationale for each MUST is captured in the principle it enforces. A gate that cannot be
run locally MUST say so in the plan instead of being marked passed.

## Governance

This constitution supersedes conflicting conventions in README.md, code comments, and
ad-hoc team practice. Where it conflicts with a template example or a default, this
document wins.

**Amendment procedure**

1. Propose the change with its rationale, its version bump, and its migration impact.
2. Amend via `/speckit.constitution`, which resolves the template, fills it, and records
   a Sync Impact Report.
3. MAJOR bumps additionally REQUIRE a migration note in README.md and, for contract
   changes, an updated example in `config/`.
4. The Sync Impact Report is review scratch material and MUST be deleted before commit.

**Versioning policy** — Semantic Versioning:

- **MAJOR** — a principle is removed or redefined in a way that invalidates existing
  compliant work, or the MCP contract (Principle III) changes incompatibly.
- **MINOR** — a principle or section is added, or existing guidance is materially
  expanded.
- **PATCH** — clarifications, wording, typo fixes, and other non-semantic refinements.

The initial ratification is `1.0.0`: it establishes binding governance from the first
release rather than signalling a provisional draft.

**Compliance review**

- Every plan and code review MUST verify compliance with the principles above.
- Any deviation MUST be declared with its justification, or the work MUST be rejected.
- When a change plausibly violates a principle — bundling data, bypassing the reader,
  renaming a tool identifier — compliance MUST be verified with a deterministic check
  (`jev_decide`) before proceeding; if P(violates) >= 0.70 the work halts pending
  clarification or amendment.
- Complexity that exceeds what these principles require MUST be justified in writing,
  in the plan, before it is written in code.
- `README.md` is the guidance file for runtime development until a dedicated guidance
  document exists.

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07