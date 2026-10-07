# Feature Specification: Multi-Client Onboarding, Skill, Installer, dan Perbaikan Temuan

**Feature Branch**: `001-mcp-client-onboarding`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "sempurnakan mcp server ini. buat petunjuk cara instalasi dan penggunaannya di claude/opencode/zed/antigravity. buat skill pendukungnya dan installernya."

**Scope decisions** (confirmed by user):

- Cakupan mencakup perbaikan fungsional pada kapabilitas yang sudah ada, di luar dokumentasi,
  skill, dan installer.
- "Claude" ditafsirkan sebagai Claude Code saja. Claude Desktop dikeluarkan dari cakupan karena
  tidak dapat memuat skill dari sistem berkas, sehingga FR-015 tidak dapat dipenuhi untuknya.
 Hal ini dikunci dalam sesi klarifikasi 2026-10-07.
- Installer boleh menulis ke berkas konfigurasi klien, tetapi hanya setelah konfirmasi eksplisit
  per klien.
- Cakupan konfigurasi bawaan adalah lingkup pengguna (global). Cakupan proyek menjadi opsi
  eksplisit, bukan bawaan.
- Skill dipasang ke dalam proyek untuk Zed dan Antigravity dari satu salinan bersama, dan
  ke lingkup pengguna untuk Claude Code dan OpenCode.
- SC-001 dipecah menjadi dua kriteria: satu untuk lama instalasi, satu untuk koneksi pertama.
  Ditambah pengaturan batas waktu OpenCode.

## Clarifications

### Session 2026-10-07

- Catatan koreksi: SC-006 dan SC-007 semula menuntut "sepuluh dari sepuluh pengguna uji".
  Ketentuan itu tidak pernah diminta dan tidak memiliki pemilik, sehingga tidak dapat dijalankan
  saat fitur dinyatakan selesai. Keduanya diganti menjadi kriteria yang otomatis dapat diperiksa:
  cakupan kapabilitas dan kesamaan isi berkas saat pemulihan.

- Q: Bagaimana spec harus menangani Claude Desktop yang tidak dapat memuat skill dari sistem
  berkas? → A: Claude Desktop dikeluarkan dari cakupan fitur; target menjadi empat klien
  (Claude Code, OpenCode, Zed, Antigravity). Seluruh penyebutan jumlah klien diselaraskan.
- Q: Pada cakupan apa installer mendaftarkan server secara bawaan? → A: Bawaan lingkup pengguna
  (global), dengan lingkup proyek sebagai opsi eksplisit. Dicatat sebagai FR-031.
- Q: Di mana skill pendukung dipasang secara bawaan? → A: Satu salinan bersama di dalam proyek
  untuk Zed dan Antigravity, dan lingkup pengguna untuk Claude Code dan OpenCode. Dicatat
  sebagai FR-032.
- Q: Bagaimana target lima menit harus direkonsiliasi dengan konfirmasi per klien dan latensi
  CDN? → A: SC-001 dipecah menjadi dua kriteria, yaitu lama instalasi dan koneksi pertama, dan
  installer MUST menuliskan batas waktu OpenCode yang cukup. Dicatat sebagai FR-033 dan SC-012.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Memasang dan terhubung pada satu klien (Priority: P1)

Seorang pengembang yang baru menemukan server KBBI ingin menghubungkannya ke satu klien AI
tertentu, misalnya Claude Code, lalu menjalankan satu pencarian definisi dari dalam klien itu.
Dia menjalankan satu perintah installer, menjawab pertanyaan minimal yang muncul, menyetujui
konfirmasi per klien, kemudian meminta kliennya "apa arti kata pintar". Klien menjawab dengan
definisi dari KBBI.

**Why this priority**: Tanpa koneksi yang benar-benar terverifikasi, semua nilai lain seperti
dokumentasi dan skill menjadi sia-sia. Ini jalur yang sekaligus membuktikan produk ini dapat
dipakai, sehingga menjadi MVP.

