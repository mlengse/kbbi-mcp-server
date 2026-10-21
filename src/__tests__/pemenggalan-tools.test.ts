import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKbbiServer } from "../index.js";
import { clearLexiconCache } from "../data/reader.js";

type ToolResult = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

let client: Client;
let server: ReturnType<typeof createKbbiServer>;
let originalFetch: typeof globalThis.fetch;

before(async () => {
  originalFetch = globalThis.fetch;
  server = createKbbiServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "kbbi-mcp-pemenggalan-test", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

after(async () => {
  globalThis.fetch = originalFetch;
  await client.close();
  await server.close();
});

beforeEach(() => {
  clearLexiconCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearLexiconCache();
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

// ──────────────────────────────────────────────────
// validasi_pemenggalan tests
// ──────────────────────────────────────────────────

test("validasi_pemenggalan: sukses mencocokkan pemenggalan yang benar", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        word: "pintar",
        entries: [{ nama: "pin.tar" }],
      }),
      { status: 200 }
    );

  const res = await callRaw("validasi_pemenggalan", {
    kata: "pintar",
    expected: "pin-tar",
  });

  assert.equal(res.isError, false);
  assert.equal(res.payload.valid, true);
  assert.equal(res.payload.actual, "pin-tar");
  assert.equal(res.payload.expected, "pin-tar");
  assert.equal(res.payload.kbbi_nama, "pin.tar");
});

test("validasi_pemenggalan: melaporkan valid=false jika pemenggalan berbeda", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        word: "pintar",
        entries: [{ nama: "pin.tar" }],
      }),
      { status: 200 }
    );

  const res = await callRaw("validasi_pemenggalan", {
    kata: "pintar",
    expected: "pi-ntar",
  });

  assert.equal(res.isError, false);
  assert.equal(res.payload.valid, false);
  assert.equal(res.payload.actual, "pin-tar");
  assert.equal(res.payload.expected, "pi-ntar");
});

test("validasi_pemenggalan: penanganan error ketika getWordDetail melempar error (CDN 404)", async () => {
  globalThis.fetch = async () => new Response("", { status: 404 });

  const res = await callRaw("validasi_pemenggalan", {
    kata: "katatidakada123",
    expected: "ka-ta",
  });

  assert.equal(res.isError, true);
  assert.match(res.text, /^Kata "katatidakada123" tidak ditemukan:/);
});

// ──────────────────────────────────────────────────
// pemenggalan_kata tests
// ──────────────────────────────────────────────────

test("pemenggalan_kata: penanganan error jika fetch kata gagal", async () => {
  globalThis.fetch = async () => new Response("", { status: 404 });

  const res = await callRaw("pemenggalan_kata", { kata: "tidakada" });
  assert.equal(res.isError, true);
  assert.match(res.text, /^Kata "tidakada" tidak ditemukan:/);
});

// ──────────────────────────────────────────────────
// ekspor_training_dic tests
// ──────────────────────────────────────────────────

test("ekspor_training_dic: sukses ekspor .dic untuk huruf", async () => {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("hyphenation/kbbi_vi_hyphenation_dict.json")) {
      return new Response(JSON.stringify({ zebra: "ze.bra" }), { status: 200 });
    }
    return new Response("", { status: 404 });
  };

  const res = await callRaw("ekspor_training_dic", { huruf: "Z" });
  assert.equal(res.isError, false);
  assert.equal(res.payload.huruf, "Z");
  assert.equal(res.payload.totalEntries, 1);
  assert.equal(res.payload.dicContent, "ze-bra");
});

test("ekspor_training_dic: penanganan error saat fetch gagal", async () => {
  globalThis.fetch = async () => new Response("", { status: 500 });

  const res = await callRaw("ekspor_training_dic", { huruf: "Z" });
  assert.equal(res.isError, true);
  assert.match(res.text, /^Gagal ekspor \.dic huruf "Z":/);
});

// ──────────────────────────────────────────────────
// statistik_pola_suku tests
// ──────────────────────────────────────────────────

