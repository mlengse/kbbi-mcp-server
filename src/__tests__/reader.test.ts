import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readTextHybrid,
  getRootWords,
  getDerivedToRoot,
} from "../data/reader.js";

const FIXTURE_DIR = join(process.cwd(), "lexicon");
const FIXTURE_FILE = join(FIXTURE_DIR, "root_words.txt");

afterEach(async () => {
  delete process.env.KBBI_CDN_BASE;
  await rm(FIXTURE_DIR, { recursive: true, force: true });
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
