/**
 * Perender laporan status per klien.
 *
 * Kontrak: contracts/installer-cli.md, data-model.md (Laporan Status).
 * Bahasa keluaran Indonesia per FR-021; nama kapabilitas dan pesan error
 * sistem tetap apa adanya.
 */
'use strict';

const RESULT_LABEL = {
  berhasil: 'BERHASIL',
  dilewati: 'DILEWATI',
  gagal: 'GAGAL',
};

/**
 * Daftar hasil per klien.
 * Setiap baris: { clientId, displayName, result, reason, changed, path }.
 */
function renderReport(rows, options = {}) {
  const lines = [];
  lines.push('');
  lines.push('=== Laporan installer KBBI MCP ===');

  if (options.dryRun) lines.push('Mode dry-run: tidak ada berkas yang ditulis.');
  if (options.bypassedConfirmation) {
    lines.push('Konfirmasi dilewati karena --yes dipakai.');
  }
  if (options.scope) lines.push(`Cakupan konfigurasi: ${options.scope}`);
  if (options.command) lines.push(`Perintah: ${options.command}`);
  lines.push('');

  if (rows.length === 0) {
    lines.push('Tidak ada klien yang diproses.');
    return lines.join('\n');
  }

  for (const row of rows) {
    const label = RESULT_LABEL[row.result] || row.result;
    lines.push(`[${label}] ${row.displayName || row.clientId}`);
    if (row.path) lines.push(`  lokasi   : ${row.path}`);
    // Baris skill memakai kata "skill", bukan "entri server", karena yang
    // berubah di sana adalah berkas skill, bukan konfigurasi klien.
    const noun = row.kind === 'skill' ? 'skill' : 'entri server';
    if (row.changed) lines.push(`  perubahan: ${noun} ditulis`);
    else if (row.result === 'berhasil') {
      lines.push(
        row.kind === 'skill'
          ? '  perubahan: tidak ada, skill sudah sama'
          : '  perubahan: tidak ada, konfigurasi sudah benar'
      );
    }
    if (row.reason) lines.push(`  alasan   : ${row.reason}`);
    lines.push('');
  }

  const changed = rows.filter((r) => r.changed).length;
  const failed = rows.filter((r) => r.result === 'gagal').length;
  const skipped = rows.filter((r) => r.result === 'dilewati').length;

  lines.push(
    `Ringkasan: ${rows.length} klien diproses, ${changed} diubah, ` +
      `${skipped} dilewati, ${failed} gagal.`
  );
  if (options.partial) {
    lines.push('Instalasi dibatalkan di tengah; klien yang sudah disetujui tetap terpasang.');
  }
  return lines.join('\n');
}

/** Baris laporan untuk klien yang tidak ditemukan di mesin. */
function absentRow(record, reason) {
  return {
    clientId: record.id,
    displayName: record.displayName,
    result: 'dilewati',
    reason,
    changed: false,
  };
}

module.exports = { renderReport, absentRow, RESULT_LABEL };