**Independent Test**: Pada mesin bersih dengan satu klien terpasang, jalankan installer untuk klien
itu saja, mulai ulang klien, lalu panggil satu pencarian definisi dari dalam klien. Hasilnya harus
definisi KBBI yang benar, tanpa sentuhan manual pada berkas konfigurasi.

**Acceptance Scenarios**:

1. **Given** mesin dengan runtime Node.js dan satu klien AI terpasang tetapi belum pernah
   dikonfigurasi untuk server ini, **When** pengguna menjalankan installer dan memilih klien
   tersebut, **Then** installer meminta konfirmasi, dan setelah disetujui mendaftarkan server pada
   klien itu serta melaporkan lokasi konfigurasi yang diubah.
2. **Given** konfirmasi ditolak untuk suatu klien, **When** installer melanjutkan, **Then**
   konfigurasi klien itu tidak berubah dan installer melompatinya tanpa berhenti.
3. **Given** installer sudah dijalankan sebelumnya untuk klien yang sama, **When** installer
   dijalankan ulang, **Then** installer tidak mengubah apa pun dan melaporkan bahwa konfigurasi
   sudah benar.
4. **Given** instalasi yang baru selesai, **When** pengguna meminta definisi satu kata dari dalam
   klien, **Then** klien mengembalikan definisi dari KBBI tanpa error.
5. **Given** build server belum tersedia, **When** installer dijalankan, **Then** installer
   membangunkan build lebih dulu, atau berhenti dengan instruksi yang jelas. Installer tidak
   pernah menulis registrasi yang rusak.

---

### User Story 2 - Menambah klien lain tanpa sentuhan manual (Priority: P2)

Seorang pengembang yang sudah memakai server di satu klien ingin memakainya juga di tiga klien
lainnya. Dia menjalankan installer dengan mode multi-klien, memilih klien yang diinginkan,
menyetujui konfirmasi yang diminta satu per satu, dan selesai tanpa membuka editor untuk
menyalin-tempel blok konfigurasi secara manual.

**Why this priority**: Nilai sesungguhnya ada pada server yang bisa dipakai di mana saja pengguna
kerja, bukan hanya di satu klien. Story ini dapat dibangun dan diuji sepenuhnya secara terpisah
dari Story 1.

**Independent Test**: Tambahkan server ke masing-masing dari tiga klien sisanya pada mesin uji.
Setiap klien harus dapat memanggil kapabilitas yang sama dan mengembalikan hasil yang sama.

**Acceptance Scenarios**:

1. **Given** server sudah terpasang di satu klien, **When** pengguna menjalankan installer untuk
   ketiga klien sisanya dalam satu sesi, **Then** keempat konfigurasi klien memuat entri server
   yang sama dan installer merangkum perubahan per klien.
2. **Given** satu klien menolak ditulis karena berkas konfigurasi tidak dapat ditulis, **When**
   installer memproses seluruh klien, **Then** installer menyelesaikan klien lain dan melaporkan
   klien yang gagal secara eksplisit beserta alasannya.
3. **Given** konfigurasi klien berisi entri lain milik pengguna, **When** installer menulis entri
   server, **Then** entri lain tidak berubah dan tidak hilang.
4. **Given** pengguna menyetujui konfirmasi untuk tiga klien dan menolak dua, **When** installer
   selesai, **Then** tepat tiga konfigurasi berubah dan dua lainnya utuh.

---

### User Story 3 - Memakai server secara produktif lewat panduan dan skill (Priority: P3)

Setelah server terhubung, pengguna dan agen AI-nya perlu tahu kapabilitas mana yang dipakai untuk
tugas apa. Dia membaca panduan penggunaan yang terstruktur, dan agen AI-nya memuat skill
pendukung sehingga secara otomatis memilih kapabilitas yang tepat. Contohnya, untuk menyiapkan
data training satu huruf, agen memakai ekspor massal, bukan memanggil pencarian kata satu per satu.

