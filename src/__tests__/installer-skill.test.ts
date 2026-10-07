/**
 * Tes penempatan dan peningkatan paket skill.
 *
 * Kontrak: contracts/skill-package.md. Frasa yang diuji di sini adalah aturan
 * yang paling mudah dilanggar tanpa disadari: skill upgrades dengan
 * mengganti direktori, bukan menggabungkannya, dan jumlah target tidak
 * pernah melebihi tiga.
 */
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SKILL_NAME,
  skillSource,
  skillVersion,
  inspect,
  compare,
  resolveTargets,
  install,
  uninstall,
} from "../../scripts/lib/skill-install.cjs";
import { allClients, skillTargetPath } from "../../scripts/lib/clients.cjs";

const REPO_ROOT = path.resolve(process.cwd());

let tmpRoot: string;
let previousRoot: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kbbi-skill-"));
  previousRoot = process.env.KBBI_CONFIG_ROOT;
  process.env.KBBI_CONFIG_ROOT = tmpRoot;
});

afterEach(() => {
  if (previousRoot === undefined) delete process.env.KBBI_CONFIG_ROOT;
  else process.env.KBBI_CONFIG_ROOT = previousRoot;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ============================================================
// Sumber paket skill
// ============================================================

test("sumber skill berada di dalam repositori pada lokasi yang dishared", () => {
  const source = skillSource(REPO_ROOT);
  assert.equal(source, path.join(REPO_ROOT, ".agents", "skills", SKILL_NAME));
  assert.equal(fs.existsSync(path.join(source, "SKILL.md")), true);
});

test("frontmatter skill memuat name dan description yang diwajibkan", () => {
  const text = fs.readFileSync(path.join(skillSource(REPO_ROOT), "SKILL.md"), "utf8");
  assert.match(text, /^name:\s*kbbi-mcp\s*$/m, "name harus sama dengan nama direktori");
  assert.match(text, /^description:\s*\S/m, "description wajib ada");
});

test("batas panjang skill dipatuhi: description di bawah 1024 karakter dan body di bawah 500 baris", () => {
  const text = fs.readFileSync(path.join(skillSource(REPO_ROOT), "SKILL.md"), "utf8");
  const description = text.match(/^description:\s*(.*)$/m)?.[1];
  assert.ok(description, "frontmatter harus memuat description");
  assert.ok(
    description.length < 1024,
    `description ${description.length} karakter, batasnya 1024`
  );
  const body = text.slice(text.indexOf("---", 3) + 3);
  const lines = body.split("\n").length;
  assert.ok(lines < 500, `body ${lines} baris, batasnya 500`);
});

test("referensi kapabilitas ada sebagai berkas terpisah dari body skill", () => {
  const source = skillSource(REPO_ROOT);
  assert.equal(fs.existsSync(path.join(source, "references", "capabilities.md")), true);
});

test("versi skill terbaca dari frontmatter", () => {
  const version = skillVersion(skillSource(REPO_ROOT));
  assert.ok(version, "versi harus terbaca dari frontmatter");
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

// ============================================================
// Target
// ============================================================

test("Zed dan Antigravity menghasilkan satu target, bukan dua", () => {
  const records = allClients().filter((c) => c.id === "zed" || c.id === "antigravity");
  const targets = resolveTargets(records, REPO_ROOT);
  assert.equal(targets.length, 1, "satu direktori untuk dua klien");
  assert.deepEqual(targets[0].clients.sort(), ["antigravity", "zed"]);
});

test("jumlah target unik untuk keempat klien tepat tiga (FR-032)", () => {
  const targets = resolveTargets(allClients(), REPO_ROOT);
  assert.equal(targets.length, 3);
});

test("skill proyek ditulis ke dalam repositori, bukan ke home", () => {
  const target = skillTargetPath(
    allClients().find((c) => c.id === "zed"),
    REPO_ROOT
  );
  assert.ok(target, "Zed harus punya target skill");
  assert.match(target, /^\.agents|agents/);
  assert.equal(target.includes(tmpRoot), false, "skill proyek bukan milik config root sementara");
});

// ============================================================
// Status per target
// ============================================================

/** Buat direktori skill palsu dengan isi yang ditentukan. */
function makeSkill(dir: string, body = "placeholder", name: string = SKILL_NAME): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`);
}

test("target yang belum ada berstatus absent lalu new", () => {
  const target = path.join(tmpRoot, "skill-target");
  assert.equal(inspect(target), "absent");
  assert.equal(compare(target, skillSource(REPO_ROOT)), "new");
});

test("skill dengan nama sama namun isi berbeda berstatus outdated", () => {
  const target = path.join(tmpRoot, "skill-target");
  makeSkill(target, "isi");
  assert.equal(inspect(target), "installed", "nama sama, jadi bukan konflik");
  assert.equal(compare(target, skillSource(REPO_ROOT)), "outdated", "isi berbeda dari sumber");
});

test("direktori dengan nama skill lain adalah konflik, bukan 대상 penimpaan (FR-018)", () => {
  const target = path.join(tmpRoot, "skill-target");
  makeSkill(target, "milik skill lain", "skill-lain");
  assert.equal(inspect(target), "conflict");
  assert.equal(compare(target, skillSource(REPO_ROOT)), "conflict");
  assert.throws(() => install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT }), /Konflik skill/);
});

test("install ke direktori yang sudah berisi skill lain tidak menimpa apa pun", () => {
  const target = path.join(tmpRoot, "skill-target");
  makeSkill(target, "milik skill lain", "skill-lain");
  const before = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
  try {
    install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });
    assert.fail("konflik harus melempar galat, bukan diam-diam ditimpa");
  } catch (err) {
    assert.match((err as Error).message, /Konflik skill/);
  }
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), before);
});

// ============================================================
// Peningkatan
// ============================================================

test("install ke direktori kosong menyalin seluruh isi paket (FR-017)", () => {
  const target = path.join(tmpRoot, "skill-target");
  const outcome = install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });

  assert.equal(outcome.state, "new");
  assert.equal(fs.existsSync(path.join(target, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(target, "references", "capabilities.md")), true);
});

test("install kedua pada paket yang sama dilaporkan current dan tidak mengubah berkas", () => {
  const target = path.join(tmpRoot, "skill-target");
  install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });
  const before = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");

  const second = install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });
  assert.equal(second.state, "current");
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), before);
});

test("peningkatan mengganti direktori, bukan menggabungkannya (FR-018)", () => {
  const target = path.join(tmpRoot, "skill-target");
  makeSkill(target, "isi versi lama");

  const outcome = install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });
  assert.equal(outcome.state, "outdated");

  // Baris dari versi lama tidak boleh tersisa, karena hasil gabung akan
  // membuat skill yang bertentangan dengan dirinya sendiri.
  const installed = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
  assert.equal(installed.includes("isi versi lama"), false, "isi lama harus hilang sepenuhnya");
});

test("uninstall menghapus direktori skill", () => {
  const target = path.join(tmpRoot, "skill-target");
  install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });
  assert.equal(fs.existsSync(target), true);

  assert.equal(uninstall({ path: target, label: "uji", clients: [] }).removed, true);
  assert.equal(fs.existsSync(target), false);
});

test("uninstall menerima path berupa string, sama seperti bentuk objeknya", () => {
  const target = path.join(tmpRoot, "skill-target");
  install({ path: target, label: "uji", clients: [] }, { repoRoot: REPO_ROOT });

  assert.equal(uninstall(target).removed, true);
  assert.equal(fs.existsSync(target), false);
  assert.equal(uninstall(target).removed, false, "hapus yang tidak ada berarti tidak ada yang diubah");
});