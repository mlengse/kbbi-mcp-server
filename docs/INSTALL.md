---
description: "Panduan instalasi server KBBI MCP untuk empat klien AI"
---

# Panduan Instalasi

Server ini mendaftarkan dirinya ke empat klien AI: **Claude Code**, **OpenCode**,
**Zed**, dan **Antigravity**.

Setiap klien punya bagiannya sendiri di bawah, lengkap dengan prasyarat,
langkah konfigurasi, verifikasi koneksi, dan pemulihan. Anda tidak perlu
membaca bagian klien lain untuk menyelesaikan instalasi satu klien.

---

## Jalur tercepat

Kalau Anda tidak ingin membaca seluruh dokumen ini, gunakan installer. Ia
menangani keempat klien, meminta konfirmasi per klien, dan mencadangkan
konfigurasi sebelum menulis apa pun.

```bash
git clone <repo> kbbi-mcp-server
cd kbbi-mcp-server
npm install
npm run build

node scripts/install-clients.cjs install --client opencode
```

Akhiri dengan:

```bash
node scripts/install-clients.cjs status
node scripts/install-clients.cjs verify
```

Untuk memasang ke semua klien yang terdeteksi sekaligus, hilangkan `--client`:

```bash
node scripts/install-clients.cjs install
```

---

## Prasyarat, berlaku untuk semua klien

| Prasyarat | Kenapa perlu | Cara memasangnya |
|---|---|---|
| Node.js di PATH | Server dijalankan sebagai proses Node.js, dan installer juga | `node --version` harus berhasil. Pasang dari situs resmi Node.js bila gagal |
| Dependensi terpasang | Server memakai SDK MCP, Hypher, dan Zod | `npm install` di direktori repositori |
| Build tersedia | Klien menjalankan `build/index.js`, bukan sumber TypeScript | `npm run build` |

Data kamus **tidak** diunduh ke mesin Anda. Server membacanya dari CDN setiap
kali dibutuhkan. Instalasi selesai tanpa koneksi internet; hanya langkah
verifikasi yang butuh jaringan.

---

## Claude Code

### Prasyarat

Node.js terpasang, dependensi terpasang, build selesai.

### Konfigurasi

```bash
node scripts/install-clients.cjs install --client claude-code
```

Installer menulis entri `kbbi` ke kunci `mcpServers` di `~/.claude.json`.
Untuk lingkup proyek, tambahkan `--scope project`, yang menulis ke `.mcp.json`
di direktori kerja.

Bentuk entri yang ditulis:

```json
{
  "mcpServers": {
    "kbbi": {
      "command": "/path/absolut/ke/node",
      "args": ["/path/absolut/ke/repo/build/index.js"],
      "env": {}
    }
  }
}
```

Skill pendukung dipasang ke `~/.claude/skills/kbbi-mcp/`. Claude Code membaca
dua lokasi skill: `~/.claude/skills/` untuk lingkup pengguna, dan
`.claude/skills/` untuk lingkup proyek.

### Verifikasi

```bash
node scripts/install-clients.cjs verify
```

Lalu di dalam Claude Code, minta: apa arti kata pintar. Jawaban harus berisi
definisi dari KBBI.

### Pemulihan

```bash
node scripts/install-clients.cjs restore --client claude-code
```

### Yang mudah salah

- Installer menolak relative path di `args`, karena keempat klien menjalankan
  server dari direktori kerja berbeda.
- Kunci entri adalah `mcpServers`, bukan `mcp` seperti pada OpenCode.

---

## OpenCode

### Prasyarat

Sama seperti klien lain, ditambah: OpenCode harus sudah pernah dijalankan
minimal sekali, sehingga `~/.config/opencode/opencode.json` ada.

### Konfigurasi

```bash
node scripts/install-clients.cjs install --client opencode
```

### Bentuk entri, dan tiga hal yang berbeda dari klien lain

```json
{
  "mcp": {
    "kbbi": {
      "type": "local",
      "command": ["/path/absolut/ke/node", "/path/absolut/ke/repo/build/index.js"],
      "enabled": true,
      "environment": {},
      "timeout": 60000
    }
  }
}
```

1. **`command` adalah array** yang memuat executable-nya, bukan string terpisah
   dari `args`. Tidak seperti ketiga klien lainnya.
