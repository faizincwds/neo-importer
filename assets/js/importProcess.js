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
    return { success: this.totalSuccess, failed: this.totalFailed, skipped: this.totalSkipped };
  }

  async processBatch(batch, progressCallback) {
    for (const row of batch) {
      if (!this.isRunning) break;

       console.log('Processing row:', row);

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

      // Tangani objek yang sengaja dilewati (misal riwayat sudah ada)
      if (row && row.skipped) {
        this.totalSuccess++; 
        this.realtimeLogs.push({
          timestamp: new Date().toISOString(),
          type: 'success',
          message: row.message || 'Data dilewati',
          row: this.extractRowSummary(row)
        });
        this.notifyProgress(progressCallback);
        continue;
      }

      let success = false;
      let errorMsg = '';
      
        const apiMethodName = this.method.charAt(0).toLowerCase() + this.method.slice(1);
        let apiMethod = this.api[apiMethodName];
        let arg = row;
        
        // Jika row memiliki properti 'type' dan 'payload', gunakan payload dan tentukan method
        if (row && (row.type === 'update' || row.type === 'existing')) {
          arg = { key: row.key, record: row.record };
          apiMethod = this.api['updateKomponenEvaluasiKelas']; // atau method spesifik
        } else if (row && row.type === 'insert') {
         arg = row.payload || row;
        } else if (row && row._action === 'nilai_akhir') {
          // Gunakan method updateNilaiPerkuliahanKelas
          arg = { key: row.key, record: row.record };
          apiMethod = this.api['updateNilaiPerkuliahanKelas'];
        } else if (row && row._action === 'nilai_komponen') {
          // Gunakan method updateNilaiPerkuliahanKelasKomponenEvaluasi
          arg = { key: row.key, record: row.record };
          apiMethod = this.api['updateNilaiPerkuliahanKelasKomponenEvaluasi'];
        }

      try {  
        if (typeof apiMethod !== 'function') throw new Error(`Method ${this.method} tidak tersedia`);
        const apiResult = await apiMethod.call(this.api, arg);

        // Periksa apakah hasilnya adalah objek yang sengaja dilewati
        if (apiResult && apiResult.skipped) {
          this.totalSuccess++;
          this.realtimeLogs.push({
            timestamp: new Date().toISOString(),
            type: 'success',
            message: apiResult.message || 'Data dilewati',
            row: this.extractRowSummary(arg) // gunakan arg asli untuk summary
          });
          this.notifyProgress(progressCallback);
          continue;
        }

        // ✅ Sukses
        this.totalSuccess++;
        success = true;
        console.log('Row succeeded, totalSuccess:', this.totalSuccess);

     } catch (err) {
        this.totalFailed++;
        errorMsg = err.message;
          if (this.settings.retry > 0) {
            for (let r = 1; r <= this.settings.retry; r++) {
              try {
                // Gunakan row asli yang sudah dibersihkan (bukan objek dengan _display)
                const cleanRow = { ...row };
                delete cleanRow._display;
                if (typeof apiMethod === 'function') {
                  await apiMethod.call(this.api, cleanRow);
                } else {
                  await this.api.callSafe(this.method, { record: cleanRow });
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
            kelas: row._display.kelas || '',
            _display: row._display
        };
    }
    // Data yang masuk bisa berupa payload API (id_matkul) atau grid data (kode_mata_kuliah)
    if (this.method === 'InsertKelasKuliah') {
      return {
        kode_mata_kuliah: row.kode_mata_kuliah || row.id_matkul || '',
        nama_mata_kuliah: row.nama_mata_kuliah || '',
        kelas: row.nama_kelas_kuliah || row.kelas || '',
        _display: row._display
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