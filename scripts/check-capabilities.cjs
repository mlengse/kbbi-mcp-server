#!/usr/bin/env node
/**
 * Bangun docs/capabilities-reference.md dari kode, lalu periksa dua arah
 * apakah guides drift dari yang benar-benar diekspos server.
 *
 * Kontrak: specs/001-mcp-client-onboarding/contracts/skill-package.md
 *           specs/001-mcp-client-onboarding/data-model.md (CapabilityReference)
 *
 * Tabel yang ditulis tangan pasti melenceng. Tabel ini dihasilkan, sehingga
 * isi docs/capabilities-reference.md selalu mengikuti src/tools/*.ts dan
 * src/prompts/index.ts.
 *
 * Dua arah dicek, karena kedua jenis melenceng sama-sama menyesatkan:
 *   1. kapabilitas yang ada di server tapi tidak ada di panduan
 *   2. entri panduan yang menyebut kapabilitas yang tidak ada di server
 *
 * Pemeriksaan ini adalah gerbang keras untuk SC-006. Keluarannya bukan nol
 * saat ada selisih. Jalankan lewat "npm run docs:check".
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const TOOL_FILES = [
  { file: 'src/tools/kamus.ts', family: 'kamus' },
  { file: 'src/tools/stemmer.ts', family: 'stemmer' },
  { file: 'src/tools/pemenggalan.ts', family: 'pemenggalan' },
];

const PROMPT_FILE = 'src/prompts/index.ts';

/**
 * Catatan editorial per kapabilitas, sesuai CapabilityReference pada
 * data-model.md. Field yang bisa diturunkan dari kode diturunkan dari kode;
 * field di bawah ini adalah bagian manusia: apa tugasnya, contoh panggilannya,
 * dan bentuk keluarannya.
 */