**Why this priority**: Agar server benar-benar bermanfaat, pengguna harus menemukan kapabilitas
yang relevan. Tanpa panduan dan skill, 21 kapabilitas dan 5 alur siap pakai menjadi tersembunyi.
Story ini juga menjadi sumber utama temuan cacat bagi Story 4.

**Independent Test**: Berikan tugas nyata pada agen yang sudah punya skill terpasang, yaitu
menyiapkan data training untuk satu huruf, lalu periksa apakah agen memakai kapabilitas massal yang
benar dan tidak mengulang pencarian kata satu per satu.

**Acceptance Scenarios**:

1. **Given** panduan penggunaan tersedia, **When** pengguna mencari kapabilitas untuk tugas
   tertentu, **Then** panduan menampilkan kapabilitas yang tepat beserta contoh pemanggilan dan
   output yang diharapkan.
2. **Given** skill pendukung terpasang pada klien, **When** agen diberi tugas di luar cakupan
   kapabilitas server, **Then** agen menjelaskan batasannya, bukan mengarang pemanggilan
   kapabilitas yang tidak ada.
3. **Given** panduan penggunaan, **When** pengguna membacanya untuk pertama kali, **Then**
   seluruh kapabilitas yang diekspos server tercakup tanpa ada yang terlewat.
4. **Given** pengguna menjalankan salah satu dari lima alur siap pakai, **When** alur itu
   memerlukan banyak panggilan kapabilitas, **Then** alur berjalan sebagai satu rangkaian
   terarah, bukan tebakan Calls individu.

---

### User Story 4 - Memperbaiki cacat fungsional yang terungkap saat onboarding (Priority: P4)

Saat memasang, memakai, dan mendokumentasikan server, pengguna menemukan kapabilitas yang
menghasilkan jawaban salah, gagal diam-diam, atau bertentangan dengan penjelasannya. Setiap
temuan dicatat, diperbaiki, dan dijaga oleh tes regresi sehingga tidak muncul kembali.

**Why this priority**: Ruang lingkup ini disepakati pengguna dan membuat server benar-benar layak
dipromosikan lewat dokumentasi. Prioritas P4 karena temuan hanya muncul setelah Story 1 sampai
Story 3 dipakai, danGTG perbaikannya tidak boleh menghambat penemuan.

**Independent Test**: Ambil satu temuan cacat yang tercatat, jalankan tes regresinya untuk melihat
kegagalan, terapkan perbaikan, lalu buktikan tes itu lulus dan kapabilitasnya berperilaku benar.

**Acceptance Scenarios**:

1. **Given** pengguna menemukan kapabilitas yang berperilaku salah, **When** temuan dicatat,
   **Then** catatan memuat langkah reproduksi, hasil yang diharapkan, dan hasil yang sebenarnya.
2. **Given** sebuah temuan yang diperbaiki, **When** perbaikan dikirim, **Then** ada tes regresi
   yang gagal sebelum perbaikan dan lulus sesudahnya.
3. **Given** sebuah temuan yang tidak dapat direproduksi, **When** temuan ditolak, **Then**
   alasannya tercatat dan kapabilitasnya dibiarkan apa adanya.
4. **Given** sebuah perbaikan, **When** diperiksa terhadap kontrak publik server, **Then** tidak
   ada nama kapabilitas yang diganti dan tidak ada data kamus yang ikut dibundel.

---

### User Story 5 - Memulihkan saat instalasi bermasalah (Priority: P5)

Instalasi bisa gagal. Berkas konfigurasi rusak, lokasi server berubah, klien tidak ditemukan,
atau server tidak dapat dijalankan. Pengguna memerlukan cara aman untuk memeriksa kondisi, melihat
diagnostik, dan mengembalikan konfigurasi ke keadaan sebelum installer menyentuh.

**Why this priority**: Instalasi yang rusak lebih merusak kepercayaan daripada tidak ada installer
sama sekali. Prioritas P5 karena nilainya hanya muncul ketika Story 1 sampai Story 4 sudah dipakai.

