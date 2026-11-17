import { STORAGE_KEYS } from './config.js';
import { Logger } from './logger.js';

// ============================================================
// LoggerUI — turunan Logger dengan rendering ke DOM
// ============================================================
export class LoggerUI extends Logger {
  // TIDAK mendefinisikan constructor:
  // parent (Logger) sudah handle parse localStorage,
  // init logs, _dirty, _flushTimer, dan _trimIfNeeded.

  init() {
    this.el = document.getElementById('activity-log');
    if (!this.el) {
      console.warn('[Logger] Elemen #activity-log tidak ditemukan');
    }
  }

  log(level, message, details = null) {
    // Simpan dulu lewat fungsi induk
    super.log(level, message, details);
    // Lalu tampilkan ke layar
    this._renderUI(level, message, details);
  }

  _renderUI(level, message, detail) {
    if (!this.el) return;

    const waktu = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const baris = document.createElement('div');
    baris.className = `log-entry ${level}`;

    if (detail) {
      const idUnik = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      baris.innerHTML = `
        <div class="log-toggle" onclick="loggerInst.toggleDetail('${idUnik}', this)">
          <i class="fa-solid fa-chevron-right"></i>
          <span><span class="log-time">${waktu}</span> ${this._escapeHtml(message)}</span>
        </div>
        <div id="${idUnik}" class="log-detail">
          <button class="btn-copy" onclick="event.stopPropagation(); loggerInst.salin(this)">
            <i class="fa-solid fa-copy"></i> Salin
          </button>
          ${this._escapeHtml(typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail))}
        </div>
      `;
    } else {
      baris.innerHTML = `<span class="log-time">${waktu}</span> ${this._escapeHtml(message)}`;
    }

    // Hapus placeholder "Siap memproses..." jika ada
    this.el.querySelector('.text-center')?.remove();

    // Baru di atas
    this.el.prepend(baris);
    this.el.scrollTop = 0;
  }

  toggleDetail(id, tombol) {
    const kotak = document.getElementById(id);
    const ikon = tombol.querySelector('i');
    kotak?.classList.toggle('show');
    ikon?.classList.toggle('fa-chevron-right');
    ikon?.classList.toggle('fa-chevron-down');
  }

  salin(tombol) {
    const teks = tombol.parentElement.textContent.trim().replace('Salin', '').trim();
    navigator.clipboard.writeText(teks).then(() => {
      tombol.classList.add('copied');
      tombol.innerHTML = `<i class="fa-solid fa-check"></i> Disalin`;
      setTimeout(() => {
        tombol.classList.remove('copied');
        tombol.innerHTML = `<i class="fa-solid fa-copy"></i> Salin`;
      }, 2000);
    });
  }

  _escapeHtml(teks) {
    return String(teks)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  clearLogs() {
    super.clearLogs();
    if (this.el) {
      this.el.innerHTML = `<div class="text-center text-gray-400 dark:text-gray-500 py-4">Siap memproses...</div>`;
    }
  }
}

// ============================================================
// Instance utama untuk seluruh aplikasi
// ============================================================
export const loggerInst = new LoggerUI();

// Alias agar kode lama tetap jalan
export const log = (tingkat, pesan, rincian = null) =>
  loggerInst.log(tingkat, pesan, rincian);

// Expose ke window untuk onclick inline di HTML
window.loggerInst = loggerInst;