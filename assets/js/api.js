import { API_BASE, STORAGE_KEYS, DEBUG_API, CACHE_PREFIX, CACHE_TTL } from './config.js';
import { loggerInst } from './loggerView.js';
import { sanitizeText } from './utils.js';

export class NeoFeederAPI {
  constructor() {
    this.token = localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
    this._memCache = new Map();      // ← cache di memori (hindari JSON.parse berulang)
    this._pendingFetch = new Map();  // ← dedup fetch paralel untuk key yang sama
    this.persistCache = true;   // ← default: aktif untuk mode normal
  }

  _escSql(str) {
    return String(str ?? '').replace(/'/g, "''");
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  }

  async call(method, params = {}, options = {}) {
    const baseUrl = localStorage.getItem(STORAGE_KEYS.API_URL) || 'http://localhost:3003';
    const apiType = localStorage.getItem(STORAGE_KEYS.API_TYPE) || 'live2.php';
    const url = `${baseUrl}/ws/${apiType}`;   // <-- gunakan URL lengkap

    const payload = {
      act: method,
      token: this.token,
      ...params,
    };

    // ✅ Hanya log untuk operasi tulis, agar panel Aktivitas Terakhir tidak dibanjiri Get*
    const isWrite = /^(Insert|Update|Delete|Set)/.test(method);

    if (DEBUG_API) {
      console.log(`[Debug API WARN] Request ${method}`, { payload });
      console.log(`[Debug API] Request ${method}`, { ...params });
      console.log(`[API Request] ${method}`, { url, ...params});
    }

    if (isWrite) {
      loggerInst.log('api', `Mengirim permintaan: ${method}`, {
        url,
        method,
        params
      });
    }

    const controller = new AbortController();
    const timeout = options.timeout || 30000;   // ← default 30s, override-able
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Catat error HTTP
        loggerInst.log('error', `Gagal terhubung API: HTTP ${response.status}`, { status: response.status, respon: errorText });
        if (DEBUG_API) console.error(`[API ERROR] HTTP ${response.status}`, errorText);
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const text = await response.text();
      if (!text) {
        // Catat respon kosong
        loggerInst.log('warning', `Respon kosong dari server untuk ${method}`);
        if (DEBUG_API) console.error(`[API ERROR] Empty response for ${method}`);
        throw new Error('Server mengembalikan respons kosong');
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        // Catat kesalahan format JSON
        loggerInst.log('error', `Respon bukan JSON untuk ${method}`, { respon: text.substring(0, 200) });
        if (DEBUG_API) console.error(`[API ERROR] Respons bukan JSON: ${text.substring(0, 100)}`);
        throw new Error('Respons server bukan JSON yang valid');
      }

      if (json.error) {
        const msg = typeof json.error === 'string' ? json.error : json.error_description || 'Unknown error';
        // Catat error dari API Neo Feeder
        loggerInst.log('error', `API menolak permintaan: ${msg}`, json);
        throw new Error(msg);
      }

      if (DEBUG_API) {
        console.log('[API Response]', `Mendapat respons: ${method}`, { response: this.ringkasData(json) });
      }

      // ============================================================
      // ✅ Cek error_code di level API (Neo Feeder mengembalikan
      //    HTTP 200 tapi bisa mengandung error_code != 0)
      // ============================================================
      const hasApiError = json.error_code !== undefined && json.error_code !== 0;

      if (hasApiError) {
        if (isWrite) {
          let actionText = 'diimport';
          if (method.startsWith('Update')) actionText = 'diupdate';
          else if (method.startsWith('Delete')) actionText = 'dihapus';

          loggerInst.log(
            'warning',
            `[Gagal Import] Ket: ${json.error_desc || 'Tidak ada keterangan'}`,
            {
              method,
              error_code: json.error_code,
              error_desc: json.error_desc || 'Tidak ada keterangan'
            }
          );
        } else {
          loggerInst.log(
            'error',
            `[Gagal] Kesalahan pada ${method}: [${json.error_code}] ${json.error_desc || 'Tidak ada keterangan'}`,
            {
              method,
              error_code: json.error_code,
              error_desc: json.error_desc || 'Tidak ada keterangan'
            }
          );
        }
        // Jangan return — biarkan callSafe yang melempar error
        return json;
      }

      // ============================================================
      // ✅ Sukses: error_code = 0 atau tidak ada error_code
      // ============================================================
      if (isWrite) {
        let actionText = 'diimport';
        if (method.startsWith('Update')) actionText = 'diupdate';
        else if (method.startsWith('Delete')) actionText = 'dihapus';

        loggerInst.log(`success`, `[Success] Data berhasil ${actionText} (${method})`, {
          method,
          ringkasan: this.ringkasData(json)
        });
      }

      return json;

    } catch (error) {

      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        loggerInst.log('error', `Permintaan dibatalkan: Timeout ${Math.round(timeout / 1000)} detik untuk ${method}`);
        if (DEBUG_API) console.error(`[API] Timeout ${timeout}ms untuk ${method}`);
        throw new Error(`Timeout setelah ${Math.round(timeout / 1000)} detik untuk ${method}`);
      }

      // Deteksi error jaringan (server mati / port salah / API tidak aktif)
      const isNetworkError =
        error.name === 'TypeError' &&
        (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('fetch'));

      if (isNetworkError) {
        loggerInst.log('error', `API tidak aktif – tidak dapat terhubung ke ${url}`, { url });
        console.warn(`[API SERVER] Tidak dapat terhubung ke: ${url}`);
      }

      // Catat kesalahan umum
      loggerInst.log('error', `Kesalahan pada ${method}: ${error.message}`);
      if (DEBUG_API) console.error(`[API] ${method} failed:`, error.message);

      throw new Error(`Autentikasi Token Gagal. Pastikan API Neo Feeder aktif dan dapat diakses. Detail: ${error.message}`);

    }
  }

  // Fungsi bantu: ringkas data agar log tidak terlalu panjang
  ringkasData(data) {
    if (!data) return null;
    if (Array.isArray(data)) return `[${data.length} item]`;
    if (typeof data === 'object') {
      const ringkas = {};
      for (const k of Object.keys(data).slice(0, 5)) ringkas[k] = data[k];
      return ringkas;
    }
    return data;
  }


  /**
   * Panggil API lalu periksa error_code. Melempar error jika gagal.
   */
  async callSafe(method, params = {}) {
    const res = await this.call(method, params);
    // Neo Feeder biasanya mengembalikan error_code, 0 = sukses
    if (res.error_code === undefined) {
      loggerInst.log('warning', `Respon ${method} tidak memiliki error_code`, res);
      console.warn('Respons tidak memiliki error_code:', res);
      throw new Error('Respons tidak valid (tidak ada error_code)');
    }
    if (res.error_code !== 0) {
      if (DEBUG_API) console.log('[Debug API]', `Kesalahan API ${method}: [${res.error_code}] ${res.error_desc || 'Tidak ada keterangan'}`);
      throw new Error(`[${res.error_code}] ${res.error_desc || 'Unknown error'}`);
    }
    return res;
  }


  /**
   * Mengekstrak data dari respons API.
   */
  extractData(response) {
    if (!response) return null;
    if (response.data !== undefined) {
      if (typeof response.data === 'object' && !Array.isArray(response.data) && response.data.data !== undefined) {
        return response.data.data;
      }
      return response.data;
    }
    if (response.result !== undefined) return response.result;
    if (Array.isArray(response)) return response;
    return response;
  }

  // Auth
  async getToken(username, password) {
    const res = await this.call('GetToken', { username, password });

    if (!res) throw new Error('Respons kosong dari server');

    const data = this.extractData(res);
    if (data && data.token) {
      this.setToken(data.token);
      return data; // { token, ... }
    }
    // Kadang token langsung di root
    if (res.token) {
      this.setToken(res.token);
      return res;
    }
    throw new Error('Autentikasi Token Gagal. Pastikan username dan password benar, serta API Neo Feeder aktif.');
  }

  // ============ CACHE HELPER ============

  _getCache(key) {
    // Mem-first: hindari JSON.parse berulang untuk list besar
    if (this._memCache.has(key)) return this._memCache.get(key);
    if (!this.persistCache) return null;   // ← jangan baca disk saat import
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      this._memCache.set(key, parsed);
      return parsed;
    } catch (e) { return null; }
  }

  _setCache(key, data, count, opts = {}) {
    const entry = { data, count, timestamp: Date.now() };
    this._memCache.set(key, entry);                 // mem cache SELALU diisi

    if (!this.persistCache) return;
    if (opts.persist === false) return;             // ← opt-out eksplisit

    let raw;
    try {
      raw = JSON.stringify(entry);
    } catch (e) {
      if (DEBUG_API) console.warn(`[CACHE] ${key} tidak bisa diserialize`, e);
      return;
    }

    // Guard ukuran: >2 MB jangan coba persist (localStorage ~5 MB / origin)
    if (raw.length > 2 * 1024 * 1024) {
      if (DEBUG_API)
        console.log(`[CACHE] ${key} terlalu besar (${(raw.length / 1024 / 1024).toFixed(2)} MB), memory-only`);
      return;
    }

    try {
      localStorage.setItem(`${CACHE_PREFIX}${key}`, raw);
    } catch (e) {
        if (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) {
          if (DEBUG_API) console.warn(`[CACHE] quota penuh saat simpan ${key} → bersihkan cache terlama`);

          // Hapus cache TERLAMA dulu (bukan semua)
          const candidates = Object.keys(localStorage)
            .filter(k => k.startsWith(CACHE_PREFIX) && k !== `${CACHE_PREFIX}${key}`)
            .map(k => {
              try {
                const p = JSON.parse(localStorage.getItem(k));
                return { key: k, ts: p.timestamp || 0 };
              } catch { return { key: k, ts: 0 }; }
            })
            .sort((a, b) => a.ts - b.ts);

          for (const c of candidates) {
            localStorage.removeItem(c.key);
            try {
              localStorage.setItem(`${CACHE_PREFIX}${key}`, raw);
              if (DEBUG_API) console.log(`[CACHE] ${key} disimpan setelah hapus ${candidates.length - candidates.indexOf(c)} cache lama`);
              return;
            } catch { /* coba berikutnya */ }
          }
        } else {
          console.warn('Cache save failed, skip', e);
        }
      }
  }

  invalidateCache(key) {
    this._memCache.delete(key);
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  }

  invalidateAllCache() {
    this._memCache.clear();
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }

  /**
   * Ambil data dengan cache + TTL + count-check.
   */
  async _cachedFetch(key, fetchFn, ttl, countFn = null, opts = {}) {
    const cached = this._getCache(key);
    const now = Date.now();

    if (cached) {
      const age = now - cached.timestamp;
      if (age < ttl) {
        // Cek countFn HANYA saat mendekati kedaluwarsa (80% TTL).
        // Tidak setiap hit. Ini memangkas 3-4 request per baris.
        if (countFn && age > ttl * 0.8) {
          try {
            const currentCount = await countFn();
            if (currentCount !== null && currentCount === cached.count) {
              if (DEBUG_API) console.log(`[CACHE HIT] ${key} (${currentCount} item)`);
              return cached.data;
            }
            if (DEBUG_API) console.log(`[CACHE STALE] ${key} count berubah`);
          } catch (e) {
            return cached.data;
          }
        } else {
          if (DEBUG_API) console.log(`[CACHE HIT] ${key}`);
          return cached.data;
        }
      }
    }

    // Dedup: 5 worker yang minta data yang sama saat cache kosong → 1 fetch saja
    if (this._pendingFetch.has(key)) return this._pendingFetch.get(key);

    if (DEBUG_API) console.log(`[CACHE MISS] ${key}, fetch baru`);
      const promise = (async () => {
      const data = await fetchFn();
      let count = null;
      if (countFn) { try { count = await countFn(); } catch (e) {} }
      this._setCache(key, data, count, opts);        // ← teruskan opts
      return data;
    })();

    this._pendingFetch.set(key, promise);
    try {
      return await promise;
    } finally {
      this._pendingFetch.delete(key);
    }
  }

  // Helper count – panggil GetCount* dan kembalikan angka
  async _count(method) {
    try {
      const res = await this.call(method, { limit: 1 });

      // 🔎 Debug: lihat struktur respons mentah
      if (DEBUG_API) console.log(`[COUNT] ${method} raw:`, res);

      // Coba semua kemungkinan lokasi angka jumlah
      const candidates = [
        res?.jumlah,
        res?.jumlah_data,
        res?.count,
        res?.total,
        res?.data?.jumlah,
        res?.data?.jumlah_data,
        res?.data?.count,
        res?.data?.total,
        res?.data,
        typeof res?.data === 'number' ? res.data : undefined,
        Array.isArray(res?.data) ? res.data.length : undefined,
      ];

      for (const c of candidates) {
        if (c !== undefined && c !== null && c !== '') {
          const n = parseInt(c, 10);
          if (!isNaN(n)) return n;
        }
      }

      // Fallback ekstraksi umum
      const d = this.extractData(res);
      if (typeof d === 'number') return d;
      if (Array.isArray(d)) return d.length;

      if (DEBUG_API) console.warn(`[COUNT] ${method} – tidak dapat mengekstrak jumlah dari:`, res);
      return 0;
    } catch (e) {
      if (DEBUG_API) console.warn(`[COUNT] ${method} – error:`, e);
      return null;
    }
  }



  async getDictionary(fungsi = null) {
    const params = {};
    if (fungsi) params.fungsi = fungsi;
    const res = await this.call('GetDictionary', params);
    return this.extractData(res);
  }

