/**
 * Registri klien deklaratif untuk installer KBBI MCP.
 *
 * Kontrak: contracts/client-registry.md
 * Model data: specs/001-mcp-client-onboarding/data-model.md (ClientRecord)
 *
 * Semua logika installer membaca data di berkas ini. Tidak ada kode yang
 * percabangan pada identitas klien di luar registri. Menambah klien kelima
 * adalah perubahan data, bukan perubahan kode.
 *
 * Claude Desktop TIDAK ada di registri. Ia hanya memuat skill lewat akun
 * claude.ai sebagai ZIP, tanpa lokasi sistem berkas yang bisa dibaca installer.
 * Lihat research.md D-007.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Direktori home yang dihormati, memakai KBBI_CONFIG_ROOT bila diset. */
function homeDir() {
  return process.env.KBBI_CONFIG_ROOT || os.homedir();
}

/** Path absolut di dalam home yang dihormati. */
function homePath(...segments) {
  return path.join(homeDir(), ...segments);
}

/**
 * Candidate config, tiap entri `{ relative, scope }`.
 * `scope` menentukan apakah candidate itu global atau proyek.
 */
const CLIENTS = [
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    rootKey: 'mcpServers',
    entryShape: 'claude-style',
    configCandidates: [
      { relative: ['.claude.json'], scope: 'global' },
      { relative: ['.mcp.json'], scope: 'project' },
    ],
    skillTarget: { scope: 'user', relative: ['.claude', 'skills', 'kbbi-mcp'] },
    knownConflicts: [],
    detect: ['command:claude', 'file:global'],
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    rootKey: 'mcp',
    entryShape: 'opencode-style',
    configCandidates: [
      { relative: ['.config', 'opencode', 'opencode.json'], scope: 'global' },
      { relative: ['opencode.json'], scope: 'project' },
    ],
    skillTarget: { scope: 'user', relative: ['.config', 'opencode', 'skills', 'kbbi-mcp'] },
    // D-003: dua skema tidak kompatibel sedang sama-sama terdokumentasi.
    knownConflicts: ['opencode-v2-shape'],
    detect: ['command:opencode', 'file:global', 'file:project'],
  },
  {
    id: 'zed',
    displayName: 'Zed',
    rootKey: 'context_servers',
    entryShape: 'zed-style',
    configCandidates: [
      { relative: ['.config', 'zed', 'settings.json'], scope: 'global' },
      { relative: ['.zed', 'settings.json'], scope: 'project' },
    ],
    // D-006: Zed dan Antigravity membaca lokasi proyek yang sama, satu salinan untuk dua klien.
    skillTarget: { scope: 'project', relative: ['.agents', 'skills', 'kbbi-mcp'] },
    knownConflicts: [],
    detect: ['file:global', 'command:zed'],
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity',
    rootKey: 'mcpServers',
    entryShape: 'claude-style',
    // D-004: tiga path bersaing, probing berurutan, yang sudah punya server diutamakan.
    configCandidates: [
      { relative: ['.gemini', 'config', 'mcp_config.json'], scope: 'global' },
      { relative: ['.gemini', 'antigravity', 'mcp_config.json'], scope: 'global' },
      { relative: ['.gemini', 'antigravity-ide', 'mcp_config.json'], scope: 'global' },
    ],
    skillTarget: { scope: 'project', relative: ['.agents', 'skills', 'kbbi-mcp'] },
    // D-005: workspace config didiamkan oleh CLI, jadi tidak pernah ditawarkan.
    knownConflicts: ['antigravity-workspace-ignored'],
    detect: ['file:global'],
  },
];

/** Path absolut untuk satu candidate. `repoRoot` dipakai untuk scope project. */
function candidatePath(candidate, repoRoot) {
  return candidate.scope === 'project'
    ? path.join(repoRoot, ...candidate.relative)
    : homePath(...candidate.relative);
}

/** Path absolut untuk skillTarget sebuah record. */
function skillTargetPath(record, repoRoot) {
  if (!record.skillTarget) return null;
  return candidatePath(record.skillTarget, repoRoot);
}

/** Apakah sebuah command ada di PATH. Read-only, tanpa efek samping apa pun. */
function isOnPath(command) {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        fs.accessSync(path.join(dir, command + ext), fs.constants.X_OK);
        return true;
      } catch {
        // Lanjut ke direktori berikutnya.
      }
    }
  }
  return false;
}

/** Kandidat config milik satu record pada sebuah scope. */
function candidatesForScope(record, scope, repoRoot) {
  return record.configCandidates.filter((c) => c.scope === scope);
}

/**
 * Deteksi apakah klien terpasang. Murni, read-only, tidak pernah menulis.
 * Sesuai kontrak: klien yang absen dilaporkan, tidak pernah dikonfigurasi.
 */
function detect(record, repoRoot) {
  for (const rule of record.detect) {
    if (rule.startsWith('command:')) {
      if (isOnPath(rule.slice('command:'.length))) return true;
    } else if (rule.startsWith('file:')) {
      const scope = rule.slice('file:'.length);
      const found = candidatesForScope(record, scope, repoRoot).some((c) =>
        fs.existsSync(candidatePath(c, repoRoot))
      );
      if (found) return true;
    }
  }
  return false;
}

/** Semua record, dalam urutan prioritas. */
function allClients() {
  return CLIENTS.slice();
}

/** Cari record berdasarkan id. Mengembalikan null bila tidak dikenal. */
function getClient(id) {
  return CLIENTS.find((c) => c.id === id) || null;
}

/** Daftar id yang valid, untuk pesan galat unknown-client. */
function validIds() {
  return CLIENTS.map((c) => c.id);
}

module.exports = {
  CLIENTS,
  allClients,
  getClient,
  validIds,
  detect,
  isOnPath,
  homeDir,
  homePath,
  candidatePath,
  skillTargetPath,
  candidatesForScope,
};