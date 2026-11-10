import { API_BASE, STORAGE_KEYS, DEBUG_API, CACHE_PREFIX, CACHE_TTL } from './config.js';
import { loggerInst } from './loggerView.js';

export class NeoFeederAPI {
  constructor() {
    this.token = localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  }

  async call(method, params = {}) {
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
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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

      // Catat keberhasilan
            // Catat respons mentah untuk debug
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
        // Catat timeout
        loggerInst.log('error', `Permintaan dibatalkan: Timeout 30 detik untuk ${method}`);
        if (DEBUG_API) console.error(`[API] Timeout untuk ${method}`);
        throw new Error(`Timeout setelah 30 detik untuk ${method}`);
      }

      // Deteksi error jaringan (server mati / port salah / API tidak aktif)
      const isNetworkError =
        error.name === 'TypeError' &&
        (error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('fetch'));

      if (isNetworkError) {
        loggerInst.log('error', `Server Off / Maintenance – tidak dapat terhubung ke ${url}`, { url });
        if (DEBUG_API) console.warn(`[API] Server Off: ${url}`);
      }

      // Catat kesalahan umum
      loggerInst.log('error', `Kesalahan pada ${method}: ${error.message}`);
      if (DEBUG_API) console.error(`[API] ${method} failed:`, error.message);

      throw error;

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
    throw new Error('Token tidak ditemukan dalam respons');
  }

  // ============ CACHE HELPER ============

  // _getCache(key) {
  //   try {
  //     const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
  //     return raw ? JSON.parse(raw) : null;
  //   } catch (e) { return null; }
  // }
  _getCache(key) {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Perbarui timestamp saat diakses
      parsed.timestamp = Date.now();
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(parsed));
      return parsed;
    } catch (e) { return null; }
  }

  _setCache(key, data, count) {
    try {
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({
        data,
        count,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Cache save failed (quota?), skip', e);
    }
  }

  invalidateCache(key) {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  }

  invalidateAllCache() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }

  /**
   * Ambil data dengan cache + TTL + count-check.
   */
  async _cachedFetch(key, fetchFn, ttl, countFn = null) {
    const cached = this._getCache(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < ttl) {
      if (countFn) {
        try {
          const currentCount = await countFn();
          if (currentCount !== null && currentCount === cached.count) {
            if (DEBUG_API) console.log(`[CACHE HIT] ${key} (${currentCount} item)`);
            return cached.data;
          }
          if (DEBUG_API) console.log(`[CACHE STALE] ${key} count berubah ${cached.count} → ${currentCount}`);
        } catch (e) {
          if (DEBUG_API) console.log(`[CACHE HIT–fallback] ${key}`);
          return cached.data;
        }
      } else {
        if (DEBUG_API) console.log(`[CACHE HIT] ${key}`);
        return cached.data;
      }
    }

    if (DEBUG_API) console.log(`[CACHE MISS] ${key}, fetch baru`);
    const data = await fetchFn();
    let count = null;
    if (countFn) {
      try { count = await countFn(); } catch (e) { /* ignore */ }
    }
    this._setCache(key, data, count);
    return data;
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
      filter: `kode_mata_kuliah = '${kode_mk}'`,
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
    if (filter.id_semester) conditions.push(`id_semester = '${filter.id_semester}'`);
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

  async getListKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_semester) conditions.push(`id_semester = '${filter.id_semester}'`);
    if (filter.kode_mata_kuliah) conditions.push(`kode_mata_kuliah = '${filter.kode_mata_kuliah}'`);
    if (filter.nama_kelas_kuliah) conditions.push(`nama_kelas_kuliah = '${filter.nama_kelas_kuliah}'`);
    const filterStr = conditions.length ? conditions.join(' and ') : '';
    const res = await this.call('GetListKelasKuliah', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }

  async getListPesertaKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_kelas_kuliah) conditions.push(`id_kelas_kuliah = '${filter.id_kelas_kuliah}'`);
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
    if (filter.id_semester) conditions.push(`id_semester = '${filter.id_semester}'`);
    if (filter.id_kelas_kuliah) conditions.push(`id_kelas_kuliah = '${filter.id_kelas_kuliah}'`);
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
      const res = await this.call('GetBiodataMahasiswa', { filter: `nik = '${nik}'` });
      biodataArr = this.extractData(res);
    }
    if ((!biodataArr || (Array.isArray(biodataArr) && biodataArr.length === 0)) && email) {
      const res = await this.call('GetBiodataMahasiswa', { filter: `email = '${email}'` });
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
    if (biodata.tanggal_lahir) {
      filterConditions.push(`tanggal_lahir = '${biodata.tanggal_lahir}'`);
    }
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
    if (filter.nik) conditions.push(`nik = '${filter.nik}'`);
    if (filter.email) conditions.push(`email = '${filter.email}'`);
    if (filter.id_mahasiswa) conditions.push(`id_mahasiswa = '${filter.id_mahasiswa}'`);
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
          loggerInst.log('error', 'Biodata sudah ada, menggunakan id_mahasiswa yang ada');
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
        if (DEBUG_API) console.log('⏭️ Riwayat sudah ada, tidak perlu insert lagi');
        loggerInst.log('info', 'Riwayat sudah ada, tidak perlu insert', { id_mahasiswa });
        return {
          skipped: true,
          message: 'Riwayat sudah ada, tidak perlu insert',
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
    const filterStr = `id_prodi = '${id_prodi}' AND id_semester = '${id_semester}' AND judul LIKE '%${judul}%'`;
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
    if (DEBUG_API) console.log('ID AK:', data.id_aktivitas);

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
}