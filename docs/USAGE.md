---
description: "Panduan penggunaan server KBBI MCP"
---

# Panduan Penggunaan Server KBBI MCP

Server ini menyediakan data kamus bahasa Indonesia lewat Model Context Protocol.
Untuk memasang, lihat `docs/INSTALL.md`.

Dokumen ini memetakan setiap kapabilitas yang diekspos server ke tugas yang
layak dipakai, lengkap dengan contoh pemanggilan dan bentuk keluarannya.

Daftar di bawah ini cakupan lengkap dan diverifikasi otomatis terhadap kode.
Jalankan `npm run docs:check` untuk memastikan tidak ada kapabilitas yang
terlewat atau pun entri yang menunjuk kapabilitas fiktif.

---

## Cara membaca dokumen ini

Tiga kolom paling penting:

- **Untuk tugas apa**: pakai kolom ini untuk memilih kapabilitas.
- **Contoh masukan**: argumen yang sah menurut skema tool.
- **Bentuk keluaran**: bentuk ringkas respons sebenarnya, bukanASN.

Kolom **alternatif massal** menunjuk kapabilitas yang lebih tepat bila tugasnya
bersifat massal. briefed kolom itu mengabaikan adalah penyebab paling umum
pekerjaan melambat.

---

## 1. Mencari makna dan informasi dasar

### `cari_kata`

Definisi lengkap satu kata: makna, kelas kata, contoh kalimat, kata turunan,
dan peribahasa sekaligus. Ini kapabilitas pertama yang dipakai hampir selalu.

- Masukan: `{ "kata": "pintar" }`
- Keluaran: objek WordDetail, yaitu `{ word, entries: [{ nama, makna[], kelasKata[], contoh }], terkait }`
- Alternatif massal: tidak ada. Untuk satu kata, satu panggilan sudah paling hemat.

### `cari_kata_awalan`

Autocomplete. Mencari kandidat kata berdasarkan awalan, berguna saat pengguna
hanya ingat sebagian kata.

- Masukan: `{ "awalan": "pin", "limit": 20 }`
- Keluaran: `{ awalan, jumlah, kata: ["pinang", "pindah", "pintar", ...] }`
- Alternatif massif: `ekspor_training_dic`, bila yang dicari pemenggalan sekelas, bukan daftar kata.

### `kelas_kata`

Kelas kata: nomina, verba, adjektiva, dan sejenisnya. Menyaring entri yang
memiliki beberapa makna, lalu mengembalikan kelas kata unik.

- Masukan: `{ "kata": "pintar" }`
- Keluaran: `{ kata, kelasKata: [{ kode, label }] }`

### `contoh_kalimat`

Contoh penggunaan kata dalam kalimat, langsung dari KBBI.

- Masukan: `{ "kata": "pintar" }`
- Keluaran: `{ kata, contoh: ["..."] }`

### `peribahasa`

Peribahasa yang mengandung kata tertentu, beserta maknanya.

- Masukan: `{ "kata": "pintar" }`
- Keluaran: `{ kata, jumlah, peribahasa: [{ peribahasa, makna }] }`

### `daftar_kategori`

Daftar kategori KBBI: kelas kata, bahasa asal, bidang subjek, atau kategori
lainnya sesuai tipe yang diminta.

- Masukan: `{ "tipe": "kelas-kata" }`
- Keluaran: objek kategori sesuai tipe

---

## 2. Kata dasar dan kata turunan

### `cari_kata_dasar`

Kata dasar dari sebuah kata berimbuhan. Kata dasarnya ditentukan dari leksikon
(root_words.txt dan derived_to_root.json), bukan dari artikel word-details,
sehingga kata turunan yang belum punya artikel KBBI tetap dijawab.

Bila leksikon mencatat kata itu sebagai kata dasar, hasilnya adalah kata itu
sendiri dan dinyatakan lewat field `catatan`. Kata yang tidak ada di kedua
leksikon dianggap tidak dikenal dan dikembalikan sebagai error, bukan ditebak
jadi kata dasar. Field `pemenggalan` diisi dari artikel KBBI bila tersedia,
dan **boleh kosong** bila artikelnya tidak ada.

- Masukan: `{ "kata": "membantu" }`
- Keluaran: `{ kata, kataDasar, pemenggalan, catatan? }`
- Alternatif massal: `daftar_kata_dasar_kbbi`

