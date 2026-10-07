/**
 * Regresi untuk cacat D-F01: `scripts/verify-accuracy.cjs` pernah membaca
 * direktori `word-details/` yang tidak pernah ada, sehingga melempar ENOENT dan
 * membuat gerbang akurasi Konstitusi tidak bisa dijalankan sama sekali.
 *
 * Tes ini membuktikan bahwa skrip melaporkan angka, bukan melempar galat.
 * Data dibaca melalui reader hybrid, jadi gerbang ini satu-satunya tes di
 * berkas ini yang menyentuh jaringan; ia dipisah dari `npm test` dan dijalankan
 * sebagai bagian dari test:integration.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const REPO_ROOT = path.resolve(process.cwd());
const SCRIPT = path.join(REPO_ROOT, "scripts", "verify-accuracy.cjs");

/** Hasil satu kali jalankan skrip: kode keluar dan seluruh keluarannya. */
interface ScriptResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Jalankan skrip dan tangkap keluarannya. */
function run(): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd: REPO_ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("skrip tidak lagi membaca direktori word-details lokal (D-008, Prinsip I dan II)", () => {
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.equal(
    source.includes("WORD_DETAILS_DIR"),
    false,
    "konstanta WORD_DETAILS_DIR harus dihapus"
  );
  assert.equal(
    source.includes("readdirSync(WORD_DETAILS"),
    false,
    "tidak boleh ada pembacaan direktori word-details"
  );
  // Konstitusi Prinsip II: seluruh akses data lewat reader.
  assert.ok(
    source.includes("getHyphenationDict"),
    "data harus diambil dari reader hybrid, bukan dari sistem berkas"
  );
});

test("skrip memberi pesan yang jelas saat build belum tersedia", async () => {
  // Tidak menjalankan skrip sungguhan di sini; cukup pastikan pesan prasyarat
  // ada, supaya kegagalan build tidak muncul sebagai galat yang membingungkan.
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.ok(source.includes("npm run build"), "pesan prasyarat harus menyebut langkah build");
  assert.ok(source.includes("BUILT_READER"), "skrip harus memeriksa keberadaan reader hasil build");
});

test("skrip melaporkan angka akurasi alih-alih melempar ENOENT (FR-025)", async (t) => {
  if (!fs.existsSync(path.join(REPO_ROOT, "build", "data", "reader.js"))) {
    t.skip("build belum tersedia, jalankan npm run build lebih dulu");
    return;
  }

  const result = await run();
  assert.equal(result.code, 0, `skrip harus keluar dengan kode 0. stderr: ${result.stderr}`);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /ENOENT/,
    "tidak boleh ada galat ENOENT dari direktori yang tidak ada"
  );
  assert.match(result.stdout, /Akurasi\s+:\s+[\d.]+%/);
  assert.match(result.stdout, /Total kata diuji\s+:\s+\d+/);
  assert.match(result.stdout, /Gate akurasi terpenuhi/);
});

test("angka akurasi bukan nol absolut, artinya data benar-benar terbaca", async (t) => {
  if (!fs.existsSync(path.join(REPO_ROOT, "build", "data", "reader.js"))) {
    t.skip("build belum tersedia");
    return;
  }

  const result = await run();
  const total = result.stdout.match(/Total kata diuji\s+:\s+(\d+)/);
  assert.ok(total, "harus melaporkan jumlah kata yang diuji");
  assert.ok(
    Number(total[1]) > 1000,
    `hanya ${total[1]} kata terbaca, berarti sumber datanya belum benar`
  );
});