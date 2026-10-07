---
description: "Log temuan cacat selama proses onboarding"
---

# Log Temuan Cacat

Setiap temuan yang muncul selama memasang, memakai, dan mendokumentasikan server
dicatat di sini. Entri yang tidak bisa direproduksi tetap dicatat, dengan alasan
penolakan. Tidak ada temuan yang hilang tanpa keputusan (SC-011).

Format entri mengikuti `DefectFinding` pada `data-model.md`:

| Kolom | Isi |
|---|---|
| id | Pengenal stabil untuk deduplikasi |
| target | Nama kapabilitas atau path berkas |
| steps | Langkah reproduksi, harus bisa dijalankan orang lain |
| expected | Perilaku yang benar |
| actual | Perilaku yang teramati |
| status | recorded, fixed, rejected, deferred |
| regressionTest | Wajib ada saat statusnya fixed |
| rejectionReason | Wajib ada saat statusnya rejected |
| docUpdated | true bila perilaku yang didokumentasikan berubah |

---

## D-F01: `verify-accuracy.cjs` membaca direktori yang tidak pernah ada

| Kolom | Isi |
|---|---|
| id | D-F01 |
| target | `scripts/verify-accuracy.cjs:17` |
| steps | 1. `npm install` lalu `npm run build`. 2. Jalankan `node scripts/verify-accuracy.cjs`. |
| expected | Skrip melaporkan angka akurasi pemenggalan engine terhadap KBBI. |
| actual | Skrip melempar `ENOENT`. `WORD_DETAILS_DIR` menunjuk `word-details/` yang tidak ada di repositori dan tidak pernah ada, karena proyek ini murni CDN sejak awal (Konstitusi Prinsip I). `loadAllWords` memanggil `fs.readdirSync` pada path yang hilang. |
| status | fixed |
| regressionTest | `src/__tests__/verify-accuracy.test.ts` |
| rejectionReason | - |
| docUpdated | false |

**Dampak**: gerbang akurasi pada bagian kualitas Konstitusi, yang mensyaratkan
`scripts/verify-accuracy.cjs` tidak menunjukkan regresi, tidak bisa dijalankan
sama sekali oleh pengembang mana pun. Witten pada `TODO(ACCURACY_GATE)`.

**Akar masalah**: akses data langsung ke berkas lokal, melanggar Konstitusi
Prinsip II yang mewajibkan seluruh akses data lewat `src/data/reader.ts`.

**Perbaikan**: `loadAllWords` kini memakai leksikon dan kamus lewat
`src/data/reader.ts`, bukan `fs.readdirSync`. Direktori `word-details/` tidak
pernah dibuat sebagai jalan pintas, dan tidak ada data kamus yang dibundel,
sesuai FR-027.

---

## D-F02: jumlah kapabilitas di dokumentasi tidak cocok dengan kode

| Kolom | Isi |
|---|---|
| id | D-F02 |
| target | `spec.md`, `data-model.md`, `contracts/skill-package.md`, `contracts/client-registry.md` |
| steps | 1. Hitung `server.tool(` di `src/tools/*.ts`. 2. Bandingkan dengan angka pada spesifikasi. |
| expected | Dokumen dan hasil hitung kode harus sama. |
| actual | Kode mendaftarkan **20** kapabilitas: 8 kamus, 5 stemmer, 7 pemenggalan. Empat dokumen spesifikasi menyebut **21**, dan menjumlahkan 8 + 5 + 7 = 20 secara implisit. Angka 21 tidak dapat ditelusuri ke lokasi pendaftaran mana pun. |
| status | fixed |
| regressionTest | `src/__tests__/installer-docs.test.ts` |
| rejectionReason | - |
| docUpdated | true |

**Akar masalah**: angka 21 sudah ditulis saat spesifikasi dibuat, sebelum
hitungan otomatis ada. Tidak ada yang memverifikasi ulang terhadap kode.

**Perbaikan**: angka pada `docs/USAGE.md` dan `docs/capabilities-reference.md`
dihasilkan dari `src/tools/*.ts`, bukan ditulis tangan. `npm run docs:check`
memeriksa kedua arah, jadi selisih seperti ini akan menggagalkan gerbang pada
saat berikutnya.

