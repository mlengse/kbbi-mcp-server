/**
 * Regresi untuk D-F03: `word-details` bukan otoritas untuk morfologi.
 *
 * Dua cacat yang dipin di sini:
 *
 *  1. `cari_kata_dasar` dan `analisis_imbuhan` dulu menggagalkan setiap kata
 *     yang tidak punya artikel `word-details`, walau leksikon tahu kata
 *     dasarnya. `saksikan` adalah kasusnya: ada di `derived_to_root.json`
 *     sebagai turunan dari `saksi`, tapi tidak punya artikel, tidak punya baris
 *     wordlist, dan tidak punya entri pemenggalan.
 *  2. `daftar_kata_turunan` menempelkan daftar turunan tiap entri artikel
 *     apa adanya, lalu melaporkan panjang daftar itu sebagai `jumlahTurunan`.
 *     KBBI mengulang daftar turunan yang sama pada beberapa entri satu artikel,
 *     sehingga 4 kata turunan terhitung 12.
 *
 * Semua fetch di-stub (Prinsip IV): tes ini tidak boleh menyentuh CDN.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKbbiServer } from "../index.js";

/**
 * Fixture leksikon. `saksikan` sengaja hanya ada di derived_to_root.json,
 * tidak di root_words.txt: itu justrucacatnya.
 */
const ROOT_WORDS = "saksi\nbantu\npintar\n";
const DERIVED_TO_ROOT: Record<string, string> = {
  saksikan: "saksi",
  membantu: "bantu",
};

/** Daftar turunan yang sama, diulang KBBI pada tiga entri artikel "balak". */
const BALAK_TURUNAN = ["balakan", "membalak", "pembalak", "pembalakan"];

/** Kata turunan tapi tanpa artikel word-details sama sekali. */
const SAKSIKAN_TIDAK_PUNYA_ARTIKEL = true;

/** Kata yang tidak ada di kedua leksikon: harus jadi unknown, bukan "kemungkinan dasar". */
const KATA_TIDAK_DIKETAHUI = "kErafil";

interface ToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

function json(text: string, status = 200): Response {
  return new Response(text, { status });
}

/**
 * Bangun `fetch` yang melayani path relatif data, mengabaikan base CDN
 * (@main dan @data-v4 dilayani sama).
 */
function makeFetch(): typeof fetch {
  const balakArticle = {
    word: "balak",
    authenticated: true,
    entries: [
      ...[0, 1, 2].map((i) => ({
        id: `747${i + 1}`,
        nama: "ba.lak",
        nomor: String(i + 1),
        makna: [],
        terkait: { kataTurunan: BALAK_TURUNAN },
      })),
      ...[3, 4, 5, 6].map((i) => ({
        id: `x${i}`,
        nama: "ba.lak",
        nomor: String(i + 1),
        makna: [],
        terkait: { kataTurunan: [] },
      })),
    ],
  };

  const routes: Record<string, () => Response> = {
    "lexicon/root_words.txt": () => json(ROOT_WORDS),
    "lexicon/derived_to_root.json": () => json(JSON.stringify(DERIVED_TO_ROOT)),
    "word-details/M/membantu.json": () =>
      json(
        JSON.stringify({
          word: "membantu",
          authenticated: true,
          entries: [
            {
              id: "1",
              nama: "mem.ban.tu",
              nomor: "1",
              rootWord: "bantu",
              makna: [],
              terkait: { kataTurunan: [] },
            },
          ],
        })
      ),
    "word-details/B/balak.json": () => json(JSON.stringify(balakArticle)),
  };

  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const relative = url.replace(
      /^https:\/\/cdn\.jsdelivr\.net\/gh\/mlengse\/kbbi-harvester-cdn@[^/]+\//,
      ""
    );
    const route = routes[relative];
    if (route) return route();
    // Tanpa artikel word-details, termasuk "saksikan" dan kata tak dikenal.
    return json("", 404);
  }) as typeof fetch;
}

let client: Client;
let server: ReturnType<typeof createKbbiServer>;

