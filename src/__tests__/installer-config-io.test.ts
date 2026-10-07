/**
 * Tes mesin konfigurasi: baca, gabung, cadangan, pulihkan, idempotensi.
 *
 * Semua tes memakai KBBI_CONFIG_ROOT yang diarahkan ke direktori sementara,
 * sehingga konfigurasi klien nyata tidak pernah disentuh dan tidak ada
 * jaringan (Konstitusi Prinsip IV).
 */
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SERVER_NAME,
  readConfigDocument,
  serializeEntry,
  detectOpenCodeShape,
  mergeServerEntry,
  removeServerEntry,
  writeConfigDocument,
  restoreBackup,
  latestBackup,
  resolveConfigPath,
  checksum,
  serializeDocument,
} from "../../scripts/lib/config-io.cjs";
import { getClient } from "../../scripts/lib/clients.cjs";

const REPO_ROOT = path.resolve(process.cwd());

const SERVER = {
  name: SERVER_NAME,
  command: "/abs/path/ke/node",
  args: ["/abs/path/ke/repo/build/index.js"],
  env: {},
};

let tmpRoot: string;
let previousRoot: string | undefined;
let openCodePath: string;

function sha(file: string): string | null {
  return checksum(file);
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * `getClient` mengembalikan null untuk id yang tidak dikenal. Semua tes di
 * berkas ini memakai id yang dijamin ada di registri, jadi>null di sini
 * adalah kegagalan tes, bukan kondisi yang harus ditangani di tiap pemanggilan.
 */
function client(id: string) {
  const found = getClient(id);
  assert.ok(found, `klien ${id} harus dikenal`);
  return found;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kbbi-config-io-"));
  previousRoot = process.env.KBBI_CONFIG_ROOT;
  process.env.KBBI_CONFIG_ROOT = tmpRoot;
  openCodePath = path.join(tmpRoot, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(openCodePath), { recursive: true });
});

