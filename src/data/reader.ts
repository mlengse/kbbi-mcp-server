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
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the project root (two levels up from src/data/)
const PROJECT_ROOT = resolve(__dirname, "..", "..");

const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@data-v1";

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
  const url = `${CDN_BASE}/${relativePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CDN fetch failed: ${response.status} ${url}`);
  }
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
  const url = `${CDN_BASE}/wordlist/${l}.txt`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch wordlist for letter ${l}`);
  }
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
 */
export async function getPemenggalanKataRules(): Promise<string> {
  const filePath = join(PROJECT_ROOT, "pemenggalan_kata.md");
  if (await fileExists(filePath)) {
    return readFile(filePath, "utf-8");
  }
  const url = `${CDN_BASE}/pemenggalan_kata.md`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch pemenggalan_kata.md");
  return response.text();
}

/**
 * Read the Liang thesis markdown.
 */
export async function getLiangThesis(): Promise<string> {
  const filePath = join(PROJECT_ROOT, "orthos", "liang_thesis.md");
  if (await fileExists(filePath)) {
    return readFile(filePath, "utf-8");
  }
  return "";
}

/**
 * Read the patgen2 tutorial markdown.
 */
export async function getPatgen2Tutorial(): Promise<string> {
  const filePath = join(PROJECT_ROOT, "orthos", "patgen2_tutorial.md");
  if (await fileExists(filePath)) {
    return readFile(filePath, "utf-8");
  }
  return "";
}
