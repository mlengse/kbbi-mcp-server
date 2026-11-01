/**
 * Pembacaan, penggabungan, pencadangan, dan penulisan konfigurasi klien.
 *
 * Kontrak: contracts/installer-cli.md (safety invariants)
 * Model data: specs/001-mcp-client-onboarding/data-model.md
 *   (ConfigDocument, BackupSnapshot, ServerEntry)
 *
 * Invariant terpenting di berkas ini: dokumen yang `parseError` TIDAK PERNAH
 * ditulis. Konfigurasi yang tidak bisa diparse justru keadaan yang paling
 * perlu dijaga pengguna.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const clients = require('./clients.cjs');

const SERVER_NAME = 'kbbi';
const BACKUP_DIR = ['.kbbi-mcp', 'backups'];

/** Kunci `mcp` yang hanya ada pada skema OpenCode v2, bukan nama server. */
const OPENCODE_V2_META_KEYS = new Set(['servers', 'timeout']);

/** Root repositori diturunkan dari lokasi modul, bukan dari process.cwd(). */
function resolveRepoRoot() {
  return path.resolve(__dirname, '..', '..');
}

/**
 * Lokasi server yang akan ditulis ke konfigurasi klien.
 * `command` dan `args` wajib absolut: keempat klien menjalankan server dari
 * direktori kerja yang berbeda, dan path disimpan sebagai elemen array JSON,
 * bukan dirangkai menjadi string shell, sehingga spasi di Windows aman tanpa
 * escaping. Lihat data-model.md ServerEntry.
 */
function resolveServerPaths() {
  const repoRoot = resolveRepoRoot();
  const command = process.execPath;
  const args = [path.join(repoRoot, 'build', 'index.js')];
  return { repoRoot, command, args, entryPath: args[0] };
}

/** Backup terpusat di dalam config root yang dihormati, per klien. */
function backupDir() {
  return clients.homePath(...BACKUP_DIR);
}

/**
 * ConfigDocument per data-model.md.
 * `parseError` non-null berarti berkas ada tapi gagal diparse; pemanggil
 * WAJIB membatalkan klien ini tanpa menulis apa pun.
 */
function readConfigDocument(filePath) {
  const doc = {
    path: filePath,
    exists: false,
    raw: null,
    parsed: null,
    parseError: null,
    servers: {},
  };

  if (!fs.existsSync(filePath)) return doc;

  doc.exists = true;
  doc.raw = fs.readFileSync(filePath);

  try {
    doc.parsed = JSON.parse(doc.raw.toString('utf8'));
  } catch (err) {
    doc.parseError = err instanceof Error ? err.message : String(err);
    return doc;
  }

  if (doc.parsed === null || typeof doc.parsed !== 'object' || Array.isArray(doc.parsed)) {
    doc.parseError = 'Isi berkas bukan objek JSON.';
    return doc;
  }

  return doc;
}

/**
 * Hasil `serializeEntry`.
 *
 * Tiga `entryShape` menghasilkan tiga bentuk yang TIDAK bisa disamakan, jadi
 * bentuknya dinyatakan di sini sebagai satu tipe dengan `command` wajib dan
 * sisanya opsional. Fields milik bentuk lain sengaja opsional, bukan `never`:
 * konsumen (tes, dan skrip yang membaca entri) boleh memeriksa field mana pun,
 * dan `undefined` sudah cukup untuk membedakan bentuk mana yang dipakai.
 *
 * `command` tetap `string | string[]` karena opencode-style memakai array
 * executable, sedangkan claude/zed memakai string tunggal.
 *
 * @typedef {object} SerializedEntry
 * @property {string|string[]} command
 * @property {string[]} [args]
 * @property {Record<string, string>} [env]
 * @property {'custom'} [source]
 * @property {'local'} [type]
 * @property {boolean} [enabled]
 * @property {boolean} [disabled]
 * @property {Record<string, string>} [environment]
 * @property {number|{startup?: number, catalog?: number, execution?: number}} [timeout]
 */

