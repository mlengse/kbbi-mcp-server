## 2025-05-18 - Promise Memoization for Large Static Datasets
**Learning:** In MCP servers and CLI tools serving repeated morphological lookups (like stemmer or dictionary queries), static lexicon files (e.g., `derived_to_root.json`, `root_words.txt`, `kbbi_vi_hyphenation_dict.json`) are often read repeatedly on every request. Re-fetching/parsing these large files synchronously or via async disk/HTTP reads takes >200ms per batch operation. Storing the pending read `Promise` (Promise memoization) allows concurrent requests to share the initial load and reduces all subsequent lookup overhead to ~0.02ms (a >10,000x speedup).
**Action:** Always memoize static dataset reads at the lowest reader layer using Promise memoization with a `.catch()` handler to reset the cache on transient network failures.

## 2025-05-19 - Memoize Set Data Structure Promises for Large Static Arrays
**Learning:** Even when array reads are memoized via Promise caching, calling `new Set(array)` on every lookup re-instantiates a 11,000+ item Set on every query, adding ~1.28ms of pure allocation overhead per lookup. Memoizing `getRootWordsSet()` as a `Promise<Set<string>>` reuses the instance across lookups, eliminating re-allocation costs entirely.
**Action:** When a static array is frequently checked for membership (O(1) lookups), memoize a `Promise<Set<T>>` at the data reader layer rather than constructing a `Set` dynamically inside the query function.

## 2025-05-20 - Parallelize Multi-Key Async Fetching in Indexes
**Learning:** Sequential `for...of` loops over fixed async batches (e.g., loading 26 letter wordlists in `WordIndex` or calculating letter counts in `getStats()`) force network/disk requests to run serially, taking ~920ms total. Executing all letter requests concurrently using `Promise.all()` reduces total time to ~330ms (~2.8x speedup) while maintaining clean error isolation per key.
**Action:** Replace sequential `for...of` loops over independent key sets with `Promise.all()` mappings to fetch or compute data in parallel.
