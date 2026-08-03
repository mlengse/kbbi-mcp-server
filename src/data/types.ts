// ============================================================
// KBBI Word Detail Types
// Based on actual JSON structure from word-details/*.json
// ============================================================

export interface WordDetail {
  word: string;
  authenticated: boolean;
  entries: Entry[];
}

export interface Entry {
  id: string;
  nama: string;           // Pemenggalan suku kata, e.g. "pin.tar", "mem.ban.tu"
  nomor: string;
  rootWord?: string;       // Kata dasar (hanya pada kata berimbuhan), e.g. "bantu"
  makna: Makna[];
  terkait: Terkait;
}

export interface Makna {
  nomor: string;
  kelasKata: KelasKata[];
  definisi: string;
  contoh: Contoh[];
}

export interface KelasKata {
  kode: string;            // "v", "n", "a", "adv", "Jw", "Kim", etc.
  nama: string;            // "Verba", "Nomina", "Adjektiva", "Jawa", "Kimia"
  tipe: string;            // "kelas_kata" | "bahasa" | "bidang_subjek" | "lainnya"
}

export interface Contoh {
  nomor: number;
  teks: string;
}

export interface Terkait {
  kataTurunan: string[];
  gabunganKata: string[];
  peribahasa: string[];
  idiom: string[];
  peribahasa_dan_makna?: PeribahasaDanMakna[];
}

export interface PeribahasaDanMakna {
  peribahasa: string;
  makna: string;
}

// ============================================================
// Word Category Types
// Based on word-category/*.json
// ============================================================

export interface CategoryMeta {
  description: string;
  total_items?: number;
  total_unique_classes?: number;
  extracted_from?: string;
  last_updated: string;
}

export interface WordClassEntry {
  kode: string;
  nama: string;
  description?: string;
  full_description?: string;
}

export interface WordClassFile {
  meta: CategoryMeta;
  word_classes: WordClassEntry[];
}

export interface LanguageFile {
  meta: CategoryMeta;
  languages: WordClassEntry[];
}

export interface SubjectDomainFile {
  meta: CategoryMeta;
  subject_domains: WordClassEntry[];
}

export interface MiscCategoryFile {
  meta: CategoryMeta;
  categories: WordClassEntry[];
}

export interface KategoriFile {
  meta: CategoryMeta;
  individual_categories: Array<{ kode: string; nama: string }>;
  popular_combinations?: Array<{
    combination: string[];
    count: number;
  }>;
}

// ============================================================
// Training-Specific Types
// For stemmer and hyphenation training workflows
// ============================================================

/** Mapping dari kata berimbuhan ke kata dasar */
export interface StemMapping {
  kata: string;            // kata berimbuhan, e.g. "membantu"
  kataDasar: string;       // kata dasar (rootWord), e.g. "bantu"
  pemenggalan: string;     // pemenggalan suku kata, e.g. "mem.ban.tu"
  kelasKata?: string[];    // kode kelas kata, e.g. ["v"]
}

/** Entry pemenggalan untuk format .dic */
export interface HyphenationEntry {
  kata: string;            // kata asli, e.g. "pintar"
  pemenggalan: string;     // format titik, e.g. "pin.tar"
  dicFormat: string;       // format .dic, e.g. "pin-tar"
}

/** Hasil analisis imbuhan */
export interface ImbuhanAnalysis {
  kata: string;
  kataDasar: string;
  prefiks: string;         // imbuhan depan yang terdeteksi
  sufiks: string;          // imbuhan belakang yang terdeteksi
  pemenggalan: string;
}

/** Statistik pola suku kata */
export interface SyllablePatternStats {
  huruf: string;
  totalKata: number;
  totalSukuKata: number;
  patterns: Record<string, number>;  // e.g. { "KV": 1234, "KVK": 5678 }
}

// ============================================================
// Flat Data Types (lexicon/ & hyphenation/ pre-computed files)
// ============================================================

/** Entry pemenggalan dari flat file (kbbi_vi_hyphenation_dict.json) */
export interface HyphenationEntryFlat {
  kata: string;
  pemenggalan: string;    // dot format: "pin.tar"
  dicFormat: string;      // hyphen format: "pin-tar"
}

/** Statistik lexicon */
export interface LexiconStats {
  totalRootWords: number;
  totalDerivedWords: number;
  totalHyphenationEntries: number;
}

/** Mapping derived→root + kelas kata (lexicon/derived_to_root_with_kelas.json) */
export interface DerivedToRootWithKelas {
  kataDasar: string;
  kelasKata: string[];
}

export type DerivedToRootWithKelasMap = Record<string, DerivedToRootWithKelas>;
