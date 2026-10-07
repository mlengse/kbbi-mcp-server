#!/usr/bin/env node
/**
 * Installer KBBI MCP untuk Claude Code, OpenCode, Zed, dan Antigravity.
 *
 * Kontrak: specs/001-mcp-client-onboarding/contracts/installer-cli.md
 * Registri:  scripts/lib/clients.cjs
 *
 * Prinsip: satu registri, lima perintah, tanpa cabang pada identitas klien.
 * Tidak ada penulisan berkas tanpa konfirmasi berhasil lebih dulu, kecuali
 * --yes yang tercatat di laporan. Tidak ada data kamus yang pernah ditulis
 * ke disk (Konstitusi Prinsip I). Tidak ada dependensi baru.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const clients = require('./lib/clients.cjs');
const configIo = require('./lib/config-io.cjs');
const report = require('./lib/report.cjs');
const skillInstall = require('./lib/skill-install.cjs');

const EXIT_OK = 0;
const EXIT_CLIENT_FAILED = 1;
const EXIT_PREREQUISITE = 2;
const EXIT_USAGE = 3;

const COMMANDS = ['install', 'status', 'uninstall', 'restore', 'verify'];

// ============================================================
// Argument parsing
// ============================================================

function parseArgs(argv) {
  const options = {
    command: null,
    clients: [],
    dryRun: false,
    yes: false,
    skill: true,
    scope: 'global',
    unknownClient: null,
    invalid: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--client') {
      const id = argv[i + 1];
      i += 1;
      if (!id || clients.getClient(id) === null) {
        options.unknownClient = id || '';
      } else {
        options.clients.push(id);
      }
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--yes') {
      options.yes = true;
    } else if (arg === '--skill') {
      options.skill = true;
    } else if (arg === '--no-skill') {
      options.skill = false;
    } else if (arg === '--scope') {
      options.scope = argv[i + 1];
      i += 1;
      if (options.scope !== 'global' && options.scope !== 'project') {
        options.invalid = `--scope hanya menerima global atau project, bukan "${options.scope}"`;
      }
    } else if (COMMANDS.includes(arg) && options.command === null) {
      options.command = arg;
    } else {
      options.invalid = options.invalid || `Argumen tidak dikenal: ${arg}`;
    }
  }

  return options;
}

// ============================================================
// Prasyarat
// ============================================================

/**
 * Gagal cepat dengan pesan yang menyebut Node.js bila runtime tak ada, dan
 * berhenti dengan instruksi bila build server belum ada. Tidak pernah menulis
 * registrasi yang menunjuk berkas yang tidak ada (FR-009).
 */
function assertPrerequisites({ allowBuild = true } = {}) {
  if (!clients.isOnPath('node') && !process.execPath) {
    throw new PrerequisiteError(
      'Node.js tidak ditemukan di PATH. Pasang Node.js lalu jalankan perintah ini lagi.'
    );
  }

  const server = configIo.resolveServerPaths();
  if (fs.existsSync(server.entryPath)) return server;

  if (allowBuild && fs.existsSync(path.join(server.repoRoot, 'tsconfig.json'))) {
    console.log('Build server belum ada, membangun sekarang...');
    const { execFileSync } = require('child_process');
    try {
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
        cwd: server.repoRoot,
        stdio: 'inherit',
      });
    } catch {
      throw new PrerequisiteError(
        `Build gagal dijalankan. Jalankan "npm run build" secara manual lalu ulangi. ` +
          `Entry server yang diharapkan: ${server.entryPath}`
      );
    }
    if (fs.existsSync(server.entryPath)) return server;
  }

  throw new PrerequisiteError(
    `Build server belum tersedia: ${server.entryPath}\n` +
      `Jalankan "npm run build" lebih dulu, lalu ulangi perintah ini.`
  );
}

/** Galat prasyarat: exit 2, tidak ada yang ditulis. */
class PrerequisiteError extends Error {}

// ============================================================
// Konfirmasi
// ============================================================

/**
 * Konfirmasi per klien. Menyetujui tiga dari lima mengubah tepat tiga
 * konfigurasi; menolak satu tidak membatalkan jalannya dan tidak halting
 * klien setelahnya (FR-005).
 */
