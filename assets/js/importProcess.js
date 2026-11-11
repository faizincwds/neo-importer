import { IMPORT_DEFAULTS, DEBUG_API } from './config.js';
import { Logger } from './logger.js';

export class ImportProcess {
  constructor(api, rows, method, settings = {}) {
    this.api = api;
    this.rows = rows;
    this.method = method;
    this.settings = { ...IMPORT_DEFAULTS, ...settings };
    this.logger = new Logger();
    this.isRunning = false;
    this.isPaused = false;
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.totalSuccess = 0;
    this.totalFailed = 0;
    this.totalSkipped = 0;
    this.startTime = null;
    this.realtimeLogs = [];
  }

  async start(progressCallback) {
    this.isRunning = true;
    this.startTime = Date.now();
    this.realtimeLogs = [];
    const batches = this.chunkArray(this.rows, this.settings.batchSize);
    this.totalBatches = batches.length;

    // Jika tidak ada data yang diproses
    if (batches.length === 0 || batches.every(b => b.length === 0)) {
      this.realtimeLogs.push({
        timestamp: new Date().toISOString(),
        type: 'skipped',
        message: 'Tidak ada data yang perlu diupdate (semua komponen mungkin belum ada atau bobot 0).'
      });
      this.notifyProgress(progressCallback);
      this.isRunning = false;
      return { success: 0, failed: 0, skipped: 1 };
    }

    for (let i = 0; i < batches.length; i++) {
      if (!this.isRunning) break;
      while (this.isPaused) await this.delay(100);
      this.currentBatch = i + 1;
      const batch = batches[i];
      await this.processBatch(batch, progressCallback);
    }
    this.isRunning = false;
    this.logger.log('info', 'Import selesai', { success: this.totalSuccess, failed: this.totalFailed });
    this.notifyProgress(progressCallback, true);   // ← flush final
    return { success: this.totalSuccess, failed: this.totalFailed, skipped: this.totalSkipped };

  }

  /**
   * Proses satu baris — logika SAMA seperti versi lama,
   * hanya dipisah ke helper agar bisa dipanggil paralel.
   */
  async _processOneRow(row, progressCallback) {
    if (!this.isRunning) return;

    if (DEBUG_API) console.log('Processing row:', row);

    // ---------- Skip invalid ----------
    const hasErrs = row.__errors && Object.keys(row.__errors).length > 0;
    if (this.settings.skipInvalid && (hasErrs || row.status === 'error')) {
      this.totalSkipped++;
      this.realtimeLogs.push({
        timestamp: new Date().toISOString(),
        type: 'skipped',
        message: 'Data tidak valid',
        row: this.extractRowSummary(row)
      });
      this.notifyProgress(progressCallback);
      return;
    }

    // ---------- Row ditandai skipped oleh caller ----------
    if (row && row.skipped) {
      this.totalSuccess++;
      this.realtimeLogs.push({
        timestamp: new Date().toISOString(),
        type: 'success',
        message: row.message || 'Data dilewati',
        row: this.extractRowSummary(row)
      });
      this.notifyProgress(progressCallback);
      return;
    }

    // ---------- Tentukan method & argumen ----------
    let success = false;
    let errorMsg = '';

    const apiMethodName = this.method.charAt(0).toLowerCase() + this.method.slice(1);
    let apiMethod = this.api[apiMethodName];
    let arg = row;

    if (row && (row.type === 'update' || row.type === 'existing')) {
      arg = { key: row.key, record: row.record };
      apiMethod = this.api['updateKomponenEvaluasiKelas'];
    } else if (row && row.type === 'insert') {
      arg = row.payload || row;
    } else if (row && row._action === 'nilai_akhir') {
      arg = { key: row.key, record: row.record };
      apiMethod = this.api['updateNilaiPerkuliahanKelas'];
    } else if (row && row._action === 'nilai_komponen') {
      arg = { key: row.key, record: row.record };
      apiMethod = this.api['updateNilaiPerkuliahanKelasKomponenEvaluasi'];
    }

    // ---------- Eksekusi ----------
    try {
      if (typeof apiMethod !== 'function') {
        throw new Error(`Method ${this.method} tidak tersedia`);
      }
      const apiResult = await apiMethod.call(this.api, arg);

      // API mengembalikan { skipped: true } → dianggap sukses
      if (apiResult && apiResult.skipped) {
        this.totalSuccess++;
        this.realtimeLogs.push({
          timestamp: new Date().toISOString(),
          type: 'success',
          message: apiResult.message || 'Data dilewati',
          row: this.extractRowSummary(arg)
        });
        this.notifyProgress(progressCallback);
        return;
      }

      // ✅ Sukses
      this.totalSuccess++;
      success = true;
      console.log('Row succeeded, totalSuccess:', this.totalSuccess);

    } catch (err) {
      this.totalFailed++;
      errorMsg = err.message;

      // ---------- Retry ----------
      if (this.settings.retry > 0) {
        for (let r = 1; r <= this.settings.retry; r++) {
          try {
            await apiMethod.call(this.api, arg);   // ← pakai `arg`, BUKAN cleanRow
            this.totalSuccess++;
            this.totalFailed--;
            success = true;
            break;
          } catch (retryErr) {
            errorMsg = retryErr.message;
          }
        }
      }
    }

    // ---------- Catat log ----------
    this.realtimeLogs.push({
      timestamp: new Date().toISOString(),
      type: success ? 'success' : 'failed',
      message: success ? 'Berhasil' : errorMsg,
      row: this.extractRowSummary(row)
    });

    this.notifyProgress(progressCallback);
  }

