import { CACHE_PREFIX, CACHE_TTL, STORAGE_KEYS, DEBUG_API } from './config.js';

// Interval cleanup = 1 jam
const CLEANUP_INTERVAL = 60 * 60 * 1000;

// Kunci meta untuk mencatat kapan terakhir cleanup dijalankan
const LAST_CLEANUP_KEY = 'nf_last_cleanup';

// Umur maksimal log aktivitas (3 hari)
const LOG_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

// TTL default kalau kunci cache tidak dikenal
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

/**
 * Ambil TTL untuk kunci cache tertentu.
 * Contoh: 'wilayah_3' → cari CACHE_TTL.wilayah
 */
function getCacheTtlByKey(cacheKey) {
  // Cek utuh dulu (mis. 'jenis_tinggal'), baru prefix (mis. 'wilayah_3')
  if (CACHE_TTL[cacheKey]) return CACHE_TTL[cacheKey];
  const base = cacheKey.split('_')[0];
  return CACHE_TTL[base] || CACHE_TTL[cacheKey] || DEFAULT_TTL;
}

/**
 * Hapus entri cache yang sudah melewati TTL.
 * @returns {number} jumlah entri yang dihapus
 */
export function cleanExpiredCache() {
  const now = Date.now();
  let removed = 0;

  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => {
      const cacheKey = k.slice(CACHE_PREFIX.length);
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const ttl = getCacheTtlByKey(cacheKey);

        if (!parsed.timestamp || (now - parsed.timestamp) > ttl) {
          localStorage.removeItem(k);
          removed++;
        }
      } catch (e) {
        // Data cache rusak → hapus
        localStorage.removeItem(k);
        removed++;
      }
    });

  if (DEBUG_API) console.log(`[Cleanup] Cache kedaluwarsa dihapus: ${removed} entri`);
  return removed;
}

/**
 * Hapus SEMUA cache (tanpa cek TTL).
 * Cocok dipanggil saat logout, agar tidak ada sisa data user sebelumnya.
 * @returns {number} jumlah entri yang dihapus
 */
export function clearAllCache() {
  let removed = 0;
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => {
      localStorage.removeItem(k);
      removed++;
    });
  if (DEBUG_API) console.log(`[Cleanup] Semua cache dihapus: ${removed} entri`);
  return removed;
}

/**
 * Hapus log aktivitas yang lebih tua dari LOG_MAX_AGE.
 * @returns {number} jumlah entri yang dihapus
 */
export function cleanOldLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (!raw) return 0;

    const logs = JSON.parse(raw);
    if (!Array.isArray(logs)) return 0;

    const cutoff = Date.now() - LOG_MAX_AGE;
    const filtered = logs.filter(l => {
      const t = Date.parse(l.timestamp);
      return !isNaN(t) && t >= cutoff;
    });

    if (filtered.length !== logs.length) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(filtered));
      if (DEBUG_API) {
        console.log(`[Cleanup] Log lama dihapus: ${logs.length - filtered.length} entri`);
      }
    }
    return logs.length - filtered.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Jalankan seluruh proses cleanup (cache + log).
 * Akan dilewati jika belum lewat 1 jam sejak cleanup terakhir,
 * kecuali `force = true`.
 */
export function runCleanup(force = false) {
  // Skip saat import berjalan
  if (window.__isImporting) {
    if (DEBUG_API) console.log('[Cleanup] Dilewati: import sedang berjalan');
    return;
  }
  const last = parseInt(localStorage.getItem(LAST_CLEANUP_KEY) || '0', 10);
  const now = Date.now();

  if (!force && (now - last) < CLEANUP_INTERVAL) {
    if (DEBUG_API) {
      const sisa = Math.round((CLEANUP_INTERVAL - (now - last)) / 60000);
      console.log(`[Cleanup] Dilewati, ${sisa} menit lagi`);
    }
    return;
  }

  const cacheRemoved = cleanExpiredCache();
  const logsRemoved = cleanOldLogs();

  localStorage.setItem(LAST_CLEANUP_KEY, String(now));
  if (DEBUG_API) {
    console.log(`[Cleanup] Selesai: ${cacheRemoved} cache + ${logsRemoved} log dihapus`);
  }
}

let intervalId = null;

/**
 * Mulai auto-cleanup:
 * - Jalankan sekali saat start (jika sudah >1 jam)
 * - Lalu setiap 1 jam
 */
export function startAutoCleanup() {
  runCleanup(false);

  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    runCleanup(false);
  }, CLEANUP_INTERVAL);
}

/**
 * Hentikan auto-cleanup (untuk testing / sebelum unload).
 */
export function stopAutoCleanup() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}