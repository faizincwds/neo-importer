import { STORAGE_KEYS } from './config.js';

export class Logger {
  MAX_ENTRIES = 150;

  constructor() {
    this.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]');
    // ✅ Bersihkan sisa lama jika melebihi batas saat dimuat
    this._trimIfNeeded();
  }

  log(level, message, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      // details,
      // ✅ JANGAN simpan data besar! Hanya simpan ringkasan saja
      details: this._ringkas(details)
    };
    
    this.logs.push(entry);
    // ✅ Potong yang paling lama jika sudah melebihi batas
    this._trimIfNeeded();
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    } catch (e) {
      // ✅ Jika tetap gagal, hapus separuh terlama
      console.warn('[Logger] Penyimpanan penuh, hapus riwayat lama...');
      this.logs = this.logs.slice(-Math.floor(this.MAX_ENTRIES / 2));
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    }

    // localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    console.log(`[${level.toUpperCase()}] ${message}`, details);
  }

  _trimIfNeeded() {
    if (this.logs.length > this.MAX_ENTRIES) {
      // Sisakan yang paling baru saja
      this.logs = this.logs.slice(-this.MAX_ENTRIES);
    }
  }

  _ringkas(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) return `[${data.length} item]`;
    const ringkas = {};
    // Ambil maksimal 3 kunci saja agar tidak besar
    Object.keys(data).slice(0, 3).forEach(k => ringkas[k] = data[k]);
    return ringkas;
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem(STORAGE_KEYS.LOGS);
  }

  export(format = 'json') {
    if (format === 'json') return JSON.stringify(this.logs, null, 2);
    if (format === 'csv') {
      const header = 'timestamp,level,message,details\n';
      return header + this.logs.map(l => `${l.timestamp},${l.level},${l.message},"${JSON.stringify(l.details)}"`).join('\n');
    }
    return this.logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n');
  }
}