**Independent Test**: Rusakkan entri server pada konfigurasi salah satu klien, jalankan pemeriksaan
kondisi, lalu jalankan pemulihan dan periksa konfigurasi kembali ke isi cadangan.

**Acceptance Scenarios**:

1. **Given** entri server sudah terpasang, **When** pengguna menjalankan pemeriksaan kondisi,
   **Then** laporan menyebutkan status per klien, yaitu terpasang, tidak terpasang, atau rusak,
   beserta lokasi konfigurasi masing-masing.
2. **Given** installer pernah mengubah konfigurasi, **When** pengguna menjalankan pemulihan,
   **Then** konfigurasi dikembalikan persis ke isi cadangan sebelum installer berjalan.
3. **Given** konfigurasi klien tidak dapat dibaca karena rusak, **When** pemeriksaan kondisi
   dijalankan, **Then** kondisi dilaporkan sebagai rusak dengan saran perbaikan, tanpa menimpa
   berkas asli.

---

### Edge Cases

- **Konfigurasi sudah punya entri dengan nama yang sama** - installer memperbarui entri itu, tidak
  membuat duplikat.
- **Berkas konfigurasi berisi isi yang tidak valid** - installer berhenti pada klien itu,
  melaporkan nama berkas dan pesan galat, dan tidak menimpa berkas.
- **Lokasi absolut mengandung spasi**, yang umum di Windows - entri tetap berfungsi, dan installer
  menolak bila lokasi tidak dapat dikenali.
- **Node.js tidak ada di PATH** - installer gagal cepat dengan pesan yang menyebut Node.js, bukan
  melaporkan galat yang membingungkan.
- **Build belum ada atau sudah usang** - installer mendeteksi dan memberi langkah perbaikan.
- **Data kamus tidak dapat diakses saat verifikasi** - kegagalan jaringan dibedakan dari kegagalan
  instalasi. Instalasi tetap dianggap berhasil, koneksi ditandai belum terverifikasi.
- **Installer dijalankan dari direktori lain** - installer menemukan lokasi server sendiri, bukan
  mengandalkan direktori kerja saat itu.
- **Instalasi di beberapa klien lalu satu klien dihapus** - perintah penghapusan hanya menyentuh
  klien yang diminta.
- **Skill sudah terpasang versi lama** - pemasangan ulang memperbarui, bukan menduplikasi.
- **Dua versi skill terpasang bersamaan** - konflik dilaporkan, bukan ditimpa diam-diam.
- **Pengguna menolak konfirmasi semua klien** - installer keluar dengan status berhasil dan laporan
  kosong, bukan gagal.
- **Pengguna membatalkan di tengah proses** - klien yang sudah disetujui tetap terpasang, dan
  laporan menyebutkan klien mana yang sudah berubah.
- **Temuan cacat ternyata DOCUMENTASI, bukan kode** - diperbaiki di panduan, tanpa tes regresi kode,
  dan tetap tercatat.
- **Perbaikan berpotensi merusak kontrak publik** - perbaikan ditahan sampai ada keputusan
  eksplisit, tidak diam-diam diterapkan.
- **Dua temuan menunjuk cacat yang sama** - digabung menjadi satu perbaikan dengan satu tes regresi.

## Requirements *(mandatory)*

### Functional Requirements

**Permukaan instalasi**

- **FR-001**: Sistem MUST menyediakan satu installer yang mendaftarkan server pada keempat klien
  target: Claude Code, OpenCode, Zed, dan Antigravity.
- **FR-002**: Installer MUST dapat dibatasi target, sehingga pengguna memilih satu klien atau semua
  klien dalam satu eksekusi.
- **FR-003**: Installer MUST mendeteksi klien yang terpasang dan melaporkan mana yang tidak ditemukan,
  tanpa membuat entri untuk klien yang absen.
- **FR-004**: Installer MUST menyediakan mode dry-run yang menampilkan rencana perubahan tanpa menulis
  apa pun ke sistem berkas.