  /**
   * Proses batch secara paralel menggunakan worker pool.
   * `concurrency` worker membaca baris dari `pointer` bersama.
   */
  async processBatch(batch, progressCallback) {
    const concurrency = Math.max(1, parseInt(this.settings.concurrency, 10) || 1);
    const delay = Math.max(0, parseInt(this.settings.delay, 10) || 0);

    let pointer = 0;

    const worker = async () => {
      while (this.isRunning) {
        if (this.isPaused) {
          await this.delay(100);
          continue;
        }
        const myIdx = pointer++;
        if (myIdx >= batch.length) break;

        try {
          await this._processOneRow(batch[myIdx], progressCallback);
        } catch (err) {
          // Jaring pengaman: kalau _processOneRow crash, jangan hentikan worker lain
          console.error('Worker error pada row', myIdx, err);
          this.totalFailed++;
          this.realtimeLogs.push({
            timestamp: new Date().toISOString(),
            type: 'failed',
            message: err.message || 'Terjadi kesalahan tak terduga',
            row: this.extractRowSummary(batch[myIdx])
          });
          this.notifyProgress(progressCallback);
        }

        if (delay > 0) await this.delay(delay);
      }
    };

    // Jalankan N worker secara bersamaan
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
  }

  notifyProgress(callback, force = false) {
    if (!callback) return;

    const now = Date.now();
    const newCount = this.realtimeLogs.length - (this._lastNotifiedIdx || 0);
    const elapsed = now - (this._lastNotifyTime || 0);

    const shouldNotify = force || !this._lastNotifyTime || newCount >= 20 || elapsed >= 300;
    if (!shouldNotify) return;

    const newLogs = this.realtimeLogs.slice(this._lastNotifiedIdx || 0);
    this._lastNotifiedIdx = this.realtimeLogs.length;
    this._lastNotifyTime = now;

    // Baris yang benar-benar sudah selesai (konsisten dengan 3 counter di bawah)
    const processedRows = this.totalSuccess + this.totalFailed + this.totalSkipped;
    const totalRows = this.rows.length;
    const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;

    callback({
      stats: {
        processedRows,
        totalRows,
        currentBatch: this.currentBatch,
        totalBatches: this.totalBatches,
        success: this.totalSuccess,
        failed: this.totalFailed,
        skipped: this.totalSkipped,
        elapsedMs,
        elapsedText: this.formatDuration(elapsedMs),
        eta: this.calculateETA(processedRows, totalRows),
      },
      logs: newLogs,     // ← HANYA log baru
      append: true,
    });
  }

  extractRowSummary(row) {
    // Jika payload membawa _display, gunakan itu
    if (row && row._display) {
    return {
      kode_mata_kuliah: row._display.kode_mata_kuliah || '',
      nama_mata_kuliah: row._display.nama_mata_kuliah || '',
      kelas: row._display.kelas || '',
      nim: row._display.nim || '',
      nama: row._display.nama || row._display.nama_mahasiswa || '',
      _display: row._display,
    };
  }
    return {
      kode_mata_kuliah: row.kode_mata_kuliah || row.id_matkul || '',
      nama: row.nama || row.nama_mahasiswa || row.nama_dosen || '',
      kelas: row.nama_kelas || '',
      nim: row.nim || '',
    };
    
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }
  cancel() { this.isRunning = false; }

  chunkArray(arr, size) {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );
  }

  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  calculateETA(processed, total) {
    if (!processed || processed <= 0) return '-';
    const elapsed = Date.now() - this.startTime;
    const avgMsPerRow = elapsed / processed;
    const remaining = Math.max(0, total - processed);
    const etaMs = avgMsPerRow * remaining;
    if (!isFinite(etaMs) || etaMs < 0) return '-';
    return new Date(Date.now() + etaMs).toLocaleTimeString();
  }

  formatDuration(ms) {
    if (!ms || ms < 0 || !isFinite(ms)) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
}