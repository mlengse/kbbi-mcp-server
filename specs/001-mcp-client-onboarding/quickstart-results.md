# Hasil Validasi quickstart.md

**Tanggal**: 2026-10-07
**Mesin**: Windows, opencode 1.18.35 terpasang, Node.js v24.16.0

Semua pemeriksaan dijalankan terhadap `KBBI_CONFIG_ROOT` yang diarahkan ke
direktori sementara, sehingga konfigurasi klien nyata tidak pernah disentuh.
Pemeriksaan yang secara bawaan mengubah konfigurasi nyata tidak dijalankan.

| ID | Pemeriksaan | Hasil | Catatan |
|---|---|---|---|
| V1 | Installer menolak menulis tanpa build | terlewati | Memerlukan build yang sengaja disentrakkan. Jalur AlternateError sudah diuji lewat tes: `assertPrerequisites` keluar dengan kode 2 dan pesan yang menyebut Node.js serta langkah build |
| V2 | Dry-run menulis nol byte | **lolos** | Checksum SHA-256 sebelum dan sesudah dry-run identik |
| V3 | Konfirmasi dihormati per klien | terlewati | Memerlukan interaksi interaktif. Jalur logikanya diuji lewat tes: konfirmasi ditolak tidak menulis apa pun, dan lebih dari satu klien diproses dalam satu sesi |
| V4 | Instalasi idempoten | **lolos** | Dua kali install menghasilkan berkas byte-identik, dan jalannya melaporkan "konfigurasi sudah benar" |
| V5 | Entri pengguna lain bertahan | **lolos** | `unrelated-tool` tetap ada dan tidak berubah setelah install |
| V6 | Konfigurasi rusak tidak pernah ditimpa | **lolos** | Berkas rusak dilaporkan sebagai rusak, installer menolak menulis, berkas asli utuh byte per byte |
| V7 | Restore mengembalikan byte asli | **lolos** | Byte sebelum install dan setelah restore identik |
| V8 | Unregister hanya menyentuh entri kita | **lolos** | Entri `kbbi` hilang, entri lain dan kunci lain tetap ada |
| V9 | Server benar-benar jalan lewat MCP | terlewati | Memerlukan klien sungguhan. Jalur `verify` ada dan membedakan kegagalan instalasi dari kegagalan jaringan |
| V10 | Skill termuat | **lolos** | Tiga berkas skill terpasang, sesuai FR-032. Pemasangan ulang melaporkan `current` dan tidak mengubah satu byte pun |
| V11 | Dokumentasi mencakup semua kapabilitas | **lolos** | 20 kapabilitas, 0 hilang. 5 alur, 0 hilang. Sebanding dengan quickstart yang menyebut 21; lihat D-F02 |
| V12 | Pemindaian karakter non-Latin | **lolos** | Semua berkas prosa Indonesia bersih, digerbang di `npm run docs:check` |
| V13 | Tes unit tetap offline | **lolos** | 83 tes lolos tanpa akses jaringan |
| V14 | Regresi cacat skrip akurasi | **lolos** | Skrip melaporkan 68736 kata dengan akurasi 20,6 persen, bukan melempar ENOENT |

## Catatan yang perlu dibaca

**V1 dan V9 tidak dijalankan.** Keduanya butuh penyuntingan state di luar
lingkungan ini: V1 memerlukan build yang dihapus sementara, V9 memerlukan klien
MCP sungguhan. Jalur kodenya ada dan diuji, tetapi belum dibuktikan pada
lingkungan klien nyata.

**V3 tidak dijalankan.** Butuh jawaban interaktif pada prompt konfirmasi. Yang
terbukti lewat tes adalah sifat yang menentukan:: menolak satu
klien tidak menghentikan klien lain, dan konfirmasi yang ditolak tidak menulis
apa pun.

**SC-002 belum terpenuhi.** Claude Code tidak terpasang di mesin ini, sehingga
jalur instalasinya belum pernah diuji. Tiga klien lain terpasang.

**Angka kapabilitas berbeda dari quickstart.** Kode mendaftarkan 20 kapabilitas
(8 kamus, 5 stemmer, 7 pemenggalan), sedangkan dokumen spesifikasi menyebut 21.
Selisih ini tercatat sebagai D-F02 di `docs/DEFECTS.md`. Cakupan tetap
terpenuhi: setiap kapabilitas yang diekspos server ada di panduan.

**Akurasi 20,6 persen.** Ini angka yang sebenarnya dari engine pemenggalan
terhadap data KBBI, bukan regresi yang diperkenalkan fitur ini. Sumber data sudah
diverifikasi setara: kamus datar `hyphenation/kbbi_vi_hyphenation_dict.json`
memuat pasangan yang identik dengan field `entries[].nama` pada word-details.
Gerbang akurasi Konstitusi sebelumnya tidak dapat dijalankan sama sekali, jadi
belum ada angka pembanding.

**Satu kegagalan sesaat pada integration test.** Pada salah satu pengulangan
pertama, `npm run test:integration` melaporkan satu tes gagal. Dua puluh
pengulangan berikutnya seluruhnya lolos, dan kegagalannya tidak dapat direproduksi.
Tes integrasi memang mengakses CDN secara bawaan, sehingga kegagalan jaringan
sesaat adalah penjelasan yang paling mungkin. Ini **belum dibuktikan** sebagai
penyebabnya, dan tidak ada perbaikan yang diklaim. Kalau kegagalan itu muncul lagi,
`npm run test:integration` perlu dijalankan ulang sambil melihat keluaran galat.