### `cari_kata_dasar_dari_lexicon`

Versi cepat dari pemeriksaan yang sama, membaca flat file leksikon, bukan
mengiterasi word-details.

- Masukan: `{ "kata": "membantu" }`
- Keluaran: `{ kata, isKataDasar, isKataTurunan, kataDasar }`
- Alternatif massal: `daftar_kata_dasar_kbbi`

### `daftar_kata_turunan`

Semua kata turunan dari sebuah kata dasar. KBBI mengulang daftar turunan yang
sama pada beberapa entri satu artikel, jadi turunan yang sama dihitung satu
kali; `jumlahTurunan` selalu dihitung dari daftar itu sendiri.

- Masukan: `{ "kataDasar": "pintar" }`
- Keluaran: `{ kataDasar, jumlahTurunan, kataTurunan: [...] }`

### `daftar_kata_dasar_kbbi`

Daftar kata dasar KBBI, yaitu entri tanpa `rootWord`, untuk satu huruf. Berguna
untuk cross-reference dengan kamus stemmer milik sendiri.

- Masukan: `{ "huruf": "M" }`
- Keluaran: `{ huruf, jumlah, kataDasar: [...] }`
- Alternatif massal: ini sudah kapabilitas massal, tidak perlu menggabungkannya.

### `statistik_lexicon`

Statistik leksikon: jumlah root words, derived words, dan entri pemenggalan.

- Masukan: `{}`
- Keluaran: `{ rootWords, derivedWords, hyphenationEntries }`

---

## 3. Analisis imbuhan

### `analisis_imbuhan`

Menguraikan struktur imbuhan: prefiks, sufiks, infiks, dan kata dasarnya.
Kata dasarnya diambil dari leksikon, jadi kata turunan tanpa artikel KBBI
tetap teranalisis. Kata yang tidak ada di kedua leksikon dikembalikan sebagai
error. Field `pemenggalan` boleh kosong bila artikel KBBI tidak tersedia.

- Masukan: `{ "kata": "membantu" }`
- Keluaran: `{ kata, prefiks, sufiks, pemenggalan }`

Perhatikan batasnya: ini pisah imbuhan secara leksikal, bukan analisis
linguistik mendalam. Untuk anomali yang perlu ditinjau manusia, pakai alur
`analisis_edge_cases`.

---

## 4. Pemenggalan suku kata

### `pemenggalan_kata`

Pemenggalan suku kata satu kata, baik bentuk bertitik (`pin.tar`) maupun bentuk
hyphen (`pin-tar`), beserta daftar sukunya.

- Masukan: `{ "kata": "pintar" }`
- Keluaran: `{ kata, nama, pemenggalan, dicFormat, sukuKata, jumlahSukuKata }`
- Alternatif massal: `ekspor_training_dic`

### `cari_pemenggalan`

Versi cepat, membaca flat file hyphenation.

- Masukan: `{ "kata": "pintar" }`
- Keluaran: `{ kata, pemenggalan, sukuKata }`
- Alternatif massal: `ekspor_training_dic`

### `statistik_pola_suku`

Statistik pola suku kata (KV, KVK, V, VK, dan sejenisnya) untuk satu huruf, untuk
analisis fonotaktik bahasa Indonesia.

- Masukan: `{ "huruf": "P" }`
- Keluaran: `{ huruf, total, pola: { KV: n, KVK: n, ... } }`

---

## 5. Ekspor massal

Dua kapabilitas inilah yang membuat pekerjaan bermasalah menjadi mudah. Tanpa
keduanya, menyiapkan data training berarti ribuan panggilan tunggal.

### `ekspor_stem_mapping`

Seluruh kata berimbuhan beserta kata dasarnya untuk satu huruf, sekaligus.

- Masukan: `{ "huruf": "M" }`
- Keluaran: `{ huruf, total, mappings: [{ kata, kataDasar, ... }] }`

### `ekspor_training_dic`

Seluruh pemenggalan satu huruf dalam format .dic untuk training Orthos atau
patgen2.

- Masukan: `{ "huruf": "P" }`
- Keluaran: `{ huruf, totalEntries, format, dicContent }`

Keduanya bersifat per huruf. Dataset penuh berarti 26 panggilan, bukan satu.