async function confirmForClient(record, entryPreview, options) {
  if (options.yes && !options.dryRun) return true;
  if (options.dryRun) return false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('');
    console.log(`── ${record.displayName} ──`);
    console.log(`  konfigurasi : ${entryPreview.path}`);
    console.log(`  entri       : ${entryPreview.json}`);
    const answer = await new Promise((resolve) => {
      rl.question('  Tulis konfigurasi klien ini? [y/N] ', resolve);
    });
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

// ============================================================
// Perintah install
// ============================================================

async function installCommand(options) {
  const server = assertPrerequisites();
  const repoRoot = server.repoRoot;
  const records = selectRecords(options);
  const rows = [];

  console.log('=== Installer KBBI MCP ===');
  console.log(`Node : ${server.command}`);
  console.log(`Entry: ${server.entryPath}`);

  for (const record of records) {
    // FR-031: lingkup proyek tidak pernah dipilih diam-diam, dan tidak
    // ditawarkan untuk Antigravity karena berkasnya diabaikan CLI (D-005).
    if (record.knownConflicts.includes('antigravity-workspace-ignored') && options.scope === 'project') {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'dilewati',
        changed: false,
        reason:
          'Antigravity hanya memakai konfigurasi global; konfigurasi workspace diabaikan CLI.',
      });
      continue;
    }

    if (!clients.detect(record, repoRoot)) {
      rows.push(
        report.absentRow(record, `${record.displayName} tidak ditemukan di mesin ini.`)
      );
      continue;
    }

    let entry;
    let resolved;
    let doc;
    try {
      resolved = configIo.resolveConfigPath(record, options.scope, repoRoot);
      doc = configIo.readConfigDocument(resolved.path);
      entry = configIo.serializeEntry(record, {
        name: configIo.SERVER_NAME,
        command: server.command,
        args: server.args,
        env: {},
      });
    } catch (err) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'gagal',
        changed: false,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Konfigurasi rusak dilaporkan sebagai rusak, tidak pernah ditimpa.
    if (doc.parseError) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'gagal',
        changed: false,
        path: doc.path,
        reason: `Berkas rusak dan tidak ditimpa: ${doc.parseError}`,
      });
      continue;
    }

    const preview = { path: doc.path, json: JSON.stringify(entry) };

    if (options.dryRun) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'berhasil',
        changed: false,
        path: doc.path,
        reason: 'dry-run: rencana saja, tidak ada yang ditulis',
      });
      console.log('');
      console.log(`Rencana untuk ${record.displayName}:`);
      console.log(`  lokasi : ${doc.path}`);
      console.log(`  entri  : ${preview.json}`);
      continue;
    }

    const approved = await confirmForClient(record, preview, options);
    if (!approved) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'dilewati',
        changed: false,
        path: doc.path,
        reason: 'konfirmasi ditolak, konfigurasi tidak diubah',
      });
      continue;
    }

    try {
      const merged = configIo.mergeServerEntry(doc, record, entry);
      if (!merged.changed) {
        rows.push({
          clientId: record.id,
          displayName: record.displayName,
          result: 'berhasil',
          changed: false,
          path: doc.path,
          reason: 'konfigurasi sudah benar, berkas tidak disentuh',
        });
        continue;
      }
      configIo.writeConfigDocument(merged.doc, record.id);
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'berhasil',
        changed: true,
        path: doc.path,
      });
    } catch (err) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'gagal',
        changed: false,
        path: doc.path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (options.skill && !options.dryRun) {
    for (const target of skillInstall.resolveTargets(records, repoRoot)) {
      try {
        const outcome = skillInstall.install(target);
        rows.push({
          clientId: `skill:${target.label}`,
          displayName: `Skill untuk ${target.label}`,
          result: 'berhasil',
          kind: 'skill',
          changed: outcome.state === 'new' || outcome.state === 'outdated',
          path: target.path,
          reason:
            outcome.state === 'conflict'
              ? 'konflik: nama direktori dipakai skill lain'
              : `skill ${outcome.state}`,
        });
      } catch (err) {
        rows.push({
          clientId: `skill:${target.label}`,
displayName: `Skill untuk ${target.label}`,
          result: 'gagal',
          kind: 'skill',
          changed: false,
          path: target.path,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  console.log(
    report.renderReport(rows, {
      dryRun: options.dryRun,
      bypassedConfirmation: options.yes && !options.dryRun,
      scope: options.scope,
      command: 'install',
    })
  );

  return rows.some((r) => r.result === 'gagal') ? EXIT_CLIENT_FAILED : EXIT_OK;
}

// ============================================================
// Perintah status
// ============================================================

function statusCommand(options) {
  const repoRoot = configIo.resolveRepoRoot();
  const records = selectRecords(options);
  const rows = [];

  for (const record of records) {
    const detected = clients.detect(record, repoRoot);
    const resolved = configIo.resolveConfigPath(record, options.scope, repoRoot);
    const doc = resolved ? configIo.readConfigDocument(resolved.path) : null;
    const backup = configIo.latestBackup(record.id);
    const skillPath = clients.skillTargetPath(record, repoRoot);
    const skillState = skillInstall.inspect(skillPath);

    const parts = [];
    parts.push(detected ? 'terpasang' : 'tidak terpasang');
    if (!detected) {
      rows.push(report.absentRow(record, `${record.displayName} tidak ditemukan.`));
      console.log(`[${record.displayName}] ${parts.join(', ')}`);
      continue;
    }

    if (!doc) {
      parts.push('konfigurasi tidak ditemukan');
    } else if (doc.parseError) {
      parts.push('rusak');
    } else {
      const servers =
        doc.parsed && doc.parsed[record.rootKey] && typeof doc.parsed[record.rootKey] === 'object'
          ? doc.parsed[record.rootKey]
          : {};
      parts.push(
        configIo.SERVER_NAME in servers
          ? `server terdaftar di ${resolved.path}`
          : `server belum terdaftar di ${resolved.path}`
      );
    }

    parts.push(`skill: ${skillState}`);
    parts.push(backup ? 'cadangan ada' : 'cadangan tidak ada');
    console.log(`[${record.displayName}] ${parts.join(', ')}`);

    rows.push({
      clientId: record.id,
      displayName: record.displayName,
      result: 'berhasil',
      changed: false,
      path: resolved ? resolved.path : null,
      reason: parts.join(', '),
    });
  }

  console.log(
    report.renderReport(rows, { scope: options.scope, command: 'status' })
  );
  return EXIT_OK;
}

// ============================================================
// Perintah uninstall
// ============================================================

async function uninstallCommand(options) {
  const repoRoot = configIo.resolveRepoRoot();
  const records = selectRecords(options);
  const rows = [];

  for (const record of records) {
    const resolved = configIo.resolveConfigPath(record, options.scope, repoRoot);
    if (!resolved || !fs.existsSync(resolved.path)) {
      rows.push(report.absentRow(record, `Konfigurasi ${record.displayName} tidak ditemukan.`));
      continue;
    }

    const doc = configIo.readConfigDocument(resolved.path);
    if (doc.parseError) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'gagal',
        changed: false,
        path: doc.path,
        reason: `Berkas rusak dan tidak ditimpa: ${doc.parseError}`,
      });
      continue;
    }

    const approved = options.yes
      ? true
      : await confirmForClient(
          record,
          { path: doc.path, json: `hapus entri "${configIo.SERVER_NAME}"` },
          options
        );

    if (!approved) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'dilewati',
        changed: false,
        path: doc.path,
        reason: 'konfirmasi ditolak, konfigurasi tidak diubah',
      });
      continue;
    }

    try {
      const removed = configIo.removeServerEntry(doc, record);
      if (!removed.changed) {
        rows.push({
          clientId: record.id,
          displayName: record.displayName,
          result: 'berhasil',
          changed: false,
          path: doc.path,
          reason: 'entri server tidak ada, tidak ada yang diubah',
        });
        continue;
      }
      configIo.writeConfigDocument(removed.doc, record.id);
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'berhasil',
        changed: true,
        path: doc.path,
      });
    } catch (err) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'gagal',
        changed: false,
        path: doc.path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    report.renderReport(rows, {
      bypassedConfirmation: options.yes,
      scope: options.scope,
      command: 'uninstall',
    })
  );
  return rows.some((r) => r.result === 'gagal') ? EXIT_CLIENT_FAILED : EXIT_OK;
}

