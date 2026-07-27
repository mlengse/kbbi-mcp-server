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
- Baca file lokal bila ada → jika tidak, ambil dari **CDN** `cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@data-v2`.
- Strategi data = **blob + jsDelivr** (per-file), karena data dipakai per-kata untuk pengujian & akses MCP.

### Data Source
Data KBBI di-host di repo terpisah: [kbbi-harvester-cdn](https://github.com/mlengse/kbbi-harvester-cdn) (tag `data-v2`). Repo tersebut berisi:
- `word-details/` — 112K+ file JSON definisi kata
- `wordlist/` — daftar kata per huruf (A-Z)
- `word-category/` — kelas kata, bahasa asal, bidang subjek
- `word-with-peribahasa/` — kata yang memiliki peribahasa
- `lexicon/` — root words, derived words, derived-to-root mappings
- `hyphenation/` — data pemenggalan suku kata

### Local Development
Jika ingin develop offline tanpa CDN, clone `kbbi-harvester-cdn` sebagai sibling directory:
```bash
git clone https://github.com/mlengse/kbbi-harvester-cdn.git
```
`reader.ts` otomatis membaca file lokal jika path-nya ada, lalu fallback ke CDN.

### TODO
- [ ] `patterns/id.cjs` dipertimbangkan pindah ke lapisan `pattern/`.

