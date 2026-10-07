# Quickstart: Validating Multi-Client Onboarding

**Feature**: 001-mcp-client-onboarding | **Date**: 2026-10-07

Runnable checks that prove the feature works end to end. Each maps to numbered requirements.
For command semantics see `contracts/installer-cli.md`; for client shapes see
`contracts/client-registry.md`.

---

## Prerequisites

- Node.js on PATH. `node --version` must succeed.
- Dependencies installed. `pnpm install`
- A build present. `npm run build`

---

## V1. The installer refuses to write without a build

Proves FR-009.

```bash
npm run build
mv build/index.js build/index.js.bak
node scripts/install-clients.cjs install --client opencode --dry-run
```

Expected: exits 2, names the missing build, and no config file changes.

```bash
mv build/index.js.bak build/index.js
```

---

## V2. Dry run writes nothing

Proves FR-004 and SC-004.

```bash
node scripts/install-clients.cjs install --dry-run
```

Then confirm nothing changed:

```bash
node -e "const fs=require('fs'),c=require('path');
const f=c.join(process.env.USERPROFILE,'.config','opencode','opencode.json');
console.log(require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex'))"
```

Run the checksum before and after. Expected: identical hashes.

---

## V3. Confirmation is honoured per client

Proves FR-005.

```bash
node scripts/install-clients.cjs install --client opencode --client zed
```

Answer yes for one and no for the other. Expected: exactly one config changed. `status` shows the
approved client registered and the declined one untouched.

---

## V4. Install is idempotent

Proves FR-007 and SC-003.

```bash
node scripts/install-clients.cjs install --client opencode --yes
node scripts/install-clients.cjs install --client opencode --yes
```

Expected: the second run reports already correct and leaves the file byte-identical. This is the
check most likely to catch a merge that rewrites formatting on every pass.

---

## V5. Other user entries survive

Proves FR-008.

```bash
node -e "const fs=require('fs'),c=require('path');
const f=c.join(process.env.USERPROFILE,'.config','opencode','opencode.json');
const j=JSON.parse(fs.readFileSync(f));
j.mcp['unrelated-tool']={type:'local',command:['echo'],enabled:true};
fs.writeFileSync(f,JSON.stringify(j,null,2))"
node scripts/install-clients.cjs install --client opencode --yes
```

Expected: `unrelated-tool` still present and unchanged.

---

## V6. An unparseable config is never overwritten

Proves the highest-priority invariant in the data model.

```bash
cp "$USERPROFILE/.config/opencode/opencode.json" "$TEMP/opencode.json.bak"
echo '{ this is not valid json' > "$USERPROFILE/.config/opencode/opencode.json"
node scripts/install-clients.cjs install --client opencode
```

Expected: reports a parse error, refuses to write, leaves the broken file exactly as it is.

```bash
cp "$TEMP/opencode.json.bak" "$USERPROFILE/.config/opencode/opencode.json"
```

---

## V7. Restore returns the original bytes

Proves FR-006 and SC-007.

```bash
node scripts/install-clients.cjs install --client opencode --yes
node scripts/install-clients.cjs restore --client opencode
```

Expected: the file is byte-identical to its pre-install state. Restore copies bytes rather than
re-serialising JSON, because re-serialising reorders keys and would fail this check while looking
correct.

---

## V8. Unregister removes only our entry

Proves FR-020.

```bash
node scripts/install-clients.cjs uninstall --client opencode
```

Expected: the `kbbi` entry is gone, every other entry untouched.

---

## V9. The server actually works over MCP

Proves the feature's whole purpose, Story 1 acceptance scenario 4.

```bash
node build/index.js
```

In a separate terminal, confirm the client lists the capabilities. Then call one and expect a real
KBBI definition. A successful registration with a failing call means the entry is wrong, not that
the dictionary is unavailable.

---

## V10. The skill loads

Proves FR-015 for the clients that support filesystem skills.

```bash
node scripts/install-clients.cjs install --skill
```

Expected: `.agents/skills/kbbi-mcp/SKILL.md` exists for Zed and Antigravity, and the personal
skill directories exist for Claude Code and OpenCode, giving three skill files total.

Then in Zed or Antigravity, invoke the skill by name. Expected: the agent picks the bulk
capability for a mass task rather than looping single lookups.

**Scope note**: the skill is installed inside the project for Zed and Antigravity, and user-wide
for Claude Code and OpenCode, per FR-032.

---

## V11. Documentation covers every capability

Proves FR-014 and SC-005.

```bash
node -e "
const fs=require('fs');
const src=['src/tools/kamus.ts','src/tools/stemmer.ts','src/tools/pemenggalan.ts']
  .map(f=>fs.readFileSync(f,'utf8')).join('\n');
const names=[...src.matchAll(/server\.tool\(\s*\n?\s*\"([a-z_]+)\"/g)].map(m=>m[1]);
const doc=fs.readFileSync('docs/USAGE.md','utf8');
const missing=names.filter(n=>!doc.includes(n));
console.log('total:',names.length,'missing:',missing);
"
```

Expected: `total: 21` and `missing: []`.

---

## V12. Non-Latin character scan

Proves research D-009. Run over every generated file before committing.

```bash
node -e "
const fs=require('fs');
const files=['docs/INSTALL.md','docs/USAGE.md','.agents/skills/kbbi-mcp/SKILL.md'];
let bad=0;
for(const f of files){
  const t=fs.readFileSync(f,'utf8');
  const hits=[...t].filter(c=>/[^\x00-\x7F]/.test(c)&&!/[^\u0000-\u024F]/.test(c)&&!/\u2014|\u2013/.test(c));
  if(hits.length){console.log(f,hits.join(''));bad++}
}
console.log(bad?'FAIL':'PASS');
"
```

Expected: `PASS`. This gate exists because the spec file was corrupted twice mid-generation and a
reviewer reading Indonesian would not necessarily notice stray CJK characters.

---

## V13. Unit tests stay offline

Proves Constitution Principle IV.

```bash
npm test
```

Expected: passes with no network access. The installer tests point the registry at a temporary
config root rather than touching real client configs.

---

## V14. Regression test for the accuracy script defect

Proves FR-025 on the seed defect from D-008.

```bash
node scripts/verify-accuracy.cjs
```

Expected before the fix: throws `ENOENT` for `word-details`. Expected after: runs and reports an
accuracy figure sourced through the CDN reader.

This check also closes the constitution's open `TODO(ACCURACY_GATE)`. Until it passes, the
constitution's own quality gate is unrunnable for every developer.