### `daftar_dic`

Seluruh isi berkas .dic dari `hyphenation/`, bukan per huruf. Ada tiga format:
`id`, `id_orthos`, dan `id_words`.

- Masukan: `{ "format": "id" }`
- Keluaran: teks isi berkas beserta jumlah baris

### `bandingkan_dic`

Membandingkan dua format .dic: jumlah baris, entri yang hanya ada di salah
satu, dan sampel perbedaannya.

- Masukan: `{ "format1": "id", "format2": "id_orthos" }`
- Keluaran: `{ format1, format2, jumlah1, jumlah2, hanyaDi1, hanyaDi2, sampel }`

---

## 6. Validasi engine

### `validasi_pemenggalan`

Membandingkan hasil pemenggalan engine sendiri dengan data KBBI, untuk satu
kata pada satu waktu.

- Masukan: `{ "kata": "pintar", "expected": "pin-tar" }`
- Keluaran: `{ kata, valid, actual, expected }`
- Alternatif__: untuk pengukuran akurasi menyeluruh, pakai skrip
  `node scripts/verify-accuracy.cjs`, bukan memanggil tool ini kata per kata.

---

## 7. Alur siap pakai

Bila pengguna mendeskripsikan sebuah proyek, bukan satu kata, lima alur ini
sudah disiapkan dan lebih baik daripada menyusun panggilan sendiri.

| Alur | Untuk tugas apa |
|---|---|
| `siapkan_data_training_pemenggalan` | Menyiapkan dataset .dic pemenggalan untuk training engine Orthos atau patgen2 |
| `siapkan_data_training_stemmer` | Menyiapkan pasangan kata berimbuhan dan kata dasarnya sebagai data training stemmer |
| `analisis_edge_cases` | Mencari kata yang mungkin salah di-stem, untuk penyempurnaan engine |
| `validasi_engine` | Mengukur akurasi engine terhadap data KBBI, untuk stemmer maupun pemenggalan |
| `bandingkan_kata` | Membandingkan dua kata atau dua sumber kamus |

Alur ini menjalankan serangkaian panggilan kapabilitas secara terarah, bukan tebakan
panggilan individu. Bila tugas pengguna cocok dengan salah satunya, pakai alur
itu, bukan memanggil tool satu per satu.

---

## 8. Batas server yang perlu dijelaskan

Bila tugas melewati batas berikut, sampaikan batasnya. Jangan mengarang
kapabilitas yang tidak ada.

- Data diambil dari CDN, bukan dari disk. Server tidak pernah menyimpan data
  kamus secara lokal, dan tidak ada data kamus yang diunduh ke mesin pengguna.
- Kegagalan jaringan menghasilkan kegagalan jaringan, bukan "kata tidak ada di
  kamus". Keduanya perlu dibedakan saat melapor.
- Ekspor hanya per huruf. Tidak ada satu panggilan untuk seluruh dataset.
- Isi data adalah entri KBBI, kata berimbuhan, dan pemenggalan. Tidak ada
  etimologi, terjemahan antar bahasa, atau data usage modern.
- Tidak ada kapabilitas baru yang ditambahkan fitur ini. Seluruh perubahan pada
  server bersifat perbaikan atas kapabilitas yang sudah ada.

---

## 9. Kalau gagal

| Gejala | Penyebab yang paling mungkin | Langkah |
|---|---|---|
| Waktu tunggu habis pada panggilan pertama di OpenCode | Batas bawaan OpenCode lima detik, lebih pendek dari satu putaran CDN | Naikkan batas waktu tool, lihat `docs/INSTALL.md` |
| Semua tool gagal sekaligus | Jaringan menuju CDN sedang tidak terjangkau | Uji koneksi; instalasi tetap dianggap berhasil |
| `kata tidak ditemukan` padahal kata itu ada | Salah ejaan, atau kata itu tidak ada di KBBI | Coba `cari_kata_awalan` dengan awalan kata tersebut |
| Entri server tidak muncul di daftar tool klien | Klien belum dimulai ulang sejak instalasi | Mulai ulang klien, lalu `node scripts/install-clients.cjs status` |

Untuk pemeriksaan menyeluruh:

```bash
node scripts/install-clients.cjs status
node scripts/install-clients.cjs verify
```