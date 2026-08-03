# kbbi-mcp-server

**Lapisan: Framework (🏗️).** MCP (Model Context Protocol) server untuk KBBI — tools stemmer, pemenggalan, kamus. Diekstrak dari kode yang sebelumnya menumpang di repo data `kbbi-harvester-cdn` (fork Naandalist).

## Struktur
```
src/       server + tools/ (kamus, pemenggalan, stemmer) + data/ (reader, index-builder)
config/    contoh konfigurasi klien (claude-desktop, cursor, gemini-cli)
scripts/   build browser bundle, konversi pola
patterns/  id.cjs (pola hyphenation untuk browser build)   ← kandidat pindah ke pattern/ nanti
```

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
- **Unit** (`npm test`): pure logic + hybrid reader (stub fetch) + extractors (fixtures lokal) — tanpa network, tanpa dep baru (`node:test` + `tsx`).
- **Integration** (`npm run test:integration`): boot server via `createKbbiServer()` + `InMemoryTransport`, panggil tools asli via CDN.

### Local Development
Jika ingin develop offline tanpa CDN, clone `kbbi-harvester-cdn` sebagai sibling directory:
```bash
git clone https://github.com/mlengse/kbbi-harvester-cdn.git
```
`reader.ts` otomatis membaca file lokal jika path-nya ada, lalu fallback ke CDN.

### TODO
- [ ] `patterns/id.cjs` dipertimbangkan pindah ke lapisan `pattern/`.

