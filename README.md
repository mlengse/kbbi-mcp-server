# kbbi-mcp-server

**Lapisan: Framework (🏗️).** MCP (Model Context Protocol) server untuk KBBI — tools stemmer, pemenggalan, kamus. Diekstrak dari kode yang sebelumnya menumpang di repo data `kbbi-harvester-cdn` (fork Naandalist).

> Status: **scaffold lokal (preview)** — belum ada remote GitHub. Bagian dari restrukturisasi `dev/bahasa` (lihat `../../implementation_plan.md`, Fase 5). Repo ini **milik sendiri** (bukan fork).

## Struktur
```
src/       server + tools/ (kamus, pemenggalan, stemmer) + data/ (reader, index-builder)
config/    contoh konfigurasi klien (claude-desktop, cursor, gemini-cli)
scripts/   build browser bundle, konversi pola
patterns/  id.cjs (pola hyphenation untuk browser build)   ← kandidat pindah ke pattern/ nanti
```

## Data — via CDN, TIDAK di-bundle
Server **tidak** menyimpan 415 MB data KBBI. `src/data/reader.ts` memakai mode hybrid:
- Baca file lokal bila ada → jika tidak, ambil dari **CDN** `cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@main` (repo data di `../../data/kbbi-harvester-cdn`).
- Strategi data = **blob + jsDelivr** (per-file), karena data dipakai per-kata untuk pengujian & akses MCP. Lihat rekomendasi di `implementation_plan.md`.

### TODO
- [ ] Pin `CDN_BASE` ke tag data (`@data-vX`) alih-alih `@main` untuk reproducibility.
- [ ] Buat repo GitHub + push (**perlu izin/aksi pengguna**).
- [ ] `patterns/id.cjs` dipertimbangkan pindah ke lapisan `pattern/`.

## Catatan
Salinan kode ini **masih ada juga** di `data/kbbi-harvester-cdn` (belum dihapus dari sana). Membersihkan kode dari repo data = langkah tinjauan terpisah pada fork Naandalist.
