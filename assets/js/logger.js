import { STORAGE_KEYS } from './config.js';

export class Logger {
  // Batas jumlah log per level
  MAX_ENTRIES = 150;         // default (jika _trimIfNeeded dipanggil tanpa argumen)
  API_MAX_ENTRIES = 500;     // log realtime (level 'api')
  AUDIT_MAX_ENTRIES = 1000;  // log audit (info/success/warning/error)

  // Debounce flush — hindari tulis localStorage setiap baris
  FLUSH_DELAY = 2000;

  constructor() {
    let parsed = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (raw) {
        const decoded = JSON.parse(raw);
        parsed = Array.isArray(decoded) ? decoded : [];
      }
    } catch (e) {
      console.warn('[Logger] Log rusak, reset ke kosong:', e.message);
      try { localStorage.removeItem(STORAGE_KEYS.LOGS); } catch (_) {}
    }
    this.logs = parsed;
    this._trimIfNeeded(this.AUDIT_MAX_ENTRIES);
    this._dirty = false;
    this._flushTimer = null;
  }

  // ------------------------------------------------------------------
  // Tambah log
  // ------------------------------------------------------------------
  log(level, message, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details: this._ringkas(details),
    };

    this.logs.push(entry);

    // Trim berdasarkan jenis log
    if (level === 'api') {
      this._trimIfNeeded(this.API_MAX_ENTRIES);
    } else {
      this._trimIfNeeded(this.AUDIT_MAX_ENTRIES);
    }

    this._dirty = true;

    // Debounce: flush 2 detik setelah log terakhir
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null;
        if (this._dirty) {
          this._dirty = false;
          this._safeSave();
        }
      }, this.FLUSH_DELAY);
    }
  }

  // ------------------------------------------------------------------
  // Paksa flush — panggil saat halaman akan ditutup
  // ------------------------------------------------------------------
  flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._dirty) {
      this._dirty = false;
      this._safeSave();
    }
  }

  // ------------------------------------------------------------------
  // Simpan dengan 4 tingkat fallback
  // ------------------------------------------------------------------
  _safeSave() {
    const key = STORAGE_KEYS.LOGS;

    // ── Level 1: coba simpan langsung
    try {
      localStorage.setItem(key, JSON.stringify(this.logs));
      return;
    } catch (e) {
      const isQuota = e.name === 'QuotaExceededError' || e.code === 22;
      if (!isQuota) {
        console.error('[Logger] Gagal simpan log (non-quota):', e);
        return;
      }
    }

    // ── Level 2: bersihkan cache API dulu (log audit tetap utuh)
    console.warn('[Logger] Quota penuh, membersihkan cache API...');
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('nf_cache_'))
        .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });

      localStorage.setItem(key, JSON.stringify(this.logs));
      console.info('[Logger] Berhasil setelah bersihkan cache.');
      return;
    } catch (e) {
      // cache tidak cukup, lanjut
    }

    // ── Level 3: potong log ke 10 entri terakhir
    console.warn('[Logger] Cache tidak cukup, memotong log ke 10 entri...');
    this.logs = this.logs.slice(-10);
    try {
      localStorage.setItem(key, JSON.stringify(this.logs));
      return;
    } catch (e) {
      // masih gagal, lanjut
    }

    // ── Level 4 (final): hapus semua
    console.error('[Logger] Gagal total, menghapus semua log.');
    this.logs = [];
    try { localStorage.removeItem(key); } catch (_) {}
  }

  // ------------------------------------------------------------------
  // Pangkas kelebihan dari awal array
  // ------------------------------------------------------------------
  _trimIfNeeded(limit = this.MAX_ENTRIES) {
    if (this.logs.length > limit) {
      this.logs = this.logs.slice(-limit);
    }
  }

  // ------------------------------------------------------------------
  // Ringkas detail — prioritaskan field penting
  // ------------------------------------------------------------------
  _ringkas(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) return `[${data.length} item]`;

    const PRIORITY = ['error_code', 'error_desc', 'method', 'status', 'message', 'nim', 'kode'];
    const ringkas = {};
    const MAX_KEYS = 5;

    for (const k of PRIORITY) {
      if (k in data) {
        ringkas[k] = data[k];
        if (Object.keys(ringkas).length >= MAX_KEYS) break;
      }
    }

    for (const k of Object.keys(data)) {
      if (k in ringkas) continue;
      if (Object.keys(ringkas).length >= MAX_KEYS) break;
      ringkas[k] = data[k];
    }

    return ringkas;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this._dirty = false;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    try { localStorage.removeItem(STORAGE_KEYS.LOGS); } catch (_) {}
  }

  export(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2);
    }
    if (format === 'csv') {
      const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const header = 'timestamp,level,message,details\n';
      return header + this.logs.map(l =>
        `${esc(l.timestamp)},${esc(l.level)},${esc(l.message)},${esc(JSON.stringify(l.details))}`
      ).join('\n');
    }
    return this.logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n');
  }
}