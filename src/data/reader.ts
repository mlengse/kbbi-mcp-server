import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  WordDetail,
  WordClassFile,
  LanguageFile,
  SubjectDomainFile,
  MiscCategoryFile,
  KategoriFile,
  DerivedToRootWithKelasMap,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the project root (two levels up from src/data/)
const PROJECT_ROOT = resolve(__dirname, "..", "..");

// Primary CDN base: always-latest `main` branch for development.
// Override with KBBI_CDN_BASE (e.g. @data-v3) for pinned production.
const DEFAULT_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@main";
// Stable fallback: pinned tag with all data verified.
const FALLBACK_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@data-v4";

function getCdnBase(): string {
  return process.env.KBBI_CDN_BASE || DEFAULT_CDN_BASE;
}

/**
 * Fetch a file from CDN. Tries primary base (@main by default), then
 * falls back to the stable tag (@data-v3) if the file is missing.
 */
async function fetchCdn(relativePath: string): Promise<Response> {
  const primary = getCdnBase();
  let response = await fetch(`${primary}/${relativePath}`);
  if (response.ok) {
    return response;
  }
  if (primary !== FALLBACK_CDN_BASE) {
    console.warn(
      `KBBI CDN: ${response.status} ${primary}/${relativePath}; falling back to ${FALLBACK_CDN_BASE}`
    );
    response = await fetch(`${FALLBACK_CDN_BASE}/${relativePath}`);
    if (response.ok) {
      return response;
    }
  }
  throw new Error(
    `CDN fetch failed: ${response.status} ${primary}/${relativePath}`
  );
}

// ============================================================
// Helper: file exists check
// ============================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Helper: read JSON file with CDN fallback
// ============================================================

async function readJsonLocal<T>(relativePath: string): Promise<T | null> {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (await fileExists(fullPath)) {
    const content = await readFile(fullPath, "utf-8");
    return JSON.parse(content) as T;
  }
  return null;
}

async function fetchFromCdn<T>(relativePath: string): Promise<T> {
  const response = await fetchCdn(relativePath);
  return (await response.json()) as T;
}

async function readJsonHybrid<T>(relativePath: string): Promise<T> {
  const local = await readJsonLocal<T>(relativePath);
  if (local !== null) {
    return local;
  }
  return fetchFromCdn<T>(relativePath);
}

// ============================================================
// Helper: read text file (TXT/MD/DIC) with CDN fallback
// ============================================================

async function fetchTextFromCdn(relativePath: string): Promise<string> {
  const response = await fetchCdn(relativePath);
  return response.text();
}

/**
 * Read a plain-text file (TXT/MD/DIC) with hybrid strategy:
 * 1. Try local file
 * 2. Fallback to CDN
 */
export async function readTextHybrid(relativePath: string): Promise<string> {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (await fileExists(fullPath)) {
    return readFile(fullPath, "utf-8");
  }
  return fetchTextFromCdn(relativePath);
}

/**
 * Read a plain-text file line by line, trimming each line.
 */