/** Objek JSON biasa, bukan array/null. */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Bentuk entri per `entryShape` sebuah record.
 *   claude-style  : command + args + env
 *   zed-style     : claude-style + source: "custom" (tanpa ini Zed menganggap
 *                   entri berasal dari ekstensi)
 *   opencode-style: type local, command SEBAGI ARRAY yang memuat executable,
 *                   dan kunci env bernama `environment` bukan `env`.
 *                   v1 menambahkan `enabled` dan `timeout` berupa angka;
 *                   v2 (skema saat ini) memakai `timeout` berupa objek
 *                   {startup, catalog, execution} dan tidak mengenal `enabled`.
 *
 * @returns {SerializedEntry}
 */
function serializeEntry(record, server, options = {}) {
  const env = { ...(server.env || {}) };

  if (record.entryShape === 'opencode-style') {
    // FR-033: batas bawaan 5000ms lebih pendek dari satu putaran CDN.
    const timeout = options.timeout ?? 60000;
    const shape = options.opencodeShape ?? 'v2';

    if (shape === 'v2') {
      // Hanya `startup` dan `catalog` yang dipersempit. `execution` sengaja
      // tidak ditulis supaya batas bawaan host tidak ikut turun.
      return {
        type: 'local',
        command: [server.command, ...server.args],
        environment: env,
        timeout: { startup: timeout, catalog: timeout },
      };
    }

    return {
      type: 'local',
      command: [server.command, ...server.args],
      enabled: true,
      environment: env,
      timeout,
    };
  }

  /** @type {SerializedEntry} */
  const entry = { command: server.command, args: server.args.slice(), env };
  if (record.entryShape === 'zed-style') entry.source = 'custom';
  return entry;
}

/**
 * Deteksi skema OpenCode saat runtime (D-003).
 * v1: entri langsung di bawah `mcp`, memakai `enabled`.
 * v2: bersarang di `mcp.servers`, memakai `disabled`.
 * Mengembalikan 'v1' | 'v2' | 'unknown'.
 *
 * `mcp` yang kosong atau hanya berisi kunci meta v2 dianggap v2: tidak ada
 * sinyal v1 di dalamnya, dan v2 adalah skema OpenCode saat ini.
 */
function detectOpenCodeShape(parsed) {
  if (!isPlainObject(parsed)) return 'unknown';
  const mcp = parsed.mcp;
  if (mcp === undefined) return 'unknown';
  if (!isPlainObject(mcp)) return 'unknown';
  if (isPlainObject(mcp.servers)) return 'v2';

  const entryKeys = Object.keys(mcp).filter((key) => !OPENCODE_V2_META_KEYS.has(key));
  return entryKeys.length > 0 ? 'v1' : 'v2';
}

/**
 * Bentuk entri yang harus dipakai untuk sebuah dokumen OpenCode.
 * Dokumen yang jelas v1 dipertahankan apa adanya; selain itu dipakai v2.
 * Dipakai bersama oleh `serializeEntry` dan `serverContainer` supaya entri dan
 * lokasi root tidak pernah berbeda skema.
 */
function openCodeEntryShape(parsed) {
  return detectOpenCodeShape(parsed) === 'v1' ? 'v1' : 'v2';
}

/**
 * Konflik yang membuat installer menolak menulis ke dokumen ini.
 * Mengembalikan string alasan, atau null bila aman ditulis.
 *
 * Skema OpenCode v1 dan v2 sama-sama didukung (D-003): bentuk entri dan lokasi
 * root ditentukan saat runtime oleh `detectOpenCodeShape`.
 */
function conflictReason(record, doc) {
  if (!doc.exists || doc.parseError || !doc.parsed) return null;
  return null;
}

/** Bandingkan entri secara mendalam, untuk deteksi idempotensi. */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Wadah entri server pada sebuah dokumen.
 *   v1 / klien lain : `parsed[record.rootKey]`
 *   OpenCode v2     : `parsed.mcp.servers`
 * Selalu mengembalikan objek wadah, meski belum ada di dokumen.
 */
