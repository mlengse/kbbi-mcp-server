import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readTextHybrid,
  getRootWords,
  getDerivedToRoot,
  getBidangSubjek,
  clearLexiconCache,
} from "../data/reader.js";

const FIXTURE_DIR = join(process.cwd(), "lexicon");
const FIXTURE_FILE = join(FIXTURE_DIR, "root_words.txt");

const CATEGORY_DIR = join(process.cwd(), "word-category");
const BIDANG_FILE = join(CATEGORY_DIR, "bidang-subjek.json");

afterEach(async () => {
  delete process.env.KBBI_CDN_BASE;
  clearLexiconCache();
  await rm(FIXTURE_DIR, { recursive: true, force: true });
  await rm(CATEGORY_DIR, { recursive: true, force: true });
});

test("readTextHybrid: CDN primary OK → satu request, tanpa fallback", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response("pintar\nbantu\n", { status: 200 });
  };

  const text = await readTextHybrid("lexicon/root_words.txt");
  assert.equal(text, "pintar\nbantu\n");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("@main"));
});

test("readTextHybrid: primary 404 → fallback ke @data-v4", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("@main")) return new Response("", { status: 404 });
    return new Response("pintar\n", { status: 200 });
  };

  const text = await readTextHybrid("lexicon/root_words.txt");
  assert.equal(text, "pintar\n");
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes("@main"));
  assert.ok(calls[1].includes("@data-v4"));
});

test("readTextHybrid: env override KBBI_CDN_BASE dipakai sebagai primary", async () => {
  process.env.KBBI_CDN_BASE = "https://example.invalid/repo@bogus";
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("@bogus")) return new Response("", { status: 404 });
    return new Response("bantu\n", { status: 200 });
  };

  const text = await readTextHybrid("lexicon/root_words.txt");
  assert.equal(text, "bantu\n");
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes("@bogus"));
  assert.ok(calls[1].includes("@data-v4"));
});

test("readTextHybrid: primary & fallback 404 → throw", async () => {
  globalThis.fetch = async () => new Response("", { status: 404 });
  await assert.rejects(() => readTextHybrid("lexicon/root_words.txt"), /CDN fetch failed/);
});

test("getRootWords: lokal-first — tidak memanggil CDN", async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(FIXTURE_FILE, "pintar\nbantu\n", "utf-8");
  globalThis.fetch = async () => {
    throw new Error("fetch tidak boleh dipanggil saat file lokal ada");
  };

  const roots = await getRootWords();
  assert.deepEqual(roots, ["pintar", "bantu"]);
});

test("getDerivedToRoot: baca JSON dari CDN", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ abangan: "abang", acap: "acap" }), {
      status: 200,
    });

  const map = await getDerivedToRoot();
  assert.equal(map.abangan, "abang");
  assert.equal(map.acap, "acap");
});

test("getBidangSubjek: lokal-first — membaca dari file lokal jika ada", async () => {
  await mkdir(CATEGORY_DIR, { recursive: true });
  const mockData = {
    meta: { description: "Test Bidang", last_updated: "2025-01-01" },
    subject_domains: [{ kode: "Kom", nama: "Komputer" }],
  };
  await writeFile(BIDANG_FILE, JSON.stringify(mockData), "utf-8");

  globalThis.fetch = async () => {
    throw new Error("fetch tidak boleh dipanggil saat file lokal ada");
  };

  const result = await getBidangSubjek();
  assert.deepEqual(result, mockData);
});

test("getBidangSubjek: CDN fallback — membaca dari CDN jika file lokal tidak ada", async () => {
  const mockData = {
    meta: { description: "CDN Bidang", last_updated: "2025-01-01" },
    subject_domains: [{ kode: "Bio", nama: "Biologi" }],
  };

  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify(mockData), { status: 200 });
  };

  const result = await getBidangSubjek();
  assert.deepEqual(result, mockData);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("word-category/bidang-subjek.json"));
});

test("getBidangSubjek: gagal saat file lokal dan CDN keduanya tidak tersedia", async () => {
  globalThis.fetch = async () => new Response("", { status: 404 });
  await assert.rejects(() => getBidangSubjek(), /CDN fetch failed/);
});