afterEach(() => {
  if (previousRoot === undefined) delete process.env.KBBI_CONFIG_ROOT;
  else process.env.KBBI_CONFIG_ROOT = previousRoot;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ============================================================
// Pembacaan
// ============================================================

test("berkas yang tidak ada menghasilkan dokumen dengan exists false", () => {
  const doc = readConfigDocument(openCodePath);
  assert.equal(doc.exists, false);
  assert.equal(doc.raw, null);
  assert.equal(doc.parsed, null);
  assert.equal(doc.parseError, null);
});

test("berkas rusak menghasilkan parseError dan tidak pernah ditulis", () => {
  fs.writeFileSync(openCodePath, "{ ini bukan json valid");
  const doc = readConfigDocument(openCodePath);
  assert.equal(doc.exists, true);
  assert.ok(doc.parseError, "parseError harus terisi");
  assert.throws(() => mergeServerEntry(doc, client("opencode"), SERVER), /tidak bisa diparse/);
  assert.throws(() => writeConfigDocument(doc, "opencode"), /tidak ditulis/);
  // Berkas asli harus utuh byte per byte.
  assert.equal(fs.readFileSync(openCodePath, "utf8"), "{ ini bukan json valid");
});

test("isi JSON yang bukan objek dianggap rusak", () => {
  fs.writeFileSync(openCodePath, "[1, 2, 3]");
  const doc = readConfigDocument(openCodePath);
  assert.ok(doc.parseError);
});

// ============================================================
// Serialisasi per bentuk entri
// ============================================================

test("claude-style menulis command, args, dan env", () => {
  const entry = serializeEntry(client("claude-code"), SERVER);
  assert.deepEqual(entry, { command: SERVER.command, args: SERVER.args, env: {} });
  // deepEqual di atas sudah menyiratkan bentuk claude-style hanya punya tiga
  // kunci, jadi `source` mustahil ada pada nilai ini.
  assert.equal(Object.keys(entry).includes("source"), false);
});

test("zed-style menambahkan source custom, tanpa itu Zed mengabaikannya", () => {
  const entry = serializeEntry(client("zed"), SERVER);
  assert.equal(entry.source, "custom");
  assert.equal(entry.command, SERVER.command);
});

test("opencode-style menulis command sebagai array dan kunci environment", () => {
  const entry = serializeEntry(client("opencode"), SERVER);
  assert.equal(entry.type, "local");
  assert.ok(Array.isArray(entry.command), "command harus array yang memuat executable");
  assert.deepEqual(entry.command, [SERVER.command, SERVER.args[0]]);
  assert.equal(entry.enabled, true);
  assert.ok(entry.environment, "kunci environment harus ada pada OpenCode");
  assert.equal(entry.environment.constructor, Object);
  assert.equal(entry.env, undefined, "kunci env tidak boleh muncul pada OpenCode");
});

test("timeout OpenCode melebihi satu putaran CDN, yaitu lebih dari 5000 ms (FR-033)", () => {
  const entry = serializeEntry(client("opencode"), SERVER);
  assert.ok(entry.timeout, "timeout harus selalu ditulis pada OpenCode");
  assert.ok(entry.timeout > 5000, `timeout ${entry.timeout} harus melebihi batas bawaan 5000 ms`);
});

test("args adalah path absolut dan disimpan sebagai elemen array, bukan string shell", () => {
  const spaced = {
    ...SERVER,
    args: ["C:\\Program Files\\kbbi mcp\\build\\index.js"],
  };
  const entry = serializeEntry(client("claude-code"), spaced);
  const { args } = entry;
  assert.ok(args, "args harus selalu ada pada claude/zed");
  assert.equal(Array.isArray(args), true);
  assert.equal(args.length, 1);
  assert.equal(args[0], spaced.args[0], "path dengan spasi tidak boleh dipecah");
});

// ============================================================
// Deteksi skema OpenCode
// ============================================================

test("deteksi skema OpenCode membedakan v1 dan v2", () => {
  assert.equal(detectOpenCodeShape({ mcp: { a: {} } }), "v1");
  assert.equal(detectOpenCodeShape({ mcp: { servers: { a: {} } } }), "v2");
  assert.equal(detectOpenCodeShape({}), "unknown");
  assert.equal(detectOpenCodeShape(null), "unknown");
});

test("installer menolak menulis ke konfigurasi OpenCode skema v2 (D-003)", () => {
  fs.writeFileSync(
    openCodePath,
    JSON.stringify({ mcp: { servers: { lain: { type: "local" } } } }, null, 2)
  );
  const doc = readConfigDocument(openCodePath);
  assert.throws(
    () => mergeServerEntry(doc, client("opencode"), serializeEntry(client("opencode"), SERVER)),
    /v2/
  );
  // Berkas tidak boleh berubah sama sekali.
  assert.equal(readJson(openCodePath).mcp.servers.lain.type, "local");
  assert.equal(readJson(openCodePath).mcp[SERVER_NAME], undefined);
});

// ============================================================
// Gabung dan idempotensi
// ============================================================

test("menggabungkan entri pada berkas yang belum punya rootKey", () => {
  const doc = readConfigDocument(openCodePath);
  const entry = serializeEntry(client("opencode"), SERVER);
  const merged = mergeServerEntry(doc, client("opencode"), entry);
  assert.equal(merged.changed, true);
  assert.ok(merged.doc.parsed.mcp[SERVER_NAME]);
});

test("entri milik pengguna lain tidak berubah dan tidak hilang (FR-008)", () => {
  fs.writeFileSync(
    openCodePath,
    JSON.stringify(
      { mcp: { "unrelated-tool": { type: "local", command: ["echo"], enabled: true } } },
      null,
      2
    )
  );
  const doc = readConfigDocument(openCodePath);
  const before = readJson(openCodePath).mcp["unrelated-tool"];

  const merged = mergeServerEntry(
    doc,
    client("opencode"),
    serializeEntry(client("opencode"), SERVER)
  );
  configWrite(merged);

  const after = readJson(openCodePath);
  assert.deepEqual(after.mcp["unrelated-tool"], before, "entri lain harus utuh");
  assert.ok(after.mcp[SERVER_NAME], "entri kbbi harus ada");
});

test("entri dengan nama sama diperbarui, bukan diduplikasi (edge case)", () => {
  const record = client("opencode");
  fs.writeFileSync(
    openCodePath,
    JSON.stringify(
      { mcp: { [SERVER_NAME]: { type: "local", command: ["lama"], enabled: true } } },
      null,
      2
    )
  );
  const merged = mergeServerEntry(readConfigDocument(openCodePath), record, serializeEntry(record, SERVER));
  configWrite(merged);

  const mcp = readJson(openCodePath).mcp;
  assert.equal(Object.keys(mcp).filter((k) => k === SERVER_NAME).length, 1, "tidak boleh duplikat");
  assert.deepEqual(mcp[SERVER_NAME].command, [SERVER.command, SERVER.args[0]]);
});

test("gabungan kedua dengan isi identik tidak mengubah berkas (FR-007, SC-003)", () => {
  const record = client("opencode");
  const entry = serializeEntry(record, SERVER);

  const first = mergeServerEntry(readConfigDocument(openCodePath), record, entry);
  configWrite(first);
  const afterFirst = sha(openCodePath);

  const second = mergeServerEntry(readConfigDocument(openCodePath), record, entry);
  assert.equal(second.changed, false, "gabungan kedua harus dilaporkan tidak berubah");
  if (second.changed) configWrite(second);

  assert.equal(sha(openCodePath), afterFirst, "checksum harus identik setelah dua kali install");
});

test("backup diambil sebelum setiap penulisan, termasuk saat hanya mengganti entri", () => {
  const record = client("opencode");
  configWrite(mergeServerEntry(readConfigDocument(openCodePath), record, serializeEntry(record, SERVER)));
  assert.ok(latestBackup("opencode"), "harus ada backup");
  assert.equal(latestBackup("opencode").sourcePath, openCodePath);
});

// ============================================================
// Cadangan dan pemulihan
// ============================================================

test("restore mengembalikan byte asli, bukan hasil serialisasi ulang (SC-007)", () => {
  const record = client("opencode");
  const original =
    '{\n  "mcp": {\n    "lain": {\n      "command": ["echo"]\n    }\n  }\n}';
  fs.writeFileSync(openCodePath, original);
  const before = sha(openCodePath);

  configWrite(mergeServerEntry(readConfigDocument(openCodePath), record, serializeEntry(record, SERVER)));
  assert.notEqual(sha(openCodePath), before, "install harus mengubah berkas");

  restoreBackup("opencode");
  assert.equal(sha(openCodePath), before, "restore harus mengembalikan byte yang sama persis");
  assert.equal(fs.readFileSync(openCodePath, "utf8"), original);
});

test("restore untuk klien tanpa cadangan melaporkan dan tidak mengubah apa pun", () => {
  const record = client("zed");
  const zedPath = path.join(tmpRoot, ".config", "zed", "settings.json");
  fs.mkdirSync(path.dirname(zedPath), { recursive: true });
  fs.writeFileSync(zedPath, "{}\n");
  const before = sha(zedPath);

  const outcome = restoreBackup("zed");
  assert.equal(outcome.restored, false);
  assert.equal(sha(zedPath), before, "tidak boleh ada perubahan");
});

test("cadangan mencatat berkas yang sebelumnya tidak ada (FR-006)", () => {
  const record = client("zed");
  const zedPath = path.join(tmpRoot, ".config", "zed", "settings.json");
  const doc = readConfigDocument(zedPath);
  configWrite(mergeServerEntry(doc, record, serializeEntry(record, SERVER)));

  assert.ok(fs.existsSync(zedPath));
  restoreBackup("zed");
  assert.equal(fs.existsSync(zedPath), false, "restore harus mengembalikan kondisi tanpa berkas");
});

// ============================================================
test("uninstall menghapus hanya entri kbbi (FR-020)", () => {
  const record = client("opencode");
  fs.writeFileSync(
    openCodePath,
    JSON.stringify(
      {
        mcp: {
          [SERVER_NAME]: { type: "local", command: ["x"], enabled: true },
          "tetap": { type: "local", command: ["echo"], enabled: true },
        },
        $schema: "https://opencode.ai/config.json",
      },
      null,
      2
    )
  );
  const removed = removeServerEntry(readConfigDocument(openCodePath), record);
  assert.equal(removed.changed, true);
  configWrite(removed);

  const after = readJson(openCodePath);
  assert.equal(after.mcp[SERVER_NAME], undefined, "entri kbbi harus hilang");
  assert.ok(after.mcp.tetap, "entri lain harus tetap ada");
  assert.equal(after.$schema, "https://opencode.ai/config.json", "kunci lain harus tetap ada");
});

test("uninstall pada konfigurasi tanpa entri kbbi tidak mengubah apa pun", () => {
  fs.writeFileSync(openCodePath, JSON.stringify({ mcp: {} }, null, 2));
  const removed = removeServerEntry(readConfigDocument(openCodePath), client("opencode"));
  assert.equal(removed.changed, false);
});

// ============================================================
// Pemilihan path
// ============================================================

test("path config yang sudah ada menang atas kandidat yang belum ada (D-004)", () => {
  const record = client("antigravity");
  const chosen = resolveConfigPath(record, "global", REPO_ROOT);
  assert.ok(chosen, "lingkup global harus punya kandidat");
  assert.equal(chosen.path, path.join(tmpRoot, ".gemini", "config", "mcp_config.json"));
  assert.equal(chosen.created, true, "belum ada berkas, jadi kandidat pertama yang dipakai");
});

test("Antigravity mengutamakan kandidat yang sudah memuat server (D-004)", () => {
  const record = client("antigravity");
  const alternate = path.join(tmpRoot, ".gemini", "antigravity", "mcp_config.json");
  fs.mkdirSync(path.dirname(alternate), { recursive: true });
  fs.writeFileSync(alternate, JSON.stringify({ mcpServers: { ada: {} } }, null, 2));

  const chosen = resolveConfigPath(record, "global", REPO_ROOT);
  assert.ok(chosen, "lingkup global harus punya kandidat");
  assert.equal(chosen.path, alternate, "kandidat yang sudah berisi server harus dipilih");
  assert.equal(chosen.created, false);
});

test("scope project tidak pernah ditawarkan untuk Antigravity (FR-031, D-005)", () => {
  const chosen = resolveConfigPath(client("antigravity"), "project", REPO_ROOT);
  assert.equal(chosen, null);
});

test("serializeDocument memakai indent dua spasi dan newline akhir", () => {
  const text = serializeDocument({ mcp: { a: 1 } });
  assert.equal(text, '{\n  "mcp": {\n    "a": 1\n  }\n}\n');
});

// ============================================================
// Helper
// ============================================================

/** Tulis dokumen hasil gabung, memakai id klien yang sesuai jalurnya. */
function configWrite(merged: ReturnType<typeof mergeServerEntry>): void {
  writeConfigDocument(merged.doc, merged.doc.path.includes("opencode") ? "opencode" : "zed");
}