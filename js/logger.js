import { STORAGE_KEYS } from './config.js';

export class Logger {
  MAX_ENTRIES = 150;   // batas jumlah log (bukan ukuran byte)

  constructor() {
    this.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]');
    this._trimIfNeeded();   // bersihkan kelebihan saat startup
  }

  log(level, message, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details: this._ringkas(details)   // jangan simpan objek besar
    };

    this.logs.push(entry);
    this._trimIfNeeded();               // jaga agar jumlah ≤ MAX_ENTRIES

    // Coba simpan, jika gagal → potong setengah, ulangi sampai berhasil atau log kosong
    this._safeSave();
  }

  // ------------------------------------------------------------------
  // Simpan dengan fallback agresif saat kuota penuh
  // ------------------------------------------------------------------
  _safeSave() {
    const key = STORAGE_KEYS.LOGS;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        localStorage.setItem(key, JSON.stringify(this.logs));
        return;   // sukses
      } catch (e) {
        // Hanya tangani error kuota penuh
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[Logger] Penyimpanan penuh, potong log lama...');
          // Potong setengah (minimal 1)
          const keep = Math.max(1, Math.floor(this.logs.length / 2));
          this.logs = this.logs.slice(-keep);
          attempts++;
        } else {
          // Error lain (misal localStorage dinonaktifkan) → lempar ulang
          throw e;
        }
      }
    }

    // Jika setelah 3 percobaan masih gagal → hapus semua log
    console.error('[Logger] Gagal menyimpan log, menghapus seluruh riwayat.');
    this.logs = [];
    try {
      localStorage.removeItem(key);
    } catch (e) { /* abaikan */ }
  }

  // ------------------------------------------------------------------
  // Pangkas kelebihan dari awal array
  // ------------------------------------------------------------------
  _trimIfNeeded() {
    if (this.logs.length > this.MAX_ENTRIES) {
      this.logs = this.logs.slice(-this.MAX_ENTRIES);
    }
  }

  // ------------------------------------------------------------------
  // Ringkas detail agar tidak terlalu besar
  // ------------------------------------------------------------------
  _ringkas(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) return `[${data.length} item]`;
    const ringkas = {};
    Object.keys(data).slice(0, 3).forEach(k => ringkas[k] = data[k]);
    return ringkas;
  }

  getLogs() { return this.logs; }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem(STORAGE_KEYS.LOGS);
  }

  export(format = 'json') {
    if (format === 'json') return JSON.stringify(this.logs, null, 2);
    if (format === 'csv') {
      const header = 'timestamp,level,message,details\n';
      return header + this.logs.map(l =>
        `${l.timestamp},${l.level},${l.message},"${JSON.stringify(l.details)}"`
      ).join('\n');
    }
    return this.logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n');
  }
}