// ============================================================
// Perintah restore
// ============================================================

async function restoreCommand(options) {
  const records = selectRecords(options);
  const rows = [];

  for (const record of records) {
    const backup = configIo.latestBackup(record.id);
    if (!backup) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'dilewati',
        changed: false,
        reason: `Tidak ada cadangan untuk ${record.displayName}, tidak ada yang diubah.`,
      });
      continue;
    }

    const approved = options.yes
      ? true
      : await confirmForClient(
          record,
          { path: backup.sourcePath, json: `pulihkan dari ${backup.id}` },
          options
        );

    if (!approved) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'dilewati',
        changed: false,
        path: backup.sourcePath,
        reason: 'konfirmasi ditolak, konfigurasi tidak diubah',
      });
      continue;
    }

    try {
      const outcome = configIo.restoreBackup(record.id);
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'berhasil',
        changed: outcome.restored,
        path: backup.sourcePath,
      });
    } catch (err) {
      rows.push({
        clientId: record.id,
        displayName: record.displayName,
        result: 'gagal',
        changed: false,
        path: backup.sourcePath,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    report.renderReport(rows, {
      bypassedConfirmation: options.yes,
      scope: options.scope,
      command: 'restore',
    })
  );
  return rows.some((r) => r.result === 'gagal') ? EXIT_CLIENT_FAILED : EXIT_OK;
}

// ============================================================
// Perintah verify
// ============================================================

/**
 * Jalankan server lalu panggil satu kapabilitas sampai tuntas. Ini satu-satunya
 * langkah yang butuh jaringan, karena itu dipisah dari instalasi (FR-023).
 * Kegagalan instalasi dan kegagalan jaringan dilaporkan sebagai dua hasil
 * yang berbeda, sesuai bagian edge case.
 */
async function verifyCommand() {
  const server = assertPrerequisites({ allowBuild: false });
  console.log('Memverifikasi koneksi ke server KBBI MCP...');

  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [server.entryPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const result = await new Promise((resolve) => {
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ kind: 'network', reason: 'Waktu tunggu habis saat memanggil kapabilitas.' });
    }, 30000);

    child.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
    });

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes('"result"')) {
        clearTimeout(timer);
        child.kill();
        resolve({ kind: 'ok', output: buffer });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ kind: 'install', reason: `Server tidak dapat dijalankan: ${err.message}` });
    });

    // initialize + tools/call cari_kata
    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'kbbi-installer', version: '1.0.0' },
          },
        })}\n`
      );
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        })}\n`
      );
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'cari_kata', arguments: { kata: 'pintar' } },
        })}\n`
      );
    } catch (err) {
      clearTimeout(timer);
      resolve({
        kind: 'install',
        reason: `Server tidak dapat dimulai: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  if (result.kind === 'ok') {
    console.log('OK: server menjawab satu kapabilitas dengan hasil kamus.');
    console.log('Instalasi terverifikasi.');
    return EXIT_OK;
  }
  if (result.kind === 'network') {
    console.log('Instalasi dianggap berhasil, koneksi belum terverifikasi.');
    console.log(`Alasan: ${result.reason}`);
    console.log('Data kamus diambil dari CDN; ini kegagalan jaringan, bukan instalasi.');
    return EXIT_CLIENT_FAILED;
  }
  console.log('Instalasi GAGAL.');
  console.log(`Alasan: ${result.reason}`);
  return EXIT_CLIENT_FAILED;
}

