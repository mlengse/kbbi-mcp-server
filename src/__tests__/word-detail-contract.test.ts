/**
 * Kontrak `word-detail`: kunci tipe (drift lock) + toleransi terhadap field baru.
 *
 * Dua hal diuji di sini:
 * 1. Kunci kontrak — himpunan field yang dideklarasikan pada `Entry` dan `Terkait`
 *    harus sama persis dengan kontrak tercatat di bawah. Perubahan apa pun pada
 *    tipe yang dideklarasikan memutus kesamaan tipe ini dan menggagalkan
 *    `npm run typecheck` sampai kontrak tercatat diperbarui secara sengaja.
 * 2. Toleransi — artikel yang membawa field baru (`etimologi`, `jenis`,
 *    `idiom_dan_makna`) maupun yang tidak membawanya sama-sama diterima, dan
 *    field opsional bernilai null diperlakukan sebagai tidak ada.
 *
 * Semua fetch di-stub (Prinsip IV): tes ini tidak boleh menyentuh CDN.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Entry, Terkait, WordDetail } from "../data/types.js";
import { getWordDetail } from "../data/reader.js";

// ============================================================
// Kontrak tercatat — dipakai oleh drift lock
// ============================================================

type RecordedEntryKeys =
  | "id"
  | "nama"
  | "nomor"
  | "rootWord"
  | "makna"
  | "terkait"
  | "etimologi"
  | "jenis";

type RecordedTerkaitKeys =
  | "kataTurunan"
  | "gabunganKata"
  | "peribahasa"
  | "idiom"
  | "peribahasa_dan_makna"
  | "idiom_dan_makna";

/** Kesamaan tipe struktural yang tahan terhadap urutan dan optionality. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

// Gagal saat `npm run typecheck` bila kunci yang dideklarasikan menyimpang.
export type EntryContractLock = Assert<Equal<keyof Entry, RecordedEntryKeys>>;
export type TerkaitContractLock = Assert<Equal<keyof Terkait, RecordedTerkaitKeys>>;

// ============================================================
// Fixture sintetis (tulis tangan, bukan salinan data)
// ============================================================

const DENGAN_FIELD_BARU: WordDetail = {
  word: "ujicoba",
  authenticated: true,
  entries: [
    {
      id: "1",
      nama: "uji.co.ba",
      nomor: "1",
      makna: [],
      terkait: {
        kataTurunan: [],
        gabunganKata: [],
        peribahasa: [],
        idiom: [],
        idiom_dan_makna: [{ idiom: "ujicoba idiom", makna: "makna idiom" }],
      },
      etimologi: { text: "dari bahasa uji", languages: ["uji"] },
      jenis: "peribahasa",
    },
  ],
};

const TANPA_FIELD_BARU: WordDetail = {
  word: "ujicoba",
  authenticated: false,
  entries: [
    {
      id: "1",
      nama: "uji.co.ba",
      nomor: "1",
      makna: [],
      terkait: { kataTurunan: [], gabunganKata: [], peribahasa: [], idiom: [] },
    },
  ],
};

function stubFetch(detail: unknown): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(detail), { status: 200 });
}

afterEach(() => {
  delete process.env.KBBI_CDN_BASE;
});

// ============================================================
// Toleransi & bentuk
// ============================================================

test("field baru diterima dan bentuk bersarang sesuai", async () => {
  stubFetch(DENGAN_FIELD_BARU);
  const detail = await getWordDetail("ujicoba");
  const entry = detail.entries[0];

  assert.equal(entry.jenis, "peribahasa");
  assert.equal(entry.etimologi?.text, "dari bahasa uji");
  assert.deepEqual(entry.etimologi?.languages, ["uji"]);
  assert.equal(entry.terkait.idiom_dan_makna?.[0]?.idiom, "ujicoba idiom");
  assert.equal(entry.terkait.idiom_dan_makna?.[0]?.makna, "makna idiom");
});

test("artikel tanpa field baru tetap diterima (toleransi)", async () => {
  stubFetch(TANPA_FIELD_BARU);
  const detail = await getWordDetail("ujicoba");
  const entry = detail.entries[0];

  assert.equal(entry.etimologi, undefined);
  assert.equal(entry.jenis, undefined);
  assert.equal(entry.terkait.idiom_dan_makna, undefined);
});

test("field opsional bernilai null diperlakukan sebagai tidak ada", async () => {
  stubFetch({
    word: "ujicoba",
    authenticated: true,
    entries: [
      {
        id: "1",
        nama: "uji.co.ba",
        nomor: "1",
        makna: [],
        terkait: { kataTurunan: [], gabunganKata: [], peribahasa: [], idiom: [] },
        etimologi: null,
        jenis: null,
      },
    ],
  });
  const detail = await getWordDetail("ujicoba");
  const entry = detail.entries[0];

  // Konsumen memperlakukan `null` sebagai "tidak ada" memakai `?? undefined`.
  assert.equal(entry.etimologi ?? undefined, undefined);
  assert.equal(entry.jenis ?? undefined, undefined);
});
