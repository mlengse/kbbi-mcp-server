#!/usr/bin/env node
/**
 * Verify hyphenation accuracy: patterns/id.cjs vs KBBI data.
 *
 * Reads word-detail JSON files from word-details/*, extracts the 'nama' field
 * (dot-separated syllables from KBBI), runs Hypher, and compares results.
 *
 * Usage: node scripts/verify-accuracy.cjs
 */
const fs = require('fs');
const path = require('path');
const Hypher = require('hypher');
const patterns = require('../patterns/id.cjs');

const hypher = new Hypher(patterns);

const WORD_DETAILS_DIR = path.join(__dirname, '..', 'word-details');

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
// Read all word-detail files
// ============================================================

function loadAllWords() {
  const words = [];
  const letters = fs.readdirSync(WORD_DETAILS_DIR).filter(f => /^[A-Z]$/.test(f));

  for (const letter of letters) {
    const dir = path.join(WORD_DETAILS_DIR, letter);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        if (!data.entries || !Array.isArray(data.entries)) continue;

        for (const entry of data.entries) {
          if (!entry.nama) continue;

          // Skip entries with leading dash (affixes like "-an", "-i")
          const nama = entry.nama;
          if (nama.startsWith('-')) continue;

          // Skip entries with dots that aren't syllable separators
          // (e.g. abbreviations like "a.k.b.")
          if (/\.[a-z]\./.test(nama)) continue;

          words.push({
            word: data.word,
            nama: nama,
            kbbiHyphens: dotsToHyphens(nama),
          });
        }
      } catch {
        // Skip malformed JSON files
      }
    }
  }

  return words;
}

// ============================================================
// Main
// ============================================================

function main() {
  console.log('Loading KBBI word data...');
  const words = loadAllWords();
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
}

main();