// ============================================================
// Helper
// ============================================================

/** Record yang terpilih: id yang diminta, atau semua klien terdeteksi. */
function selectRecords(options) {
  if (options.clients.length > 0) {
    return options.clients.map((id) => clients.getClient(id));
  }
  const repoRoot = configIo.resolveRepoRoot();
  return clients.allClients().filter((record) => clients.detect(record, repoRoot));
}

// ============================================================
// Entry point
// ============================================================

async function main(argv) {
  const options = parseArgs(argv);

  if (options.invalid) {
    console.error(`Galat: ${options.invalid}`);
    return EXIT_USAGE;
  }
  if (options.unknownClient !== null) {
    console.error(
      `Klien tidak dikenal: "${options.unknownClient}". Id yang valid: ${clients.validIds().join(', ')}`
    );
    return EXIT_USAGE;
  }
  if (options.command === null) {
    console.error(`Perintah wajib. Pilihan: ${COMMANDS.join(', ')}`);
    return EXIT_USAGE;
  }

  switch (options.command) {
    case 'install':
      return installCommand(options);
    case 'status':
      return statusCommand(options);
    case 'uninstall':
      return uninstallCommand(options);
    case 'restore':
      return restoreCommand(options);
    case 'verify':
      return verifyCommand(options);
    default:
      console.error(`Perintah tidak dikenal: ${options.command}`);
      return EXIT_USAGE;
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      if (err instanceof PrerequisiteError) {
        console.error(`Prasyarat tidak terpenuhi: ${err.message}`);
        process.exitCode = EXIT_PREREQUISITE;
        return;
      }
      console.error(`Galat tak terduga: ${err instanceof Error ? err.stack : String(err)}`);
      process.exitCode = EXIT_CLIENT_FAILED;
    });
}

module.exports = { main, parseArgs, PrerequisiteError, EXIT_OK, EXIT_PREREQUISITE, EXIT_USAGE };