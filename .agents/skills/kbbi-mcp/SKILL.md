---
name: kbbi-mcp
description: Gunakan skill ini saat pengguna meminta definisi, kelas kata, contoh kalimat, peribahasa, atau makna turunannya sebuah kata Indonesia, atau saat pengguna menyiapkan data training stemmer dan pemenggalan kata. Skill ini memandu pemilihan kapabilitas server KBBI MCP, termasuk kapan memakai ekspor massal alih-alih pencarian satu per satu.
version: 1.0.0
---

# Server KBBI MCP

Server ini menyediakan data kamus bahasa Indonesia lewat Model Context Protocol.
Fungsinya: definisi, kelas kata, contoh kalimat, peribahasa, dan pemenggalan kata
dari KBBI, ditambah kapabilitas ekspor untuk menyiapkan data training NLP.

Daftar lengkap kapabilitas ada di `references/capabilities.md`. Baca berkas itu
ketika perlu tahu nama dan parameter yang tepat.

## Memilih kapabilitas

Pilih berdasarkan tugas pengguna, bukan berdasarkan struktur internal server.

| Tugas pengguna | Kapabilitas yang dipakai |
|---|---|
| Apa arti kata X | `cari_kata` |
| Kata apa saja yang berawalan X | `cari_kata_awalan` |
| X termasuk kata apa (nomina, verba, dan sejenisnya) | `kelas_kata` |
| Contoh kalimatnya | `contoh_kalimat` |
| Ada peribahasa tentang X | `peribahasa` |
| Apa saja daftar kategorinya | `daftar_kategori` |
| Kata dasar X itu apa | `cari_kata_dasar`, atau `cari_kata_dasar_dari_lexicon` untuk hasil massal |
| Kata turunan dari X | `daftar_kata_turunan` |
| Imbuhan pada X itu apa | `analisis_imbuhan` |
| Suku kata X itu apa | `pemenggalan_kata` |
| Hitung pemenggalan seluruh kata berawalan X | `cari_pemenggalan` |
| Bandingkan hasil engine dengan KBBI | `validasi_pemenggalan`, `bandingkan_dic` |
| Hitung kata dasar KBBI | `daftar_kata_dasar_kbbi` |
| Seberapa besar leksikon | `statistik_lexicon`, `statistik_pola_suku` |
| Isi berkas .dic untuk satu huruf | `daftar_dic` |

## Batas yang harus dijelaskan, bukan dikarang

Server ini punya batas berikut. Saat tugas melewati batas ini, sampaikan batasnya
kepada pengguna. Jangan mengarang pemanggilan kapabilitas yang tidak ada.

- Data diambil dari CDN. Saat jaringan gagal, hasilnya adalah kegagalan
  jaringan, bukan berarti kata itu tidak ada di kamus.
- Isi data adalah entri KBBI, kata berimbuhan, dan pemenggalan. Tidak ada
  etimologi, terjemahan antar bahasa, atau data usage modern.
- Ekspor bersifat per huruf, bukan satu panggilan untuk seluruh kamus. Untuk
  dataset penuh, panggil per huruf A sampai Z.
- Ukuran yang akurat untuk sekelas kata ada di `statistik_lexicon` dan
  `statistik_pola_suku`, bukan hasil perkiraan.
- Server tidak menyimpan data kamus di disk. Semua pembacaan data lewat CDN.

## Massal, bukan satu per satu

Aturan paling penting untuk produktivitas.

Untuk pekerjaan massal, pakai kapabilitas ekspor. Memanggil `cari_kata` berulang
atas ribuan kata adalah cara yang salah dan boros.

| salah | benar |
|---|---|
| memanggil `cari_kata` untuk tiap kata satu per satu | `ekspor_stem_mapping` dengan satu huruf |
| memanggil `pemenggalan_kata` untuk tiap kata | `ekspor_training_dic` dengan satu huruf |
| memanggil `cari_kata_dasar` untuk tiap kata | `daftar_kata_dasar_kbbi` atau `cari_kata_dasar_dari_lexicon` |

Contoh: menyiapkan data training pemenggalan untuk satu huruf P cukup satu
panggilan `ekspor_training_dic` dengan `{ "huruf": "P" }`, bukan ratusan
panggilan `pemenggalan_kata`.

## Alur siap pakai

Bila pengguna mendeskripsikan sebuah proyek, bukan satu kata, masih ada lima
alur yang sudah disiapkan. Gunakan yang paling dekat:

- `siapkan_data_training_pemenggalan` - dataset .dic untuk Orthos atau patgen2
- `siapkan_data_training_stemmer` - pasangan kata berimbuhan dan kata dasarnya
- `analisis_edge_cases` - kata yang mungkin salah di-stem, untuk penyempurnaan
- `validasi_engine` - mengukur akurasi engine terhadap KBBI
- `bandingkan_kata` - membandingkan dua kata atau dua sumber

## Batas waktu OpenCode

Jika memakai OpenCode, panggilan pertama butuh waktu lebih dari batas bawaan
lima detik karena data kamus diambil dari jaringan. Bila waktu tunggu habis,
naikkan batas waktu tool, jangan menyimpulkan servernya rusak.