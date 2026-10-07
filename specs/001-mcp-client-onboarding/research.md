# Research: Multi-Client Onboarding, Skill, Installer

**Feature**: 001-mcp-client-onboarding | **Date**: 2026-10-07 | **Phase**: 0

Research resolved all unknowns in Technical Context. Findings are grounded in vendor
documentation plus empirical inspection of this machine, because several client formats are
inconsistent between docs and reality.

---

## D-001: Installer implementation language

- **Decision**: Node.js, CommonJS, placed in `scripts/` as `*.cjs`, matching the three scripts
  already in the repository.
- **Rationale**: The repository already uses `scripts/*.cjs` (`build-browser.cjs`,
  `convert-tex-patterns.cjs`, `verify-accuracy.cjs`). Reusing the convention means no new
  runtime dependency and no build step for the installer itself. Node.js is already a hard
  prerequisite for the MCP server, so requiring it for the installer adds no new constraint.
- **Alternatives considered**: PowerShell was rejected because it does not run on macOS or
  Linux, and four of the five target clients are cross-platform. A TypeScript CLI under `src/`
  was rejected because it would need compiling before use, which defeats the purpose of a
  tool users run during installation.

---

## D-002: Client handling shape

- **Decision**: A declarative client registry. Each of the four clients is a data record with
  its config path candidates, its JSON root key, its entry shape, its detection rule, and its
  skill target. All install, verify, uninstall, and status logic is shared; only the record
  differs.
- **Rationale**: The four clients share one behaviour and differ only in shape. A
  per-client branch would produce five copies of the same backup, merge, confirm, and report
  logic, which is exactly the duplication Principle V forbids. A registry also makes adding a
  sixth client a data change.
- **Alternatives considered**: Per-client scripts were rejected as duplicative. A single
  universal config format was rejected because it does not exist; see D-003 through D-005.

---

## D-003: OpenCode schema version is ambiguous in the wild

- **Decision**: Emit the v1 shape, and detect the v2 shape at runtime. If a v2 config is
  found, the installer reports the incompatibility rather than writing v1 into a v2 file.
- **Rationale**: OpenCode currently documents two incompatible schemas. The v1 form places
  server entries directly under the `mcp` root key and uses `enabled`. The v2 form nests them
  under `mcp.servers` and uses `disabled`. Documentation for both is live and unreconciled.
  Empirical inspection of this machine at opencode 1.18.35 shows the **v1** shape in
  `~/.config/opencode/opencode.json`, with `type`, `command` as an array, `enabled`, and
  `timeout`. So v1 is correct here, but the version must be checked rather than assumed.
- **Critical detail**: OpenCode's `command` is an **array** including the executable name,
  unlike every other client where command and args are separate fields. Its environment
  variable key is `environment`, not `env`.
- **Alternatives considered**: Writing v1 unconditionally was rejected because it would
  produce a silently broken entry on any v2 install. Always writing v2 was rejected because it
  would break the v1 install actually present on this machine.

---

## D-004: Antigravity has three competing config paths

- **Decision**: Probe all three candidates, prefer the one that already contains servers, and
  report which path was chosen.
- **Rationale**: Official Antigravity documentation names
  `~/.gemini/config/mcp_config.json`. Third-party installation guides name
  `~/.gemini/antigravity/mcp_config.json`. Both files exist on this machine, along with
  `~/.gemini/antigravity-ide/mcp_config.json` and a backup copy. Only
  `~/.gemini/config/mcp_config.json` currently holds servers. Hardcoding any single path
  would either fail or write to a file nothing reads.
- **Alternatives considered**: Hardcoding the documented path was rejected because the other
  candidates demonstrably exist. Writing to all three was rejected as invasive; it would
  modify files the user may not expect to change.

---

## D-005: Antigravity workspace-scoped MCP config does not work

- **Decision**: Install to the global Antigravity config only. Do not offer workspace-scoped
  installation for Antigravity.
- **Rationale**: Documentation describes `.agents/mcp_config.json` as the workspace-scoped
  location, but this is a known defect. Community testing on agy 1.2.10 found the file is
  silently ignored, tracked as antigravity-cli#60 and re-reported through 1.1.3. Silently
  ignored is the worst failure mode for an installer: the user would see success and no
  working server.
- **Alternatives considered**: Offering it as an option was rejected because it produces a
  false success. Waiting for the fix was rejected because global scope satisfies the feature.

---

## D-006: Zed and Antigravity share one skill directory