export async function readLinesHybrid(relativePath: string): Promise<string[]> {
  const content = await readTextHybrid(relativePath);
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// ============================================================
// Word Detail
// ============================================================

/**
 * Get detailed dictionary entry for a word.
 * Reads from local file first, falls back to CDN.
 */
export async function getWordDetail(word: string): Promise<WordDetail> {
  const firstLetter = word.charAt(0).toUpperCase();
  const safeName = encodeURIComponent(word);
  const relativePath = `word-details/${firstLetter}/${safeName}.json`;
  return readJsonHybrid<WordDetail>(relativePath);
}

// ============================================================
// Word List
// ============================================================

/**
 * Get the full word list for a given letter (A-Z).
 */
export async function getWordList(letter: string): Promise<string[]> {
  const l = letter.toUpperCase();
  const filePath = join(PROJECT_ROOT, "wordlist", `${l}.txt`);
  if (await fileExists(filePath)) {
    const content = await readFile(filePath, "utf-8");
    return content
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  }

  // CDN fallback
  const response = await fetchCdn(`wordlist/${l}.txt`);
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/**
 * List all available word-detail files for a given letter.
 * Returns filenames (without .json extension).
 */
export async function listWordFiles(letter: string): Promise<string[]> {
  const l = letter.toUpperCase();
  const dirPath = join(PROJECT_ROOT, "word-details", l);
  try {
    const files = await readdir(dirPath);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => decodeURIComponent(f.replace(/\.json$/, "")));
  } catch {
    // If local dir doesn't exist, fall back to wordlist
    return getWordList(letter);
  }
}

// ============================================================
// Peribahasa
// ============================================================

/**
 * Get words that have peribahasa for a given letter.
 */
export async function getPeribahasa(letter: string): Promise<string[]> {
  const l = letter.toUpperCase();
  const filePath = join(PROJECT_ROOT, "word-with-peribahasa", `${l}.txt`);
  if (await fileExists(filePath)) {
    const content = await readFile(filePath, "utf-8");
    return content
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  }
  return [];
}

// ============================================================
// Categories
// ============================================================

export async function getKelasKata(): Promise<WordClassFile> {
  return readJsonHybrid<WordClassFile>("word-category/kelas-kata.json");
}

export async function getBahasa(): Promise<LanguageFile> {
  return readJsonHybrid<LanguageFile>("word-category/bahasa.json");
}

export async function getBidangSubjek(): Promise<SubjectDomainFile> {
  return readJsonHybrid<SubjectDomainFile>("word-category/bidang-subjek.json");
}

export async function getLainnya(): Promise<MiscCategoryFile> {
  return readJsonHybrid<MiscCategoryFile>("word-category/lainnya.json");
}

export async function getKategori(): Promise<KategoriFile> {
  return readJsonHybrid<KategoriFile>("word-category/kategori.json");
}

// ============================================================
// Reference Documents
// ============================================================

/**
 * Read pemenggalan_kata.md as raw markdown.
 * Single source of truth: hyphenation/pemenggalan_kata.md.
 */
export async function getPemenggalanKataRules(): Promise<string> {
  return readTextHybrid("hyphenation/pemenggalan_kata.md");
}

/**
 * Read the Liang thesis markdown.
 */
export async function getLiangThesis(): Promise<string> {
  return readTextHybrid("orthos/liang_thesis.md");
}

/**
 * Read the patgen2 tutorial markdown.
 */
export async function getPatgen2Tutorial(): Promise<string> {
  return readTextHybrid("orthos/patgen2_tutorial.md");
}

// ============================================================
// Lexicon (pre-computed flat files)
// ============================================================

/**
 * Get all root words (kata dasar) from lexicon/root_words.txt.
 */
export async function getRootWords(): Promise<string[]> {
  return readLinesHybrid("lexicon/root_words.txt");
}

/**
 * Get all derived words from lexicon/derived_words.txt.
 */
export async function getDerivedWords(): Promise<string[]> {
  return readLinesHybrid("lexicon/derived_words.txt");
}

/**
 * Get derived→root mapping from lexicon/derived_to_root.json.
 */
export async function getDerivedToRoot(): Promise<Record<string, string>> {
  return readJsonHybrid<Record<string, string>>("lexicon/derived_to_root.json");
}

/**
 * Get derived→root mapping + kelas kata from
 * lexicon/derived_to_root_with_kelas.json.
 * e.g. { "membantu": { "kataDasar": "bantu", "kelasKata": ["v"] } }
 */
export async function getDerivedToRootWithKelas(): Promise<DerivedToRootWithKelasMap> {
  return readJsonHybrid<DerivedToRootWithKelasMap>(
    "lexicon/derived_to_root_with_kelas.json"
  );
}

// ============================================================
// Hyphenation (pre-computed flat files)
// ============================================================

/**
 * Get the full hyphenation dictionary: word → dotted pemenggalan.
 * e.g. { "pintar": "pin.tar" }
 */
export async function getHyphenationDict(): Promise<
  Record<string, string>
> {
  return readJsonHybrid<Record<string, string>>(
    "hyphenation/kbbi_vi_hyphenation_dict.json"
  );
}

/**
 * Get pemenggalan lines from hyphenation/kbbi_pemenggalan.txt.
 * Format: "kata: pemenggalan" per line.
 */
export async function getPemenggalanLines(): Promise<string[]> {
  return readLinesHybrid("hyphenation/kbbi_pemenggalan.txt");
}

/**
 * Get raw content of a .dic file in hyphenation/.
 */
export async function getDicContent(
  format: "id" | "orthos" | "words" = "id"
): Promise<string> {
  const file = format === "id" ? "id.dic" : `id_${format}.dic`;
  return readTextHybrid(`hyphenation/${file}`);
}

/**
 * Get hyphenation rules from hyphenation/pemenggalan_kata.md.
 */
export async function getHyphenationPemenggalanRules(): Promise<string> {
  return readTextHybrid("hyphenation/pemenggalan_kata.md");
}
