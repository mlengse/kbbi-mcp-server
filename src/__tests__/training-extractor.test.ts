import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAffixes,
  dotToHyphen,
  extractSyllables,
  classifySyllablePattern,
  extractKataDasar,
} from "../data/training-extractor.js";
import { clearLexiconCache } from "../data/reader.js";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  clearLexiconCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearLexiconCache();
});

test("analyzeAffixes: membantu → prefiks mem, tanpa sufiks", () => {
  assert.deepEqual(analyzeAffixes("membantu", "bantu"), {
    prefiks: "mem",
    sufiks: "",
  });
});

test("analyzeAffixes: kepintaran → prefiks ke + sufiks an", () => {
  assert.deepEqual(analyzeAffixes("kepintaran", "pintar"), {
    prefiks: "ke",
    sufiks: "an",
  });
});

test("analyzeAffixes: menjumlahkan → prefiks men + sufiks kan", () => {
  assert.deepEqual(analyzeAffixes("menjumlahkan", "jumlah"), {
    prefiks: "men",
    sufiks: "kan",
  });
});

test("analyzeAffixes: kata tanpa imbuhan → kosong", () => {
  assert.deepEqual(analyzeAffixes("pintar", "pintar"), {
    prefiks: "",
    sufiks: "",
  });
});

test("dotToHyphen: pin.tar → pin-tar", () => {
  assert.equal(dotToHyphen("pin.tar"), "pin-tar");
});

test("dotToHyphen: mem.ban.tu → mem-ban-tu", () => {
  assert.equal(dotToHyphen("mem.ban.tu"), "mem-ban-tu");
});

test("extractSyllables: memisahkan suku kata", () => {
  assert.deepEqual(extractSyllables("mem.ban.tu"), ["mem", "ban", "tu"]);
});

test("classifySyllablePattern: K/V pattern", () => {
  assert.equal(classifySyllablePattern("pin"), "KVK");
  assert.equal(classifySyllablePattern("tar"), "KVK");
  assert.equal(classifySyllablePattern("a"), "V");
  assert.equal(classifySyllablePattern("ba"), "KV");
  assert.equal(classifySyllablePattern("ai"), "VV");
  assert.equal(classifySyllablePattern("kha"), "KKV");
});

test("extractKataDasar: filters root words by letter (case-insensitive letter parameter)", async () => {
  globalThis.fetch = async () =>
    new Response("abang\nabar\nbantu\nCacing\n", { status: 200 });

  const aWordsLower = await extractKataDasar("a");
  assert.deepEqual(aWordsLower, ["abang", "abar"]);

  clearLexiconCache();
  const aWordsUpper = await extractKataDasar("A");
  assert.deepEqual(aWordsUpper, ["abang", "abar"]);

  clearLexiconCache();
  const bWords = await extractKataDasar("b");
  assert.deepEqual(bWords, ["bantu"]);

  clearLexiconCache();
  const cWords = await extractKataDasar("C");
  assert.deepEqual(cWords, ["Cacing"]);
});

test("extractKataDasar: returns empty array when no matching words exist for a letter", async () => {
  globalThis.fetch = async () =>
    new Response("abang\nabar\nbantu\n", { status: 200 });

  const zWords = await extractKataDasar("Z");
  assert.deepEqual(zWords, []);
});

test("extractKataDasar: returns empty array when root words list is empty", async () => {
  globalThis.fetch = async () => new Response("", { status: 200 });

  const aWords = await extractKataDasar("A");
  assert.deepEqual(aWords, []);
});