const NOTES = {
  cari_kata: {
    purpose: 'Mencari definisi lengkap satu kata beserta makna, kelas kata, contoh kalimat, kata turunan, dan peribahasanya.',
    exampleInput: { kata: 'pintar' },
    expectedOutput: 'Objek WordDetail: word, entries[{ nama, makna[], kelasKata[], contoh }], terkait',
    bulkAlternative: null,
  },
  cari_kata_awalan: {
    purpose: 'Autocomplete: mencari kandidat kata berdasarkan awalan.',
    exampleInput: { awalan: 'pin', limit: 20 },
    expectedOutput: '{ awalan, jumlah, kata: ["pinang", "pindah", "pintar", ...] }',
    bulkAlternative: 'ekspor_training_dic',
  },
  kelas_kata: {
    purpose: 'Mengetahui kelas kata (nomina, verba, adjektiva, dan sejenisnya) sebuah kata.',
    exampleInput: { kata: 'pintar' },
    expectedOutput: '{ kata, kelasKata: [{ kode, label }] }',
    bulkAlternative: null,
  },
  contoh_kalimat: {
    purpose: 'Mengambil contoh penggunaan kata dalam kalimat dari KBBI.',
    exampleInput: { kata: 'pintar' },
    expectedOutput: '{ kata, contoh: ["..."] }',
    bulkAlternative: null,
  },
  peribahasa: {
    purpose: 'Mencari peribahasa yang mengandung kata tertentu beserta maknanya.',
    exampleInput: { kata: 'pintar' },
    expectedOutput: '{ kata, jumlah, peribahasa: [{ peribahasa, makna }] }',
    bulkAlternative: null,
  },
  daftar_kategori: {
    purpose: 'Mengambil daftar kategori KBBI: kelas kata, bahasa asal, bidang subjek, atau kategori lainnya.',
    exampleInput: { tipe: 'kelas-kata' },
    expectedOutput: 'Objek kategori sesuai tipe yang diminta',
    bulkAlternative: null,
  },
  cari_kata_dasar_dari_lexicon: {
    purpose: 'Cek cepat status satu kata pada leksikon: kata dasar, turunan, atau bukan keduanya.',
    exampleInput: { kata: 'membantu' },
    expectedOutput: '{ kata, isKataDasar, isKataTurunan, kataDasar }',
    bulkAlternative: 'daftar_kata_dasar_kbbi',
  },
  statistik_lexicon: {
    purpose: 'Statistik leksikon: jumlah root words, derived words, dan entri pemenggalan.',
    exampleInput: {},
    expectedOutput: '{ rootWords, derivedWords, hyphenationEntries }',
    bulkAlternative: null,
  },
  cari_kata_dasar: {
    purpose: 'Menentukan kata dasar dari leksikon, lalu melengkapi pemenggalan dari artikel KBBI bila tersedia.',
    exampleInput: { kata: 'membantu' },
    expectedOutput: '{ kata, kataDasar, pemenggalan, catatan? }',
    bulkAlternative: 'daftar_kata_dasar_kbbi',
  },
  daftar_kata_turunan: {
    purpose: 'Daftar semua kata turunan dari sebuah kata dasar, turunan kembar dihitung satu kali.',
    exampleInput: { kataDasar: 'pintar' },
    expectedOutput: '{ kataDasar, jumlahTurunan, kataTurunan: [...] }',
    bulkAlternative: null,
  },
  ekspor_stem_mapping: {
    purpose: 'Ekspor massal seluruh kata berimbuhan beserta kata dasarnya untuk satu huruf, sebagai data training stemmer.',
    exampleInput: { huruf: 'M' },
    expectedOutput: '{ huruf, total, mappings: [{ kata, kataDasar, ... }] }',
    bulkAlternative: null,
  },
  analisis_imbuhan: {
    purpose: 'Menguraikan struktur imbuhan sebuah kata: prefiks, sufiks, infiks, dan kata dasarnya, dengan kata dasar diambil dari leksikon.',
    exampleInput: { kata: 'membantu' },
    expectedOutput: '{ kata, prefiks, sufiks, kataDasar, pemenggalan }',
    bulkAlternative: null,
  },
  daftar_kata_dasar_kbbi: {
    purpose: 'Daftar kata dasar KBBI, yaitu entri tanpa rootWord, untuk satu huruf.',
    exampleInput: { huruf: 'M' },
    expectedOutput: '{ huruf, jumlah, kataDasar: [...] }',
    bulkAlternative: null,
  },
  pemenggalan_kata: {
    purpose: 'Mengambil pemenggalan suku kata satu kata dari KBBI.',
    exampleInput: { kata: 'pintar' },
    expectedOutput: '{ kata, nama, pemenggalan, dicFormat, sukuKata, jumlahSukuKata }',
    bulkAlternative: 'ekspor_training_dic',
  },
  ekspor_training_dic: {
    purpose: 'Ekspor massal pemenggalan satu huruf dalam format .dic untuk training Orthos atau patgen2.',
    exampleInput: { huruf: 'P' },
    expectedOutput: '{ huruf, totalEntries, format, dicContent }',
    bulkAlternative: null,
  },
  validasi_pemenggalan: {
    purpose: 'Membandingkan hasil pemenggalan engine dengan data KBBI untuk satu kata.',
    exampleInput: { kata: 'pintar', expected: 'pin-tar' },
    expectedOutput: '{ kata, valid, actual, expected }',
    bulkAlternative: null,
  },
  statistik_pola_suku: {
    purpose: 'Statistik pola suku kata (KV, KVK, V, VK, dan sejenisnya) untuk satu huruf, untuk analisis fonotaktik.',
    exampleInput: { huruf: 'P' },
    expectedOutput: '{ huruf, total, pola: { KV: n, KVK: n, ... } }',
    bulkAlternative: null,
  },
  cari_pemenggalan: {
    purpose: 'Cari pemenggalan satu kata dari flat file hyphenation, cepat tanpa iterasi word-details.',
    exampleInput: { kata: 'pintar' },
    expectedOutput: '{ kata, pemenggalan, sukuKata }',
    bulkAlternative: 'ekspor_training_dic',
  },
  daftar_dic: {
    purpose: 'Ekspor seluruh isi berkas .dic dari hyphenation, bukan per huruf.',
    exampleInput: { format: 'id' },
    expectedOutput: 'Teks isi berkas .dic beserta jumlah baris',
    bulkAlternative: null,
  },
  bandingkan_dic: {
    purpose: 'Membandingkan dua format .dic: jumlah baris, perbedaan, dan sampel entri yang berbeda.',
    exampleInput: { format1: 'id', format2: 'id_orthos' },
    expectedOutput: '{ format1, format2, jumlah1, jumlah2, hanyaDi1, hanyaDi2, sampel }',
    bulkAlternative: null,
  },
};

const WORKFLOW_NOTES = {
  siapkan_data_training_pemenggalan: 'Menyiapkan dataset .dic pemenggalan untuk training engine Orthos atau patgen2.',
  siapkan_data_training_stemmer: 'Menyiapkan pasangan kata berimbuhan dan kata dasarnya sebagai data training stemmer.',
  analisis_edge_cases: 'Mencari kata yang mungkin salah di-stem, untuk penyempurnaan engine.',
  validasi_engine: 'Mengukur akurasi engine terhadap data KBBI, untuk stemmer maupun pemenggalan.',
  bandingkan_kata: 'Membandingkan dua kata atau dua sumber kamus.',
};

