import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getWordDetail,
  getKelasKata,
  getBahasa,
  getBidangSubjek,
  getLainnya,
  getPeribahasa,
} from "../data/reader.js";
import { wordIndex } from "../data/index-builder.js";

/**
 * Register general dictionary tools on the MCP server.
 */
export function registerKamusTools(server: McpServer): void {
  // ──────────────────────────────────────────────────
  // cari_kata
  // ──────────────────────────────────────────────────
  server.tool(
    "cari_kata",
    "Cari definisi lengkap sebuah kata dari KBBI. Mengembalikan makna, kelas kata, contoh kalimat, kata turunan, peribahasa.",
    { kata: z.string().describe("Kata yang ingin dicari definisinya") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(detail, null, 2),
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
  // cari_kata_awalan
  // ──────────────────────────────────────────────────
  server.tool(
    "cari_kata_awalan",
    "Autocomplete — cari kata berdasarkan awalan. Contoh: 'pin' → ['pinang', 'pindah', 'pintar', ...].",
    {
      awalan: z.string().describe("Awalan kata yang ingin dicari"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Jumlah maksimum hasil (default: 20)"),
    },
    async ({ awalan, limit }) => {
      try {
        const results = await wordIndex.searchByPrefix(awalan, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  awalan,
                  jumlah: results.length,
                  kata: results,
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
              text: `Gagal mencari awalan "${awalan}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────
  // kelas_kata
  // ──────────────────────────────────────────────────
  server.tool(
    "kelas_kata",
    "Dapatkan kelas kata (nomina, verba, adjektiva, dll) untuk sebuah kata dari KBBI.",
    { kata: z.string().describe("Kata yang ingin dicari kelas katanya") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        const kelasKata = detail.entries.flatMap((e) =>
          e.makna.flatMap((m) => m.kelasKata)
        );
        // Deduplicate by kode
        const seen = new Set<string>();
        const unique = kelasKata.filter((k) => {
          if (seen.has(k.kode)) return false;
          seen.add(k.kode);
          return true;
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { kata: detail.word, kelasKata: unique },
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
  // contoh_kalimat
  // ──────────────────────────────────────────────────
  server.tool(
    "contoh_kalimat",
    "Ambil contoh penggunaan kata dalam kalimat dari KBBI.",
    { kata: z.string().describe("Kata yang ingin dicari contoh kalimatnya") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        const contoh = detail.entries.flatMap((e) =>
          e.makna.flatMap((m) =>
            m.contoh.map((c) => ({
              definisi: m.definisi,
              contoh: c.teks,
            }))
          )
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { kata: detail.word, jumlah: contoh.length, contoh },
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
  // peribahasa
  // ──────────────────────────────────────────────────
  server.tool(
    "peribahasa",
    "Peribahasa yang mengandung kata ini, beserta maknanya.",
    { kata: z.string().describe("Kata yang ingin dicari peribahasanya") },
    async ({ kata }) => {
      try {
        const detail = await getWordDetail(kata);
        const peribahasa = detail.entries.flatMap(
          (e) => e.terkait?.peribahasa_dan_makna || []
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { kata: detail.word, jumlah: peribahasa.length, peribahasa },
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
  // daftar_kategori
  // ──────────────────────────────────────────────────
  server.tool(
    "daftar_kategori",
    "Daftar kategori KBBI: kelas kata, bahasa asal, bidang subjek, atau lainnya.",
    {
      tipe: z
        .enum(["kelas_kata", "bahasa", "bidang_subjek", "lainnya"])
        .optional()
        .default("kelas_kata")
        .describe("Tipe kategori yang ingin ditampilkan"),
    },
    async ({ tipe }) => {
      try {
        let data: unknown;
        switch (tipe) {
          case "kelas_kata":
            data = await getKelasKata();
            break;
          case "bahasa":
            data = await getBahasa();
            break;
          case "bidang_subjek":
            data = await getBidangSubjek();
            break;
          case "lainnya":
            data = await getLainnya();
            break;
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Gagal memuat kategori "${tipe}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