2. **Kunci environment adalah `environment`**, bukan `env`.
3. **`timeout` harus diubah.** Batas bawaan OpenCode adalah lima detik, dan
   panggilan pertama ke server ini mengambil data kamus dari jaringan. Lima
   detik lebih pendek dari satu putaran CDN, sehingga panggilan pertama akan
   gagal dengan pesan waktu tunggu habis, lalu berhasil pada panggilan
   berikutnya. Installer menuliskan 60000 milidetik.

### Verifikasi

```bash
node scripts/install-clients.cjs verify
```

Mulai ulang OpenCode, lalu minta definisi satu kata. Bila yang pertama gagal
dengan waktu tunggu habis, jangan simpulkan servernya rusak. Periksa apakah
`timeout` sudah tertulis di `~/.config/opencode/opencode.json`.

### Pemulihan

```bash
node scripts/install-clients.cjs restore --client opencode
```

### Yang mudah salah

- **Dua skema tidak kompatibel sedang sama-sama terdokumentasi.** Skema v1
  menaruh entri langsung di bawah `mcp` dan memakai `enabled`. Skema v2
  bersarang di `mcp.servers` dan memakai `disabled`. Installer menulis v1 dan
  mendeteksi v2 saat dijalankan. Bila konfigurasi Anda v2, installer **menolak
  menulis** dan memberi tahu, alih-alih menghasilkan entri yang rusak diam-diam.
  Naikkan atau turunkan versi OpenCode supaya format dan skema cocok.
- Konfigurasi di `~/.config/opencode/opencode.json` bersifat global dan
  memengaruhi seluruh proyek. `opencode.json` di dalam proyek bersifat per
  proyek, dan `--scope project` menuliskannya di sana.Ingat bahwa berkas
  per proyek ikut ter-commit ke kendali versi.

---

## Zed

### Prasyarat

Zed harus sudah pernah dijalankan, sehingga `~/.config/zed/settings.json` ada.

### Konfigurasi

```bash
node scripts/install-clients.cjs install --client zed
```

### Bentuk entri

```json
{
  "context_servers": {
    "kbbi": {
      "command": "/path/absolut/ke/node",
      "args": ["/path/absolut/ke/repo/build/index.js"],
      "env": {},
      "source": "custom"
    }
  }
}
```

Kunci root-nya `context_servers`, bukan `mcpServers` seperti pada Claude Code dan
Antigravity.

### Verifikasi

Mulai ulang Zed, buka panel MCP, lalu minta definisi satu kata.

### Pemulihan

```bash
node scripts/install-clients.cjs restore --client zed
```

### Yang mudah salah

- **`source: "custom"` wajib ada.** Tanpa field ini, Zed menganggap entri
  berasal dari ekstensi dan mengabaikannya. Installer menulisnya otomatis.
- Skill dipasang ke `.agents/skills/kbbi-mcp/` di dalam repositori, satu salinan
  yang juga dipakai Antigravity. Zed hanya mendukung dua lokasi skill, yaitu
  `~/.agents/skills/` dan `<proyek>/.agents/skills/`. Pencarian path kustom dan
  registry jarak jauh tidak didukung.

---

## Antigravity

### Prasyarat

Sama seperti klien lain.

### Konfigurasi

```bash
node scripts/install-clients.cjs install --client antigravity
```

### Yang mudah salah, dan ini yang paling penting

- **Harus memakai konfigurasi global.** Berkas workspace `.agents/mcp_config.json`
  terdokumentasi sebagai lokasi lingkup proyek, tetapi CLI mengabaikannya
  diam-diam. Kegagalan diam-diam adalah kegagalan terburuk bagi installer:
  Anda melihat pesan berhasil, tetapi tidak ada server yang jalan. Karena itu
  installer **tidak pernah** menawarkan `--scope project` untuk Antigravity.
- **Tiga path bersaing.** Installer memeriksa berurutan
  `~/.gemini/config/mcp_config.json`, lalu `~/.gemini/antigravity/mcp_config.json`,
  lalu `~/.gemini/antigravity-ide/mcp_config.json`, dan memilih yang sudah memuat
  server bila ada. Path yang dipilih dilaporkan di keluaran installer.
- Bentuk entri sama seperti Claude Code: kunci `mcpServers`, dengan `command`,
  `args`, dan `env`.

### Verifikasi

Mulai ulang Antigravity, lalu minta definisi satu kata.

### Pemulihan

```bash
node scripts/install-clients.cjs restore --client antigravity
```

