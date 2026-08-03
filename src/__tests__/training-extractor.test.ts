import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAffixes,
  dotToHyphen,
  extractSyllables,
  classifySyllablePattern,
} from "../data/training-extractor.js";

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
