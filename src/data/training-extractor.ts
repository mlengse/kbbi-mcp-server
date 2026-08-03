import {
  getRootWords,
  getDerivedToRoot,
  getDerivedToRootWithKelas,
  getHyphenationDict,
} from "./reader.js";
import type {
  StemMapping,
  HyphenationEntry,
  ImbuhanAnalysis,
  SyllablePatternStats,
  WordDetail,
} from "./types.js";

// ============================================================
// Common Indonesian Prefixes and Suffixes
// ============================================================

const PREFIXES = [
  // Active prefixes (nasalized)
  "memper", "mempel",
  "menge", "meng", "meny", "men", "mem", "me",
  "diper",
  "penge", "peng", "peny", "pen", "pem", "pe",
  "ber", "be",
  "ter", "te",
  "per",
  "di",
  "ke",
  "se",
  // Serapan/khusus
  "non", "swa", "pra", "tuna", "maha", "adi", "anti", "pasca",
];

const SUFFIXES = [
  "kan", "an", "i",
  "lah", "kah", "tah", "pun", "nya",
];

// ============================================================
// Affix Analysis
// ============================================================

/**
 * Analyze the affixes of a word by comparing it with its root word.
 * This is a heuristic analysis — not a full morphological parser.
 */
export function analyzeAffixes(
  kata: string,
  kataDasar: string
): { prefiks: string; sufiks: string } {
  const lower = kata.toLowerCase();
  const root = kataDasar.toLowerCase();

  let prefiks = "";
  let sufiks = "";

  // Try to detect suffix first
  for (const suf of SUFFIXES) {
    if (lower.endsWith(suf) && !root.endsWith(suf)) {
      sufiks = suf;
      break;
    }
  }

  // Remove detected suffix for prefix detection
  const withoutSuffix = sufiks
    ? lower.slice(0, lower.length - sufiks.length)
    : lower;

  // Try to detect prefix
  for (const pref of PREFIXES) {
    if (withoutSuffix.startsWith(pref)) {
      // Verify: after removing prefix, what remains should relate to the root
      const remainder = withoutSuffix.slice(pref.length);
      if (
        root.startsWith(remainder) ||
        remainder.length >= 2
      ) {
        prefiks = pref;
        break;
      }
    }
  }

  return { prefiks, sufiks };
}

// ============================================================
// Pemenggalan (Syllabification) Helpers
// ============================================================

/**
 * Convert dot-format syllabification to hyphen-format (.dic format).
 * "pin.tar" → "pin-tar"
 * "mem.ban.tu" → "mem-ban-tu"
 */
export function dotToHyphen(nama: string): string {
  return nama.replace(/\./g, "-");
}

/**
 * Extract syllables from the nama field.
 * "pin.tar" → ["pin", "tar"]
 */
export function extractSyllables(nama: string): string[] {
  return nama.split(".").map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Classify a syllable pattern (V, KV, KVK, VK, etc).
 * K = consonant, V = vowel
 */
export function classifySyllablePattern(syllable: string): string {
  const vowels = new Set(["a", "e", "i", "o", "u"]);
  return syllable
    .toLowerCase()
    .split("")
    .map((ch) => (vowels.has(ch) ? "V" : "K"))
    .join("");
}

// ============================================================
// Batch Extraction Functions (via pre-computed flat files)
// ============================================================

/**
 * Extract stem mappings for all words of a given letter.
 * Reads derived_to_root.json + kbbi_vi_hyphenation_dict.json
 * (+ derived_to_root_with_kelas.json untuk kelasKata).
 * (1-2 HTTP requests vs. thousands).
 */
export async function extractStemMappings(
  letter: string
): Promise<StemMapping[]> {
  const l = letter.toUpperCase();
  const [derivedToRoot, hyphenation, derivedToRootWithKelas] = await Promise.all(
    [
      getDerivedToRoot(),
      getHyphenationDict(),
      // Backward compatible: bila file tidak ada, lewati kelasKata.
      getDerivedToRootWithKelas().catch(() => null),
    ]
  );

  const mappings: StemMapping[] = [];
  for (const [kata, kataDasar] of Object.entries(derivedToRoot)) {
    if (kata.charAt(0).toUpperCase() !== l) continue;
    mappings.push({
      kata,
      kataDasar,
      pemenggalan: hyphenation[kata] || "",
      kelasKata: derivedToRootWithKelas?.[kata]?.kelasKata,
    });
  }
  return mappings;
}

/**
 * Extract hyphenation entries for all words of a given letter.
 * Reads kbbi_vi_hyphenation_dict.json directly.
 */
export async function extractHyphenationDic(
  letter: string
): Promise<HyphenationEntry[]> {
  const l = letter.toUpperCase();
  const hyphenation = await getHyphenationDict();

  const entries: HyphenationEntry[] = [];
  for (const [kata, pemenggalan] of Object.entries(hyphenation)) {
    if (kata.charAt(0).toUpperCase() !== l) continue;
    entries.push({
      kata,
      pemenggalan,
      dicFormat: dotToHyphen(pemenggalan),
    });
  }
  return entries;
}

/**
 * Extract base words (kata dasar) for a given letter.
 * Reads lexicon/root_words.txt.
 */
export async function extractKataDasar(letter: string): Promise<string[]> {
  const l = letter.toUpperCase();
  const rootWords = await getRootWords();
  return rootWords.filter((w) => w.charAt(0).toUpperCase() === l);
}

/**
 * Compute syllable pattern statistics for a given letter.
 * Reads kbbi_vi_hyphenation_dict.json, computes stats from dot-format.
 */
export async function computeSyllableStats(
  letter: string
): Promise<SyllablePatternStats> {
  const l = letter.toUpperCase();
  const hyphenation = await getHyphenationDict();

  const patterns: Record<string, number> = {};
  let totalKata = 0;
  let totalSukuKata = 0;

  for (const [kata, pemenggalan] of Object.entries(hyphenation)) {
    if (kata.charAt(0).toUpperCase() !== l) continue;
    const syllables = extractSyllables(pemenggalan);
    if (syllables.length === 0) continue;

    totalKata++;
    totalSukuKata += syllables.length;
    for (const syl of syllables) {
      const pattern = classifySyllablePattern(syl);
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    }
  }

  return {
    huruf: l,
    totalKata,
    totalSukuKata,
    patterns,
  };
}

/**
 * Analyze affixes for a single word detail.
 */
export function analyzeWordAffixes(detail: WordDetail): ImbuhanAnalysis | null {
  for (const entry of detail.entries) {
    if (entry.rootWord) {
      const { prefiks, sufiks } = analyzeAffixes(detail.word, entry.rootWord);
      return {
        kata: detail.word,
        kataDasar: entry.rootWord,
        prefiks,
        sufiks,
        pemenggalan: entry.nama,
      };
    }
  }
  return null;
}
