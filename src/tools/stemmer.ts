import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWordDetail } from "../data/reader.js";
import {
  extractStemMappings,
  extractKataDasar,
  analyzeAffixesFromRoot,
  lookupKataStatus,
} from "../data/training-extractor.js";

/**
 * Read `pemenggalan` from the KBBI article, as optional enrichment.
 *
 * Enrichment must never fail the caller's answer: `word-details` coverage is
 * independent of lexicon coverage, so a word can be a recorded derivative and
 * still have no article. Every failure here degrades to an empty string.
 */
async function enrichPemenggalan(kata: string): Promise<string> {
  try {
    const detail = await getWordDetail(kata);
    const entry = detail.entries.find((e) => e.rootWord) ?? detail.entries[0];
    return entry?.nama || "";
  } catch {
    return "";
  }
}

/**
 * Register stemmer training tools on the MCP server.
 */
export function registerStemmerTools(server: McpServer): void {
  // ──────────────────────────────────────────────────
  // cari_kata_dasar
  // ──────────────────────────────────────────────────
  server.tool(
    "cari_kata_dasar",
    "Dari kata berimbuhan, cari kata dasarnya. Contoh: 'membantu' → 'bantu'. Menentukan kata dasar dari leksikon (root_words.txt + derived_to_root.json), lalu melengkapi pemenggalan dari KBBI bila tersedia. Kata yang tidak ada di leksikon akan dikembalikan sebagai error.",
    { kata: z.string().describe("Kata yang ingin dicari kata dasarnya") },
    async ({ kata }) => {
      try {
        const status = await lookupKataStatus(kata);
        if (status.status === "unknown") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Kata "${kata}" tidak ditemukan di leksikon morphological`,
              },
            ],
            isError: true,
          };
        }

        // Leksikon sudah menentukan jawabannya. word-details hanya menambah
        // pemenggalan; artikel yang hilang tidak boleh menggagalkan jawaban.
        const pemenggalan = await enrichPemenggalan(kata);

        if (status.status === "derived") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    kata,
                    kataDasar: status.kataDasar,
                    pemenggalan,
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
                  kataDasar: kata,
                  pemenggalan,
                  catatan: "Kata ini tercatat sebagai kata dasar di leksikon",
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
              text: `Gagal membaca leksikon untuk kata "${kata}": ${error instanceof Error ? error.message : String(error)}`,
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
    "Daftar semua kata turunan dari kata dasar tertentu. Contoh: 'pintar' → ['kepintaran', 'memintarkan', 'terpintar']. Turunan yang sama disebut pada beberapa entri KBBI dihitung satu kali.",
    { kataDasar: z.string().describe("Kata dasar yang ingin dicari turunannya") },
    async ({ kataDasar }) => {
      try {
        const detail = await getWordDetail(kataDasar);
        // KBBI mengulang daftar turunan yang sama pada beberapa entri satu
        // artikel (per makna). Buang duplikat dengan mempertahankan urutan
        // kemunculan pertama, lalu hitung jumlah dari daftar itu sendiri
        // supaya jumlahTurunan tidak pernah berbeda dari kataTurunan.
        const seen = new Set<string>();
        const turunan: string[] = [];
        for (const entry of detail.entries) {
          for (const kata of entry.terkait?.kataTurunan ?? []) {
            if (seen.has(kata)) continue;
            seen.add(kata);
            turunan.push(kata);
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
              text: `Gagal membaca artikel KBBI untuk kata "${kataDasar}": ${error instanceof Error ? error.message : String(error)}`,
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
    "Analisis struktur imbuhan kata. Contoh: 'membantu' → prefiks 'mem', sufiks '', kataDasar 'bantu'. Kata dasarnya ditentukan dari leksikon, jadi kata turunan tanpa artikel KBBI tetap teranalisis. Kata yang tidak ada di leksikon akan dikembalikan sebagai error.",
    { kata: z.string().describe("Kata yang ingin dianalisis imbuhannya") },
    async ({ kata }) => {
      try {
        const status = await lookupKataStatus(kata);
        if (status.status === "unknown") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Kata "${kata}" tidak ditemukan di leksikon morphological`,
              },
            ],
            isError: true,
          };
        }

        // Sama seperti cari_kata_dasar: leksikon menentukan kata dasarnya,
        // word-details hanya menambah pemenggalan.
        const pemenggalan = await enrichPemenggalan(kata);

        if (status.status === "derived") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  analyzeAffixesFromRoot(kata, status.kataDasar, pemenggalan),
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
                  catatan: "Kata ini tercatat sebagai kata dasar di leksikon",
                  pemenggalan,
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
              text: `Gagal membaca leksikon untuk kata "${kata}": ${error instanceof Error ? error.message : String(error)}`,
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
