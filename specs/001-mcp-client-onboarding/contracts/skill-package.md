# Contract: Skill Package and Documentation

**Feature**: 001-mcp-client-onboarding | **Date**: 2026-10-07

---

## Skill package

One skill, installed to several locations. Content is identical everywhere; only the path differs.

### Layout

```text
.agents/skills/kbbi-mcp/
├── SKILL.md              # required
└── references/
    └── capabilities.md   # the 21-capability table
```

`SKILL.md` stays under 500 lines and the frontmatter description under 1024 characters. Both
limits come from the Agent Skills spec, and both Zed and Claude reject skills that exceed them.
Keeping the capability table in a reference file rather than in the body is what lets the body stay
short while the guide stays complete.

### Frontmatter

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | `kbbi-mcp`. Must equal the directory name. Lowercase and hyphens only |
| `description` | yes | Indonesian. States when to load the skill, not what the server is |
| `disable-model-invocation` | no | Left unset, so the agent can load it autonomously when a task matches |

### Content requirements

- Which capability to reach for, keyed to the user's task rather than to the server's internals.
  FR-016.
- The bulk-versus-single distinction, stated explicitly: mass work uses the export capabilities,
  not repeated single lookups.
- The server's limits, so the agent explains a boundary instead of inventing a capability.
  This is acceptance scenario 2 of Story 3.
- A pointer to the reference file for the full capability list.

### Install targets

| Target | Serves |
|--------|---------|
| `.agents/skills/kbbi-mcp/` | Zed and Antigravity, one shared copy |
| `~/.claude/skills/kbbi-mcp/` | Claude Code |
| `~/.config/opencode/skills/kbbi-mcp/` | OpenCode |
| none | Claude Desktop, removed from scope 2026-10-07, see research.md D-007 |

### Upgrade rule

Replace the directory, never merge into it. A merge would leave lines from the previous version in
place, and a skill file that contradicts itself is worse than either version alone. FR-018.

Two different skills sharing one directory name is a conflict to report, never an overwrite. The
`conflict` state in the data model covers this.

---

## Documentation

### `docs/INSTALL.md`

Covers all four clients, each as a self-contained section with prerequisites, configuration steps,
connection verification, and recovery. FR-011, FR-012.

A reader must be able to finish installing one client without reading another client's section.
That is the test for whether the document is complete enough.

Each client section names the client's specific failure modes, not generic advice. The parts that
differ per client and are easy to get wrong:

- Claude Code reads `~/.claude/skills/` and `.claude/skills/`.
- OpenCode's `command` is an array including the executable, its env key is `environment`, and it
  needs an explicit tool-fetch timeout because its five-second default is shorter than a CDN round
  trip. See FR-033.
- Zed needs `source: custom` and the root key is `context_servers`.
- Antigravity must use a global config; the workspace one is silently ignored.

### `docs/USAGE.md`

Maps all 21 capabilities and 5 workflows to the tasks they serve, each with an example
invocation and the expected output shape. FR-013, FR-014.

Capability counts, verified from registration sites at planning time:

| Family | Count |
|--------|-------|
| kamus | 8 |
| stemmer | 5 |
| pemenggalan | 7 |
| **Total** | **21** |

Plus 5 workflows. SC-005 requires cross-checking this table against what the server actually
exposes, in both directions. A capability on the server but missing from the guide is as much a
defect as the reverse, because both mislead the reader.

### `docs/capabilities-reference.md`

Generated rather than hand-written, so the 21-entry table stays consistent with
`src/data/types.ts` and the registration modules. Hand-maintained tables drift.

---

## Language and encoding

Indonesian throughout, per FR-020. Capability names stay verbatim since they are the server's
public API.

Every generated file passes a byte-level scan for stray non-Latin characters before it is
committed. This is a hard gate, not a stylistic preference: the spec file was silently corrupted
with CJK and Cyrillic fragments twice during generation, and such corruption in Indonesian prose
is invisible to casual review while shipping to users. See research D-009.