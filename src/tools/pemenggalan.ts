import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWordDetail } from "../data/reader.js";
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
}
