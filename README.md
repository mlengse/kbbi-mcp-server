# kbbi-mcp-server

**Lapisan: Framework (🏗️).** MCP (Model Context Protocol) server untuk KBBI — tools stemmer, pemenggalan, kamus. Diekstrak dari kode yang sebelumnya menumpang di repo data `kbbi-harvester-cdn` (fork Naandalist).

## Dokumentasi

- [Panduan Instalasi](docs/INSTALL.md) — memasang ke Claude Code, OpenCode, Zed, dan Antigravity
- [Panduan Penggunaan](docs/USAGE.md) — 20 kapabilitas dan 5 alur siap pakai, dipetakan ke tugas yang layak
- [Referensi Kapabilitas](docs/capabilities-reference.md) — tabel yang dibangkitkan dari kode
- [Log Temuan Cacat](docs/DEFECTS.md) — cacat yang terungkap saat onboarding, beserta statusnya

## Struktur
```
src/       server + tools/ (kamus, pemenggalan, stemmer) + data/ (reader, index-builder)
config/    contoh konfigurasi klien (claude-desktop, cursor, gemini-cli)
scripts/   installer klien, build browser bundle, konversi pola, cek dokumentasi
patterns/  id.cjs (pola hyphenation untuk browser build)   ← kandidat pindah ke pattern/ nanti
docs/      INSTALL.md, USAGE.md, capabilities-reference.md, DEFECTS.md
```

## Memasang ke klien AI

```bash
npm install
npm run build
node scripts/install-clients.cjs install --client opencode
```

Installer mendaftarkan server ke empat klien (Claude Code, OpenCode, Zed,
Antigravity), meminta konfirmasi per klien, dan mencadangkan konfigurasi
sebelum menulis apa pun. Tambahkan `--dry-run` untuk melihat rencana tanpa
menulis satu byte pun.

| Perintah | Guna |
|---|---|
| `install` | Mendaftarkan server, opsional memasang skill |
| `status` | Melaporkan status registrasi dan skill per klien |
| `uninstall` | Melepas entri server dari klien terpilih |
| `restore` | Mengembalikan konfigurasi ke isi cadangan |
| `verify` | Menjalankan server dan memanggil satu kapabilitas |

Skill pendukung dipasang ke tiga lokasi: satu salinan bersama di proyek untuk
Zed dan Antigravity, serta lingkup pengguna untuk Claude Code dan OpenCode.

## Data — via CDN, TIDAK di-bundle
Server **tidak** menyimpan 415 MB data KBBI. `src/data/reader.ts` memakai mode hybrid:
- Baca file lokal bila ada → jika tidak, ambil dari **CDN** `cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@main`.
- Strategi data = **blob + jsDelivr** (per-file), karena data dipakai per-kata untuk pengujian & akses MCP.

### CDN Strategy
- **Primary:** `@main` (selalu latest) — cocok untuk development.
- **Fallback otomatis:** jika file 404 di primary, reader log warning lalu mencoba tag stabil **`@data-v4`**.
- **Override:** set env `KBBI_CDN_BASE` (mis. `@data-v4`) untuk pin ke versi produksi.

### Data Source
Data KBBI di-host di repo terpisah: [kbbi-harvester-cdn](https://github.com/mlengse/kbbi-harvester-cdn) (tag `data-v4`). Repo tersebut berisi:
- `word-details/` — 112K+ file JSON definisi kata
- `wordlist/` — daftar kata per huruf (A-Z)
- `word-category/` — kelas kata, bahasa asal, bidang subjek
- `word-with-peribahasa/` — kata yang memiliki peribahasa
- `lexicon/` — root words, derived words, derived-to-root mappings (+ `derived_to_root_with_kelas.json` untuk `kelasKata` di `ekspor_stem_mapping`)
- `hyphenation/` — data pemenggalan suku kata
- `schemas/` — JSON schema word-detail
- `orthos/` — Liang thesis & patgen2 tutorial (markdown)

### Testing
- **Unit** (`npm test`): pure logic + hybrid reader (stub fetch) + extractors (fixtures lokal) + installer (config root sementara) — tanpa network, tanpa dep baru (`node:test` + `tsx`). Berjalan berurutan (`--test-concurrency=1`) karena beberapa berkas tes berbagi direktori fixture.
- **Integration** (`npm run test:integration`): boot server via `createKbbiServer()` + `InMemoryTransport`, panggil tools asli via CDN, plus kontrak publik dan gerbang akurasi.
- **Dokumentasi** (`npm run docs:check`): membangkitkan `docs/capabilities-reference.md` dari kode dan memeriksa dokumentasi dua arah, plus gerbang karakter non-Latin.

### Local Development
Jika ingin develop offline tanpa CDN, clone `kbbi-harvester-cdn` sebagai sibling directory:
```bash
git clone https://github.com/mlengse/kbbi-harvester-cdn.git
```
`reader.ts` otomatis membaca file lokal jika path-nya ada, lalu fallback ke CDN.

### TODO
- [ ] `patterns/id.cjs` dipertimbangkan pindah ke lapisan `pattern/`.

