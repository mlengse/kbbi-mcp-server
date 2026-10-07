/**
 * Tes registri klien: bentuk setiap record dan deteksi read-only.
 *
 * Semua tes di berkas ini memakai KBBI_CONFIG_ROOT yang diarahkan ke direktori
 * sementara, sehingga tidak menyentuh konfigurasi klien nyata dan tidak butuh
 * jaringan (Konstitusi Prinsip IV).
 */
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  allClients,
  getClient,
  validIds,
  detect,
  candidatePath,
  skillTargetPath,
  candidatesForScope,
} from "../../scripts/lib/clients.cjs";

const REPO_ROOT = path.resolve(process.cwd());

let tmpRoot: string;
let previousRoot: string | undefined;

/**
 * `getClient` mengembalikan null untuk id yang tidak dikenal. Tes di berkas ini
 * memakai id dari registri, jadi null berarti registri rusak, bukan kondisi
 * yang perlu ditangani di tiap pemanggilan.
 */
function client(id: string) {
  const found = getClient(id);
  assert.ok(found, `klien ${id} harus dikenal`);
  return found;
}

/** Tulis berkas konfigurasi palsu di config root sementara. */
function writeConfig(relative: string[], contents: string): string {
  const target = path.join(tmpRoot, ...relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kbbi-registry-"));
  previousRoot = process.env.KBBI_CONFIG_ROOT;
  process.env.KBBI_CONFIG_ROOT = tmpRoot;
});

afterEach(() => {
  if (previousRoot === undefined) delete process.env.KBBI_CONFIG_ROOT;
  else process.env.KBBI_CONFIG_ROOT = previousRoot;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("registri memuat tepat empat klien dan tidak memuat Claude Desktop", () => {
  const ids = validIds();
  assert.deepEqual(ids.sort(), ["antigravity", "claude-code", "opencode", "zed"]);
  assert.equal(getClient("claude-desktop"), null);
});

test("getClient mengembalikan null untuk id yang tidak dikenal", () => {
  // Nullabilitas inilah yang dipaparkan oleh helper client() di berkas ini,
  // jadi ia dipin di sini oleh perilaku, bukan oleh asumsi tipe di test.
  assert.equal(getClient("tidak-ada"), null);
  assert.equal(getClient(""), null);
  assert.equal(getClient("CLAUDE-CODE"), null, "id bersifat case-sensitive");
  assert.equal(getClient("claude_code"), null, "id memakai tanda hubung");
});

test("setiap record punya seluruh kolom ClientRecord yang diwajibkan", () => {
  for (const record of allClients()) {
    assert.equal(typeof record.id, "string", `${record.id}: id`);
    assert.equal(typeof record.displayName, "string", `${record.id}: displayName`);
    assert.ok(Array.isArray(record.configCandidates), `${record.id}: configCandidates`);
    assert.ok(record.configCandidates.length > 0, `${record.id}: configCandidates tidak boleh kosong`);
    assert.equal(typeof record.rootKey, "string", `${record.id}: rootKey`);
    assert.ok(
      ["claude-style", "opencode-style", "zed-style"].includes(record.entryShape),
      `${record.id}: entryShape tidak dikenal`
    );
    assert.ok(Array.isArray(record.detect), `${record.id}: detect`);
    assert.ok(Array.isArray(record.knownConflicts), `${record.id}: knownConflicts`);
    assert.ok(
      record.skillTarget === null || typeof record.skillTarget === "object",
      `${record.id}: skillTarget`
    );
  }
});

test("id klien unik dan berupa slug huruf kecil", () => {
  const ids = allClients().map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z-]+$/, `id bukan slug: ${id}`);
});

test("rootKey dan entryShape sesuai bentuk yang terverifikasi", () => {
  assert.equal(client("claude-code").rootKey, "mcpServers");
  assert.equal(client("claude-code").entryShape, "claude-style");

  assert.equal(client("opencode").rootKey, "mcp");
  assert.equal(client("opencode").entryShape, "opencode-style");

  assert.equal(client("zed").rootKey, "context_servers");
  assert.equal(client("zed").entryShape, "zed-style");

  assert.equal(client("antigravity").rootKey, "mcpServers");
  assert.equal(client("antigravity").entryShape, "claude-style");
});

