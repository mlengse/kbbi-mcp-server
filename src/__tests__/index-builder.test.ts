import assert from "node:assert/strict";
import { test } from "node:test";
import { binaryPrefixSearch } from "../data/search-utils.js";
import { WordIndex, wordIndex } from "../data/index-builder.js";

test("binaryPrefixSearch: returns empty array on empty input", () => {
  const result = binaryPrefixSearch([], "pin", 10);
  assert.deepEqual(result, []);
});

test("binaryPrefixSearch: finds prefix matches in sorted array up to limit", () => {
  const words = ["pinang", "pindah", "pingsan", "pinjam", "pintar", "pintu", "pipi"];
  const matches = binaryPrefixSearch(words, "pin", 3);
  assert.deepEqual(matches, ["pinang", "pindah", "pingsan"]);
});

test("binaryPrefixSearch: stops search when prefix no longer matches", () => {
  const words = ["pinang", "pindah", "pisang", "pohon"];
  const matches = binaryPrefixSearch(words, "pin", 10);
  assert.deepEqual(matches, ["pinang", "pindah"]);
});

test("binaryPrefixSearch: returns empty array if no word matches prefix", () => {
  const words = ["padi", "paku", "papan"];
  const matches = binaryPrefixSearch(words, "pin", 10);
  assert.deepEqual(matches, []);
});

test("WordIndex: loadLetter loads, lowercases, sorts, and caches words", async () => {
  const index = new WordIndex();
  const words = await index.loadLetter("a");
  assert.ok(Array.isArray(words));
  assert.ok(words.length > 0);
  for (const w of words) {
    assert.equal(w, w.toLowerCase());
  }

  // Second call returns cached array
  const cachedWords = await index.loadLetter("A");
  assert.strictEqual(words, cachedWords);
});

test("WordIndex: getCount returns letter word count", async () => {
  const index = new WordIndex();
  const countA = await index.getCount("a");
  const wordsA = await index.loadLetter("a");
  assert.equal(countA, wordsA.length);
});

test("WordIndex: searchByPrefix filters by letter list for alphabetic prefixes", async () => {
  const index = new WordIndex();
  const results = await index.searchByPrefix("pin", 5);
  assert.ok(results.length > 0);
  assert.ok(results.length <= 5);
  for (const word of results) {
    assert.ok(word.startsWith("pin"));
  }
});

test("WordIndex: searchByPrefix searches full index for non-alphabetic or empty prefix", async () => {
  const index = new WordIndex();
  const results = await index.searchByPrefix("", 5);
  assert.equal(results.length, 5);
});

test("WordIndex: buildFullIndex caches and returns flattened sorted array", async () => {
  const index = new WordIndex();
  const full1 = await index.buildFullIndex();
  const full2 = await index.buildFullIndex();
  assert.strictEqual(full1, full2);
  assert.ok(full1.length > 0);
});

test("WordIndex: getStats computes statistics across all letters and TOTAL", async () => {
  const index = new WordIndex();
  const stats = await index.getStats();
  assert.ok("A" in stats);
  assert.ok("Z" in stats);
  assert.ok("TOTAL" in stats);
  assert.ok(stats.TOTAL > 0);
});

test("wordIndex singleton instance is exported and functional", async () => {
  assert.ok(wordIndex instanceof WordIndex);
  const results = await wordIndex.searchByPrefix("air", 3);
  assert.ok(results.length > 0);
});