- **FR-005**: Installer MUST meminta konfirmasi eksplisit per klien sebelum menulis ke konfigurasi
  klien tersebut, dan tidak menulis ke klien yang konfirmasinya ditolak.
- **FR-006**: Installer MUST membuat cadangan konfigurasi klien sebelum mengubahnya, dan menyediakan
  perintah pemulihan yang mengembalikan isi cadangan tersebut.
- **FR-007**: Installer MUST bersifat idempoten. Eksekusi berulang pada konfigurasi yang sudah benar
  tidak mengubah berkas dan keluar dengan status berhasil.
- **FR-008**: Installer MUST mempertahankan entri milik pengguna lain pada berkas konfigurasi yang
  sama.
- **FR-009**: Installer MUST gagal dengan pesan yang jelas bila prasyarat tidak terpenuhi, yaitu runtime
  Node.js tidak tersedia, build server tidak ada, atau konfigurasi tidak dapat ditulis.
- **FR-010**: Installer MUST melaporkan ringkasan per klien berupa berhasil, dilewati, atau gagal,
  beserta alasannya.

**Dokumentasi**

- **FR-011**: Sistem MUST menyediakan panduan instalasi yang mencakup keempat klien secara lengkap dan
  independen, sehingga pembaca tidak perlu dokumentasi klien lain untuk menyelesaikan instalasi.
- **FR-012**: Panduan instalasi MUST mendokumentasikan prasyarat, langkah konfigurasi, verifikasi
  koneksi, dan pemulihan untuk setiap klien.
- **FR-013**: Sistem MUST menyediakan panduan penggunaan yang memetakan setiap kapabilitas yang
  diekspos server ke tugas yang tepat untuk memakainya, lengkap dengan contoh pemanggilan dan output
  yang diharapkan.
- **FR-014**: Panduan penggunaan MUST mencakup seluruh 21 kapabilitas dan 5 alur siap pakai yang
  diekspos server, tanpa kecuali.

**Skill pendukung**

- **FR-015**: Sistem MUST menyediakan skill pendukung yang dapat dimuat oleh keempat klien, dan
  setiap klien tersebut MUST memuatnya dari sistem berkas.
- **FR-016**: Skill pendukung MUST menjelaskan kapan memakai kapabilitas mana, serta batas-batas server,
  sehingga agen memilih pendekatan massal untuk tugas massal.
- **FR-017**: Installer MUST dapat memasang skill pendukung ke lokasi skill yang benar untuk setiap klien
  yang mendukungnya.
- **FR-018**: Installer MUST dapat memasang ulang atau memperbarui skill yang sudah terpasang tanpa
  menghasilkan duplikat.

**Diagnosis dan penghapusan**

- **FR-019**: Sistem MUST menyediakan perintah pemeriksaan kondisi yang melaporkan status registrasi
  per klien tanpa mengubah apa pun.
- **FR-020**: Sistem MUST menyediakan perintah penghapusan yang melepas server dari klien
  yang dipilih dan tidak menyentuh klien lain.

**Bahasa dan portabilitas**

- **FR-021**: Seluruh dokumentasi MUST ditulis dalam Bahasa Indonesia, kecuali nama kapabilitas dan
  pesan error dari sistem yang dipertahankan apa adanya.
- **FR-022**: Dokumentasi instalasi dan penggunaan MUST tersedia di dalam repositori dan dapat dibaca
  tanpa koneksi internet.
- **FR-023**: Installer MUST menyelesaikan instalasi untuk satu klien tanpa memerlukan server tersambung
  ke internet. Verifikasi koneksi adalah langkah terpisah dan opsional.

**Perbaikan cacat**

- **FR-024**: Setiap cacat yang terungkap selama Story 1 sampai Story 3 MUST dicatat dalam bentuk
  yang dapat direproduksi, yaitu langkah, hasil yang diharapkan, dan hasil yang sebenarnya.
- **FR-025**: Setiap cacat yang diperbaiki MUST disertai tes regresi yang gagal sebelum perbaikan dan
  lulus sesudahnya.
