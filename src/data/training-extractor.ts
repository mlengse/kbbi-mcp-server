import { listWordFiles, getWordDetail } from "./reader.js";
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
// Batch Extraction Functions
// ============================================================

/**
 * Extract stem mappings for all words of a given letter.
 * Only includes words that have a rootWord field.
 */
export async function extractStemMappings(
  letter: string
): Promise<StemMapping[]> {
  const words = await listWordFiles(letter);
  const mappings: StemMapping[] = [];

  for (const word of words) {
    try {
      const detail = await getWordDetail(word);
      for (const entry of detail.entries) {
        if (entry.rootWord) {
          const kelasKata = entry.makna
            .flatMap((m) => m.kelasKata)
            .filter((k) => k.tipe === "kelas_kata")
            .map((k) => k.kode);

          mappings.push({
            kata: detail.word,
            kataDasar: entry.rootWord,
            pemenggalan: entry.nama,
            kelasKata: [...new Set(kelasKata)],
          });
        }
      }
    } catch {
      // Skip words that fail to load
    }
  }

  return mappings;
}

/**
 * Extract hyphenation entries for all words of a given letter.
 * Uses the nama field as the source of syllabification.
 */
export async function extractHyphenationDic(
  letter: string
): Promise<HyphenationEntry[]> {
  const words = await listWordFiles(letter);
  const entries: HyphenationEntry[] = [];

  for (const word of words) {
    try {
      const detail = await getWordDetail(word);
      for (const entry of detail.entries) {
        if (entry.nama && entry.nama.includes(".")) {
          entries.push({
            kata: detail.word,
            pemenggalan: entry.nama,
            dicFormat: dotToHyphen(entry.nama),
          });
        }
      }
    } catch {
      // Skip words that fail to load
    }
  }

  // Deduplicate by kata
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.kata)) return false;
    seen.add(e.kata);
    return true;
  });
}

/**
 * Extract base words (kata dasar) — words without a rootWord field.
 */
export async function extractKataDasar(letter: string): Promise<string[]> {
  const words = await listWordFiles(letter);
  const kataDasar: string[] = [];

  for (const word of words) {
    try {
      const detail = await getWordDetail(word);
      const hasRootWord = detail.entries.some((e) => e.rootWord);
      if (!hasRootWord) {
        kataDasar.push(detail.word);
      }
    } catch {
      // Skip
    }
  }

  return kataDasar;
}

/**
 * Compute syllable pattern statistics for a given letter.
 */
export async function computeSyllableStats(
  letter: string
): Promise<SyllablePatternStats> {
  const words = await listWordFiles(letter);
  const patterns: Record<string, number> = {};
  let totalKata = 0;
  let totalSukuKata = 0;

  for (const word of words) {
    try {
      const detail = await getWordDetail(word);
      for (const entry of detail.entries) {
        if (entry.nama && entry.nama.includes(".")) {
          totalKata++;
          const syllables = extractSyllables(entry.nama);
          totalSukuKata += syllables.length;

          for (const syl of syllables) {
            const pattern = classifySyllablePattern(syl);
            patterns[pattern] = (patterns[pattern] || 0) + 1;
          }
        }
      }
    } catch {
      // Skip
    }
  }

  return {
    huruf: letter.toUpperCase(),
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