// REFERENCE
  async getProfilPT() {
    const res = await this.call('GetProfilPT');
    return this.extractData(res);
  }

  // ✅ Cache: prodi
  async getProdi(force = false) {
    if (force) this.invalidateCache('prodi');
    return this._cachedFetch(
      'prodi',
      async () => this.extractData(await this.call('GetProdi')),
      CACHE_TTL.prodi,
      () => this._count('GetCountProdi')
    );
  }

  async getPeriode() {
    const res = await this.call('GetPeriode');
    return this.extractData(res);
  }

  // ✅ Cache: semester
  async getSemester(force = false) {
    if (force) this.invalidateCache('semester');
    return this._cachedFetch(
      'semester',
      async () => this.extractData(await this.call('GetSemester')),
      CACHE_TTL.semester
    );
  }

  async getDetailMataKuliah(kode_mk) {
    const res = await this.call('GetDetailMataKuliah', {
      filter: `kode_mata_kuliah = '${kode_mk}'`,   // ← pakai _escSql
      limit: 1
    });
    const data = this.extractData(res);
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data && !Array.isArray(data)) return data;
    return null;
  }

  async getDetailKurikulum(kode_kurikulum) {
    const res = await this.call('GetDetailKurikulum', {
      filter: `kode_kurikulum = '${kode_kurikulum}'`,
      limit: 1
    });
    const data = this.extractData(res);
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data && !Array.isArray(data)) return data;
    return null;
  }

  async getDetailKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_semester) conditions.push(`id_semester = '${sanitizeText(filter.id_semester)}'`);
    if (filter.kode_mata_kuliah) conditions.push(`kode_mata_kuliah = '${filter.kode_mata_kuliah}'`);
    if (filter.nama_kelas_kuliah) conditions.push(`nama_kelas_kuliah = '${filter.nama_kelas_kuliah}'`);
    const filterStr = conditions.length ? conditions.join(' and ') : '';
    const res = await this.call('GetDetailKelasKuliah', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  // ✅ Cache: dosen
  async getListDosen(force = false) {
    if (force) this.invalidateCache('dosen');
    return this._cachedFetch(
      'dosen',
      async () => this.extractData(await this.call('GetListDosen')),
      CACHE_TTL.dosen,
      () => this._count('GetCountDosen')
    );
  }

  // ✅ Cache: matakuliah
  async getListMataKuliah(force = false) {
    if (force) this.invalidateCache('matakuliah');
    return this._cachedFetch(
      'matakuliah',
      async () => this.extractData(await this.call('GetListMataKuliah')),
      CACHE_TTL.matakuliah,
      () => this._count('GetCountMataKuliah')
    );
  }

  // ✅ Cache: mahasiswa
  async getListMahasiswa(force = false) {
    if (force) this.invalidateCache('mahasiswa');
    return this._cachedFetch(
      'mahasiswa',
      async () => this.extractData(await this.call('GetListMahasiswa')),
      CACHE_TTL.mahasiswa,
      () => this._count('GetCountMahasiswa')
    );
  }

  // ✅ Cache: Mahasiswa Lulus/DO
 async getDetailMahasiswaLulusDO(force = false) {
  if (force) this.invalidateCache('mahasiswalulusdo');
  return this._cachedFetch(
    'mahasiswalulusdo',
    async () => {
      const res = await this.call('GetDetailMahasiswaLulusDO');
      if (res?.error_code && res.error_code !== 0) {
        throw new Error(`[${res.error_code}] ${res.error_desc || 'GetDetailMahasiswaLulusDO gagal'}`);
      }
      return this.extractData(res) || [];
    },
    CACHE_TTL.mahasiswalulusdo || 5 * 60 * 1000,
    () => this._count('GetCountMahasiswaLulusDO')
  );
}

  /**
   * Ambil daftar mahasiswa lulus/DO difilter per jenis keluar.
   * Reuse cache GetListMahasiswaLulusDO → 1 request untuk semua jenis.
   *
   * @param {'lulus'|'do'|'mundur'|'mengundurkan'|'putus'|'mutasi'|'meninggal'|'nongelar'|'Semua'} jenis
   * @param {boolean} force
   * @returns {Promise<Array<{
   *   nim, nama_mahasiswa, nama_program_studi,
   *   id_jenis_keluar, no_seri_ijazah, sk_yudisium,
   *   tgl_sk_yudisium, id_periode_keluar, ...
   * }>>}
   */
  async getMahasiswaLulusDO(jenis = 'Semua', force = false) {
    const target = String(jenis).toLowerCase();
    const key = `mhs_lulusdo_${target}`;
    if (force) this.invalidateCache(key);

    return this._cachedFetch(key, async () => {
      // Reuse cache method lama → hanya 1 network call untuk 7 jenis
      const all = await this.getDetailMahasiswaLulusDO(force);
      const arr = Array.isArray(all) ? all : (all?.data || []);

      if (target === 'semua') return arr;

      // Mapping sama dengan getCountMahasiswaLulusDO, biar konsisten
      const MAP = {
        'nongelar':    '0',
        'lulus':       '1',
        'mutasi':      '2',
        'do':          '3',
        'mengundurkan':'4',
        'mundur':      '4',
        'putus':       '5',
        'meninggal':   '6',
      };
      const idJenis = MAP[target];
      if (!idJenis) return [];

      return arr.filter(m =>
        String(m.id_jenis_keluar ?? '').trim() === idJenis
      );
    }, 5 * 60 * 1000);
  }

/**
 * Ambil daftar status mahasiswa resmi (A, N, C, G, M, U) dari Neo Feeder.
 * @returns {Promise<Array<{id_status_mahasiswa, nama_status_mahasiswa}>>}
 */
async getStatusMahasiswa(force = false) {
  const key = 'status_mahasiswa_ref';
  if (force) this.invalidateCache(key);
  return this._cachedFetch(
    key,
    async () => {
      const res = await this.call('GetStatusMahasiswa');
      const arr = this.extractData(res) || [];
      // Trim trailing spaces pada nama
      return arr.map(s => ({
        id_status_mahasiswa: s.id_status_mahasiswa,
        nama_status_mahasiswa: (s.nama_status_mahasiswa || '').trim(),
      }));
    },
    60 * 60 * 1000   // TTL 1 jam (data referensi statis)
  );
}


/**
 * Hitung mahasiswa berstatus Lulus atau DO.
 * Menggunakan endpoint terpisah karena tidak termasuk GetStatusMahasiswa.
 * @param {'Lulus'|'DO'|'Semua'} jenis
 * @returns {Promise<number>}
 */
  async getCountMahasiswaLulusDO(jenis = 'Semua', force = false) {
    const key = `count_mhs_lulusdo_${String(jenis).toLowerCase()}`;
    if (force) this.invalidateCache(key);

    return this._cachedFetch(
      key,
      async () => {
        const target = String(jenis).toLowerCase();

        // Map lengkap 7 jenis keluar (dari GetListMahasiswalulusDO)
        const MAP = {
          'nongelar':    '0',   // Selesai Pendidikan Non Gelar
          'lulus':       '1',   // Lulus
          'mutasi':      '2',   // Mutasi
          'do':          '3',   // Dikeluarkan
          'mengundurkan':'4',   // Mengajukan pengunduran diri
          'mundur':      '4',   // alias
          'putus':       '5',   // Putus Studi
          'meninggal':   '6',   // Meninggal dunia
        };

        if (target === 'semua') {
          try {
            const res = await this.call('GetCountMahasiswaLulusDO', {});
            if (res?.error_code === 0) {
              const n = parseInt(res.data ?? res.jumlah, 10);
              if (!isNaN(n)) return n;
            }
          } catch (e) {}
          return null;
        }

        const idJenis = MAP[target];
        if (!idJenis) return null;

        try {
          const res = await this.call('GetCountMahasiswaLulusDO', {
            filter: `id_jenis_keluar='${idJenis}'`
          });
          if (res?.error_code === 0) {
            const n = parseInt(res.data ?? res.jumlah, 10);
            if (!isNaN(n)) return n;
          }
        } catch (e) {
          if (DEBUG_API) console.warn(`[Lulus/DO] ${jenis} gagal:`, e.message);
        }

        return null;
      },
      5 * 60 * 1000
    );
  }

  /**
   * Ambil semester aktif (a_periode_aktif='1').
   */
  async getSemesterAktif(force = false) {
    const key = 'semester_aktif';
    if (force) this.invalidateCache(key);
    return this._cachedFetch(key, async () => {
      const res = await this.call('GetSemester', {
        filter: "a_periode_aktif='1'",
        limit: 1
      });
      const list = this.extractData(res) || [];
      const arr = Array.isArray(list) ? list : (list?.data || []);
      return arr[0] || null;
    }, 30 * 60 * 1000);
  }

  /**
 * Cari semester sebelumnya (id_semester < idSemesterAktif, terbesar).
 * Contoh: jika aktif = '20261', return semester '20252'.
 */
async getSemesterSebelumnya(idSemesterAktif, force = false) {
  if (!idSemesterAktif) return null;
  const key = `semester_sebelumnya_${idSemesterAktif}`;
  if (force) this.invalidateCache(key);

  return this._cachedFetch(key, async () => {
    const res = await this.call('GetSemester', {});
    const list = this.extractData(res) || [];
    const arr = Array.isArray(list) ? list : (list?.data || []);

    // Helper: cek apakah semester adalah "Pendek/Antara" (skip)
    const isPendek = (s) => {
      const id = String(s.id_semester || '');
      const nama = String(s.nama_semester || '').toLowerCase();
      // Digit terakhir '3' = pendek, atau nama mengandung "pendek"/"antara"
      return id.endsWith('3') || nama.includes('pendek') || nama.includes('antara');
    };

    // Filter: id < aktif, BUKAN pendek, lalu urutkan descending
    const sorted = arr
      .filter(s =>
        s.id_semester &&
        String(s.id_semester) < String(idSemesterAktif) &&
        !isPendek(s)                                    // ← skip pendek
      )
      .sort((a, b) => String(b.id_semester).localeCompare(String(a.id_semester)));

    if (DEBUG_API) {
      console.log(`[Semester] Aktif: ${idSemesterAktif}, sebelumnya (non-pendek):`,
        sorted.slice(0, 3).map(s => `${s.id_semester} (${s.nama_semester})`));
    }

    return sorted[0] || null;
  }, 30 * 60 * 1000);

}

  /**
   * Ambil daftar semester sebelum `idSemesterAktif`, urut dari yang paling dekat.
   * TERMASUK semester pendek/antara (akan ditandai `isPendek: true`).
   * @param {string} idSemesterAktif - mis. '20261'
   * @param {number} maxCount - berapa kandidat (default 6, termasuk pendek)
   * @returns {Promise<Array<{id_semester, nama_semester, isPendek}>>}
   */
  async getSemesterListBefore(idSemesterAktif, maxCount = 3, force = false) {
    if (!idSemesterAktif) return [];
    const key = `semester_list_before_all_${idSemesterAktif}_${maxCount}`;
    if (force) this.invalidateCache(key);

    return this._cachedFetch(key, async () => {
      const res = await this.call('GetSemester', {});
      const list = this.extractData(res) || [];
      const arr = Array.isArray(list) ? list : (list?.data || []);

      const isPendek = (s) => {
        const id = String(s.id_semester || '');
        const nama = String(s.nama_semester || '').toLowerCase();
        return id.endsWith('3') || nama.includes('pendek') || nama.includes('antara');
      };

      // Tidak ada filter pendek — semua semester sebelum aktif jadi kandidat
      return arr
        .filter(s => s.id_semester && String(s.id_semester) < String(idSemesterAktif))
        .sort((a, b) => String(b.id_semester).localeCompare(String(a.id_semester)))
        .slice(0, maxCount)
        .map(s => ({
          id_semester: s.id_semester,
          nama_semester: s.nama_semester,
          isPendek: isPendek(s),
        }));
    }, 30 * 60 * 1000);
  }

  /**
   * Ambil Set id_mahasiswa dari GetAktivitasKuliahMahasiswa per semester.
   * Untuk intersection presisi (bukan sekadar total).
   */
  async getMahasiswaIdsBySemester(idSemester, force = false) {
    const key = `mhs_ids_${idSemester}`;
    if (force) this.invalidateCache(key);

    return this._cachedFetch(key, async () => {
      const list = await this.getAktivitasKuliahMahasiswa({ id_semester: idSemester });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const ids = new Set();
      for (const m of arr) {
        const id = m.id_mahasiswa || m.id_registrasi_mahasiswa;
        if (id) ids.add(id);
      }
      return [...ids];   // array (bisa di-serialize)
    }, 5 * 60 * 1000);
  }

  /**
   * Ambil data lengkap aktivitas kuliah mahasiswa (untuk daftar/modal).
   * @param {string} idSemester
   */
  async getAktivitasKuliahDetail(idSemester, force = false) {
    if (!idSemester) return [];
    const key = `mhs_aktivitas_detail_${idSemester}`;
    if (force) this.invalidateCache(key);
    return this._cachedFetch(key, async () => {
      const list = await this.getAktivitasKuliahMahasiswa({ id_semester: idSemester });
      return Array.isArray(list) ? list : (list?.data || []);
    }, 5 * 60 * 1000);
  }

  /**
   * Ambil aktivitas kuliah mahasiswa (per semester).
   * @param {object} filter - { id_semester, id_status_mahasiswa, id_registrasi_mahasiswa }
   */
  async getAktivitasKuliahMahasiswa(filter = {}, force = false) {
    const conditions = [];
    if (filter.id_semester) conditions.push(`id_semester='${filter.id_semester}'`);
    if (filter.id_status_mahasiswa) conditions.push(`id_status_mahasiswa='${filter.id_status_mahasiswa}'`);
    if (filter.id_registrasi_mahasiswa) conditions.push(`id_registrasi_mahasiswa='${filter.id_registrasi_mahasiswa}'`);
    const filterStr = conditions.join(' AND ');
    const params = { limit: 10000 };
    if (filterStr) params.filter = filterStr;

    const key = `aktivitas_kuliah_${filterStr || 'all'}`;
    if (force) this.invalidateCache(key);

    return this._cachedFetch(key, async () => {
      const res = await this.call('GetAktivitasKuliahMahasiswa', params);
      return this.extractData(res);
    }, 5 * 60 * 1000);
  }

  /**
   * Hitung distribusi mahasiswa per status (A/N/C/G/M/U)
   * dari GetAktivitasKuliahMahasiswa pada semester aktif.
   * @returns {Promise<Object>} { A: 149, N: 0, C: 0, G: 0, M: 0, U: 0 }
   */
  // async getStatusMahasiswaCounts(force = false) {
  //   const key = 'status_mhs_dist';
  //   if (force) this.invalidateCache(key);

  //   return this._cachedFetch(key, async () => {
  //     const semester = await this.getSemesterAktif();
  //     const idSem = semester?.id_semester;

  //     if (DEBUG_API) console.log('[Status] Semester aktif:', idSem);

  //     const filter = idSem ? { id_semester: idSem } : {};
  //     const list = await this.getAktivitasKuliahMahasiswa(filter);
  //     const arr = Array.isArray(list) ? list : (list?.data || []);

  //     // Dedupe by id_registrasi_mahasiswa — 1 mahasiswa = 1 hitungan
  //     const seen = new Map();
  //     for (const m of arr) {
  //       const regId = m.id_registrasi_mahasiswa || m.id_mahasiswa;
  //       if (!regId) continue;
  //       if (!seen.has(regId)) {
  //         seen.set(regId, String(m.id_status_mahasiswa ?? 'unknown').trim().toUpperCase());
  //       }
  //     }

  //     const dist = {};
  //     for (const status of seen.values()) {
  //       dist[status] = (dist[status] || 0) + 1;
  //     }

  //     if (DEBUG_API) console.log('[Status] Distribusi:', dist, `(total unik: ${seen.size})`);
  //     return dist;
  //   }, 5 * 60 * 1000);
  // }

  /**
 * Hitung distribusi mahasiswa per status (A/N/C/G/M/U)
 * dari GetAktivitasKuliahMahasiswa pada semester tertentu.
 * @param {string} idSemester - mis. '20261'. Jika null → pakai semester aktif.
 * @returns {Promise<Object>} { A: 21, N: 22, C: 0, G: 0, M: 0, U: 0 }
 */
async getStatusMahasiswaCounts(idSemester = null, force = false) {
  const semKey = idSemester || 'aktif';
  const key = `status_mhs_dist_${semKey}`;
  if (force) this.invalidateCache(key);

  return this._cachedFetch(key, async () => {
    let idSem = idSemester;
    if (!idSem) {
      const semester = await this.getSemesterAktif();
      idSem = semester?.id_semester;
    }
    if (!idSem) return {};

    if (DEBUG_API) console.log('[Status] Menghitung semester:', idSem);

    const list = await this.getAktivitasKuliahMahasiswa({ id_semester: idSem });
    const arr = Array.isArray(list) ? list : (list?.data || []);

    const seen = new Map();
    for (const m of arr) {
      const regId = m.id_registrasi_mahasiswa || m.id_mahasiswa;
      if (!regId) continue;
      if (!seen.has(regId)) {
        seen.set(regId, String(m.id_status_mahasiswa ?? 'unknown').trim().toUpperCase());
      }
    }
    const dist = {};
    for (const status of seen.values()) {
      dist[status] = (dist[status] || 0) + 1;
    }
    if (DEBUG_API) console.log(`[Status] Semester ${idSem}:`, dist, `(total unik: ${seen.size})`);
    return dist;
  }, 5 * 60 * 1000);
}

  async getListKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_semester) conditions.push(`id_semester = '${sanitizeText(filter.id_semester)}'`);
    if (filter.kode_mata_kuliah) conditions.push(`kode_mata_kuliah = '${filter.kode_mata_kuliah}'`);
    if (filter.nama_kelas_kuliah) conditions.push(`nama_kelas_kuliah = '${filter.nama_kelas_kuliah}'`);
    const filterStr = conditions.length ? conditions.join(' and ') : '';
    const res = await this.call('GetListKelasKuliah', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async getListPesertaKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_kelas_kuliah) conditions.push(`id_kelas_kuliah = '${sanitizeText(filter.id_kelas_kuliah)}'`);
    if (filter.nim) conditions.push(`nim = '${filter.nim}'`);
    const filterStr = conditions.length ? conditions.join(' and ') : '';
    const res = await this.call('GetListPesertaKelasKuliah', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async getListPenugasanDosen(filter = {}) {
    let filterStr = '';
    if (filter.nuptk) filterStr = `nuptk = '${filter.nuptk}'`;
    const res = await this.call('GetListPenugasanDosen', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async getListRiwayatPendidikanMahasiswa(filter = {}) {
    let filterStr = '';
    if (filter.nim) filterStr = `nim = '${filter.nim}'`;
    const res = await this.call('GetListRiwayatPendidikanMahasiswa', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async getAllRiwayatPendidikanMahasiswa(force = false) {
    const key = 'riwayat_all';
    if (force) this.invalidateCache(key);
    return this._cachedFetch(key, async () => {
      const res = await this.call('GetListRiwayatPendidikanMahasiswa', {
        limit: 100000,
      }, { timeout: 90000 });   // 90 detik
      
      if (res?.error_code && res.error_code !== 0) {
        throw new Error(`[${res.error_code}] ${res.error_desc || 'GetListRiwayatPendidikanMahasiswa gagal'}`);
      }

      return this.extractData(res) || [];
    }, 10 * 60 * 1000);
  }


// ============ RAW NILAI (untuk deteksi retake) ============

async getRiwayatNilaiMahasiswa(filter = {}, force = false) {
  const cond = [];
  if (filter.id_registrasi_mahasiswa)
    cond.push(`id_registrasi_mahasiswa='${sanitizeText(filter.id_registrasi_mahasiswa)}'`);
  const filterStr = cond.join(' AND ');
  const key = `riwayat_nilai_${filterStr || 'all'}`;
  if (force) this.invalidateCache(key);

  return this._cachedFetch(key, async () => {
    const res = await this.call('GetRiwayatNilaiMahasiswa', {
      filter: filterStr, limit: 100000,
    });
    if (res?.error_code && res.error_code !== 0) {
      throw new Error(`[${res.error_code}] ${res.error_desc || 'GetRiwayatNilaiMahasiswa gagal'}`);
    }
    return this.extractData(res) || [];
  }, 5 * 60 * 1000);
}

async getDetailNilaiPerkuliahanKelas(filter = {}, force = false) {
  const cond = [];
  if (filter.id_registrasi_mahasiswa)
    cond.push(`id_registrasi_mahasiswa='${sanitizeText(filter.id_registrasi_mahasiswa)}'`);
  if (filter.id_semester)
    cond.push(`id_semester='${sanitizeText(filter.id_semester)}'`);
  const filterStr = cond.join(' AND ');
  const key = `detail_nilai_kelas_${filterStr || 'all'}`;
  if (force) this.invalidateCache(key);

  return this._cachedFetch(key, async () => {
    const res = await this.call('GetDetailNilaiPerkuliahanKelas', {
      filter: filterStr, limit: 100000,
    });
    if (res?.error_code && res.error_code !== 0) {
      throw new Error(`[${res.error_code}] ${res.error_desc || 'GetDetailNilaiPerkuliahanKelas gagal'}`);
    }
    return this.extractData(res) || [];
  }, 5 * 60 * 1000);
}

async getNilaiTransferPendidikanMahasiswa(filter = {}, force = false) {
  const cond = [];
  if (filter.id_registrasi_mahasiswa)
    cond.push(`id_registrasi_mahasiswa='${sanitizeText(filter.id_registrasi_mahasiswa)}'`);
  const filterStr = cond.join(' AND ');
  const key = `nilai_transfer_${filterStr || 'all'}`;
  if (force) this.invalidateCache(key);

  return this._cachedFetch(key, async () => {
    const res = await this.call('GetNilaiTransferPendidikanMahasiswa', {
      filter: filterStr, limit: 100000,
    });
    if (res?.error_code && res.error_code !== 0) {
      throw new Error(`[${res.error_code}] ${res.error_desc || 'GetNilaiTransferPendidikanMahasiswa gagal'}`);
    }
    return this.extractData(res) || [];
  }, 5 * 60 * 1000);
}

async getListKonversiKampusMerdeka(filter = {}, force = false) {
  const cond = [];
  if (filter.id_konversi_aktivitas)
    cond.push(`id_konversi_aktivitas='${sanitizeText(filter.id_konversi_aktivitas)}'`);
  if (filter.id_matkul)
    cond.push(`id_matkul='${sanitizeText(filter.id_matkul)}'`);
  if (filter.id_aktivitas)
    cond.push(`id_aktivitas='${sanitizeText(filter.id_aktivitas)}'`);
  if (filter.id_anggota)
    cond.push(`id_anggota='${sanitizeText(filter.id_anggota)}'`);
  if (filter.nim)
    cond.push(`nim='${filter.nim}'`);
  if (filter.id_semester)
    cond.push(`id_semester='${sanitizeText(filter.id_semester)}'`);

  const filterStr = cond.join(' AND ');
  const key = `konversi_km_${filterStr || 'all'}`;
  if (force) this.invalidateCache(key);

  return this._cachedFetch(key, async () => {
    const params = { limit: 100000 };
    if (filterStr) params.filter = filterStr;
    const res = await this.call('GetListKonversiKampusMerdeka', params);
    if (res?.error_code && res.error_code !== 0) {
      throw new Error(`[${res.error_code}] ${res.error_desc || 'GetListKonversiKampusMerdeka gagal'}`);
    }
    return this.extractData(res) || [];
  }, 5 * 60 * 1000);
}

/**
 * Ambil SEMUA nilai raw untuk satu mahasiswa (lintas sumber).
 * Gabungkan: RiwayatNilai + DetailNilaiKelas + Transfer + Konversi.
 * Fallback terakhir: GetTranskripMahasiswa (deduped).
 *
 * @returns {Promise<{ records: Array, source: string, deduped: boolean }>}
 */
async getAllRawNilaiMahasiswa(regId, options = {}) {
  const { nim = '', force = false, includeKonversi = true } = options;
  const errors = [];

  // 1) Kelas & Transfer (pakai id_registrasi_mahasiswa — valid)
  const [kelas, transfer] = await Promise.allSettled([
    this.getDetailNilaiPerkuliahanKelas({ id_registrasi_mahasiswa: regId }, force),
    this.getNilaiTransferPendidikanMahasiswa({ id_registrasi_mahasiswa: regId }, force),
  ]);

  const all = [];
  if (kelas.status === 'fulfilled' && Array.isArray(kelas.value)) {
    kelas.value.forEach(r => all.push({ ...r, _source: 'kelas' }));
  } else if (kelas.status === 'rejected') {
    errors.push('DetailNilaiPerkuliahanKelas: ' + (kelas.reason?.message || '?'));
  }

  if (transfer.status === 'fulfilled' && Array.isArray(transfer.value)) {
    transfer.value.forEach(r => all.push({ ...r, _source: 'transfer' }));
  } else if (transfer.status === 'rejected') {
    errors.push('NilaiTransferPendidikanMahasiswa: ' + (transfer.reason?.message || '?'));
  }

  // 2) Konversi — filter pakai nim (BUKAN id_registrasi_mahasiswa)
  let konversiCount = 0;
  if (includeKonversi && nim) {
    try {
      const konversi = await this.getListKonversiKampusMerdeka({ nim }, force);
      if (Array.isArray(konversi) && konversi.length > 0) {
        konversi.forEach(r => all.push({
          ...r,
          id_registrasi_mahasiswa: regId,   // ← inject dari context
          _source: 'konversi',
        }));
        konversiCount = konversi.length;
      }
    } catch (e) {
      // Skip gracefully — konversi opsional, tidak gagalkan seluruh proses
      errors.push('ListKonversiKampusMerdeka: ' + (e.message || '?'));
      if (DEBUG_API) console.warn('[RawNilai] konversi gagal (skip):', e.message);
    }
  }

  if (all.length > 0) {
    if (DEBUG_API) {
      console.log(
        `[RawNilai] combined: ${all.length} record ` +
        `(kelas=${kelas.value?.length || 0}, ` +
        `transfer=${transfer.value?.length || 0}, ` +
        `konversi=${konversiCount})`
      );
    }
    return { records: all, source: 'Kelas + Transfer + Konversi', errors };
  }

  // Fallback: Riwayat (tetap tanpa GetTranskripMahasiswa)
  try {
    const recs = await this.getRiwayatNilaiMahasiswa({ id_registrasi_mahasiswa: regId }, force);
    if (Array.isArray(recs) && recs.length > 0) {
      return {
        records: recs.map(r => ({ ...r, _source: 'riwayat' })),
        source: 'GetRiwayatNilaiMahasiswa',
        errors,
      };
    }
  } catch (e) {
    errors.push('riwayat: ' + e.message);
  }

  throw new Error(
    'Tidak ada sumber raw nilai yang tersedia.\n' + errors.join('\n')
  );
}

  async getJenisEvaluasi() {
    const res = await this.call('GetJenisEvaluasi');
    return this.extractData(res);
  }

  async getListKomponenEvaluasiKelas(filter = {}) {
    let filterStr = '';
    if (filter.id_kelas_kuliah) filterStr = `id_kelas_kuliah = '${filter.id_kelas_kuliah}'`;
    const res = await this.call('GetListKomponenEvaluasiKelas', { filter: filterStr });
    return this.extractData(res);
  }

  async getListRencanaEvaluasi(filter = {}) {
    let filterStr = '';
    if (filter.kode_mata_kuliah) filterStr = `kode_mata_kuliah = '${filter.kode_mata_kuliah}'`;
    const res = await this.call('GetListRencanaEvaluasi', { filter: filterStr });
    return this.extractData(res);
  }

  async getListRencanaPembelajaran(filter = {}) {
    let filterStr = '';
    if (filter.kode_mata_kuliah) filterStr = `kode_mata_kuliah = '${filter.kode_mata_kuliah}'`;
    const res = await this.call('GetListRencanaPembelajaran', { filter: filterStr });
    return this.extractData(res);
  }

  async getDosenPengajarKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_semester) conditions.push(`id_semester = '${sanitizeText(filter.id_semester)}'`);
    if (filter.id_kelas_kuliah) conditions.push(`id_kelas_kuliah = '${sanitizeText(filter.id_kelas_kuliah)}'`);
    if (filter.nuptk) conditions.push(`nuptk = '${filter.nuptk}'`);
    const filterStr = conditions.length ? conditions.join(' and ') : '';
    const res = await this.call('GetDosenPengajarKelasKuliah', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async getWilayah() {
    const res = await this.call('GetWilayah');
    return this.extractData(res);
  }

  // ✅ Cache: referensi statis (jarang berubah)
  async getAgama() {
    return this._cachedFetch('agama',
      async () => this.extractData(await this.call('GetAgama')),
      CACHE_TTL.agama);
  }

  async getJenisTinggal() {
    return this._cachedFetch('jenis_tinggal',
      async () => this.extractData(await this.call('GetJenisTinggal')),
      CACHE_TTL.jenis_tinggal);
  }

  async getAlatTransportasi() {
    return this._cachedFetch('alat_transportasi',
      async () => this.extractData(await this.call('GetAlatTransportasi')),
      CACHE_TTL.alat_transportasi);
  }

  async GetLevelWilayah() { const res = await this.call('GetLevelWilayah'); return this.extractData(res); }

  async getJenjangPendidikan() {
    return this._cachedFetch('jenjang_pendidikan',
      async () => this.extractData(await this.call('GetJenjangPendidikan')),
      CACHE_TTL.jenjang_pendidikan);
  }

  async getPekerjaan() {
    return this._cachedFetch('pekerjaan',
      async () => this.extractData(await this.call('GetPekerjaan')),
      CACHE_TTL.pekerjaan);
  }

  async getPenghasilan() {
    return this._cachedFetch('penghasilan',
      async () => this.extractData(await this.call('GetPenghasilan')),
      CACHE_TTL.penghasilan);
  }

  async getKebutuhanKhusus() {
    return this._cachedFetch('kebutuhan_khusus',
      async () => this.extractData(await this.call('GetKebutuhanKhusus')),
      CACHE_TTL.kebutuhan_khusus);
  }

  async getPembiayaan() {
    return this._cachedFetch('pembiayaan',
      async () => this.extractData(await this.call('GetPembiayaan')),
      CACHE_TTL.pembiayaan);
  }

  async getKategoriKegiatan() {
    return this._cachedFetch('kategori_kegiatan',
      async () => this.extractData(await this.call('GetKategoriKegiatan')),
      CACHE_TTL.kategori_kegiatan);
  }

  async getJenisAktivitasMahasiswa() {
    return this._cachedFetch('jenis_aktivitas',
      async () => this.extractData(await this.call('GetJenisAktivitasMahasiswa')),
      CACHE_TTL.jenis_aktivitas);
  }

  async getWilayah(level = null) {
    const key = level ? `wilayah_${level}` : 'wilayah';
    return this._cachedFetch(
      key,
      async () => {
        let filterStr = '';
        if (level) filterStr = `id_level_wilayah = ${level}`;
        const res = await this.call('GetWilayah', { filter: filterStr });
        return this.extractData(res);
      },
      CACHE_TTL.wilayah
    );
  }

  // END REFERENCE


  // INSERT

  // Method baru: cari mahasiswa lewat GetBiodataMahasiswa dulu, lalu GetListMahasiswa
  async cariMahasiswaLengkap({ nik, email, nama, jenis_kelamin, tanggal_lahir }) {
    let biodataArr = null;
    if (nik) {
      const res = await this.call('GetBiodataMahasiswa', { filter: `nik = '${sanitizeText(nik)}'` });
      biodataArr = this.extractData(res);
    }
    if ((!biodataArr || (Array.isArray(biodataArr) && biodataArr.length === 0)) && email) {
      const res = await this.call('GetBiodataMahasiswa', { filter: `email = '${sanitizeText(email)}'` });
      biodataArr = this.extractData(res);
    }

    if (!biodataArr || (Array.isArray(biodataArr) && biodataArr.length === 0)) {
      return this.cariMahasiswa({ nama });
    }

    const biodata = Array.isArray(biodataArr) ? biodataArr[0] : biodataArr;
    if (!biodata) return null;

    const filterConditions = [];
    if (biodata.nama_mahasiswa) filterConditions.push(`nama_mahasiswa LIKE '%${biodata.nama_mahasiswa}%'`);
    if (biodata.jenis_kelamin) filterConditions.push(`jenis_kelamin = '${biodata.jenis_kelamin}'`);
    if (biodata.tanggal_lahir) filterConditions.push(`tanggal_lahir = '${biodata.tanggal_lahir}'`);

    // const filterConditions = [];
    // if (biodata.nama_mahasiswa) filterConditions.push(`nama_mahasiswa LIKE '%${biodata.nama_mahasiswa}%'`);
    // if (biodata.jenis_kelamin) filterConditions.push(`jenis_kelamin = '${biodata.jenis_kelamin}'`);
    // if (biodata.tanggal_lahir) {
    //   filterConditions.push(`tanggal_lahir = '${biodata.tanggal_lahir}'`);
    // }
    const filterStr = filterConditions.join(' AND ');
    const res = await this.call('GetListMahasiswa', { filter: filterStr, limit: 1 });
    const listData = this.extractData(res);
    const found = Array.isArray(listData) ? listData[0] : listData;
    return found || null;
  }

  async cekRiwayatMahasiswa(id_mahasiswa) {
    const res = await this.call('GetListRiwayatPendidikanMahasiswa', {
      filter: `id_mahasiswa = '${id_mahasiswa}'`,
      limit: 1
    });
    const data = this.extractData(res);
    return (Array.isArray(data) && data.length > 0) || (!Array.isArray(data) && data);
  }

  async cariMahasiswa(filter = {}) {
    const conditions = [];
    if (filter.nama) conditions.push(`nama_mahasiswa LIKE '%${filter.nama}%'`);
    if (filter.nik) conditions.push(`nik = '${sanitizeText(filter.nik)}'`);
    if (filter.email) conditions.push(`email = '${sanitizeText(filter.email)}'`);
    if (filter.id_mahasiswa) conditions.push(`id_mahasiswa = '${sanitizeText(filter.id_mahasiswa)}'`);
    const filterStr = conditions.length ? conditions.join(' AND ') : '';
    const res = await this.call('GetListMahasiswa', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async findMahasiswaByNIK(nik) {
    if (!nik) return null;
    const found = await this.cariMahasiswa({ nik });
    return (Array.isArray(found) ? found[0] : found)?.id_mahasiswa || null;
  }

  // Ambil anggota aktivitas berdasarkan NIM
  async getListAnggotaAktivitasMahasiswa(filter = {}) {
    let filterStr = '';
    if (filter.nim) filterStr = `nim = '${filter.nim}'`;
    const res = await this.call('GetListAnggotaAktivitasMahasiswa', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async insertMahasiswaLengkap(payload) {
    loggerInst.log('info', 'Memulai proses insert mahasiswa lengkap...', {
        nim: payload.riwayat?.nim,
        nama: payload.biodata?.nama_mahasiswa
    });

    let id_mahasiswa;
    let biodataBaru = false;

    try {
      loggerInst.log('info', '🔵 Mencoba insert biodata...');

      const biodataResult = await this.insertBiodataMahasiswa(payload.biodata);

      if (typeof biodataResult === 'string' && biodataResult.length === 36) {
          id_mahasiswa = biodataResult;
          biodataBaru = true;
      } else if (biodataResult && biodataResult.skipped) {
          loggerInst.log('info', 'Biodata sudah ada, menggunakan id_mahasiswa yang ada');
          id_mahasiswa = biodataResult.id_mahasiswa;
      } else {
          throw new Error('Gagal mendapatkan id_mahasiswa dari respons insert biodata');
      }

      loggerInst.log('info', '✅ Cek Biodata dengan id_mahasiswa:', id_mahasiswa);
    } catch (err) {
        loggerInst.log('error', '❌ Insert biodata gagal:', err.message);
        loggerInst.log('error', '🔍 Mencari mahasiswa yang sudah ada...');
        const found = await this.cariMahasiswaLengkap({
          nik: payload.biodata.nik,
          email: payload.biodata.email,
          nama: payload.biodata.nama_mahasiswa,
          jenis_kelamin: payload.biodata.jenis_kelamin,
          tanggal_lahir: payload.biodata.tanggal_lahir
        });
        id_mahasiswa = found?.id_mahasiswa || null;
        if (!id_mahasiswa) {
            loggerInst.log('error', 'Mahasiswa tidak ditemukan');
            throw new Error(`Gagal insert biodata dan mahasiswa tidak ditemukan. Error: ${err.message}`);
        }
        loggerInst.log('success', '✅ Mahasiswa ditemukan (existing), id_mahasiswa:', id_mahasiswa);
      }

    if (!biodataBaru) {
      const riwayatAda = await this.cekRiwayatMahasiswa(id_mahasiswa);
      loggerInst.log('info', '🔍 Cek riwayat mahasiswa:', riwayatAda ? 'sudah ada' : 'belum ada');
      if (riwayatAda) {
        if (DEBUG_API) console.log('Riwayat sudah ada, tidak perlu insert lagi');
          loggerInst.log('info', ' Riwayat sudah ada, tidak perlu insert lagi', { id_mahasiswa });
        return {
          skipped: true,
          message: 'Riwayat sudah ada, tidak perlu insert lagi',
          id_mahasiswa,
          _display: payload._display || { nama: payload.biodata?.nama_mahasiswa, nim: payload.riwayat?.nim }
        };
      }
    }

    const riwayat = { ...payload.riwayat, id_mahasiswa };
    try {
      loggerInst.log('info', '🔵 Mencoba insert riwayat...');
      const result = await this.insertRiwayatPendidikanMahasiswa(riwayat);
      loggerInst.log('info', '✅ Insert riwayat berhasil', { message: result });
      this.invalidateCache('mahasiswa');   // ✅ invalidate
      return result;
    } catch (err) {
      loggerInst.log('error', '❌ Insert riwayat gagal:', err.message);
      throw new Error(`Biodata / Riwayat Gagal: ${err.message}. id_mahasiswa: ${id_mahasiswa}`);
    }
  }

  async insertBiodataMahasiswa(record) {
    const { _display, ...cleanRecord } = record;
    try {
      const res = await this.callSafe('InsertBiodataMahasiswa', { record: cleanRecord });

      let id_mahasiswa = null;
      const data = this.extractData(res);
      if (data) {
        if (typeof data === 'string' && data.length === 36) {
          id_mahasiswa = data;
        } else if (data.id_mahasiswa) {
          id_mahasiswa = data.id_mahasiswa;
        }
      }
      if (!id_mahasiswa && record.nik) {
        id_mahasiswa = await this.findMahasiswaByNIK(record.nik);
      }

      if (!id_mahasiswa) {
        loggerInst.log('error', 'Gagal mendapatkan id_mahasiswa');
        throw new Error('Gagal mendapatkan id_mahasiswa dari pencarian NIK');
      }

      this.invalidateCache('mahasiswa');   // ✅ invalidate
      return { error_code: 0, error_desc: 'Biodata berhasil disimpan', id_mahasiswa };

    } catch (err) {
      const existing = await this.cariMahasiswaLengkap({
        nik: record.nik,
        email: record.email,
        nama: record.nama_mahasiswa,
        jenis_kelamin: record.jenis_kelamin,
        tanggal_lahir: record.tanggal_lahir
      });
      if (existing && existing.id_mahasiswa) {
        return {
          skipped: true,
          message: 'Biodata mahasiswa sudah ada',
          id_mahasiswa: existing.id_mahasiswa,
          _display: record._display || { nama: record.nama_mahasiswa }
        };
      }
      throw err;
    }
  }

  async insertRiwayatPendidikanMahasiswa(record) {
    const { _display, ...cleanRecord } = record;
    const existingRiwayat = await this.cekRiwayatMahasiswa(cleanRecord.id_mahasiswa);
    if (existingRiwayat) {
      return {
        skipped: true,
        message: 'Riwayat pendidikan mahasiswa sudah ada',
        id_mahasiswa: cleanRecord.id_mahasiswa,
        _display: record._display || { nim: record.nim, nama: record.nama_mahasiswa }
      };
    }
    const result = await this.callSafe('InsertRiwayatPendidikanMahasiswa', { record: cleanRecord });
    this.invalidateCache('mahasiswa');   // ✅ invalidate
    return result;
  }

  async insertKelasKuliah(record) {
    const { _display, ...cleanRecord } = record;
    const result = await this.callSafe('InsertKelasKuliah', { record: cleanRecord });
    this.invalidateCache('kelas');   // ✅ invalidate
    return result;
  }

  async insertDosenPengajarKelasKuliah(record) {
    const { _display, ...cleanRecord } = record;
    const result = await this.callSafe('InsertDosenPengajarKelasKuliah', { record: cleanRecord });
    this.invalidateCache('dosen');   // ✅ invalidate
    return result;
  }

  async insertPesertaKelasKuliah(record) {
    const { _display, ...cleanRecord } = record;
    const result = await this.callSafe('InsertPesertaKelasKuliah', { record: cleanRecord });
    this.invalidateCache('mahasiswa');   // ✅ invalidate
    return result;
  }


  async insertKomponenEvaluasiKelas(record) {
    const { _display, ...cleanRecord } = record;
    return this.callSafe('InsertKomponenEvaluasiKelas', { record: cleanRecord });
  }

  async insertRencanaEvaluasi(record) {
    const { _display, ...cleanRecord } = record;
    return this.callSafe('InsertRencanaEvaluasi', { record: cleanRecord });
  }

  // Mencari aktivitas berdasarkan judul, prodi, dan semester
  async cariAktivitasExisting(judul, id_prodi, id_semester) {
    if (!judul || !id_prodi || !id_semester) return null;
    const filterStr = `id_prodi = '${sanitizeText(id_prodi)}' AND id_semester = '${sanitizeText(id_semester)}' AND judul LIKE '%${judul}%'`;
    const res = await this.call('GetListAktivitasMahasiswa', { filter: filterStr, limit: 1 });
    const data = this.extractData(res);
    return Array.isArray(data) ? data[0] : data;
  }

  // Mencari anggota aktivitas berdasarkan id_aktivitas dan id_registrasi_mahasiswa
  async cariAnggotaExisting(id_aktivitas, id_registrasi_mahasiswa) {
    if (!id_aktivitas || !id_registrasi_mahasiswa) return null;
    const filterStr = `id_aktivitas = '${id_aktivitas}' AND id_registrasi_mahasiswa = '${id_registrasi_mahasiswa}'`;
    const res = await this.call('GetListAnggotaAktivitasMahasiswa', { filter: filterStr, limit: 1 });
    const data = this.extractData(res);
    return Array.isArray(data) ? data[0] : data;
  }

  // Cari bimbingan existing
  async cariBimbinganExisting(id_aktivitas, id_kategori_kegiatan, id_dosen, pembimbing_ke) {
    if (!id_aktivitas || !id_dosen || !id_kategori_kegiatan) return null;
    const filterStr = `id_aktivitas = '${id_aktivitas}' AND id_kategori_kegiatan = '${id_kategori_kegiatan}' AND id_dosen = '${id_dosen}' AND pembimbing_ke = '${pembimbing_ke}'`;
    const res = await this.call('GetListBimbingMahasiswa', { filter: filterStr, limit: 1 });
    const data = this.extractData(res);
    return Array.isArray(data) ? data[0] : data;
  }

  // Cari penguji existing
  async cariUjianExisting(id_aktivitas, id_kategori_kegiatan, id_dosen, penguji_ke) {
    if (!id_aktivitas || !id_dosen || !id_kategori_kegiatan) return null;
    const filterStr = `id_aktivitas = '${id_aktivitas}' AND id_kategori_kegiatan = '${id_kategori_kegiatan}' AND id_dosen = '${id_dosen}' AND penguji_ke = '${penguji_ke}'`;
    const res = await this.call('GetListUjiMahasiswa', { filter: filterStr, limit: 1 });
    const data = this.extractData(res);
    return Array.isArray(data) ? data[0] : data;
  }

  // Override method gabungan dengan validasi duplikasi
  async insertAktivitasMahasiswaLengkap(payload) {
    const { aktivitas, anggota, _display } = payload;

    let id_aktivitas;
    let aktivitasSkipped = false;

    const existingAktivitas = await this.cariAktivitasExisting(
      aktivitas.judul,
      aktivitas.id_prodi,
      aktivitas.id_semester
    );

    if (existingAktivitas?.id_aktivitas) {
      id_aktivitas = existingAktivitas.id_aktivitas;
      aktivitasSkipped = true;
      if (DEBUG_API) console.log('⏭️ Aktivitas sudah ada, gunakan id_aktivitas:', id_aktivitas);
    } else {
      try {
        id_aktivitas = await this.insertAktivitasMahasiswa(aktivitas);
        if (DEBUG_API) console.log('✅ Aktivitas baru disimpan, id_aktivitas:', id_aktivitas);
      } catch (err) {
        const fallback = await this.cariAktivitasExisting(
          aktivitas.judul,
          aktivitas.id_prodi,
          aktivitas.id_semester
        );
        if (fallback?.id_aktivitas) {
          id_aktivitas = fallback.id_aktivitas;
          aktivitasSkipped = true;
          if (DEBUG_API) console.log('⚠️ Insert aktivitas gagal, ditemukan yang sudah ada:', id_aktivitas);
        } else {
          throw new Error(`Insert aktivitas gagal dan tidak ditemukan existing. Error: ${err.message}`);
        }
      }
    }

    const existingAnggota = await this.cariAnggotaExisting(
      id_aktivitas,
      anggota.id_registrasi_mahasiswa
    );

    if (existingAnggota) {
      return {
        skipped: true,
        message: 'Anggota aktivitas sudah ada',
        id_aktivitas,
        _display: _display || { judul: aktivitas.judul, nim: anggota.nim || '' }
      };
    }

    try {
      await this.insertAnggotaAktivitasMahasiswa({
        ...anggota,
        id_aktivitas
      });
    } catch (err) {
      const existingAfterFail = await this.cariAnggotaExisting(
        id_aktivitas,
        anggota.id_registrasi_mahasiswa
      );
      if (existingAfterFail) {
        return {
          skipped: true,
          message: 'Anggota aktivitas sudah ada (terdeteksi setelah error)',
          id_aktivitas,
          _display: _display || { judul: aktivitas.judul, nim: anggota.nim || '' }
        };
      }
      throw new Error(`Insert anggota gagal: ${err.message}. id_aktivitas: ${id_aktivitas}`);
    }

    return {
      error_code: 0,
      error_desc: 'Aktivitas & anggota berhasil disimpan',
      data: { id_aktivitas }
    };
  }

  //INSERT AKTIVITAS MAHASISWA
  async insertAktivitasMahasiswa(record) {
    const { _display, ...cleanRecord } = record;
    const res = await this.callSafe('InsertAktivitasMahasiswa', { record: cleanRecord });
    const data = this.extractData(res);
    if (data && data.id_aktivitas) return data.id_aktivitas;
    if (res.data && typeof res.data === 'string') return res.data;
    throw new Error('Gagal mendapatkan id_aktivitas setelah insert');

  }

  // Insert Anggota Aktivitas Mahasiswa
  async insertAnggotaAktivitasMahasiswa(record) {
    const { _display, ...cleanRecord } = record;
    return this.callSafe('InsertAnggotaAktivitasMahasiswa', { record: cleanRecord });
  }

  // Insert Bimbing dengan cek duplikasi
  async insertBimbingMahasiswa(record) {
    const { _display, ...cleanRecord } = record;
    const existing = await this.cariBimbinganExisting(
      cleanRecord.id_aktivitas,
      cleanRecord.id_kategori_kegiatan,
      cleanRecord.id_dosen,
      cleanRecord.pembimbing_ke
    );
    if (existing) {
      return {
        skipped: true,
        message: 'Pembimbing sudah ada untuk aktivitas ini',
        id_bimbing_mahasiswa: existing.id_bimbing_mahasiswa,
        _display: record._display || {}
      };
    }
    return this.callSafe('InsertBimbingMahasiswa', { record: cleanRecord });
  }
  // Insert Uji dengan cek duplikasi
  async insertUjiMahasiswa(record) {
    const { _display, ...cleanRecord } = record;
    const existing = await this.cariUjianExisting(
      cleanRecord.id_aktivitas,
      cleanRecord.id_kategori_kegiatan,
      cleanRecord.id_dosen,
      cleanRecord.penguji_ke
    );
    if (existing) {
      return {
        skipped: true,
        message: 'Penguji sudah ada untuk aktivitas ini',
        id_uji: existing.id_uji,
        _display: record._display || {}
      };
    }
    return this.callSafe('InsertUjiMahasiswa', { record: cleanRecord });
  }

  // UPDATE
  async updateKomponenEvaluasiKelas(payload) {
    return this.callSafe('UpdateKomponenEvaluasiKelas', {
      key: { id_komponen_evaluasi: payload.key.id_komponen_evaluasi },
      record: payload.record
    });
  }

  async updateNilaiPerkuliahanKelasKomponenEvaluasi(payload) {
    return this.callSafe('UpdateNilaiPerkuliahanKelasKomponenEvaluasi', {
      key: payload.key,
      record: payload.record
    });
  }

  async updateNilaiPerkuliahanKelas(payload) {
    return this.callSafe('UpdateNilaiPerkuliahanKelas', {
      key: payload.key,
      record: payload.record
    });
  }

  // DELETE
  async deleteRencanaPembelajaran(id_rencana_ajar) {
    return this.callSafe('DeleteRencanaPembelajaran', { id_rencana_ajar });
  }

  async deleteRencanaEvaluasi(id_rencana_evaluasi) {
    return this.callSafe('DeleteRencanaEvaluasi', {
      key: id_rencana_evaluasi
    });
  }

  async deleteKelasKuliah(payload) {
    const result = await this.callSafe('DeleteKelasKuliah', {
      key: {
        id_kelas_kuliah: payload.id_kelas_kuliah
      }
    });
    this.invalidateCache('kelas');   // ✅ invalidate
    return result;
  }

  async deleteDosenPengajarKelasKuliah(payload) {
    const result = await this.callSafe('DeleteDosenPengajarKelasKuliah', {
      key: {
        id_aktivitas_mengajar: payload.id_aktivitas_mengajar
      }
    });
    this.invalidateCache('dosen');   // ✅ invalidate
    return result;
  }

  async deletePesertaKelasKuliah(payload) {
    const result = await this.callSafe('DeletePesertaKelasKuliah', {
      key: {
        id_kelas_kuliah: payload.id_kelas_kuliah,
        id_registrasi_mahasiswa: payload.id_registrasi_mahasiswa
      }
    });
    this.invalidateCache('mahasiswa');   // ✅ invalidate
    return result;
  }

  //Tidak bisa Hapus Komponen Evaluasi di Kelas (hanya bisa UPDATE)
  async deleteKomponenEvaluasiKelas(params) {
    return this.callSafe('DeleteKomponenEvaluasiKelas', {
      key: {
        // id_komponen_evaluasi: params.id_komponen_evaluasi,
        id_kelas_kuliah: params.id_kelas_kuliah,
        id_jenis_evaluasi: params.id_jenis_evaluasi,
        nama: params.nama || ''
      }
    });
  }


  /**
   * GetTranskripMahasiswa — filter opsional per mahasiswa.
   * Cache mem-first via _cachedFetch supaya aman dipanggil berulang.
   */
  async getTranskripMahasiswa(filter = {}, force = false) {
    const cond = [];
    if (filter.id_registrasi_mahasiswa)
      cond.push(`id_registrasi_mahasiswa='${sanitizeText(filter.id_registrasi_mahasiswa)}'`);
    if (filter.id_matkul)
      cond.push(`id_matkul='${sanitizeText(filter.id_matkul)}'`);
    const filterStr = cond.join(' AND ');
    const key = `transkrip_${filterStr || 'all'}`;

    if (force) this.invalidateCache(key);

    // Bulk (tanpa filter) terlalu besar → memory-only, jangan simpan ke disk
    const opts = filterStr ? {} : { persist: false };

    return this._cachedFetch(
      key,
      async () => {
        const params = { limit: filterStr ? 10000 : 100000 };
        if (filterStr) params.filter = filterStr;
        const res = await this.call('GetTranskripMahasiswa', params);
        return this.extractData(res) || [];
      },
      5 * 60 * 1000,
      null,
      opts
    );
  }

  /** Hapus semua cache transkrip (bulk + per-student) di memori & disk. */
_invalidateTranskripAll() {
  for (const key of [...this._memCache.keys()]) {
    if (key.startsWith('transkrip_')) this._memCache.delete(key);
  }
  if (this.persistCache) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(`${CACHE_PREFIX}transkrip_`))
      .forEach(k => localStorage.removeItem(k));
  }
}

  /** Trigger kalkulasi transkrip di server (per prodi + angkatan). */
  async hitungTranskripAngkatan(params = {}) {
    // 1) Normalisasi: bungkus ke `key: { angkatan, id_prodi }` sesuai GetDictionary
    let payload;
    if (params.key) {
      payload = params;
    } else if (params.angkatan !== undefined || params.id_prodi !== undefined) {
      const keyData = {};
      if (params.angkatan  !== undefined) keyData.angkatan  = params.angkatan;
      if (params.id_prodi  !== undefined) keyData.id_prodi  = params.id_prodi;
      payload = { key: keyData };
      // Salin params tambahan kalau ada (filter, dsb.)
      for (const k of Object.keys(params)) {
        if (k !== 'angkatan' && k !== 'id_prodi') payload[k] = params[k];
      }
    } else {
      payload = params;
    }

    if (DEBUG_API) console.log('[HitungTranskrip] payload:', payload);

    // 2) Kirim — pakai call() bukan callSafe() supaya bisa coba format lain
    let res = await this.call('HitungTranskripAngkatan', payload, { timeout: 5 * 60 * 1000 });
    if (res?.error_code === 0 || res?.error_code === undefined) {
      this._invalidateTranskripAll();
      return res;
    }

    // 3) Fallback kalau 108: coba `angkatan` sebagai number (numeric(4))
    if (res?.error_code === 108 && payload.key?.angkatan !== undefined
        && /^\d+$/.test(String(payload.key.angkatan))) {
      const retry = {
        ...payload,
        key: { ...payload.key, angkatan: parseInt(payload.key.angkatan, 10) },
      };
      if (DEBUG_API) console.log('[HitungTranskrip] retry numeric:', retry);
      const res2 = await this.call('HitungTranskripAngkatan', retry, { timeout: 5 * 60 * 1000 });
      if (res2?.error_code === 0 || res2?.error_code === undefined) {
        this._invalidateTranskripAll();
        return res2;
      }

      // 4) Fallback terakhir: flat bracket `key[angkatan]`
      const flat = {
        'key[angkatan]': payload.key.angkatan,
        'key[id_prodi]': payload.key.id_prodi,
      };
      if (DEBUG_API) console.log('[HitungTranskrip] retry flat:', flat);
      const res3 = await this.call('HitungTranskripAngkatan', flat);
      if (res3?.error_code === 0 || res3?.error_code === undefined) {
        this._invalidateTranskripAll();
        return res3;
      }

      // Semua gagal → lempar error asli
      throw new Error(`[${res.error_code}] ${res.error_desc || 'Unknown'}`);
    }

    throw new Error(`[${res?.error_code}] ${res?.error_desc || 'Unknown'}`);
  }

  

async insertTranskripMahasiswa(record) {
  const { _display, ...clean } = record || {};

  // === VALIDASI KLIEN — tangkap bug sebelum kirim ke server ===
  if (!clean.id_registrasi_mahasiswa) {
    throw new Error(
      `id_registrasi_mahasiswa kosong di payload. ` +
      `Record: ${JSON.stringify(clean)}`
    );
  }
  if (!clean.id_matkul) {
    throw new Error(`id_matkul kosong di payload. Record: ${JSON.stringify(clean)}`);
  }
  if (clean.smt_diambil === undefined || clean.smt_diambil === null || clean.smt_diambil === '') {
    throw new Error(`smt_diambil kosong. Record: ${JSON.stringify(clean)}`);
  }
  const hasSource = clean.id_kelas_kuliah || clean.id_nilai_transfer || clean.id_konversi_aktivitas;
  if (!hasSource) {
    throw new Error(`Butuh salah satu: id_kelas_kuliah / id_nilai_transfer / id_konversi_aktivitas. Record: ${JSON.stringify(clean)}`);
  }

  // === Normalisasi ===
  const normalized = {};
  for (const k of Object.keys(clean)) {
    const v = clean[k];
    if (v === null || v === undefined || v === '') continue;
    normalized[k] = (k === 'smt_diambil') ? Number(v) : v;
  }

  // === 4 format kandidat, dicoba berurutan ===
  
  // const result = await this.insertTranskripMahasiswa( { record: normalized } );
  const attempts = [
    {
      name: 'record sebagai object',
      payload: { record: normalized },
    },
    // {
    //   name: 'record sebagai object',
    //   record: normalized,
    // },
   
    // {
    //   name: 'record sebagai JSON string',
    //   payload: { record: JSON.stringify(normalized) },
    // },
    // {
    //   name: 'flat record[k]',
    //   payload: (() => {
    //     const flat = {};
    //     for (const [k, v] of Object.entries(normalized)) {
    //       flat[`record[${k}]`] = v;
    //     }
    //     return flat;
    //   })(),
    // },
    // {
    //   name: 'flat langsung (tanpa wrapper)',
    //   payload: normalized,
    // },
  ];

  const errs = [];

  for (const att of attempts) {
    if (DEBUG_API) console.log(`[InsertTranskrip] coba: ${att.name}`, att.payload);

    try {
      const res = await this.call('InsertTranskripMahasiswa', att.payload);

      if (res?.error_code === 0 || res?.error_code === undefined) {
        if (DEBUG_API) console.log(`[InsertTranskrip] ✅ sukses via "${att.name}"`);
        this._invalidateTranskripAll();
        return res;
      }

      errs.push(`${att.name}: [${res?.error_code}] ${res?.error_desc || ''}`);
      if (DEBUG_API) console.warn(`[InsertTranskrip] ❌ ${att.name}: [${res?.error_code}] ${res?.error_desc}`);

      // Retry untuk error yang kemungkinan besar soal FORMAT,
      // bukan bisnis-logika (mis. 401 token, 500 server)
      const retryCodes = [15, 108, 109, 111, 400];
      if (!retryCodes.includes(Number(res?.error_code))) break;

    } catch (e) {
      errs.push(`${att.name}: ${e.message}`);
    }
  }

  throw new Error(
    `InsertTranskripMahasiswa gagal di ${errs.length} format.\n\n` +
    errs.join('\n') +
    `\n\nKalau semua gagal, buka sandbox2.php di case 'InsertTranskripMahasiswa' ` +
    `dan lihat bagaimana \$input['record'] di-decode.`
  );
}



  async deleteTranskripMahasiswa(key) {
    const result = await this.callSafe('DeleteTranskripMahasiswa', 
      { key: {
        id_registrasi_mahasiswa: key.id_registrasi_mahasiswa,
        id_matkul: key.id_matkul
      }

       });
    this._invalidateTranskripAll();
    return result;
  }


}