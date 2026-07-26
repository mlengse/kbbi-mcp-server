import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register MCP prompt templates on the server.
 * Prompts are reusable workflows that guide AI agents through specific tasks.
 */
export function registerPrompts(server: McpServer): void {
  // ──────────────────────────────────────────────────
  // siapkan_data_training_pemenggalan
  // ──────────────────────────────────────────────────
  server.prompt(
    "siapkan_data_training_pemenggalan",
    "Workflow untuk menyiapkan data training pemenggalan kata. Export .dic file, validasi format, dan generate statistik pola suku kata.",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin disiapkan datanya"),
    },
    ({ huruf }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Saya ingin menyiapkan data training pemenggalan kata untuk huruf "${huruf.toUpperCase()}". Tolong lakukan langkah-langkah berikut:

1. **Export data pemenggalan** menggunakan tool \`ekspor_training_dic\` untuk huruf ${huruf.toUpperCase()}.
2. **Analisis statistik pola suku kata** menggunakan tool \`statistik_pola_suku\` untuk huruf ${huruf.toUpperCase()}.
3. **Validasi beberapa sampel** — ambil 5 kata acak dari hasil export, lalu gunakan tool \`validasi_pemenggalan\` untuk masing-masing kata.
4. **Baca aturan EYD V** dari resource \`kbbi://aturan/pemenggalan-kata\` untuk referensi aturan yang berlaku.
5. **Rangkum temuan** — berapa total kata, distribusi pola suku kata, dan apakah ada anomali yang ditemukan.

Format output .dic harus kompatibel dengan Orthos/patgen (hyphen-separated syllables).`,
          },
        },
      ],
    })
  );

  // ──────────────────────────────────────────────────
  // siapkan_data_training_stemmer
  // ──────────────────────────────────────────────────
  server.prompt(
    "siapkan_data_training_stemmer",
    "Workflow untuk menyiapkan data training stemmer. Export stem mapping, identifikasi kata dasar, dan analisis distribusi imbuhan.",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin disiapkan datanya"),
    },
    ({ huruf }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Saya ingin menyiapkan data training stemmer untuk huruf "${huruf.toUpperCase()}". Tolong lakukan langkah-langkah berikut:

1. **Export stem mapping** menggunakan tool \`ekspor_stem_mapping\` untuk huruf ${huruf.toUpperCase()}. Ini akan memberikan mapping kata berimbuhan → kata dasar.
2. **Daftar kata dasar** menggunakan tool \`daftar_kata_dasar_kbbi\` untuk huruf ${huruf.toUpperCase()} — kata-kata yang TIDAK punya rootWord.
3. **Analisis distribusi imbuhan** — dari stem mapping, hitung berapa banyak kata yang menggunakan tiap prefiks (me-, ber-, ter-, di-, ke-, se-, pe-, per-) dan sufiks (-kan, -an, -i).
4. **Baca aturan imbuhan** dari resource \`kbbi://aturan/imbuhan\` untuk referensi.
5. **Identifikasi anomali** — kata-kata yang mungkin salah ter-stem (e.g. "berjalan" → rootWord bukan "jalan", atau kata tanpa rootWord tapi seharusnya punya).
6. **Rangkum temuan** — berapa total kata berimbuhan, berapa kata dasar, distribusi prefiks/sufiks, dan daftar anomali.`,
          },
        },
      ],
    })
  );

  // ──────────────────────────────────────────────────
  // analisis_edge_cases
  // ──────────────────────────────────────────────────
  server.prompt(
    "analisis_edge_cases",
    "Identifikasi kata-kata yang sulit di-stem atau dipenggal. Contoh: 'berani' (ber- bukan prefiks), 'terang' (ter- bukan prefiks).",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin dianalisis"),
    },
    ({ huruf }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Saya ingin mengidentifikasi edge cases untuk stemmer dan pemenggalan kata pada huruf "${huruf.toUpperCase()}". Tolong analisis:

1. **Edge cases stemmer** — cari kata-kata yang dimulai dengan prefiks umum (ber-, ter-, me-, pe-, di-, ke-, se-) TAPI sebenarnya bukan kata berimbuhan. Contoh klasik:
   - "berani" — "ber-" bukan prefiks, kata dasarnya "berani"
   - "terang" — "ter-" bukan prefiks, kata dasarnya "terang"
   - "merah" — "me-" bukan prefiks, kata dasarnya "merah"
   
   Gunakan tool \`cari_kata_dasar\` dan \`analisis_imbuhan\` untuk beberapa kata yang mencurigakan.

2. **Edge cases pemenggalan** — cari kata-kata dengan pemenggalan yang tidak mengikuti aturan umum:
   - Kata serapan dengan cluster konsonan (str, pr, tr, dll)
   - Kata dengan diftong (ai, au, ei, oi) dan monoftong (eu)
   - Kata dengan gabungan konsonan (ng, ny, kh, sy)
   
   Gunakan tool \`pemenggalan_kata\` untuk beberapa kata yang mencurigakan.

3. **Rangkum** — buat daftar edge cases yang ditemukan, kategorisasi berdasarkan tipe masalah, dan rekomendasikan penanganan (exception list vs aturan baru).`,
          },
        },
      ],
    })
  );

  // ──────────────────────────────────────────────────
  // validasi_engine
  // ──────────────────────────────────────────────────
  server.prompt(
    "validasi_engine",
    "Workflow validasi akurasi engine stemmer atau pemenggalan. Mengambil sampel kata, menguji engine, dan menghitung akurasi.",
    {
      jenis: z
        .enum(["stemmer", "pemenggalan"])
        .describe("Jenis engine yang ingin divalidasi"),
    },
    ({ jenis }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              jenis === "pemenggalan"
                ? `Saya ingin memvalidasi akurasi engine pemenggalan kata. Tolong lakukan:

1. **Ambil sampel** — gunakan tool \`cari_kata_awalan\` dengan beberapa awalan berbeda (mis. "ab", "me", "per", "str") untuk mendapatkan kata-kata test.
2. **Dapatkan ground truth** — gunakan tool \`pemenggalan_kata\` untuk setiap kata sampel (data KBBI sebagai ground truth).
3. **Minta saya memberikan hasil engine** — saya akan memberikan output pemenggalan dari engine yang sedang diuji.
4. **Bandingkan** — gunakan tool \`validasi_pemenggalan\` untuk membandingkan output engine vs KBBI.
5. **Hitung akurasi** — berapa persen kata yang dipenggal dengan benar?
6. **Identifikasi pola error** — apakah ada pola konsisten pada kata-kata yang salah? (misalnya selalu salah pada cluster konsonan, atau pada diftong)`
                : `Saya ingin memvalidasi akurasi engine stemmer. Tolong lakukan:

1. **Ambil sampel kata berimbuhan** — gunakan tool \`cari_kata_awalan\` dengan awalan seperti "mem", "men", "meng", "ber", "ter", "per", "di", "ke" untuk mendapatkan kata-kata test.
2. **Dapatkan ground truth** — gunakan tool \`cari_kata_dasar\` untuk setiap kata sampel (rootWord KBBI sebagai ground truth).
3. **Minta saya memberikan hasil engine** — saya akan memberikan output stemming dari engine yang sedang diuji.
4. **Bandingkan** — apakah output engine cocok dengan rootWord KBBI?
5. **Hitung akurasi** — berapa persen kata yang di-stem dengan benar?
6. **Identifikasi pola error** — apakah ada pola konsisten? (misalnya selalu salah pada prefiks meng- + vokal, atau pada konfiks ke-...-an)`,
          },
        },
      ],
    })
  );

  // ──────────────────────────────────────────────────
  // bandingkan_kata
  // ──────────────────────────────────────────────────
  server.prompt(
    "bandingkan_kata",
    "Bandingkan morfologi dan pemenggalan dua kata. Berguna untuk analisis pola dan debugging.",
    {
      kata1: z.string().describe("Kata pertama"),
      kata2: z.string().describe("Kata kedua"),
    },
    ({ kata1, kata2 }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Tolong bandingkan kedua kata berikut secara mendalam:

**Kata 1:** "${kata1}"
**Kata 2:** "${kata2}"

Untuk masing-masing kata, gunakan tools berikut:
1. \`cari_kata\` — definisi lengkap
2. \`pemenggalan_kata\` — pemenggalan suku kata
3. \`cari_kata_dasar\` — kata dasar (jika kata berimbuhan)
4. \`analisis_imbuhan\` — analisis struktur imbuhan
5. \`kelas_kata\` — kelas kata

Lalu bandingkan:
- Apakah keduanya punya pola pemenggalan yang sama?
- Apakah keduanya dari akar kata yang sama?
- Apa perbedaan morfologis utama?
- Bagaimana implikasinya untuk stemmer dan hyphenation engine?`,
          },
        },
      ],
    })
  );
}