- **FR-026**: Setiap perbaikan MUST mempertahankan nama kapabilitas, nama resource, dan nama alur yang
  ada. Perubahan yang merusak kontrak publik memerlukan versi mayor dan catatan migrasi.
- **FR-027**: Setiap perbaikan MUST NOT membundel, menyalin, atau mengunduh data kamus ke dalam
  repositori atau paket.
- **FR-028**: Sistem MUST melaporkan seluruh temuan, yang diperbaiki dan yang ditolak, beserta alasan
  penolakan.
- **FR-029**: Setiap perbaikan yang mengubah perilaku yang didokumentasikan MUST memperbarui panduan
  penggunaan pada titik yang sama.
- **FR-030**: Cakupan perbaikan terbatas pada cacat yang dapat direproduksi pada kapabilitas yang sudah
  ada. Penambahan kapabilitas baru berada di luar cakupan fitur ini dan harus dicatat sebagai pekerjaan
  terpisah.
- **FR-031**: Cakupan konfigurasi bawaan installer MUST berupa lingkup pengguna, sehingga memengaruhi
  seluruh proyek pada mesin tersebut. Cakupan proyek MUST tersedia sebagai opsi eksplisit yang diminta
  pengguna dan tidak pernah dipilih secara diam-diam. Untuk Antigravity, lingkup proyek tidak MUST
  ditawarkan karena berkas tersebut diabaikan diam-diam oleh CLI.
- **FR-032**: Skill pendukung MUST dipasang ke satu salinan bersama di dalam proyek untuk Zed dan
  Antigravity, karena kedua klien membaca lokasi proyek yang sama, dan MUST dipasang ke lingkup
  pengguna untuk Claude Code dan OpenCode. Jumlah berkas skill yang terpasang MUST tidak melebihi
  tiga.
- **FR-033**: Untuk OpenCode, installer MUST menuliskan batas waktu pengambilan kapabilitas yang
  melebihi waktu tempuh satu putaran jaringan ke CDN, karena batas bawaan OpenCode hanya lima
  detik dan pemanggilan pertama server ini mengambil data kamus dari jaringan.

### Key Entities

- **Klien Terpasang**: Salah satu dari empat aplikasi target yang ada di mesin pengguna. Atribut: nama,
  ada atau tidaknya, lokasi konfigurasi, dapat ditulis atau tidaknya.
- **Entri Server**: Satu catatan registrasi server di dalam konfigurasi klien. Atribut: nama, perintah,
  argumen, variabel lingkungan, lokasi berkas tempat ia berada.
- **Cadangan Konfigurasi**: Salinan berkas konfigurasi sebelum installer mengubahnya. Atribut: lokasi,
  waktu pembuatan, berkas asal, isi.
- **Paket Skill**: Kumpulan instruksi yang dapat dimuat klien. Atribut: nama, versi, lokasi instalasi
  per klien, status yaitu baru, sudah ada, atau lebih baru.
- **Laporan Status**: Ringkasan hasil satu eksekusi installer atau pemeriksaan. Atribut: hasil per klien,
  alasan kegagalan, jumlah perubahan.
- **Temuan Cacat**: Suatu masalah yang terungkap selama proses onboarding. Atribut: kapabilitas atau
  dokumen yang terdampak, langkah reproduksi, hasil diharapkan, hasil sebenarnya, status yaitu diperbaiki,
  ditolak, atau tertunda, serta tes regresi penunjangnya.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Installer menyelesaikan instalasi pada satu klien dalam waktu kurang dari lima menit,
  diukur dari perintah dijalankan sampai konfigurasi ditulis, termasuk konfirmasi per klien, dan
  tanpa mengedit berkas konfigurasi secara manual.
- **SC-012**: Klien yang baru dikonfigurasi dapat mengembalikan satu hasil kamus yang benar dari
  dalam klien dalam waktu kurang dari satu menit setelah klien dimulai ulang, pada koneksi yang
  dihitung sebagai kegagalan instalasi.
