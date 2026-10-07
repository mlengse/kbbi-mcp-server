---
description: "Daftar kapabilitas server KBBI MCP, dibangkitkan dari kode"
---

# Referensi Kapabilitas Server KBBI MCP

Berkas ini **dibangkitkan** oleh `scripts/check-capabilities.cjs` dari
`src/tools/*.ts` dan `src/prompts/index.ts`. Jangan disunting manual;
sunting sumbernya lalu jalankan `npm run docs:check`.

Jumlah kapabilitas: **20**. Jumlah alur siap pakai: **5**.

## Ringkasan per keluarga

| Keluarga | Jumlah |
|---|---|
| kamus | 8 |
| stemmer | 5 |
| pemenggalan | 7 |
| **total** | **20** |

## Daftar kapabilitas

| Nama | Keluarga | Untuk tugas apa | Contoh masukan | Bentuk keluaran | Alternatif massal |
|---|---|---|---|---|---|
| `cari_kata` | kamus | Mencari definisi lengkap satu kata beserta makna, kelas kata, contoh kalimat, kata turunan, dan peribahasanya. | {"kata":"pintar"} | Objek WordDetail: word, entries[{ nama, makna[], kelasKata[], contoh }], terkait | - |
| `cari_kata_awalan` | kamus | Autocomplete: mencari kandidat kata berdasarkan awalan. | {"awalan":"pin","limit":20} | { awalan, jumlah, kata: ["pinang", "pindah", "pintar", ...] } | ekspor_training_dic |
| `kelas_kata` | kamus | Mengetahui kelas kata (nomina, verba, adjektiva, dan sejenisnya) sebuah kata. | {"kata":"pintar"} | { kata, kelasKata: [{ kode, label }] } | - |
| `contoh_kalimat` | kamus | Mengambil contoh penggunaan kata dalam kalimat dari KBBI. | {"kata":"pintar"} | { kata, contoh: ["..."] } | - |
| `peribahasa` | kamus | Mencari peribahasa yang mengandung kata tertentu beserta maknanya. | {"kata":"pintar"} | { kata, jumlah, peribahasa: [{ peribahasa, makna }] } | - |
| `daftar_kategori` | kamus | Mengambil daftar kategori KBBI: kelas kata, bahasa asal, bidang subjek, atau kategori lainnya. | {"tipe":"kelas-kata"} | Objek kategori sesuai tipe yang diminta | - |
| `cari_kata_dasar_dari_lexicon` | kamus | Cek cepat status satu kata pada leksikon: kata dasar, turunan, atau bukan keduanya. | {"kata":"membantu"} | { kata, status, kataDasar } | daftar_kata_dasar_kbbi |
| `statistik_lexicon` | kamus | Statistik leksikon: jumlah root words, derived words, dan entri pemenggalan. | {} | { rootWords, derivedWords, hyphenationEntries } | - |
| `cari_kata_dasar` | stemmer | Menentukan kata dasar dari sebuah kata berimbuhan memakai field rootWord KBBI. | {"kata":"membantu"} | { kata, kataDasar, pemenggalan, catatan? } | daftar_kata_dasar_kbbi |
| `daftar_kata_turunan` | stemmer | Daftar semua kata turunan dari sebuah kata dasar. | {"kataDasar":"pintar"} | { kataDasar, jumlahTurunan, kataTurunan: [...] } | - |
| `ekspor_stem_mapping` | stemmer | Ekspor massal seluruh kata berimbuhan beserta kata dasarnya untuk satu huruf, sebagai data training stemmer. | {"huruf":"M"} | { huruf, total, mappings: [{ kata, kataDasar, ... }] } | - |
| `analisis_imbuhan` | stemmer | Menguraikan struktur imbuhan sebuah kata: prefiks, sufiks, infiks, dan kata dasarnya. | {"kata":"membantu"} | { kata, prefiks, sufiks, infiks, kataDasar } | - |
| `daftar_kata_dasar_kbbi` | stemmer | Daftar kata dasar KBBI, yaitu entri tanpa rootWord, untuk satu huruf. | {"huruf":"M"} | { huruf, jumlah, kataDasar: [...] } | - |
| `pemenggalan_kata` | pemenggalan | Mengambil pemenggalan suku kata satu kata dari KBBI. | {"kata":"pintar"} | { kata, nama, pemenggalan, dicFormat, sukuKata, jumlahSukuKata } | ekspor_training_dic |
| `ekspor_training_dic` | pemenggalan | Ekspor massal pemenggalan satu huruf dalam format .dic untuk training Orthos atau patgen2. | {"huruf":"P"} | { huruf, totalEntries, format, dicContent } | - |
| `validasi_pemenggalan` | pemenggalan | Membandingkan hasil pemenggalan engine dengan data KBBI untuk satu kata. | {"kata":"pintar","expected":"pin-tar"} | { kata, valid, actual, expected } | - |
| `statistik_pola_suku` | pemenggalan | Statistik pola suku kata (KV, KVK, V, VK, dan sejenisnya) untuk satu huruf, untuk analisis fonotaktik. | {"huruf":"P"} | { huruf, total, pola: { KV: n, KVK: n, ... } } | - |
| `cari_pemenggalan` | pemenggalan | Cari pemenggalan satu kata dari flat file hyphenation, cepat tanpa iterasi word-details. | {"kata":"pintar"} | { kata, pemenggalan, sukuKata } | ekspor_training_dic |
| `daftar_dic` | pemenggalan | Ekspor seluruh isi berkas .dic dari hyphenation, bukan per huruf. | {"format":"id"} | Teks isi berkas .dic beserta jumlah baris | - |
| `bandingkan_dic` | pemenggalan | Membandingkan dua format .dic: jumlah baris, perbedaan, dan sampel entri yang berbeda. | {"format1":"id","format2":"id_orthos"} | { format1, format2, jumlah1, jumlah2, hanyaDi1, hanyaDi2, sampel } | - |

## Alur siap pakai

| Nama alur | Untuk tugas apa |
|---|---|
| `siapkan_data_training_pemenggalan` | Menyiapkan dataset .dic pemenggalan untuk training engine Orthos atau patgen2. |
| `siapkan_data_training_stemmer` | Menyiapkan pasangan kata berimbuhan dan kata dasarnya sebagai data training stemmer. |
| `analisis_edge_cases` | Mencari kata yang mungkin salah di-stem, untuk penyempurnaan engine. |
| `validasi_engine` | Mengukur akurasi engine terhadap data KBBI, untuk stemmer maupun pemenggalan. |
| `bandingkan_kata` | Membandingkan dua kata atau dua sumber kamus. |