- **Decision**: Use project-local `.agents/skills/<name>/SKILL.md` as the shared install
  target for Zed and Antigravity, since both read it.
- **Rationale**: Zed loads skills from `~/.agents/skills/` and `<project>/.agents/skills/`.
  Antigravity discovers workspace customizations at `.agents/`, which is also where this
  repository already carries the nine Spec Kit skills. A single directory therefore serves two
  clients with one copy, and it is already inside version control for team sharing.
- **Note**: Zed supports only these two locations. Custom search paths and remote registries
  are not supported, so a symlink is the only escape hatch if a different location is needed.
- **Alternatives considered**: Per-client skill copies were rejected as duplicative and a
  drift risk. `~/.agents/skills/` global was rejected as the default because it silently
  affects every project on the machine rather than just this one.

---

## D-007: Claude Desktop cannot load skills from the filesystem

- **Decision**: Claude Desktop is out of scope. The registry carries no record for it. Resolved by
  user decision on 2026-10-07, after three alternatives were considered: amend FR-015 to cover
  four clients, ship a manual ZIP upload step, or drop the client.
- **Rationale**: Claude Code reads `~/.claude/skills/` and `.claude/skills/`. Claude Desktop does
  not. Desktop skills are managed through the claude.ai account, enabled from Customize in the app
  sidebar, and distributed as an uploaded ZIP archive. There is no documented filesystem path that
  Claude Desktop reads, so no installer can reach it.
- **Why drop rather than amend**: Amending FR-015 to four clients would leave the installer
  supporting one fewer client than the user asked for. A manual ZIP step keeps the client in scope
  but moves work outside the installer's remit and cannot be verified here, since the client is not
  installed on this machine. Dropping it keeps every remaining claim testable.
- **Consequence**: The feature covers four clients, and all four load skills from the filesystem, so
  FR-015 is now satisfiable in full. See the Clarifications section of spec.md.

---

## D-008: A pre-existing defect was found during research

- **Decision**: Record this as the first entry in the defect log for Story 4.
- **Rationale**: `scripts/verify-accuracy.cjs` reads word data from
  `path.join(__dirname, '..', 'word-details')`. That directory does not exist in this
  repository and never has, because the project is CDN-only by design per Constitution
  Principle I. The script's `loadAllWords` calls `fs.readdirSync` on a missing path, so it
  throws rather than reporting an accuracy figure.
- **Consequence**: This is the concrete blocker behind the constitution's open
  `TODO(ACCURACY_GATE)`, and it means the accuracy gate in the constitution's quality section
  cannot currently be run at all. The constitution's Development Workflow requires
  `scripts/verify-accuracy.cjs` to show no regression; that gate is presently unrunnable.
- **Fix direction**: Route the script through the existing hybrid reader instead of reading a
  local directory directly. This also aligns it with Constitution Principle II, which
  requires all data access to go through the reader. Note that this is a repair of an existing
  defect, not new functionality, so it stays inside FR-030's scope boundary.

---

## D-009: Documentation language and character safety

- **Decision**: All documentation in Indonesian, plus a byte-level scan gate over every
  generated file for stray non-Latin characters.
- **Rationale**: FR-020 requires Indonesian. The scan gate is not a stylistic preference: the
  spec file itself was corrupted twice during generation, with CJK and Cyrillic fragments
  injected mid-sentence while scanning reported zero CJK characters. Silent character
  corruption in Indonesian prose is invisible to a reviewer who does not read the script and
  would ship to users.
- **Alternatives considered**: Manual proofreading was rejected as unreliable for a class of
  failure that review attention does not catch.

---

## Resolved Technical Context

| Field | Value |
|-------|-------|
| Language | Node.js v24.16.0 (observed), CommonJS `.cjs` |
| Runtime dependencies | None added. Uses `node:fs`, `node:path`, `node:readline` only |
| Storage | Local config files plus timestamped backups, no database |
| Testing | `node:test` via `tsx`, matching the repository's existing runner |
| Target platform | Windows, macOS, Linux. Windows is the primary verification target here |
| Project type | CLI installer alongside an existing MCP server |
| Performance goals | Install completes in under 5 minutes per SC-001. Effectively instant |
| Constraints | Offline-capable per FR-023, zero new dependencies, no writes without confirmation |
| Scale | 4 clients, 21 capabilities, 5 workflows, 1 skill package |
| Scope default | User-wide config per FR-031; skill per FR-032 (shared project copy for Zed and Antigravity, user-wide for the other two) |
| OpenCode timeout | Must exceed one CDN round trip, per FR-033. Default 5000ms is too short |