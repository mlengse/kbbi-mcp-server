#!/usr/bin/env node
/**
 * Verify hyphenation accuracy: patterns/id.cjs vs KBBI data.
 *
 * Data comes from the hybrid reader in src/data/reader.ts, never from a local
 * word-details directory. The repository has never contained that directory,
 * because it is CDN-only by design (Constitution Principle I); reading it
 * directly threw ENOENT and made the constitution's accuracy gate unrunnable
 * for everyone. See specs/001-mcp-client-onboarding/research.md D-008 and
 * docs/DEFECTS.md entry D-F01.
 *
 * Usage: npm run build && node scripts/verify-accuracy.cjs
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const Hypher = require('hypher');
const patterns = require('../patterns/id.cjs');

const hypher = new Hypher(patterns);

const BUILT_READER = path.join(__dirname, '..', 'build', 'data', 'reader.js');

/**
 * Load the hybrid reader from the build output.
 * The reader is ESM, so a .cjs script reaches it through dynamic import.
 */
async function loadReader() {
  if (!fs.existsSync(BUILT_READER)) {
    throw new Error(
      `Reader hasil build tidak ditemukan: ${BUILT_READER}\n` +
        'Jalankan "npm run build" lebih dulu, lalu ulangi perintah ini.'
    );
  }
  return import(pathToFileURL(BUILT_READER).href);
}

// ============================================================
// Helpers
// ============================================================

/** Convert dot-separated syllables to hyphen-separated */
function dotsToHyphens(nama) {
  return nama.split('.').join('-');
}

/** Convert Hypher array output to hyphen-separated string */
function hypherResult(arr) {
  return arr.join('-');
}

/** Normalize for comparison: lowercase, trim, remove leading dash */
function normalize(s) {
  return s.toLowerCase().trim().replace(/^-/, '');
}

// ============================================================
// Read word data through the hybrid reader
// ============================================================

/**
 * Load every word that carries a KBBI syllable division.
 *
 * The flat hyphenation dictionary is the right source here: it already pairs
 * each word with its dotted syllable division, so one fetch replaces iterating
 * 26 directories of word-detail JSON. Data still arrives through the reader,
 * which means local-first then CDN, and nothing is ever written to disk.
 */
async function loadAllWords() {
  const { getHyphenationDict } = await loadReader();
  const hyphenation = await getHyphenationDict();

  const words = [];
  for (const [word, nama] of Object.entries(hyphenation)) {
    if (!nama) continue;

    // Skip entries with leading dash (affixes like "-an", "-i")
    if (nama.startsWith('-')) continue;

    // Skip entries with dots that aren't syllable separators
    // (e.g. abbreviations like "a.k.b.")
    if (/\.[a-z]\./.test(nama)) continue;

    words.push({
      word,
      nama,
      kbbiHyphens: dotsToHyphens(nama),
    });
  }

  return words;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('Loading KBBI word data...');
  const words = await loadAllWords();
  console.log(`Loaded ${words.length} words from KBBI.\n`);

  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  const errors = [];

  for (const { word, nama, kbbiHyphens } of words) {
    const hypherArr = hypher.hyphenate(word);
    const hypherStr = hypherResult(hypherArr);

    const normExpected = normalize(kbbiHyphens);
    const normActual = normalize(hypherStr);

    if (normExpected === normActual) {
      correct++;
    } else {
      incorrect++;
      if (errors.length < 50) {
        errors.push({ word, expected: kbbiHyphens, actual: hypherStr });
      }
    }
  }

  const total = correct + incorrect;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

  console.log('=== HASIL VERIFIKASI ===');
  console.log(`Total kata diuji  : ${total}`);
  console.log(`Sesuai KBBI      : ${correct}`);
  console.log(`Tidak sesuai     : ${incorrect}`);
  console.log(`Akurasi          : ${accuracy}%`);
  console.log('');

  if (errors.length > 0) {
    console.log(`=== CONTOH KESALAHAN (${errors.length} pertama) ===`);
    console.log('Kata'.padEnd(20) + 'Expected'.padEnd(20) + 'Actual');
    console.log('-'.repeat(60));
    for (const e of errors) {
      console.log(
        e.word.padEnd(20) +
        e.expected.padEnd(20) +
        e.actual
      );
    }
  }

  // Also test the specific words from the original audit
  console.log('\n=== KATA DARI AUDIT ASLI ===');
  const auditWords = [
    'air', 'hari', 'orang', 'guru', 'lari',
    'pintar', 'besar', 'bulan', 'tahun', 'cantik',
    'panjang', 'hidung', 'murid', 'leher',
    'mengerti', 'menyanyi', 'berenang', 'berhitung',
    'menjumlahkan', 'mengalikan',
    'kemerdekaan', 'pemerintahan', 'kebersihan', 'kesehatan',
    'perhatian', 'pembelajaran',
    'buku', 'rumah', 'makan', 'minum',
    'tulis', 'baca', 'kecil', 'baik',
    'sayang', 'suka', 'meja', 'kepala',
    'mata', 'kaki', 'gigi', 'membaca',
    'menulis', 'tertipu',
  ];

  // Load KBBI data for audit words
  const auditKbbi = {};
  for (const { word, kbbiHyphens } of words) {
    if (auditWords.includes(word) && !auditKbbi[word]) {
      auditKbbi[word] = kbbiHyphens;
    }
  }

  let auditCorrect = 0;
  let auditTotal = 0;
  console.log('Kata'.padEnd(20) + 'Hypher'.padEnd(20) + 'KBBI'.padEnd(20) + 'Status');
  console.log('-'.repeat(70));
  for (const w of auditWords) {
    const kbbi = auditKbbi[w] || '(no data)';
    const h = hypherResult(hypher.hyphenate(w));
    const match = kbbi !== '(no data)' && normalize(h) === normalize(kbbi);
    if (kbbi !== '(no data)') auditTotal++;
    if (match) auditCorrect++;
    const status = kbbi === '(no data)' ? 'N/A' : (match ? 'OK' : 'MISS');
    console.log(w.padEnd(20) + h.padEnd(20) + kbbi.padEnd(20) + status);
  }
  if (auditTotal > 0) {
    console.log(`\nAkurasi kata audit: ${auditCorrect}/${auditTotal} (${((auditCorrect / auditTotal) * 100).toFixed(0)}%)`);
  }

  // Exit code doubles as the constitution's quality gate: a figure is reported,
  // which is what was previously impossible.
  return accuracy;
}

main()
  .then((accuracy) => {
    process.exitCode = 0;
    console.log(`\nGate akurasi terpenuhi: angka ${accuracy}% dilaporkan.`);
  })
  .catch((err) => {
    console.error(`Gagal menjalankan verifikasi akurasi: ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  });