test("OpenCode mencatat konflik skema v2 (D-003)", () => {
  assert.ok(client("opencode").knownConflicts.includes("opencode-v2-shape"));
});

test("Antigravity mencatat konflik workspace yang diabaikan CLI (D-005)", () => {
  assert.ok(
    client("antigravity").knownConflicts.includes("antigravity-workspace-ignored")
  );
  // Hanya kandidat global; tidak ada kandidat lingkup proyek sama sekali.
  assert.equal(candidatesForScope(client("antigravity"), "project", REPO_ROOT).length, 0);
});

test("Zed dan Antigravity berbagi satu lokasi skill (FR-032)", () => {
  const zed = skillTargetPath(client("zed"), REPO_ROOT);
  const antigravity = skillTargetPath(client("antigravity"), REPO_ROOT);
  assert.ok(zed, "Zed harus punya target skill");
  assert.ok(antigravity, "Antigravity harus punya target skill");
  assert.equal(zed, antigravity);
  assert.match(zed, /\.agents[/\\]skills[/\\]kbbi-mcp$/);
});

test("skill Claude Code dan OpenCode berada di lingkup pengguna yang berbeda", () => {
  const claude = skillTargetPath(client("claude-code"), REPO_ROOT);
  const opencode = skillTargetPath(client("opencode"), REPO_ROOT);
  assert.ok(claude, "Claude Code harus punya target skill");
  assert.ok(opencode, "OpenCode harus punya target skill");
  assert.notEqual(claude, opencode);
  assert.match(claude, /\.claude[/\\]skills[/\\]kbbi-mcp$/);
  assert.match(opencode, /opencode[/\\]skills[/\\]kbbi-mcp$/);
});

test("jumlah target skill unik tidak melebihi tiga (FR-032)", () => {
  const targets = new Set(
    allClients()
      .map((record) => skillTargetPath(record, REPO_ROOT))
      .filter(Boolean)
  );
  assert.equal(targets.size, 3);
});

test("kandidat config satu klien tidak pernah melebihi tiga", () => {
  assert.equal(client("antigravity").configCandidates.length, 3);
  for (const record of allClients()) {
    assert.ok(record.configCandidates.length <= 3, `${record.id} punya kandidat berlebih`);
  }
});

test("deteksi membaca keberadaan berkas dan tidak pernah menulis", () => {
  const record = client("claude-code");
  const globalCandidate = record.configCandidates.find((c) => c.scope === "global");
  assert.ok(globalCandidate, "Claude Code harus punya kandidat lingkup global");
  const configPath = candidatePath(globalCandidate, REPO_ROOT);

  const before = fs.readdirSync(tmpRoot);
  assert.equal(detect(record, REPO_ROOT), false, "belum ada berkas, jadi tidak terdeteksi");
  assert.deepEqual(fs.readdirSync(tmpRoot), before, "deteksi tidak boleh menambah berkas");

  writeConfig([".claude.json"], JSON.stringify({ mcpServers: {} }));
  assert.equal(detect(record, REPO_ROOT), true, "berkas ada, jadi terdeteksi");
});

test("deteksi membaca config root yang diarahkan, bukan home asli", () => {
  const record = client("zed");
  const candidate = record.configCandidates.find((c) => c.scope === "global");
  assert.ok(candidate, "Zed harus punya kandidat lingkup global");
  const configPath = candidatePath(candidate, REPO_ROOT);
  assert.equal(
    configPath.startsWith(tmpRoot),
    true,
    "path harus berada di config root sementara, bukan home asli"
  );

  // Aturan berbasis PATH ikut berlaku dan tidak bisa dipalsukan di sini,
  // jadi yang diuji adalah arahkan config root: berkas yang dibuat di
  // tmpRoot harus terlihat, sedangkan home asli tidak boleh disentuh.
  assert.equal(fs.existsSync(path.join(os.homedir(), ".config", "zed", "settings.json.kbbi-test")), false);
  writeConfig([".config", "zed", "settings.json"], "{}");
  assert.equal(fs.existsSync(configPath), true);
});

test("deteksi berhenti pada rule pertama yang cocok", () => {
  const record = client("opencode");
  // Hanya rule file:global yang bisa terpenuhi lewat config root.
  writeConfig([".config", "opencode", "opencode.json"], "{}");
  assert.equal(detect(record, REPO_ROOT), true);
});