test("statistik_pola_suku: penanganan error saat fetch gagal", async () => {
  globalThis.fetch = async () => new Response("", { status: 500 });

  const res = await callRaw("statistik_pola_suku", { huruf: "Z" });
  assert.equal(res.isError, true);
  assert.match(res.text, /^Gagal menghitung statistik huruf "Z":/);
});

// ──────────────────────────────────────────────────
// cari_pemenggalan tests
// ──────────────────────────────────────────────────

test("cari_pemenggalan: sukses jika kata ada di dict", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        pintar: "pin.tar",
      }),
      { status: 200 }
    );

  const res = await callRaw("cari_pemenggalan", { kata: "pintar" });
  assert.equal(res.isError, false);
  assert.equal(res.payload.ditemukan, true);
  assert.equal(res.payload.pemenggalan, "pin.tar");
  assert.equal(res.payload.dicFormat, "pin-tar");
  assert.deepEqual(res.payload.sukuKata, ["pin", "tar"]);
});

test("cari_pemenggalan: mengembalikan ditemukan=false jika kata tidak ada", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        pintar: "pin.tar",
      }),
      { status: 200 }
    );

  const res = await callRaw("cari_pemenggalan", { kata: "tidakada" });
  assert.equal(res.isError, false);
  assert.equal(res.payload.ditemukan, false);
});

test("cari_pemenggalan: penanganan error jika fetch dict gagal", async () => {
  globalThis.fetch = async () => new Response("", { status: 500 });

  const res = await callRaw("cari_pemenggalan", { kata: "pintar" });
  assert.equal(res.isError, true);
  assert.match(res.text, /^Gagal mencari pemenggalan "pintar":/);
});

// ──────────────────────────────────────────────────
// daftar_dic tests
// ──────────────────────────────────────────────────

test("daftar_dic: sukses membaca isi .dic", async () => {
  globalThis.fetch = async () => new Response("pin.tar\nmem.ban.tu\n", { status: 200 });

  const res = await callRaw("daftar_dic", { format: "id" });
  assert.equal(res.isError, false);
  assert.equal(res.payload.format, "id");
  assert.equal(res.payload.totalEntries, 2);
  assert.equal(res.payload.dicContent, "pin.tar\nmem.ban.tu\n");
});

test("daftar_dic: penanganan error jika fetch .dic gagal", async () => {
  globalThis.fetch = async () => new Response("", { status: 404 });

  const res = await callRaw("daftar_dic", { format: "id" });
  assert.equal(res.isError, true);
  assert.match(res.text, /^Gagal ekspor \.dic "id":/);
});

// ──────────────────────────────────────────────────
// bandingkan_dic tests
// ──────────────────────────────────────────────────

test("bandingkan_dic: sukses membandingkan 2 format .dic", async () => {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("id.dic")) {
      return new Response("pin.tar\nmem.ban.tu\n", { status: 200 });
    }
    if (url.includes("id_orthos.dic")) {
      return new Response("pin.tar\n", { status: 200 });
    }
    return new Response("", { status: 404 });
  };

  const res = await callRaw("bandingkan_dic", { format1: "id", format2: "orthos" });
  assert.equal(res.isError, false);
  assert.equal(res.payload.format1, "id");
  assert.equal(res.payload.format2, "orthos");
  assert.equal(res.payload.totalEntries1, 2);
  assert.equal(res.payload.totalEntries2, 1);
  assert.equal(res.payload.onlyIn1, 1);
  assert.equal(res.payload.onlyIn2, 0);
  assert.deepEqual(res.payload.sampleOnlyIn1, ["mem.ban.tu"]);
});

test("bandingkan_dic: penanganan error jika salah satu fetch gagal", async () => {
  globalThis.fetch = async () => new Response("", { status: 500 });

  const res = await callRaw("bandingkan_dic", { format1: "id", format2: "orthos" });
  assert.equal(res.isError, true);
  assert.match(res.text, /^Gagal bandingkan \.dic "id" vs "orthos":/);
});
