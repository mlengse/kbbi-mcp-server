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

### TODO
- [ ] `patterns/id.cjs` dipertimbangkan pindah ke lapisan `pattern/`.