function serverContainer(parsed, record) {
  const base = isPlainObject(parsed) ? parsed : {};
  if (record.entryShape === 'opencode-style' && openCodeEntryShape(base) === 'v2') {
    return {
      nested: true,
      servers: isPlainObject(base.mcp) && isPlainObject(base.mcp.servers) ? base.mcp.servers : {},
    };
  }
  const key = record.rootKey;
  return { nested: false, key, servers: isPlainObject(base[key]) ? base[key] : {} };
}

/** Tulis wadah entri kembali ke dokumen, tanpa menyentuh kunci lain. */
function withServerContainer(base, container, servers) {
  if (container.nested) {
    return { ...base, mcp: { ...(isPlainObject(base.mcp) ? base.mcp : {}), servers } };
  }
  return { ...base, [container.key]: servers };
}

/**
 * Gabungkan entri server ke dalam dokumen, di wadah yang sesuai skemanya.
 * Mengembalikan { doc, changed }.
 *   changed === false berarti isi berkas identik sehingga TIDAK ditulis,
 *   itulah yang membuat instalasi kedua menjadi byte-identik (FR-007).
 */
function mergeServerEntry(doc, record, entry, options = {}) {
  if (doc.parseError) {
    throw new Error(`Konfigurasi ${doc.path} tidak bisa diparse: ${doc.parseError}`);
  }
  const reason = conflictReason(record, doc);
  if (reason) throw new Error(reason);

  const base = isPlainObject(doc.parsed) ? doc.parsed : {};
  const container = serverContainer(base, record);

  const existing = container.servers[SERVER_NAME];
  const identical =
    existing !== undefined &&
    deepEqual(existing, entry) &&
    (doc.exists === true ? sameFormatting(doc.raw, base) : true);

  // Entri milik pengguna lain tidak pernah hilang, hanya entri kbbi yang
  // ditambahkan atau diganti.
  const nextServers = { ...container.servers, [SERVER_NAME]: entry };
  const next = withServerContainer(base, container, nextServers);

  if (doc.exists && identical) {
    return { doc, changed: false };
  }

  return {
    doc: { ...doc, parsed: next, servers: nextServers, exists: true },
    changed: true,
  };
}

/**
 * Apakah format berkas saat ini persis seperti hasil serialisasi ulang?
 * Bila ya, penulisan ulang tidak mengubah satu byte pun.
 */
function sameFormatting(raw, parsed) {
  if (!raw) return false;
  return raw.toString('utf8') === serializeDocument(parsed);
}

/** Serialisasi standar: dua spasi indent, newline akhir. */
function serializeDocument(parsed) {
  return JSON.stringify(parsed, null, 2) + '\n';
}

