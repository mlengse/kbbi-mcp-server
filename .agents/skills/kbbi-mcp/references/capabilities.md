---
description: "Referensi kapabilitas server KBBI MCP"
---

# Referensi Kapabilitas

Daftar lengkap 21 kapabilitas dan 5 alur siap pakai. Berkas ini adalah salinan
dari `docs/capabilities-reference.md` yang dibangkitkan oleh
`scripts/check-capabilities.cjs`.

## Keluarga kamus (8 kapabilitas)

| Nama | Untuk tugas apa | Contoh masukan | Bentuk keluaran | Alternatif massal |
|---|---|---|---|---|
| `cari_kata` | Mencari definisi lengkap satu kata beserta makna, kelas kata, contoh kalimat, kata turunan, dan peribahasanya. | `{"kata":"pintar"}` | Objek WordDetail: word, entries[{ nama, makna[], kelasKata[], contoh }], terkait | - |
| `cari_kata_awalan` | Autocomplete: mencari kandidat kata berdasarkan awalan. | `{"awalan":"pin","limit":20}` | `{ awalan, jumlah, kata: ["pinang", "pindah", "pintar", ...] }` | `ekspor_training_dic` |
| `kelas_kata` | Mengetahui kelas kata (nomina, verba, adjektiva, dan sejenisnya) sebuah kata. | `{"kata":"pintar"}` | `{ kata, kelasKata: [{ kode, label }] }` | - |
| `contoh_kalimat` | Mengambil contoh penggunaan kata dalam kalimat dari KBBI. | `{"kata":"pintar"}` | `{ kata, contoh: ["..."] }` | - |
| `peribahasa` | Mencari peribahasa yang mengandung kata tertentu beserta maknanya. | `{"kata":"pintar"}` | `{ kata, jumlah, peribahasa: [{ peribahasa, makna }] }` | - |
| `daftar_kategori` | Mengambil daftar kategori KBBI: kelas kata, bahasa asal, bidang subjek, atau kategori lainnya. | `{"tipe":"kelas-kata"}` | Objek kategori sesuai tipe yang diminta | - |
| `cari_kata_dasar_dari_lexicon` | Cek cepat status satu kata pada leksikon: kata dasar, turunan, atau bukan keduanya. | `{"kata":"membantu"}` | `{ kata, isKataDasar, isKataTurunan, kataDasar }` | `daftar_kata_dasar_kbbi` |
| `statistik_lexicon` | Statistik leksikon: jumlah root words, derived words, dan entri pemenggalan. | `{}` | `{ rootWords, derivedWords, hyphenationEntries }` | - |

## Keluarga stemmer (5 kapabilitas)

| Nama | Untuk tugas apa | Contoh masukan | Bentuk keluaran | Alternatif massal |
|---|---|---|---|---|
| `cari_kata_dasar` | Menentukan kata dasar dari leksikon, lalu melengkapi pemenggalan dari artikel KBBI bila tersedia. | `{"kata":"membantu"}` | `{ kata, kataDasar, pemenggalan, catatan? }` | `daftar_kata_dasar_kbbi` |
| `daftar_kata_turunan` | Daftar semua kata turunan dari sebuah kata dasar, turunan kembar dihitung satu kali. | `{"kataDasar":"pintar"}` | `{ kataDasar, jumlahTurunan, kataTurunan: [...] }` | - |
| `ekspor_stem_mapping` | Ekspor massal seluruh kata berimbuhan beserta kata dasarnya untuk satu huruf, sebagai data training stemmer. | `{"huruf":"M"}` | `{ huruf, total, mappings: [{ kata, kataDasar, ... }] }` | - |
| `analisis_imbuhan` | Menguraikan struktur imbuhan sebuah kata: prefiks, sufiks, infiks, dan kata dasarnya, dengan kata dasar diambil dari leksikon. | `{"kata":"membantu"}` | `{ kata, prefiks, sufiks, kataDasar, pemenggalan }` | - |
| `daftar_kata_dasar_kbbi` | Daftar kata dasar KBBI, yaitu entri tanpa rootWord, untuk satu huruf. | `{"huruf":"M"}` | `{ huruf, jumlah, kataDasar: [...] }` | - |

## Keluarga pemenggalan (7 kapabilitas)

| Nama | Untuk tugas apa | Contoh masukan | Bentuk keluaran | Alternatif massal |
|---|---|---|---|---|
| `pemenggalan_kata` | Mengambil pemenggalan suku kata satu kata dari KBBI. | `{"kata":"pintar"}` | `{ kata, nama, pemenggalan, dicFormat, sukuKata, jumlahSukuKata }` | `ekspor_training_dic` |
| `ekspor_training_dic` | Ekspor massal pemenggalan satu huruf dalam format .dic untuk training Orthos atau patgen2. | `{"huruf":"P"}` | `{ huruf, totalEntries, format, dicContent }` | - |
| `validasi_pemenggalan` | Membandingkan hasil pemenggalan engine dengan data KBBI untuk satu kata. | `{"kata":"pintar","expected":"pin-tar"}` | `{ kata, valid, actual, expected }` | - |
| `statistik_pola_suku` | Statistik pola suku kata (KV, KVK, V, VK, dan sejenisnya) untuk satu huruf, untuk analisis fonotaktik. | `{"huruf":"P"}` | `{ huruf, total, pola: { KV: n, KVK: n, ... } }` | - |
| `cari_pemenggalan` | Cari pemenggalan satu kata dari flat file hyphenation, cepat tanpa iterasi word-details. | `{"kata":"pintar"}` | `{ kata, pemenggalan, sukuKata }` | `ekspor_training_dic` |
| `daftar_dic` | Ekspor seluruh isi berkas .dic dari hyphenation, bukan per huruf. | `{"format":"id"}` | Teks isi berkas .dic beserta jumlah baris | - |
| `bandingkan_dic` | Membandingkan dua format .dic: jumlah baris, perbedaan, dan sampel entri yang berbeda. | `{"format1":"id","format2":"id_orthos"}` | `{ format1, format2, jumlah1, jumlah2, hanyaDi1, hanyaDi2, sampel }` | - |

## Alur siap pakai (5 alur)

| Nama alur | Untuk tugas apa |
|---|---|
| `siapkan_data_training_pemenggalan` | Menyiapkan dataset .dic pemenggalan untuk training engine Orthos atau patgen2. |
| `siapkan_data_training_stemmer` | Menyiapkan pasangan kata berimbuhan dan kata dasarnya sebagai data training stemmer. |
| `analisis_edge_cases` | Mencari kata yang mungkin salah di-stem, untuk penyempurnaan engine. |
| `validasi_engine` | Mengukur akurasi engine terhadap data KBBI, untuk stemmer maupun pemenggalan. |
| `bandingkan_kata` | Membandingkan dua kata atau dua sumber kamus. |

## Aturan Recall yang paling penting

Untuk pekerjaan massal, pakai kapabilitas ekspor. Yang berikut adalah cara yang
salah:

- `cari_kata` berulang atas ribuan kata, ganti `ekspor_stem_mapping`
- `pemenggalan_kata` berulang atas ribuan kata, ganti `ekspor_training_dic`
- `cari_kata_dasar` berulang atas ribuan kata, ganti `daftar_kata_dasar_kbbi`

Ekspor bersifat per huruf, jadi dataset penuh butuh 26 panggilan, bukan satu.