---

## Setiap perintah installer

| Perintah | Guna | Menulis berkas |
|---|---|---|
| `install` | Mendaftarkan server, opsional memasang skill | Ya, setelah konfirmasi |
| `status` | Melaporkan status registrasi dan skill per klien | Tidak |
| `uninstall` | Melepas entri server dari klien terpilih | Ya, setelah konfirmasi |
| `restore` | Mengembalikan konfigurasi ke isi cadangan | Ya, setelah konfirmasi |
| `verify` | Menjalankan server dan memanggil satu kapabilitas | Tidak |

### Opsi umum

| Opsi | Guna |
|---|---|
| `--client <id>` | Membatasi ke satu klien. Dapat diulang. Bawaan: semua klien yang terdeteksi |
| `--dry-run` | Menampilkan rencana, menulis nol byte |
| `--yes` | Melewati konfirmasi. Hanya dihormati tanpa `--dry-run`, dan dilaporkan di keluaran |
| `--skill` / `--no-skill` | Menyertakan atau tidak memasang skill |
| `--scope global\|project` | Cakupan konfigurasi. Bawaannya global |

### Kode keluar

| Kode | Arti |
|---|---|
| 0 | Semua klien terpilih berhasil, atau dilewati atau ditolak dengan benar |
| 1 | Setidaknya satu klien gagal |
| 2 | Prasyarat gagal. Tidak ada yang ditulis |
| 3 | Id klien tidak dikenal atau opsi tidak sah |

Keluar dengan kode 0 saat semua konfirmasi ditolak itu disengaja. Menolak
semua adalah pilihan yang sah, bukan kegagalan.

---

## Praktik yang aman

**Gunakan `--dry-run` lebih dulu** kalau ragu:

```bash
node scripts/install-clients.cjs install --dry-run
```

Dry-run menulis nol byte, sehingga aman dijalankan berulang kali.

**Cadangan diambil otomatis** sebelum setiap penulisan, termasuk saat hanya
mengganti satu entri. Pemulihan menyalin byte cadangan apa adanya, bukan
menyalin ulang hasil serialisasi, karena serialisasi ulang mengurutkan ulang
kunci dan mengubah format.

**Konfigurasi yang rusak tidak pernah ditimpa.** Bila berkas konfigurasi tidak
bisa diparse, installer melaporkannya sebagai rusak lengkap dengan saran
perbaikan, dan membiarkan berkas aslinya utuh.

**Mulai ulang klien** setelah instalasi. Klien membaca konfigurasi saat mulai.

---

## Pemecahan masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| Installer keluar dengan kode 2 | Node.js tidak ada di PATH, atau build belum tersedia | `node --version`, lalu `npm run build` |
| Installer menolak menulis ke OpenCode | Konfigurasi memakai skema v2 | Periksa `~/.config/opencode/opencode.json`; samakan versi OpenCode dengan skema yang ditulis installer |
| Server tidak muncul di klien | Klien belum dimulai ulang | Mulai ulang klien, lalu `status` |
| Panggilan pertama gagal dengan waktu tunggu habis di OpenCode | Batas bawaan lima detik lebih pendek dari satu putaran CDN | Periksa `timeout` pada entri; installer menulis 60000 |
| Semua panggilan gagal | Jaringan menuju CDN tidak terjangkau | Uji koneksi. Instalasi tetap benar; koneksi yang belum terverifikasi |
| `kata tidak ditemukan` padahal kata ada | Salah ejaan, atau kata itu tidak ada di KBBI | Coba `cari_kata_awalan` dengan awalan kata tersebut |
| Konfigurasi klien rusak | Berkas pernah disunting manual | `restore`, atau perbaiki manual. Installer tidak akan menimpa berkas rusak |
| Server tidak ditemukan di mesin | Klien belum pernah dijalankan | Jalankan klien sekali, lalu ulangi `install` |
| Installer dijalankan dari direktori lain | - | Aman. Installer menemukan lokasi repositori dari lokasinya sendiri, bukan dari direktori kerja |

---

## Bila ingin menulis konfigurasi manual

Bila Anda lebih suka menulis konfigurasi sendiri alih-alih memakai installer,
bentuk lengkap tiap klien ada di
`specs/001-mcp-client-onboarding/contracts/client-registry.md`. Installer tidak
menyimpan berkas di tempat lain, jadi menulis manual tidak akan saling menimpa.