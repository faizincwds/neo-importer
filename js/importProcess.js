import { IMPORT_DEFAULTS } from './config.js';
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

    for (let i = 0; i < batches.length; i++) {
      if (!this.isRunning) break;
      while (this.isPaused) await this.delay(100);
      this.currentBatch = i + 1;
      const batch = batches[i];
      await this.processBatch(batch, progressCallback);
    }
    this.isRunning = false;
    this.logger.log('info', 'Import selesai', { success: this.totalSuccess, failed: this.totalFailed });
    return { success: this.totalSuccess, failed: this.totalFailed, skipped: this.totalSkipped };
  }

  async processBatch(batch, progressCallback) {
    for (const row of batch) {
      if (!this.isRunning) break;

      if (this.settings.skipInvalid && row.__errors && Object.keys(row.__errors).length > 0) {
        this.totalSkipped++;
        this.realtimeLogs.push({
          timestamp: new Date().toISOString(),
          type: 'skipped',
          message: 'Data tidak valid',
          row: this.extractRowSummary(row)
        });
        this.notifyProgress(progressCallback);
        continue;
      }

      let success = false;
      let errorMsg = '';
      try {
          const apiMethod = this.api[this.method.charAt(0).toLowerCase() + this.method.slice(1)];
          if (typeof apiMethod === 'function') {
            const arg = (typeof row === 'string' || row instanceof String) ? row : row;
            await apiMethod.call(this.api, arg);
            this.totalSuccess++;
            success = true;
          } else {
            // Jika tidak ada method spesifik, lemparkan error
            throw new Error(`Method ${this.method} tidak tersedia`);
          }
     } catch (err) {
        this.totalFailed++;
        errorMsg = err.message;
        if (this.settings.retry > 0) {
          for (let r = 1; r <= this.settings.retry; r++) {
            try {
              if (typeof apiMethod === 'function') {
                await apiMethod.call(this.api, row);
              } else {
                await this.api.callSafe(this.method, { record: row });
              }
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

      this.realtimeLogs.push({
        timestamp: new Date().toISOString(),
        type: success ? 'success' : 'failed',
        message: success ? 'Berhasil' : errorMsg,
        row: this.extractRowSummary(row)
      });

      this.notifyProgress(progressCallback);
      await this.delay(this.settings.delay);
    }
  }

  notifyProgress(callback) {
    if (callback) {
      callback({
        stats: {
          currentBatch: this.currentBatch,
          totalBatches: this.totalBatches,
          success: this.totalSuccess,
          failed: this.totalFailed,
          skipped: this.totalSkipped,
          eta: this.calculateETA(this.currentBatch - 1, this.totalBatches),
        },
        logs: [...this.realtimeLogs]
      });
    }
  }

  extractRowSummary(row) {
    // Jika payload membawa _display, gunakan itu
    if (row._display) {
        return {
            kode_mata_kuliah: row._display.kode_mata_kuliah || '',
            nama_mata_kuliah: row._display.nama_mata_kuliah || '',
            kelas: row._display.kelas || ''
        };
    }
    // Data yang masuk bisa berupa payload API (id_matkul) atau grid data (kode_mata_kuliah)
    if (this.method === 'InsertKelasKuliah') {
      return {
        kode_mata_kuliah: row.kode_mata_kuliah || row.id_matkul || '',
        nama_mata_kuliah: row.nama_mata_kuliah || '',
        kelas: row.nama_kelas_kuliah || row.kelas || '',
      };
    }
    return { ...row };
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

  calculateETA(currentIndex, total) {
    const elapsed = Date.now() - this.startTime;
    const avg = elapsed / (currentIndex + 1);
    const remaining = total - (currentIndex + 1);
    const etaMs = avg * remaining;
    return new Date(Date.now() + etaMs).toLocaleTimeString();
  }
}