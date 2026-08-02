import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getWordDetail,
  getHyphenationDict,
  getDicContent,
} from "../data/reader.js";
import {
  extractHyphenationDic,
  extractSyllables,
  dotToHyphen,
  computeSyllableStats,
} from "../data/training-extractor.js";

/**
 * Register pemenggalan (hyphenation) training tools on the MCP server.
 */
export function registerPemenggalanTools(server: McpServer): void {
  // ──────────────────────────────────────────────────
  // pemenggalan_kata
  // ──────────────────────────────────────────────────
  server.tool(
    "pemenggalan_kata",
    "Ambil pemenggalan suku kata dari KBBI. Contoh: 'pintar' → 'pin.tar', suku kata: ['pin', 'tar'].",
    { kata: z.string().describe("Kata yang ingin dipenggal") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        const results = detail.entries.map((entry) => {
          const syllables = extractSyllables(entry.nama);
          return {
            kata: detail.word,
            nama: entry.nama,
            pemenggalan: entry.nama,
            dicFormat: dotToHyphen(entry.nama),
            sukuKata: syllables,
            jumlahSukuKata: syllables.length,
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                results.length === 1 ? results[0] : results,
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Kata "${kata}" tidak ditemukan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // ekspor_training_dic
  // ──────────────────────────────────────────────────
  server.tool(
    "ekspor_training_dic",
    "Export pemenggalan kata dalam format .dic untuk training Orthos/patgen. Satu huruf per panggilan. Contoh: huruf 'P' → 'pin-tar\\npan-dai\\n...'",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin diekspor"),
    },
    async ({ huruf }) => {
      try {
        const entries = await extractHyphenationDic(huruf);
        const dicContent = entries.map((e) => e.dicFormat).join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  huruf: huruf.toUpperCase(),
                  totalEntries: entries.length,
                  format: "Orthos/patgen .dic format (hyphen-separated syllables)",
                  dicContent,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Gagal ekspor .dic huruf "${huruf}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // validasi_pemenggalan
  // ──────────────────────────────────────────────────
  server.tool(
    "validasi_pemenggalan",
    "Bandingkan hasil pemenggalan engine dengan data KBBI. Untuk validasi akurasi engine. Contoh: kata 'pintar', expected 'pin-tar'.",
    {
      kata: z.string().describe("Kata yang ingin divalidasi"),
      expected: z
        .string()
        .describe(
          "Pemenggalan yang diharapkan (format hyphen, e.g. 'pin-tar')"
        ),
    },
    async ({ kata, expected }) => {
      try {
        const detail = await getWordDetail(kata);
        const actual = dotToHyphen(detail.entries[0]?.nama || "");
        const isValid = actual === expected;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  kata,
                  valid: isValid,
                  actual,
                  expected,
                  kbbi_nama: detail.entries[0]?.nama || "",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Kata "${kata}" tidak ditemukan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // statistik_pola_suku
  // ──────────────────────────────────────────────────
  server.tool(
    "statistik_pola_suku",
    "Statistik pola suku kata (KV, KVK, V, VK, dll) per huruf. Berguna untuk analisis fonotaktik bahasa Indonesia.",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin dianalisis"),
    },
    async ({ huruf }) => {
      try {
        const stats = await computeSyllableStats(huruf);
        // Sort patterns by frequency
        const sortedPatterns = Object.entries(stats.patterns)
          .sort((a, b) => b[1] - a[1])
          .reduce(
            (acc, [k, v]) => {
              acc[k] = v;
              return acc;
            },
            {} as Record<string, number>
          );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ...stats, patterns: sortedPatterns },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Gagal menghitung statistik huruf "${huruf}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // cari_pemenggalan
  // ──────────────────────────────────────────────────
  server.tool(
    "cari_pemenggalan",
    "Cari pemenggalan suku kata dari flat file hyphenation (kbbi_vi_hyphenation_dict.json). Cepat, tanpa iterasi word-details.",
    { kata: z.string().describe("Kata yang ingin dicari pemenggalannya") },
    async ({ kata }) => {
      try {
        const dict = await getHyphenationDict();
        const pemenggalan = dict[kata];
        if (!pemenggalan) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    kata,
                    ditemukan: false,
                    catatan:
                      "Kata tidak ada di hyphenation dict. Coba cari via word-detail (pemenggalan_kata).",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  kata,
                  ditemukan: true,
                  pemenggalan,
                  dicFormat: dotToHyphen(pemenggalan),
                  sukuKata: extractSyllables(pemenggalan),
                  jumlahSukuKata: extractSyllables(pemenggalan).length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Gagal mencari pemenggalan "${kata}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // daftar_dic
  // ──────────────────────────────────────────────────
  server.tool(
    "daftar_dic",
    "Export seluruh data .dic dari hyphenation/ (id.dic, id_orthos.dic, atau id_words.dic). Bukan per-huruf.",
    {
      format: z
        .enum(["id", "orthos", "words"])
        .optional()
        .default("id")
        .describe("Format .dic yang ingin diekspor"),
    },
    async ({ format }) => {
      try {
        const content = await getDicContent(format);
        const lines = content
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  format,
                  totalEntries: lines.length,
                  dicContent: content,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Gagal ekspor .dic "${format}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // bandingkan_dic
  // ──────────────────────────────────────────────────
  server.tool(
    "bandingkan_dic",
    "Bandingkan 2 format .dic (id vs id_orthos vs id_words). Menampilkan jumlah line, perbedaan, dan sampel entry yang berbeda.",
    {
      format1: z
        .enum(["id", "orthos", "words"])
        .describe("Format pertama"),
      format2: z
        .enum(["id", "orthos", "words"])
        .describe("Format kedua"),
    },
    async ({ format1, format2 }) => {
      try {
        const [content1, content2] = await Promise.all([
          getDicContent(format1),
          getDicContent(format2),
        ]);
        const lines1 = content1
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        const lines2 = content2
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        const set2 = new Set(lines2);
        const onlyIn1 = lines1.filter((l) => !set2.has(l));
        const set1 = new Set(lines1);
        const onlyIn2 = lines2.filter((l) => !set1.has(l));

        const sample = (arr: string[], n = 5) =>
          arr.length === 0 ? [] : arr.slice(0, n);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  format1,
                  format2,
                  totalEntries1: lines1.length,
                  totalEntries2: lines2.length,
                  onlyIn1: onlyIn1.length,
                  onlyIn2: onlyIn2.length,
                  sampleOnlyIn1: sample(onlyIn1),
                  sampleOnlyIn2: sample(onlyIn2),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Gagal bandingkan .dic "${format1}" vs "${format2}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
