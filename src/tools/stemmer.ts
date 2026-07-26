import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWordDetail } from "../data/reader.js";
import {
  extractStemMappings,
  extractKataDasar,
  analyzeWordAffixes,
} from "../data/training-extractor.js";

/**
 * Register stemmer training tools on the MCP server.
 */
export function registerStemmerTools(server: McpServer): void {
  // ──────────────────────────────────────────────────
  // cari_kata_dasar
  // ──────────────────────────────────────────────────
  server.tool(
    "cari_kata_dasar",
    "Dari kata berimbuhan, cari kata dasarnya. Contoh: 'membantu' → 'bantu'. Menggunakan field rootWord dari KBBI.",
    { kata: z.string().describe("Kata yang ingin dicari kata dasarnya") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        for (const entry of detail.entries) {
          if (entry.rootWord) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      kata: detail.word,
                      kataDasar: entry.rootWord,
                      pemenggalan: entry.nama,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        }
        // No rootWord → likely a base word itself
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  kata: detail.word,
                  kataDasar: detail.word,
                  pemenggalan: detail.entries[0]?.nama || "",
                  catatan: "Kata ini kemungkinan kata dasar (tidak ada rootWord)",
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
  // daftar_kata_turunan
  // ──────────────────────────────────────────────────
  server.tool(
    "daftar_kata_turunan",
    "Daftar semua kata turunan dari kata dasar tertentu. Contoh: 'pintar' → ['kepintaran', 'memintarkan', 'terpintar'].",
    { kataDasar: z.string().describe("Kata dasar yang ingin dicari turunannya") },
    async ({ kataDasar }) => {
      try {
        const detail = await getWordDetail(kataDasar);
        const turunan: string[] = [];
        for (const entry of detail.entries) {
          if (entry.terkait?.kataTurunan) {
            turunan.push(...entry.terkait.kataTurunan);
          }
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  kataDasar: detail.word,
                  jumlahTurunan: turunan.length,
                  kataTurunan: turunan,
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
              text: `Kata "${kataDasar}" tidak ditemukan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // ekspor_stem_mapping
  // ──────────────────────────────────────────────────
  server.tool(
    "ekspor_stem_mapping",
    "Bulk export: semua kata berimbuhan + rootWord untuk 1 huruf. Untuk training data stemmer. Contoh: huruf 'M' → [{kata: 'membantu', kataDasar: 'bantu', ...}, ...]",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin diekspor"),
    },
    async ({ huruf }) => {
      try {
        const mappings = await extractStemMappings(huruf);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  huruf: huruf.toUpperCase(),
                  total: mappings.length,
                  mappings,
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
              text: `Gagal ekspor stem mapping huruf "${huruf}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // analisis_imbuhan
  // ──────────────────────────────────────────────────
  server.tool(
    "analisis_imbuhan",
    "Analisis struktur imbuhan kata. Contoh: 'membantu' → prefiks 'mem', sufiks '', kataDasar 'bantu'.",
    { kata: z.string().describe("Kata yang ingin dianalisis imbuhannya") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        const analysis = analyzeWordAffixes(detail);
        if (analysis) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(analysis, null, 2),
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
                  kata: detail.word,
                  catatan: "Kata ini tidak memiliki rootWord — kemungkinan kata dasar",
                  pemenggalan: detail.entries[0]?.nama || "",
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
  // daftar_kata_dasar_kbbi
  // ──────────────────────────────────────────────────
  server.tool(
    "daftar_kata_dasar_kbbi",
    "Daftar kata dasar KBBI (yang tidak punya rootWord) per huruf. Berguna untuk cross-reference dengan kamus stemmer.",
    {
      huruf: z
        .string()
        .length(1)
        .describe("Huruf (A-Z) yang ingin diekspor"),
    },
    async ({ huruf }) => {
      try {
        const kataDasar = await extractKataDasar(huruf);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  huruf: huruf.toUpperCase(),
                  total: kataDasar.length,
                  kataDasar,
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
              text: `Gagal ekspor kata dasar huruf "${huruf}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
