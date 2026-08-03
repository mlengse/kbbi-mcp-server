import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  extractStemMappings,
  extractKataDasar,
  extractHyphenationDic,
  computeSyllableStats,
} from "../data/training-extractor.js";

const LEXICON_DIR = join(process.cwd(), "lexicon");
const HYPHEN_DIR = join(process.cwd(), "hyphenation");

const DERIVED_TO_ROOT = {
  abangan: "abang",
  abaran: "abar",
  membantu: "bantu",
};
const DERIVED_TO_ROOT_WITH_KELAS = {
  abangan: { kataDasar: "abang", kelasKata: ["n"] },
  abaran: { kataDasar: "abar", kelasKata: [] },
  membantu: { kataDasar: "bantu", kelasKata: ["v"] },
};
const HYPHENATION_DICT = {
  abangan: "a.ba.ngan",
  abaran: "a.ba.ran",
  membantu: "mem.ban.tu",
};

before(async () => {
  await mkdir(LEXICON_DIR, { recursive: true });
  await mkdir(HYPHEN_DIR, { recursive: true });
  await writeFile(
    join(LEXICON_DIR, "derived_to_root.json"),
    JSON.stringify(DERIVED_TO_ROOT),
    "utf-8"
  );
  await writeFile(
    join(LEXICON_DIR, "derived_to_root_with_kelas.json"),
    JSON.stringify(DERIVED_TO_ROOT_WITH_KELAS),
    "utf-8"
  );
  await writeFile(
    join(HYPHEN_DIR, "kbbi_vi_hyphenation_dict.json"),
    JSON.stringify(HYPHENATION_DICT),
    "utf-8"
  );
  await writeFile(join(LEXICON_DIR, "root_words.txt"), "abang\nabar\nbantu\n", "utf-8");
  globalThis.fetch = async () => {
    throw new Error("fetch tidak boleh dipanggil — fixture lokal harus lengkap");
  };
});

after(async () => {
  await rm(LEXICON_DIR, { recursive: true, force: true });
  await rm(HYPHEN_DIR, { recursive: true, force: true });
});

test("extractStemMappings: filter per huruf + isi pemenggalan", async () => {
  const a = await extractStemMappings("A");
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], {
    kata: "abangan",
    kataDasar: "abang",
    pemenggalan: "a.ba.ngan",
    kelasKata: ["n"],
  });
  assert.equal(a[1].kata, "abaran");
  assert.deepEqual(a[1].kelasKata, []);

  const m = await extractStemMappings("m");
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], {
    kata: "membantu",
    kataDasar: "bantu",
    pemenggalan: "mem.ban.tu",
    kelasKata: ["v"],
  });
});

test("extractKataDasar: filter per huruf dari root_words.txt", async () => {
  assert.deepEqual(await extractKataDasar("A"), ["abang", "abar"]);
  assert.deepEqual(await extractKataDasar("B"), ["bantu"]);
  assert.deepEqual(await extractKataDasar("X"), []);
});

test("extractHyphenationDic: entry + dicFormat (dot → hyphen)", async () => {
  const entries = await extractHyphenationDic("A");
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    kata: "abangan",
    pemenggalan: "a.ba.ngan",
    dicFormat: "a-ba-ngan",
  });
});

test("computeSyllableStats: hitung kata, suku kata, pola", async () => {
  const stats = await computeSyllableStats("A");
  assert.equal(stats.huruf, "A");
  assert.equal(stats.totalKata, 2);
  assert.equal(stats.totalSukuKata, 6);
  assert.deepEqual(stats.patterns, { V: 2, KV: 2, KVK: 1, KKVK: 1 });
});