before(async () => {
  globalThis.fetch = makeFetch();
  server = createKbbiServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "kbbi-mcp-stemmer-test", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

after(async () => {
  await client.close();
  await server.close();
});

async function callRaw(
  name: string,
  args: Record<string, unknown>
): Promise<{ isError: boolean; payload: any; text: string }> {
  const res = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = (res.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  let payload: unknown = undefined;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  return { isError: res.isError === true, payload, text };
}

/** Panggil kapabilitas yang harusnya sukses. */
async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const out = await callRaw(name, args);
  assert.equal(
    out.isError,
    false,
    `Tool ${name} harusnya tidak error, dapat: ${out.text}`
  );
  return out.payload;
}

// ============================================================
// Bagian A — kata dasar ditentukan leksikon, bukan word-details
// ============================================================

test("cari_kata_dasar 'saksikan' menjawab dari leksikon walau artikel 404", async () => {
  assert.equal(SAKSIKAN_TIDAK_PUNYA_ARTIKEL, true, "fixture harus tanpa artikel");
  const out = await callTool("cari_kata_dasar", { kata: "saksikan" });
  assert.equal(out.kata, "saksikan");
  assert.equal(out.kataDasar, "saksi");
  // Pemenggalan kosong itu benar dan tetap lebih baik daripada error.
  assert.equal(out.pemenggalan, "");
});

test("cari_kata_dasar 'membantu' tetap melengkapi pemenggalan dari artikel", async () => {
  const out = await callTool("cari_kata_dasar", { kata: "membantu" });
  assert.equal(out.kataDasar, "bantu");
  assert.equal(out.pemenggalan, "mem.ban.tu");
});

test("cari_kata_dasar 'pintar' melaporkan kata dasar dari leksikon", async () => {
  const out = await callTool("cari_kata_dasar", { kata: "pintar" });
  assert.equal(out.kataDasar, "pintar");
  assert.equal(typeof out.catatan, "string");
  assert.match(out.catatan, /leksikon/);
});

test("cari_kata_dasar kata tak dikenal error tanpa membocorkan URL CDN", async () => {
  const out = await callRaw("cari_kata_dasar", { kata: KATA_TIDAK_DIKETAHUI });
  assert.equal(out.isError, true);
  assert.doesNotMatch(out.text, /cdn\.jsdelivr\.net/);
});

test("analisis_imbuhan 'saksikan' mengurai imbuhan walau artikel 404", async () => {
  const out = await callTool("analisis_imbuhan", { kata: "saksikan" });
  assert.equal(out.kata, "saksikan");
  assert.equal(out.kataDasar, "saksi");
  // Heuristiksuffix menang lebih dulu: "saksikan" berakhiran "kan", dan sisa
  // "saksi" sama persis dengan akar, jadi tidak ada prefiks terdeteksi.
  assert.equal(out.sufiks, "kan");
  assert.equal(out.prefiks, "");
  assert.equal(out.pemenggalan, "");
});

test("analisis_imbuhan 'membantu' masih mengurai prefiks 'mem'", async () => {
  const out = await callTool("analisis_imbuhan", { kata: "membantu" });
  assert.equal(out.kataDasar, "bantu");
  assert.equal(out.prefiks, "mem");
  assert.equal(out.sufiks, "");
  assert.equal(out.pemenggalan, "mem.ban.tu");
});

test("analisis_imbuhan kata tak dikenal error tanpa membocorkan URL CDN", async () => {
  const out = await callRaw("analisis_imbuhan", { kata: KATA_TIDAK_DIKETAHUI });
  assert.equal(out.isError, true);
  assert.doesNotMatch(out.text, /cdn\.jsdelivr\.net/);
});

test("cari_kata_dasar_dari_lexicon tidak berubah bentuk keluarannya", async () => {
  const turunan = await callTool("cari_kata_dasar_dari_lexicon", {
    kata: "saksikan",
  });
  assert.deepEqual(turunan, {
    kata: "saksikan",
    isKataDasar: false,
    isKataTurunan: true,
    kataDasar: "saksi",
  });

  const dasar = await callTool("cari_kata_dasar_dari_lexicon", { kata: "pintar" });
  assert.deepEqual(dasar, {
    kata: "pintar",
    isKataDasar: true,
    isKataTurunan: false,
    kataDasar: null,
  });
});

// ============================================================
// Bagian B — daftar_kata_turunan tidak lagi menggandakan turunan
// ============================================================

test("daftar_kata_turunan 'balak' menghitung 4, bukan 12", async () => {
  const out = await callTool("daftar_kata_turunan", { kataDasar: "balak" });
  assert.equal(out.kataDasar, "balak");
  assert.equal(out.jumlahTurunan, 4);
  assert.equal(out.kataTurunan.length, 4);
  // Urutan kemunculan pertama dipertahankan.
  assert.deepEqual(out.kataTurunan, BALAK_TURUNAN);
});

test("daftar_kata_turunan menjaga jumlah dan daftar tetap sinkron", async () => {
  const out = await callTool("daftar_kata_turunan", { kataDasar: "balak" });
  assert.equal(
    out.jumlahTurunan,
    out.kataTurunan.length,
    "jumlahTurunan harus dihitung dari daftar itu sendiri"
  );
  assert.equal(
    new Set(out.kataTurunan).size,
    out.kataTurunan.length,
    "daftar turunan tidak boleh memuat duplikat"
  );
});