/** Ambil nama, deskripsi, dan parameter setiap server.tool dari berkas sumber. */
function extractTools() {
  const tools = [];
  for (const { file, family } of TOOL_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    const re =
      /server\.tool\(\s*\n\s*"([a-z_]+)",\s*\n\s*"([^"]+)",\s*\n\s*\{([^}]*)\}/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const params = [...match[3].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)].map((m) => m[1]);
      tools.push({ name: match[1], family, description: match[2], params, file });
    }
  }
  return tools;
}

/** Ambil nama setiap prompt, yaitu lima alur siap pakai. */
function extractWorkflows() {
  const source = fs.readFileSync(path.join(REPO_ROOT, PROMPT_FILE), 'utf8');
  return [...source.matchAll(/server\.prompt\(\s*\n\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

/** Susun baris tabel markdown untuk satu kapabilitas. */
function toolRow(tool) {
  const note = NOTES[tool.name];
  const example = note ? JSON.stringify(note.exampleInput) : '{}';
  const bulk = note && note.bulkAlternative ? note.bulkAlternative : '-';
  const purpose = note ? note.purpose : tool.description;
  return `| \`${tool.name}\` | ${tool.family} | ${purpose} | ${example} | ${
    note ? note.expectedOutput : '-'
  } | ${bulk} |`;
}

function workflowRow(name) {
  const purpose = WORKFLOW_NOTES[name] || '-';
  return `| \`${name}\` | ${purpose} |`;
}

/** Bangun isi docs/capabilities-reference.md. */
function renderReference(tools, workflows) {
  const byFamily = { kamus: [], stemmer: [], pemenggalan: [] };
  for (const tool of tools) byFamily[tool.family].push(tool);

  const lines = [];
  lines.push('---');
  lines.push('description: "Daftar kapabilitas server KBBI MCP, dibangkitkan dari kode"');
  lines.push('---');
  lines.push('');
  lines.push('# Referensi Kapabilitas Server KBBI MCP');
  lines.push('');
  lines.push('Berkas ini **dibangkitkan** oleh `scripts/check-capabilities.cjs` dari');
  lines.push('`src/tools/*.ts` dan `src/prompts/index.ts`. Jangan disunting manual;');
  lines.push('sunting sumbernya lalu jalankan `npm run docs:check`.');
  lines.push('');
  lines.push(`Jumlah kapabilitas: **${tools.length}**. Jumlah alur siap pakai: **${workflows.length}**.`);
  lines.push('');
  lines.push('## Ringkasan per keluarga');
  lines.push('');
  lines.push('| Keluarga | Jumlah |');
  lines.push('|---|---|');
  for (const [family, list] of Object.entries(byFamily)) {
    lines.push(`| ${family} | ${list.length} |`);
  }
  lines.push(`| **total** | **${tools.length}** |`);
  lines.push('');
  lines.push('## Daftar kapabilitas');
  lines.push('');
  lines.push('| Nama | Keluarga | Untuk tugas apa | Contoh masukan | Bentuk keluaran | Alternatif massal |');
  lines.push('|---|---|---|---|---|---|');
  for (const tool of tools) lines.push(toolRow(tool));
  lines.push('');
  lines.push('## Alur siap pakai');
  lines.push('');
  lines.push('| Nama alur | Untuk tugas apa |');
  lines.push('|---|---|');
  for (const name of workflows) lines.push(workflowRow(name));
  lines.push('');
  return lines.join('\n');
}

/**
 * Bandingkan isi panduan dengan yang sebenarnya diekspos server, dua arah.
 * Mengembalikan { missingInGuides, phantomInGuides, missingWorkflows }.
 */
function checkDrift(tools, workflows) {
  const usagePath = path.join(REPO_ROOT, 'docs', 'USAGE.md');
  const usage = fs.existsSync(usagePath) ? fs.readFileSync(usagePath, 'utf8') : '';

  const missingInGuides = tools.filter((t) => !usage.includes(t.name)).map((t) => t.name);
  const known = new Set(tools.map((t) => t.name));
  const phantomInGuides = [...usage.matchAll(/`([a-z_]{4,})`/g)]
    .map((m) => m[1])
    .filter((name) => !known.has(name) && !(name in WORKFLOW_NOTES) && !isNonCapability(name));
  const missingWorkflows = workflows.filter((w) => !usage.includes(w));

  return {
    missingInGuides: [...new Set(missingInGuides)],
    phantomInGuides: [...new Set(phantomInGuides)],
    missingWorkflows: [...new Set(missingWorkflows)],
  };
}

/**
 * Nama dalam backtick yang bukan kapabilitas, jadi bukan phantom.
 * Daftar ini bersifat heuristik: pemeriksaan phantom menangkap apa pun
 * yang ditulis dalam backtick, termasuk nama format berkas dan nama field.
 * Melewati terlalu banyak lebih baik daripada menandai yang benar.
 */
function isNonCapability(name) {
  const words = [
    // format dan path
    'id', 'id_orthos', 'id_words', 'orthos', 'patgen2', 'dic', 'txt', 'json',
    'md', 'ts', 'cjs', 'js', 'yaml', 'toml', 'url', 'api',
    // nama field pada bentuk keluaran
    'catatan', 'prefiks', 'sufiks', 'infiks', 'sukuKata', 'kataDasar',
    'rootWord', 'letters', 'total', 'valid', 'actual', 'expected', 'huruf',
    'limit', 'kata', 'awalan', 'kataDasar_', 'format', 'format1', 'format2',
    'jumlah1', 'jumlah2', 'hanyaDi1', 'hanyaDi2', 'sampel', 'dicContent',
    'dicFormat', 'jumlahSukuKata', 'pemenggalan', 'nama', 'makna', 'contoh',
    'entries', 'terkait', 'kelasKata', 'peribahasa', 'mappings', 'kataDasar',
    'rootWords', 'derivedWords', 'hyphenationEntries', 'status', 'pola',
    'jumlah', 'kataTurunan', 'jumlahTurunan', 'tipe', 'labels', 'jumlah',
    // perangkat dan produk
    'mcp', 'npm', 'node', 'nvm', 'sdk', 'cli', 'cdn', 'kbbi', 'http',
    'stdio', 'env', 'gitignore', 'npmrc', 'windows', 'macos', 'linux',
    'opencode', 'zed', 'claude', 'antigravity',
  ];
  return words.includes(name);
}

/**
 * Gerbang karakter non-Latin (research D-009).
 * Gangguan karakter seperti CJK atau Kiril di dalam prosa Indonesia praktis
 * tidak terlihat oleh pembaca biasa,JUCE, jadi ini gerbang keras.
 */
function scanNonLatin(files) {
  const allowed = /[\u0000-\u024F\u2013\u2014\u2018\u2019\u201C\u201D]/;
  const offenders = [];
  for (const file of files) {
    const full = path.join(REPO_ROOT, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const bad = [...text].filter((ch) => ch.codePointAt(0) > 0x7f && !allowed.test(ch));
    if (bad.length > 0) offenders.push({ file, chars: [...new Set(bad)].join('') });
  }
  return offenders;
}

function main() {
  const tools = extractTools();
  const workflows = extractWorkflows();

  const reference = renderReference(tools, workflows);
  fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'capabilities-reference.md'), reference);
  console.log(`Ditulis: docs/capabilities-reference.md (${tools.length} kapabilitas, ${workflows.length} alur)`);

  const drift = checkDrift(tools, workflows);
  const offenders = scanNonLatin([
    'docs/INSTALL.md',
    'docs/USAGE.md',
    'docs/capabilities-reference.md',
    'docs/DEFECTS.md',
    '.agents/skills/kbbi-mcp/SKILL.md',
    '.agents/skills/kbbi-mcp/references/capabilities.md',
  ]);

  let failed = false;

  if (drift.missingInGuides.length > 0) {
    failed = true;
    console.error(`\nKapabilitas ada di server tapi tidak ada di docs/USAGE.md: ${drift.missingInGuides.join(', ')}`);
  }
  if (drift.missingWorkflows.length > 0) {
    failed = true;
    console.error(`\nAlur ada di server tapi tidak ada di docs/USAGE.md: ${drift.missingWorkflows.join(', ')}`);
  }
  if (drift.phantomInGuides.length > 0) {
    failed = true;
    console.error(`\nEntri di docs/USAGE.md tapi kapabilitasnya tidak ada di server: ${drift.phantomInGuides.join(', ')}`);
  }
  if (offenders.length > 0) {
    failed = true;
    console.error('\nKarakter non-Latin yang tidak diizinkan ditemukan:');
    for (const o of offenders) console.error(`  ${o.file}: ${o.chars}`);
  }

  if (failed) {
    console.error('\nGAGAL: dokumentasi melenceng dari kode.');
    process.exitCode = 1;
    return;
  }
  console.log('OK: dokumentasi sinkron dengan kode, dan bebas karakter asing.');
}

if (require.main === module) main();

module.exports = { extractTools, extractWorkflows, renderReference, checkDrift, scanNonLatin };