**Catatan kontrak**: FR-014 dan SC-005 menyebut "21 kapabilitas". Angka itu
dipakai sebagai target cakupan, yaitu semua kapabilitas yang diekspos server.
Cakupan tetap terpenuhi sepenuhnya; hanya angkanya yang dikoreksi ke 20.
Nama kapabilitas tidak berubah sama sekali, sesuai FR-026 dan SC-010.

---

## D-F04: `npm test` gagal secara tidak stabil karena dua berkas tes berbagi satu direktori fixture

| Kolom | Isi |
|---|---|
| id | D-F04 |
| target | `src/__tests__/extractors.test.ts`, `src/__tests__/reader.test.ts`, `package.json` |
| steps | 1. Jalankan `npx tsx --test src/__tests__/reader.test.ts src/__tests__/extractors.test.ts` berulang kali tanpa `--test-concurrency=1`. |
| expected | Hasil selalu sama. |
| actual | Hasil berubah-ubah: satu kali lolos, berikutnya gagal satu atau dua tes. `getRootWords: lokal-first` kadang membaca `abang/abar/bantu` dari fixture milik berkas lain, bukan `pintar/bantu` miliknya sendiri. |
| status | fixed |
| regressionTest | `package.json`, script `test` |
| rejectionReason | - |
| docUpdated | false |

**Akar masalah**: `extractors.test.ts` menulis fixture ke `lexicon/` dan
`hyphenation/` di akar repositori, lalu menghapusnya di `after`. `reader.test.ts`
menghapus direktori yang sama di setiap `afterEach`. node:test menjalankan
berkas tes secara paralel secara bawaan, sehingga keduanya berebut atas satu
direktori yang sama. Ini cacat yang sudah ada sebelum fitur ini; ia menjadi
terlihat saat berkas tes installer ditambahkan dan mengubah urutan eksekusi.

**Perbaikan**: kedua skrip `test` dan `test:integration` kini memakai
`--test-concurrency=1` sehingga berkas tes berjalan berurutan. Direktori
fixture tidak lagi direbut. Memindahkan fixture ke lokasi per-berkas akan lebih
bersih, tetapi itu perubahan yang lebih luas dari yang dibenarkan fitur ini.

**Catatan**: cacat ini sudah ada sebelum fitur ini. Yang memicu adalah
penambahan berkas tes installer, yang mengubah urutan eksekusi dan membuat
direbutan direktori fixture lebih sering terjadi.

---

## D-F03: `check-capabilities.cjs` salah membaca nama prompt

| Kolom | Isi |
|---|---|
| id | D-F03 |
| target | `scripts/check-capabilities.cjs` |
| steps | 1. Jalankan `node scripts/check-capabilities.cjs` pada versi pertama berkasnya. 2. Perhatikan baris keluaran jumlah alur. |
| expected | `5 alur`. |
| actual | `0 alur`. Ekstraktor mencari `registerPrompt(`, padahal `src/prompts/index.ts` memanggil API SDK secara langsung lewat `server.prompt(`. Hasilnya daftar alur kosong sehingga gerbang cek dokumentasi tidak akan pernah complain saat satu alur hilang dari panduan. |
| status | fixed |
| regressionTest | `src/__tests__/installer-docs.test.ts` |
| rejectionReason | - |
| docUpdated | false |

**Catatan**: temuan ini ditemukan oleh eksekusi pertamanya sendiri. Gerbang
dokumentasi yang tidak bisa melihat alur sama saja tidak ada gerbang.
---

## D-F05: kapabilitas stemmer menganggap `word-details` sebagai satu-satunya otoritas

| Kolom | Isi |
|---|---|
| id | D-F05 |
| target | `src/tools/stemmer.ts` (`cari_kata_dasar`, `analisis_imbuhan`) |
| steps | 1. Panggil `cari_kata_dasar` dengan `kata: "saksikan"`. 2. Panggil `analisis_imbuhan` dengan `kata: "saksikan"`. 3. Bandingkan dengan `cari_kata_dasar_dari_lexicon` untuk kata yang sama. |
| expected | Ketiganya menjawab `kataDasar: "saksi"`. |
| actual | Dua kapabilitas pertama gagal dengan `CDN fetch failed: 404 .../word-details/S/saksikan.json` dan `isError: true`, padahal `saksikan` tercatat di `lexicon/derived_to_root.json` sebagai turunan dari `saksi` dan kapabilitas ketiga menjawabnya dengan benar. `word-details` dan leksikon adalah artefak terpisah dengan cakupan berbeda: `saksikan` tidak punya artikel, tidak punya baris wordlist, dan tidak punya entri pemenggalan. Karena dua kapabilitas itu mengambil seluruh keputusan dari artikel, keduanya mewarisi celah cakupan artikel. |
| status | fixed |
| regressionTest | `src/__tests__/stemmer-lexicon.test.ts` |
| rejectionReason | - |
| docUpdated | true |

