import { getWordList } from "./reader.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * In-memory word index for fast prefix searching.
 * Built lazily — only loads letters as they are requested.
 */
class WordIndex {
  private letterCache: Map<string, string[]> = new Map();
  private fullIndex: string[] | null = null;

  /**
   * Load the wordlist for a single letter into cache.
   */
  async loadLetter(letter: string): Promise<string[]> {
    const l = letter.toUpperCase();
    if (this.letterCache.has(l)) {
      return this.letterCache.get(l)!;
    }
    const words = await getWordList(l);
    // Store lowercased and sorted for binary search
    const sorted = words.map((w) => w.toLowerCase()).sort();
    this.letterCache.set(l, sorted);
    return sorted;
  }

  /**
   * Build the full index from all letters.
   * This loads ~1MB of wordlist data into memory.
   */
  async buildFullIndex(): Promise<string[]> {
    if (this.fullIndex !== null) {
      return this.fullIndex;
    }

    const allWords: string[] = [];
    for (const letter of LETTERS) {
      try {
        const words = await this.loadLetter(letter);
        allWords.push(...words);
      } catch {
        // Skip letters that fail to load
      }
    }
    this.fullIndex = allWords.sort();
    return this.fullIndex;
  }

  /**
   * Search for words matching a prefix.
   * Uses binary search for efficiency.
   */
  async searchByPrefix(prefix: string, limit: number = 20): Promise<string[]> {
    const normalizedPrefix = prefix.toLowerCase();

    // If prefix starts with a letter, only search that letter's list
    if (normalizedPrefix.length > 0 && /^[a-z]/.test(normalizedPrefix)) {
      const firstLetter = normalizedPrefix.charAt(0).toUpperCase();
      const words = await this.loadLetter(firstLetter);
      return binaryPrefixSearch(words, normalizedPrefix, limit);
    }

    // Otherwise search the full index
    const fullIndex = await this.buildFullIndex();
    return binaryPrefixSearch(fullIndex, normalizedPrefix, limit);
  }

  /**
   * Get total word count for a letter.
   */
  async getCount(letter: string): Promise<number> {
    const words = await this.loadLetter(letter);
    return words.length;
  }

  /**
   * Get statistics across all letters.
   */
  async getStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    let total = 0;
    for (const letter of LETTERS) {
      try {
        const count = await this.getCount(letter);
        stats[letter] = count;
        total += count;
      } catch {
        stats[letter] = 0;
      }
    }
    stats["TOTAL"] = total;
    return stats;
  }
}

/**
 * Binary search for prefix matches in a sorted array.
 */
function binaryPrefixSearch(
  sortedWords: string[],
  prefix: string,
  limit: number
): string[] {
  if (sortedWords.length === 0) return [];

  // Find the insertion point for the prefix
  let lo = 0;
  let hi = sortedWords.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedWords[mid] < prefix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Collect matches from the insertion point
  const results: string[] = [];
  for (let i = lo; i < sortedWords.length && results.length < limit; i++) {
    if (sortedWords[i].startsWith(prefix)) {
      results.push(sortedWords[i]);
    } else {
      break; // No more matches since array is sorted
    }
  }

  return results;
}

// ============================================================
// Singleton instance
// ============================================================

export const wordIndex = new WordIndex();
