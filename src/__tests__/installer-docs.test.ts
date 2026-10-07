/**
 * Tes cakupan dokumentasi terhadap kode yang benar-benar diekspos server.
 *
 * Yang diuji adalah dua arah sekaligus, karena kedua jenis melenceng sama-sama
 * menyesatkan pembaca:
 *   1. kapabilitas yang ada di server tapi tidak ada di panduan
 *   2. entri panduan yang menyebut kapabilitas yang tidak ada di server
 *
 * Ini realisation dari SC-006. D-009 juga berlaku: berkas prosa Indonesia diperiksa
 * untuk karakter non-Latin, karena gangguan seperti itu tidak terlihat oleh
 * pembaca biasa tapi tetap dikirim ke pengguna.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  extractTools,
  extractWorkflows,
  checkDrift,
  scanNonLatin,
} from "../../scripts/check-capabilities.cjs";

const REPO_ROOT = path.resolve(process.cwd());
const USAGE = path.join(REPO_ROOT, "docs", "USAGE.md");
const REFERENCE = path.join(REPO_ROOT, "docs", "capabilities-reference.md");

const tools = extractTools();
const workflows = extractWorkflows();

test("ekstraktor membaca seluruh kapabilitas yang mendaftarkan diri", () => {
  assert.ok(tools.length > 0, "harus ada kapabilitas");
  for (const tool of tools) {
    assert.match(tool.name, /^[a-z_]+$/, `nama kapabilitas bukan snake_case: ${tool.name}`);
    assert.ok(tool.description.length > 0, `${tool.name} tidak punya deskripsi`);
  }
});

test("jumlah kapabilitas per keluarga sesuai hasil hitung di kode", () => {
  const byFamily: Record<string, number> = {};
  for (const tool of tools) byFamily[tool.family] = (byFamily[tool.family] ?? 0) + 1;
  // Angka ini berasal dari kode, bukan dari dokumen spesifikasi.
  assert.equal(byFamily.kamus, 8);
  assert.equal(byFamily.stemmer, 5);
  assert.equal(byFamily.pemenggalan, 7);
  assert.equal(tools.length, 20);
});

test("ekstraktor membaca kelima alur siap pakai", () => {
  assert.equal(workflows.length, 5);
});

test("kedua berkas panduan memuat seluruh kapabilitas, tidak ada yang terlewat", () => {
  const usage = fs.readFileSync(USAGE, "utf8");
  const reference = fs.readFileSync(REFERENCE, "utf8");
  const missingUsage = tools.filter((t) => !usage.includes(t.name)).map((t) => t.name);
  const missingReference = tools.filter((t) => !reference.includes(t.name)).map((t) => t.name);
  assert.deepEqual(missingUsage, [], "kapabilitas ada di server tapi tidak di docs/USAGE.md");
  assert.deepEqual(missingReference, [], "kapabilitas ada di server tapi tidak di docs/capabilities-reference.md");
});

test("kedua berkas panduan memuat kelima alur", () => {
  const usage = fs.readFileSync(USAGE, "utf8");
  const reference = fs.readFileSync(REFERENCE, "utf8");
  for (const name of workflows) {
    assert.ok(usage.includes(name), `alur ${name} tidak ada di docs/USAGE.md`);
    assert.ok(reference.includes(name), `alur ${name} tidak ada di docs/capabilities-reference.md`);
  }
});

test("tidak ada entri panduan yang menyebut kapabilitas fiktif (FR-013)", () => {
  const drift = checkDrift(tools, workflows);
  assert.deepEqual(drift.missingInGuides, [], "kapabilitas ada di server tapi tidak di panduan");
  assert.deepEqual(drift.missingWorkflows, [], "alur ada di server tapi tidak di panduan");
  assert.deepEqual(drift.phantomInGuides, [], "panduan menyebut kapabilitas yang tidak ada di server");
});

test("panduan menyebut nama kapabilitas apa adanya, tanpa mengubah atau mengganti nama (FR-026)", () => {
  const usage = fs.readFileSync(USAGE, "utf8");
  // Nama server memakai garis bawah; nama yang ditulis ulang dengan spasi
  // atau bentuk lain di panduan berarti kontrak publik berubah.
  const rewritten = tools
    .map((t) => t.name.replace(/_/g, " "))
    .filter((spaced) => !usage.includes(spaced.replace(/ /g, "_")))
    .filter((spaced) => usage.includes(spaced));
  assert.deepEqual(rewritten, [], "nama kapabilitas ditulis ulang di panduan");
});

test("referensi yang dibangkitkan menyebut jumlah yang benar", () => {
  const reference = fs.readFileSync(REFERENCE, "utf8");
  assert.ok(
    reference.includes(`Jumlah kapabilitas: **${tools.length}**`),
    "jumlah kapabilitas pada referensi harus cocok dengan kode"
  );
  assert.ok(
    reference.includes(`Jumlah alur siap pakai: **${workflows.length}**`),
    "jumlah alur pada referensi harus cocok dengan kode"
  );
});

test("berkas prosa Indonesia bebas karakter non-Latin (D-009)", () => {
  const offenders = scanNonLatin([
    "docs/INSTALL.md",
    "docs/USAGE.md",
    "docs/capabilities-reference.md",
    "docs/DEFECTS.md",
    ".agents/skills/kbbi-mcp/SKILL.md",
    ".agents/skills/kbbi-mcp/references/capabilities.md",
  ]);
  assert.deepEqual(
    offenders,
    [],
    `karakter asing ditemukan: ${offenders.map((o) => `${o.file}: ${o.chars}`).join(", ")}`
  );
});

test("dokumentasi instalasi menyebut keempat klien (FR-011)", () => {
  const install = fs.readFileSync(path.join(REPO_ROOT, "docs", "INSTALL.md"), "utf8");
  for (const client of ["Claude Code", "OpenCode", "Zed", "Antigravity"]) {
    assert.ok(install.includes(client), `docs/INSTALL.md tidak menyebut ${client}`);
  }
  // Claude Desktop dikeluarkan dari cakupan pada 2026-10-07 per D-007.
  assert.equal(
    install.includes("Claude Desktop"),
    false,
    "Claude Desktop tidak boleh muncul sebagai klien yang didukung"
  );
});

test("dokumentasi instalasi menyebutkan pemulihannya setiap klien (FR-012)", () => {
  const install = fs.readFileSync(path.join(REPO_ROOT, "docs", "INSTALL.md"), "utf8");
  for (const command of ["restore --client claude-code", "restore --client opencode", "restore --client zed", "restore --client antigravity"]) {
    assert.ok(install.includes(command), `docs/INSTALL.md tidak memuat perintah ${command}`);
  }
  assert.ok(install.includes("verify"), "harus ada langkah verifikasi koneksi");
});