/** BackupSnapshot per data-model.md. */
function createBackup(doc, clientId) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/[:.]/g, '-')}_${clientId}`;
  const file = path.join(dir, `${id}.json`);

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        id,
        sourcePath: doc.path,
        createdAt,
        existed: doc.exists,
        bytes: doc.raw ? doc.raw.toString('base64') : null,
      },
      null,
      2
    )
  );

  return { id, sourcePath: doc.path, createdAt, bytes: doc.raw, existed: doc.exists, file };
}

/** Backup terbaru untuk sebuah klien, atau null. */
function latestBackup(clientId) {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return null;
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.includes(`_${clientId}`))
    .sort();
  if (candidates.length === 0) return null;

  const record = JSON.parse(fs.readFileSync(path.join(dir, candidates[candidates.length - 1]), 'utf8'));
  return {
    ...record,
    bytes: record.bytes ? Buffer.from(record.bytes, 'base64') : null,
    file: path.join(dir, candidates[candidates.length - 1]),
  };
}

/**
 * Tulis dokumen. Cadangan SELALU dibuat lebih dulu, termasuk saat yang ditulis
 * hanya replaces sebuah entri.
 */
function writeConfigDocument(doc, clientId) {
  if (doc.parseError) {
    throw new Error(`Konfigurasi ${doc.path} rusak, tidak ditulis: ${doc.parseError}`);
  }
  const backup = createBackup(doc, clientId);
  fs.mkdirSync(path.dirname(doc.path), { recursive: true });
  fs.writeFileSync(doc.path, serializeDocument(doc.parsed));
  return backup;
}

/**
 * Pulihkan byte cadangan apa adanya, bukan hasil serialisasi ulang.
 * Menyerialisasi ulang akan mengurutkan ulang kunci dan mengubah format,
 * sehingga berkasnya berbeda dari aslinya meski setara secara semantik (SC-007).
 * Pemulihan bersifat per klien, tidak pernah global.
 */
function restoreBackup(clientId) {
  const backup = latestBackup(clientId);
  if (!backup) return { restored: false, reason: `Tidak ada cadangan untuk ${clientId}.` };

  fs.mkdirSync(path.dirname(backup.sourcePath), { recursive: true });
  if (backup.existed && backup.bytes) {
    fs.writeFileSync(backup.sourcePath, backup.bytes);
  } else {
    // Cadangan mencatat berkas yang tidak ada sebelum installer menyentuh.
    if (fs.existsSync(backup.sourcePath)) fs.rmSync(backup.sourcePath);
  }
  return { restored: true, sourcePath: backup.sourcePath };
}

/** Hapus hanya entri kbbi, sisanya utuh. */
function removeServerEntry(doc, record) {
  if (doc.parseError) {
    throw new Error(`Konfigurasi ${doc.path} rusak, tidak ditulis: ${doc.parseError}`);
  }
  const base = isPlainObject(doc.parsed) ? doc.parsed : {};
  const container = serverContainer(base, record);

  if (!(SERVER_NAME in container.servers)) {
    return { doc, changed: false };
  }

  const nextServers = { ...container.servers };
  delete nextServers[SERVER_NAME];

  const next = { ...base };
  if (container.nested) {
    // `mcp` mungkin masih memuat `timeout`; hanya `servers` yang dibuang bila
    // kosong, dan `mcp` sendiri tidak pernah dihapus.
    const nextMcp = { ...(isPlainObject(base.mcp) ? base.mcp : {}) };
    if (Object.keys(nextServers).length === 0) delete nextMcp.servers;
    else nextMcp.servers = nextServers;
    next.mcp = nextMcp;
  } else if (Object.keys(nextServers).length === 0) {
    delete next[container.key];
  } else {
    next[container.key] = nextServers;
  }

  return { doc: { ...doc, parsed: next, servers: nextServers, exists: true }, changed: true };
}

/**
 * Pilih satu path config yang akan dipakai.
 * Candidate pertama yang ADA menang; bila belum ada, candidate pertama yang
 * dipakai. Untuk Antigravity (D-004) candidate yang sudah memuat server
 * diutamakan, karena hanya `~/.gemini/config/mcp_config.json` yang memuatnya.
 */
function resolveConfigPath(record, scope, repoRoot) {
  const ordered = clients.candidatesForScope(record, scope, repoRoot);
  if (ordered.length === 0) return null;

  const existing = ordered.filter((c) => fs.existsSync(clients.candidatePath(c, repoRoot)));
  if (existing.length > 0) {
    const populated = existing.find((c) => {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(clients.candidatePath(c, repoRoot), 'utf8')
        );
        const key = parsed[record.rootKey];
        return key && typeof key === 'object' && Object.keys(key).length > 0;
      } catch {
        return false;
      }
    });
    const chosen = populated || existing[0];
    return { path: clients.candidatePath(chosen, repoRoot), created: false };
  }

  return { path: clients.candidatePath(ordered[0], repoRoot), created: true };
}

/** Checksum berkas, untuk pembuktian dry-run nol modifikasi (SC-004). */
function checksum(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

module.exports = {
  SERVER_NAME,
  resolveRepoRoot,
  resolveServerPaths,
  readConfigDocument,
  serializeEntry,
  detectOpenCodeShape,
  openCodeEntryShape,
  conflictReason,
  serverContainer,
  mergeServerEntry,
  removeServerEntry,
  writeConfigDocument,
  createBackup,
  latestBackup,
  restoreBackup,
  resolveConfigPath,
  serializeDocument,
  checksum,
  backupDir,
};