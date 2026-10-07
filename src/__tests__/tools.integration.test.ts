import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKbbiServer } from "../index.js";

// @integration — butuh akses CDN (network). Jalan via `npm run test:integration`.

let client: Client;
let server: ReturnType<typeof createKbbiServer>;

before(async () => {
  server = createKbbiServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "kbbi-mcp-test", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

after(async () => {
  await client.close();
  await server.close();
});

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string }>;
  };
  if (res.isError) {
    throw new Error(`Tool ${name} error: ${JSON.stringify(res.content)}`);
  }
  const text = (res.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  return JSON.parse(text);
}

test("cari_kata 'pintar' → word + entries", async () => {
  const out = await callTool("cari_kata", { kata: "pintar" });
  assert.equal(out.word, "pintar");
  assert.ok(out.entries.length > 0);
  assert.ok(out.entries[0].makna.length > 0);
});

test("pemenggalan_kata 'pintar' → suku kata pin/tar", async () => {
  const out = await callTool("pemenggalan_kata", { kata: "pintar" });
  const first = Array.isArray(out) ? out[0] : out;
  assert.equal(first.pemenggalan, "pin.tar");
  assert.equal(first.dicFormat, "pin-tar");
  assert.deepEqual(first.sukuKata, ["pin", "tar"]);
});

test("ekspor_stem_mapping huruf 'P' → total mappings + kelasKata field", async () => {
  const out = await callTool("ekspor_stem_mapping", { huruf: "P" });
  assert.equal(out.huruf, "P");
  assert.ok(out.total > 0);
  assert.ok(Array.isArray(out.mappings));
  assert.equal(typeof out.mappings[0].kataDasar, "string");
  assert.ok("kelasKata" in out.mappings[0]);
});

test("cari_kata_dasar 'membantu' → kataDasar dari leksikon + pemenggalan dari artikel", async () => {
  const out = await callTool("cari_kata_dasar", { kata: "membantu" });
  assert.equal(out.kataDasar, "bantu");
  assert.equal(out.pemenggalan, "mem.ban.tu");
});

test("analisis_imbuhan 'membantu' → prefiks mem, kataDasar bantu", async () => {
  const out = await callTool("analisis_imbuhan", { kata: "membantu" });
  assert.equal(out.kataDasar, "bantu");
  assert.equal(out.prefiks, "mem");
  assert.equal(out.sufiks, "");
});

test("daftar_kata_turunan tidak memuat duplikat (D-F06)", async () => {
  const out = await callTool("daftar_kata_turunan", { kataDasar: "balak" });
  assert.equal(out.jumlahTurunan, out.kataTurunan.length);
  assert.equal(new Set(out.kataTurunan).size, out.kataTurunan.length);
});

test("statistik_lexicon → metric global", async () => {
  const out = await callTool("statistik_lexicon", {});
  assert.ok(out.totalRootWords > 1000);
  assert.ok(out.totalDerivedWords > 1000);
  assert.ok(out.totalHyphenationEntries > 1000);
});
