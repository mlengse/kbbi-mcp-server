# Contract: Client Registry

**Feature**: 001-mcp-client-onboarding | **Date**: 2026-10-07

The registry is the installer's contract with the five target clients. Everything the installer
does to a user's machine is derived from this data. Adding a sixth client is a data change.

---

## Verified shapes

Root keys and entry fields below were confirmed against vendor documentation and, where the
documentation is ambiguous, against this machine's actual configuration.

| Client | Config path | Root key | Entry fields | Skill target |
|--------|-------------|----------|--------------|--------------|
| Claude Code | `.mcp.json` in project, or user scope | `mcpServers` | `command`, `args`, `env` | `~/.claude/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/opencode.json` global, `opencode.json` project | `mcp` (v1) or `mcp.servers` (v2) | `type`: `local`, `command` as array, `enabled`, `environment` | `~/.config/opencode/skills/<name>/SKILL.md` |
| Zed | `~/.config/zed/settings.json` user, `.zed/settings.json` project | `context_servers` | `command`, `args`, `env`, `source`: `custom` | `.agents/skills/<name>/SKILL.md` |
| Antigravity | `~/.gemini/config/mcp_config.json`, with `~/.gemini/antigravity/mcp_config.json` and `~/.gemini/antigravity-ide/mcp_config.json` as alternates | `mcpServers` | `command`, `args`, `env` | `.agents/skills/<name>/SKILL.md` |

---

## Known conflicts the installer must refuse

**OpenCode v1 versus v2.** Two incompatible schemas are both currently documented. v1 places
entries directly under `mcp` and uses `enabled`. v2 nests under `mcp.servers` and uses `disabled`.
This machine runs opencode 1.18.35 with the v1 shape. The installer detects the shape at runtime
and refuses to write when it cannot match what it finds, rather than emitting a silently broken
entry.

**Antigravity workspace config.** `.agents/mcp_config.json` is documented as the workspace-scoped
location but is silently ignored by the CLI, tracked as antigravity-cli#60. The installer installs
to the global path only. Silently ignored is the dangerous failure mode here: the user would see a
success message and no working server.

**Antigravity multi-path.** Three candidate paths exist on this machine. The installer probes them
in order, prefers a candidate that already holds servers, and reports which one it chose.

**Zed `source` field.** Required for custom entries and absent from every other client's shape.
Omitting it makes Zed treat the entry as extension-provided.

---

## Detection rules

Detection is read-only and must never write.

| Client | Detected when |
|--------|---------------|
| Claude Code | `claude` is resolvable on PATH, or a user-scope config exists |
| OpenCode | `opencode` is resolvable on PATH, or `opencode.json` exists in a searched location |
| Zed | `~/.config/zed/settings.json` exists, or `zed` is resolvable on PATH |
| Antigravity | Any of the three candidate config paths exists |

An absent client is reported, never configured. Fabricating a config for a client that is not
installed produces a file nobody reads.

---

## Skill target sharing

Zed and Antigravity both read `.agents/skills/<name>/SKILL.md` from the workspace. One directory,
one copy, two clients. This repository already carries nine Spec Kit skills there, so the location
is proven on this machine. Per FR-032 this is the install target for both.

Claude Desktop was removed from scope on 2026-10-07. It reads no filesystem skill location at all;
its skills arrive only through the claude.ai account as an uploaded ZIP, so no installer can reach
it. The registry carries no record for it. See research.md D-007 for the original finding.