**Akar masalah**: `getWordDetail(kata)` adalah pernyataan pertama di dalam
`try` pada kedua kapabilitas itu, jadi 404 terjadi sebelum logika kata dasar
semuanya berjalan. `Entry.rootWord` juga opsional di `src/data/types.ts`, jadi
even sebuah artikel yang berhasil diambil pun tidak menjamin ada kata dasar;
ketiadaan `rootWord` lalu ditafsirkan jadi "kemungkinan kata dasar".erver
sudah punya jawaban yang benar dalam bentuk
`cari_kata_dasar_dari_lexicon`, tetapi itu kapabilitas terpisah, bukan
implementasi bersama, sehingga kedua kapilitas stemmer tidak pernah mendapat
cakupan leksikon.

**Perbaikan**: leksikon jadi otoritas. `lookupKataStatus(kata)` di
`src/data/training-extractor.ts` membaca `root_words.txt` dan
`derived_to_root.json` lewat `src/data/reader.ts` sesuai Prinsip II, dan
mengembalikan status `derived`, `root`, atau `unknown`. Kedua kapabilitas
memakai hasil itu untuk keputusan, lalu memanggil `word-details` hanya untuk
melengkapi `pemenggalan` lewat `enrichPemenggalan`, yang selalu melempar
`""` bila artikel tidak ada. `analyzeAffixesFromRoot(kata, kataDasar,
pemenggalan)` menggantikan `analyzeWordAffixes`, yang tidak lagi punya pemanggil
setelah perubahan ini dan karena itu dihapus.

**Catatan**: `cari_kata` tetap bergantung penuh pada `word-details`, karena
memang tidak ada yang bisa dijawab tanpa artikel. `analisis_imbuhan` untuk
`saksikan` menghasilkan `prefiks: ""` dan `sufiks: "kan"`: heuristik sufiks
diperhatikan lebih dulu dan sisa "saksi" sama persis dengan akar, jadi tidak
ada prefiks yang terdeteksi. Ini hasil heuristik yang diamati, bukan asumsi.

---

## D-F06: `daftar_kata_turunan` menghitung turunan kembar berkali-kali

| Kolom | Isi |
|---|---|
| id | D-F06 |
| target | `src/tools/stemmer.ts` (`daftar_kata_turunan`) |
| steps | 1. Panggil `daftar_kata_turunkan` dengan `kataDasar: "balak"`. 2. Baca artikel `word-details/B/balak.json`. |
| expected | `jumlahTurunan: 4` atas empat kata turunan yang berbeda. |
| actual | `jumlahTurunan: 12`, dengan empat kata yang sama diulang tiga kali berturut-turut. Artikel itu berisi tujuh entri; entri 1, 2, dan 3 (makna "belang", "wilayah klan", "balok") membawa `terkait.kataTurunan` yang identik, sedangkan entri 4 sampai 7 kosong. 3 x 4 = 12. |
| status | fixed |
| regressionTest | `src/__tests__/stemmer-lexicon.test.ts` |
| rejectionReason | - |
| docUpdated | true |

**Akar masalah**: KBBI mengelompokkan kata turunan di bawah makna tertentu,
sehingga satu artikel mengulang daftar turunan yang sama pada beberapa entri.
`daftar_kata_turunan` menempelkan satu daftar per entri tanpa menggabungkan duplikat
(`turunan.push(...entry.terkait.kataTurunan)`), lalu melaporkan panjang daftar
mentah itu sebagai `jumlahTurunan`. Isi informasinya benar, hanya kelipatannya
dan jumlah yang salah; karena jumlah dihitung dari daftar yang sama, cacat ini
merusak data training secara senyap, bukan sekadar berisik.

**Perbaikan**: deduplikasi eksplisit yang mempertahankan urutan kemunculan
pertama, dan `jumlahTurunan` dihitung dari daftar itu sendiri sehingga jumlah
dan daftar tidak bisa berbeda lagi.