- **SC-002**: Keempat klien target memiliki jalur instalasi yang terdokumentasi dan terverifikasi,
  masing-masing diuji minimal sekali pada build rilis.
- **SC-003**: Menjalankan installer dua kali berturut-turut menghasilkan nol perbedaan pada berkas
  konfigurasi klien.
- **SC-004**: Mode dry-run pada seluruh klien menghasilkan nol modifikasi berkas, terverifikasi lewat
  checksum sebelum dan sesudah.
- **SC-005**: Setiap kapabilitas yang diekspos server memiliki entri di panduan penggunaan,
  terverifikasi lewat penghitungan silang terhadap daftar yang diekspos server.
- **SC-006**: Setiap kapabilitas yang diekspos server memiliki entri di panduan penggunaan, dan
  penghitungan silang otomatis melaporkan nol kapabilitas yang hilang dari panduan.
- **SC-007**: Perintah pemulihan mengembalikan berkas konfigurasi ke isi yang identik dengan isi
  sebelum instalasi, terverifikasi otomatis lewat perbandingan checksum.
- **SC-008**: Nol entri milik pengguna hilang pada berkas konfigurasi mana pun di seluruh skenario uji.
- **SC-009**: Seratus persen cacat yang diperbaiki memiliki tes regresi yang lulus, dan nol cacat
  diperbaiki tanpa tes penunjang.
- **SC-010**: Nol nama kapabilitas, resource, atau alur berubah selama fitur ini, terverifikasi lewat
  perbandingan daftar sebelum dan sesudah.
- **SC-011**: Seluruh temuan cacat tercatat dengan status akhir yang jelas, sehingga tidak ada temuan
  yang hilang tanpa keputusan.

## Assumptions

- Runtime Node.js sudah terpasang di mesin pengguna. Installer memverifikasi, bukan memasangnya.
- Cakupan perbaikan fungsional terbatas pada kapabilitas yang sudah ada. Tidak ada kapabilitas baru
  yang ditambahkan oleh fitur ini, sesuai FR-030.
- Lokasi dan nama kapabilitas, resource, dan alur tetap sama sebelum dan sesudah fitur ini, sesuai
  FR-026 dan Prinsip III Konstitusi.
- Data KBBI tetap diakses lewat CDN sesuai Prinsip I Konstitusi. Installer dan perbaikan tidak pernah
  mengunduh atau menyalin data kamus ke mesin pengguna.
- Keempat klien target mendukung mekanisme skill berbasis sistem berkas, sehingga skill
  pendukung dapat dipasang di keempat lokasi tersebut.
- Lokasi skill untuk Zed dan Antigravity sama-sama berada di dalam repositori ini, sehingga
  keduanya berbagi satu salinan dan skill ikut terbawa oleh siapa pun yang mengkloning repositori.
- Bahasa utama seluruh dokumentasi adalah Bahasa Indonesia.
- Lokasi konfigurasi keempat klien mengikuti default masing-masing aplikasi dan dapat ditemukan installer
  pada struktur direktori yang lazim.
- Installer dijalankan dari direktori repositori ini dan menemukan lokasi server secara otomatis.
- Keempat klien target mendokumentasikan format konfigurasi yang stabil, sehingga entri yang ditulis
  installer dapat dibaca klien tanpa langkah tambahan.
- Kegagalan instalasi pada satu klien tidak menghalangi klien lain dalam sesi yang sama.
- Lingkup bawaan adalah lingkup pengguna, sehingga instalasi tidak bergantung pada direktori
  tempat installer dijalankan dan tidak ikut ter-commit ke repositori.
- Pengguna yang memakai lingkup proyek memahami bahwa masukannya berakhir di VCS, sesuai
  catatan kehati-hatian dari Zed untuk berkas konfigurasi proyek.
- Jumlah cacat yang ditemukan pada Story 4 bergantung pada pemakaian nyata Story 1 sampai Story 3,
  sehingga tidak dapat diprediksi di muka dan tidak menjadi ukuran keberhasilan fitur ini.