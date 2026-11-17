// ============================================================
// Validator — validasi baris sebelum import
// ============================================================

// Pola default — bisa di-override via options.patterns
const DEFAULT_PATTERNS = {
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    message: 'Format email tidak valid',
  },
  nik: {
    regex: /^\d{16}$/,
    message: 'NIK harus 16 digit angka',
  },
  nisn: {
    regex: /^\d{10}$/,
    message: 'NISN harus 10 digit angka',
  },
  npwp: {
    regex: /^\d{15}$|^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/,
    message: 'Format NPWP tidak valid (15 digit)',
  },
  handphone: {
    regex: /^[0-9+\-\s()]{8,20}$/,
    message: 'Format nomor HP tidak valid',
  },
  telepon: {
    regex: /^[0-9+\-\s()]{8,20}$/,
    message: 'Format telepon tidak valid',
  },
};

export class Validator {
  /**
   * @param {string[]} targetFields   - daftar field yang relevan (untuk iterasi format)
   * @param {string[]} requiredFields - field yang wajib diisi
   * @param {object}   options        - { patterns: {field: {regex, message}} }
   */
  constructor(targetFields, requiredFields, options = {}) {
    this.targetFields = targetFields || [];
    this.requiredFields = requiredFields || [];
    // Default ke DEFAULT_PATTERNS jika tidak di-override
    this.patterns = options.patterns !== undefined ? options.patterns : DEFAULT_PATTERNS;
  }

  validateRow(row, mapping) {
    const errors = {};

    // 1. Required check
    for (const field of this.requiredFields) {
      if (this._isEmpty(row[field])) {
        errors[field] = 'Wajib diisi';
      }
    }

    // 2. Format check — hanya untuk field yang punya pattern & belum error
    for (const [field, cfg] of Object.entries(this.patterns)) {
      if (!cfg || !cfg.regex) continue;
      if (errors[field]) continue;               // sudah error required
      if (!(field in row)) continue;             // field tidak ada di baris
      const val = row[field];
      if (this._isEmpty(val)) continue;          // kosong bukan urusan format

      const s = String(val).trim();
      if (!cfg.regex.test(s)) {
        errors[field] = cfg.message || 'Format tidak valid';
      }
    }

    return errors;
  }

  validateAll(rows, mapping) {
    return rows.map((row, idx) => ({
      index: idx,
      errors: this.validateRow(row, mapping),
    }));
  }

  /**
   * Validasi satu field saja (berguna untuk realtime feedback di grid editor).
   * @returns {string|null} pesan error atau null jika valid
   */
  validateCell(field, value) {
    if (this.requiredFields.includes(field) && this._isEmpty(value)) {
      return 'Wajib diisi';
    }
    const cfg = this.patterns[field];
    if (cfg && cfg.regex && !this._isEmpty(value)) {
      const s = String(value).trim();
      if (!cfg.regex.test(s)) return cfg.message || 'Format tidak valid';
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Helper: deteksi kosong yang benar (0, false TIDAK dianggap kosong)
  // ------------------------------------------------------------------
  _isEmpty(val) {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string' && val.trim() === '') return true;
    return false;
  }
}