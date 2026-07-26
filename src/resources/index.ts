import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getWordDetail,
  getKelasKata,
  getBahasa,
  getBidangSubjek,
  getPemenggalanKataRules,
} from "../data/reader.js";
import { wordIndex } from "../data/index-builder.js";

/**
 * Register MCP resources on the server.
 * Resources are read-only data contexts available to AI agents.
 */
export function registerResources(server: McpServer): void {
  // ──────────────────────────────────────────────────
  // kbbi://aturan/pemenggalan-kata
  // ──────────────────────────────────────────────────
  server.resource(
    "aturan-pemenggalan-kata",
    "kbbi://aturan/pemenggalan-kata",
    {
      description:
        "Aturan pemenggalan kata bahasa Indonesia sesuai EYD V. Referensi utama untuk hyphenation engine training.",
      mimeType: "text/markdown",
    },
    async () => {
      const content = await getPemenggalanKataRules();
      return {
        contents: [
          {
            uri: "kbbi://aturan/pemenggalan-kata",
            mimeType: "text/markdown" as const,
            text: content,
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────
  // kbbi://aturan/imbuhan
  // ──────────────────────────────────────────────────
  server.resource(
    "aturan-imbuhan",
    "kbbi://aturan/imbuhan",
    {
      description:
        "Referensi aturan imbuhan bahasa Indonesia: prefiks, sufiks, dan variasinya. Untuk stemmer training.",
      mimeType: "text/markdown",
    },
    async () => {
      // Extract imbuhan section from pemenggalan_kata.md
      const fullContent = await getPemenggalanKataRules();
      const imbuhanIdx = fullContent.indexOf(
        "## Pemenggalan kata pada kata berimbuhan"
      );
      const imbuhanSection =
        imbuhanIdx >= 0 ? fullContent.substring(imbuhanIdx) : "";

      const imbuhanReference = `# Referensi Aturan Imbuhan Bahasa Indonesia

## Prefiks (Awalan)

### Prefiks dasar
| Prefiks | Contoh | Pemenggalan |
|---------|--------|-------------|
| ber- | berjalan | ber-jalan |
| di- | diambil | di-ambil |
| ke- | kekasih | ke-kasih |
| se- | sebuah | se-buah |
| ter- | terbawa | ter-bawa |
| per- | perbuat | per-buat |

### Prefiks nasal (me-/pe- dan variasinya)
| Prefiks | Kondisi | Contoh | Pemenggalan |
|---------|---------|--------|-------------|
| mem- | sebelum b, p, f | membantu | mem-bantu |
| men- | sebelum d, t, c, j | mencari | men-cari |
| meng- | sebelum vokal, g, h, k | mengukur | meng-ukur |
| meny- | sebelum s | menyapu | meny-apu |
| me- | lainnya | melihat | me-lihat |
| pem- | sebelum b, p, f | pembaca | pem-baca |
| pen- | sebelum d, t, c, j | pendidik | pen-didik |
| peng- | sebelum vokal, g, h, k | pengajar | peng-ajar |
| peny- | sebelum s | penyakit | peny-akit |
| pe- | lainnya | pekerja | pe-kerja |

### Prefiks gabungan
| Prefiks | Contoh | Pemenggalan |
|---------|--------|-------------|
| memper- | memperjual | mem-per-jual |
| diper- | diperjual | di-per-jual |

### Prefiks serapan/khusus
| Prefiks | Contoh | Pemenggalan |
|---------|--------|-------------|
| non- | nonaktif | non-aktif |
| swa- | swafoto | swa-foto |
| pra- | prasejarah | pra-sejarah |
| tuna- | tunawisma | tuna-wisma |
| maha- | mahaguru | maha-guru |
| adi- | adidaya | adi-daya |
| anti- | antibodi | anti-bodi |
| pasca- | pascasarjana | pasca-sarjana |

## Sufiks (Akhiran)
| Sufiks | Contoh | Pemenggalan |
|--------|--------|-------------|
| -kan | letakkan | letak-kan |
| -an | makanan | makan-an |
| -i | tandai | tanda-i |

## Partikel
| Partikel | Contoh | Pemenggalan |
|----------|--------|-------------|
| -lah | pergilah | pergi-lah |
| -kah | apakah | apa-kah |
| -tah | apatah | apa-tah |
| -pun | adapun | ada-pun |
| -nya | bukunya | buku-nya |

## Aturan Khusus
- Kata berimbuhan yang bentuk dasarnya mengalami perubahan: me-*ma*-kai, me-*ngun*-ci
- Kata yang mendapat sisipan: ge-lem-bung, ge-mu-ruh
- Pemenggalan yang menyebabkan 1 huruf di awal/akhir baris TIDAK dilakukan

---

${imbuhanSection}`;

      return {
        contents: [
          {
            uri: "kbbi://aturan/imbuhan",
            mimeType: "text/markdown" as const,
            text: imbuhanReference,
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────
  // kbbi://statistik
  // ──────────────────────────────────────────────────
  server.resource(
    "statistik",
    "kbbi://statistik",
    {
      description:
        "Statistik database KBBI: total kata per huruf, distribusi data.",
      mimeType: "application/json",
    },
    async () => {
      const stats = await wordIndex.getStats();
      return {
        contents: [
          {
            uri: "kbbi://statistik",
            mimeType: "application/json" as const,
            text: JSON.stringify(
              {
                deskripsi: "Statistik database KBBI MCP Server",
                totalEntri: stats["TOTAL"] || 0,
                distribusiPerHuruf: Object.fromEntries(
                  Object.entries(stats).filter(([k]) => k !== "TOTAL")
                ),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────
  // kbbi://kategori/kelas-kata
  // ──────────────────────────────────────────────────
  server.resource(
    "kategori-kelas-kata",
    "kbbi://kategori/kelas-kata",
    {
      description:
        "Referensi semua kelas kata (part of speech) dalam KBBI beserta deskripsi lengkap.",
      mimeType: "application/json",
    },
    async () => {
      const data = await getKelasKata();
      return {
        contents: [
          {
            uri: "kbbi://kategori/kelas-kata",
            mimeType: "application/json" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────
  // kbbi://kategori/bahasa
  // ──────────────────────────────────────────────────
  server.resource(
    "kategori-bahasa",
    "kbbi://kategori/bahasa",
    {
      description:
        "Referensi bahasa asal kata dalam KBBI: Arab, Jawa, Sunda, Inggris, dll.",
      mimeType: "application/json",
    },
    async () => {
      const data = await getBahasa();
      return {
        contents: [
          {
            uri: "kbbi://kategori/bahasa",
            mimeType: "application/json" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────
  // kbbi://kategori/bidang-subjek
  // ──────────────────────────────────────────────────
  server.resource(
    "kategori-bidang-subjek",
    "kbbi://kategori/bidang-subjek",
    {
      description:
        "Referensi bidang ilmu/subjek dalam KBBI: Kimia, Kedokteran, Biologi, Komputer, dll.",
      mimeType: "application/json",
    },
    async () => {
      const data = await getBidangSubjek();
      return {
        contents: [
          {
            uri: "kbbi://kategori/bidang-subjek",
            mimeType: "application/json" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────
  // kbbi://kata/{word} — Resource Template
  // ──────────────────────────────────────────────────
  const kataTemplate = new ResourceTemplate("kbbi://kata/{word}", {
    list: undefined,
  });

  server.resource(
    "kata-detail",
    kataTemplate,
    {
      description:
        "Detail kata spesifik dari KBBI. Ganti {word} dengan kata yang diinginkan.",
      mimeType: "application/json",
    },
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const rawWord = variables.word;
      const word = Array.isArray(rawWord) ? rawWord[0] : rawWord || "";
      try {
        const detail = await getWordDetail(word);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json" as const,
              text: JSON.stringify(detail, null, 2),
            },
          ],
        };
      } catch {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain" as const,
              text: `Kata "${word}" tidak ditemukan.`,
            },
          ],
        };
      }
    }
  );
}
