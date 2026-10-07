/**
 * Penempatan dan peningkatan paket skill pendukung.
 *
 * Kontrak: specs/001-mcp-client-onboarding/contracts/skill-package.md
 * Model data: data-model.md (SkillPackage)
 *
 * Per FR-032 hanya tiga berkas skill yang terpasang: satu salinan bersama di
 * dalam proyek untuk Zed dan Antigravity, ditambah lingkup pengguna untuk
 * Claude Code dan OpenCode. Peningkatan mengganti direktori, tidak pernah
 * menggabung, supaya baris yang dihapus di versi baru benar-benar hilang.
 * Dua skill berbeda yang memakai satu nama direktori adalah konflik yang
 * dilaporkan, bukan ditimpa diam-diam.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const clients = require('./clients.cjs');

const SKILL_NAME = 'kbbi-mcp';

/** Sumber paket skill, satu salinan di dalam repositori. */
function skillSource(repoRoot) {
  return path.join(repoRoot, '.agents', 'skills', SKILL_NAME);
}

/** Versi paket skill, dibaca dari frontmatter bila ada. */
function skillVersion(sourceDir) {
  const skillFile = path.join(sourceDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  const match = fs
    .readFileSync(skillFile, 'utf8')
    .match(/^version:\s*(\S+)\s*$/m);
  return match ? match[1] : '0.0.0';
}

/** Nama yang direpresentasikan skill yang sudah terpasang di sebuah direktori. */
function installedSkillName(targetDir) {
  const skillFile = path.join(targetDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  const match = fs.readFileSync(skillFile, 'utf8').match(/^name:\s*(\S+)\s*$/m);
  return match ? match[1] : null;
}

/**
 * Status skill pada satu target, sesuai data-model.md:
 * new | current | outdated | conflict | absent
 */
function inspect(targetDir) {
  if (!targetDir || !fs.existsSync(targetDir)) return 'absent';
  const installed = installedSkillName(targetDir);
  if (installed === null) return 'conflict';
  return installed === SKILL_NAME ? 'installed' : 'conflict';
}

/**
 * Bandingkan isi target dengan sumber.
 * Mengembalikan 'new' | 'current' | 'outdated' | 'conflict'.
 */
function compare(targetDir, sourceDir) {
  const state = inspect(targetDir);
  if (state === 'absent') return 'new';
  if (state === 'conflict') return 'conflict';

  const sourceFiles = listFiles(sourceDir);
  for (const relative of sourceFiles) {
    const targetFile = path.join(targetDir, relative);
    if (!fs.existsSync(targetFile)) return 'outdated';
    const a = fs.readFileSync(targetFile, 'utf8');
    const b = fs.readFileSync(path.join(sourceDir, relative), 'utf8');
    if (a !== b) return 'outdated';
  }
  return 'current';
}

/** Path relatif seluruh berkas dalam sebuah direktori, terurut. */
function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFiles(path.join(dir, entry.name), relative));
    } else {
      out.push(relative);
    }
  }
  return out.sort();
}

/** Salin direktori secara rekursif. */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const relative of listFiles(from)) {
    const target = path.join(to, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(from, relative), target);
  }
}

/**
 * Target skill unik dari sekumpulan record.
 * Zed dan Antigravity menunjuk lokasi proyek yang sama, jadi hasilnya satu
 * target bukan dua, dan jumlah berkas skill yang terpasang tidak melebihi tiga
 * sesuai FR-032.
 */
function resolveTargets(records, repoRoot) {
  const seen = new Map();
  for (const record of records) {
    const targetPath = clients.skillTargetPath(record, repoRoot);
    if (!targetPath) continue;
    if (!seen.has(targetPath)) {
      seen.set(targetPath, { path: targetPath, clients: [], label: '' });
    }
    const entry = seen.get(targetPath);
    entry.clients.push(record.id);
  }
  return [...seen.values()].map((entry) => ({
    path: entry.path,
    clients: entry.clients,
    label: entry.clients.join(' + '),
  }));
}

/**
 * Pasang atau tingkatkan skill pada satu target.
 * Mengembalikan { state, path } dengan state new | current | outdated | conflict.
 */
function install(target, options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..');
  const sourceDir = skillSource(repoRoot);
  const state = compare(target.path, sourceDir);

  if (state === 'conflict') {
    throw new Error(
      `Konflik skill: direktori ${target.path} sudah dipakai skill lain. ` +
        `Installer tidak menimpa diam-diam; periksa manual.`
    );
  }
  if (state === 'current') return { state, path: target.path };
  if (state === 'new') {
    copyDir(sourceDir, target.path);
  } else {
    // Ganti direktori, jangan gabungkan (FR-018).
    fs.rmSync(target.path, { recursive: true, force: true });
    copyDir(sourceDir, target.path);
  }
  return { state, path: target.path, version: skillVersion(sourceDir) };
}

/**
 * Hapus skill pada sebuah target.
 * Menerima objek target seperti `install`, atau path berupa string.
 */
function uninstall(target) {
  const targetPath = typeof target === "string" ? target : target.path;
  if (!fs.existsSync(targetPath)) return { removed: false };
  fs.rmSync(targetPath, { recursive: true, force: true });
  return { removed: true };
}

module.exports = {
  SKILL_NAME,
  skillSource,
  skillVersion,
  installedSkillName,
  inspect,
  compare,
  listFiles,
  resolveTargets,
  install,
  uninstall,
};