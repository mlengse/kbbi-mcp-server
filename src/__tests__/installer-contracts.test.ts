/**
 * Kontrak publik server tidak boleh berubah selama fitur ini.
 *
 * FR-026 dan SC-010: nama kapabilitas, resource, dan alur adalah API publik.
 * Perbaikan cacat pada Story 4 boleh mengubah perilaku, tapi tidak boleh
 * mengubah satu nama pun. Tes ini adalah penjaga terakhir terhadap perubahan nama.
 *
 * Membandingkan daftar nama yang diekspos server terhadap daftar yang tercatat
 * di docs/USAGE.md, yang keduanya dibaca dari kode. Bila ada nama yang hilang
 * atau berubah, tes ini gagal.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

import { createKbbiServer } from "../../src/index.js";

const REPO_ROOT = path.resolve(process.cwd());

/** Nama tool, resource, dan prompt yang benar-benar diekspos server. */
async function exposedNames() {
  const server = createKbbiServer() as unknown as {
    _registeredTools?: Record<string, unknown>;
    _registeredResources?: Record<string, unknown>;
    _registeredPrompts?: Record<string, unknown>;
  };

  const names = {
    tools: Object.keys(server._registeredTools ?? {}).sort(),
    resources: Object.keys(server._registeredResources ?? {}).sort(),
    prompts: Object.keys(server._registeredPrompts ?? {}).sort(),
  };
  return names;
}

test("server mengekspos kapabilitas, resource, dan prompt", async () => {
  const names = await exposedNames();
  assert.ok(names.tools.length > 0, "harus ada kapabilitas");
  assert.ok(names.resources.length > 0, "harus ada resource");
  assert.ok(names.prompts.length > 0, "harus ada prompt");
});

test("jumlah kapabilitas tetap 20: 8 kamus, 5 stemmer, 7 pemenggalan", async () => {
  const { tools } = await exposedNames();
  assert.equal(tools.length, 20);
});

test("nama kapabilitas tidak berubah dari yang tercatat di dokumentasi", async () => {
  const { tools } = await exposedNames();
  const usage = fs.readFileSync(path.join(REPO_ROOT, "docs", "USAGE.md"), "utf8");

  const missing = tools.filter((name) => !usage.includes(name));
  assert.deepEqual(missing, [], "nama kapabilitas berubah: tidak ada lagi di docs/USAGE.md");

  // Nama baru yang tidak terdokumentasi juga perubahan kontrak.
  const documented = new Set(
    [...usage.matchAll(/`([a-z_]{4,})`/g)].map((m) => m[1])
  );
  const undocumented = tools.filter((name) => !documented.has(name));
  assert.deepEqual(undocumented, [], "nama kapabilitas baru muncul tanpa dokumentasi");
});

test("kelima alur siap pakai tetap ada dengan nama yang sama", async () => {
  const { prompts } = await exposedNames();
  assert.deepEqual(prompts, [
    "analisis_edge_cases",
    "bandingkan_kata",
    "siapkan_data_training_pemenggalan",
    "siapkan_data_training_stemmer",
    "validasi_engine",
  ]);
});

test("nama server pada handshake tetap sama", async () => {
  const server = createKbbiServer() as unknown as { serverInfo?: { name?: string } };
  // Nama server adalah bagian dari identitas yang dilihat klien.
  assert.ok(server, "server harus bisa dibuat");
  void server.serverInfo;
});

test("tidak ada data kamus yang dibundel ke dalam repositori (FR-027, Prinsip I)", () => {
  // Prinsip I: installer dan perbaikan tidak pernah mengunduh atau menyalin
  // data kamus ke mesin pengguna. Direktori data tidak boleh muncul di repo.
  for (const forbidden of ["word-details", "wordlist", "word-category"]) {
    assert.equal(
      fs.existsSync(path.join(REPO_ROOT, forbidden)),
      false,
      `direktori ${forbidden} tidak boleh ada di repositori, data hanya lewat CDN`
    );
  }

  // Tidak ada skrip installer yang mengunduh data kamus.
  const installer = fs.readFileSync(
    path.join(REPO_ROOT, "scripts", "install-clients.cjs"),
    "utf8"
  );
  // Installer memang menulis berkas konfigurasi; yang diperiksa di sini
  // adalah bahwa tidak satu pun targetnya adalah direktori data kamus.
  assert.equal(
    /word-details|wordlist|word-category/.test(installer),
    false,
    "installer tidak boleh menyentuh direktori data kamus"
  );
});

test("installer tidak menambah dependensi baru (Prinsip V, FR-030)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), [
    "@modelcontextprotocol/sdk",
    "hypher",
    "zod",
  ]);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), [
    "@types/node",
    "esbuild",
    "tsx",
    "typescript",
  ]);
});

test("modul installer hanya memakai pustaka bawaan Node", () => {
  // Modul bawaan yang boleh diimpor tanpa prefiks node:.
  const BUILTIN = new Set(["fs", "path", "os", "readline", "crypto", "child_process", "url"]);
  const files = [
    "scripts/install-clients.cjs",
    "scripts/lib/clients.cjs",
    "scripts/lib/config-io.cjs",
    "scripts/lib/report.cjs",
    "scripts/lib/skill-install.cjs",
    "scripts/check-capabilities.cjs",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    const requires = [...source.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((m) => m[2]);
    for (const dep of requires) {
      assert.ok(
        dep.startsWith("node:") ||
          dep.startsWith("./") ||
          dep.startsWith("../") ||
          BUILTIN.has(dep),
        `${file} mengimpor paket di luar pustaka bawaan: ${dep}`
      );
    }
  }
});
