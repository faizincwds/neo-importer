import { API_BASE, STORAGE_KEYS } from './config.js';
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

    loggerInst.log('api', `Mengirim permintaan: ${method}`, { url, payload });
    console.log(`[URL API] Request ${method}`, url);
    // console.log(`[API] Request ${method}`, payload);

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
        // ✅ Catat error HTTP
        loggerInst.log('error', `Gagal terhubung API: HTTP ${response.status}`, { status: response.status, respon: errorText });
        console.error(`[API ERROR] HTTP ${response.status}`, errorText);
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const text = await response.text();
      if (!text) {
        // ✅ Catat respon kosong
        loggerInst.log('warning', `Respon kosong dari server untuk ${method}`);
        console.error(`[API ERROR] Empty response for ${method}`);
        throw new Error('Server mengembalikan respons kosong');
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        // ✅ Catat kesalahan format JSON
        loggerInst.log('error', `Respon bukan JSON untuk ${method}`, { respon: text.substring(0, 200) });
        console.error(`[API ERROR] Respons bukan JSON: ${text.substring(0, 100)}`);
        throw new Error('Respons server bukan JSON yang valid');
      }

      if (json.error) {
        const msg = typeof json.error === 'string' ? json.error : json.error_description || 'Unknown error';
        // ✅ Catat error dari API Neo Feeder
        loggerInst.log('error', `API menolak permintaan: ${msg}`, json);
        throw new Error(msg);
      }

      // ✅ Catat keberhasilan
      loggerInst.log('success', `Berhasil memproses: ${method}`, { ringkasan: this.ringkasData(json) });

      return json;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        // ✅ Catat timeout
        loggerInst.log('error', `Permintaan dibatalkan: Timeout 30 detik untuk ${method}`);
        console.error(`[API] Timeout untuk ${method}`);
        throw new Error(`Timeout setelah 30 detik untuk ${method}`);
      }
      // ✅ Catat kesalahan umum
      loggerInst.log('error', `Kesalahan pada ${method}: ${error.message}`);
      console.error(`[API] ${method} failed:`, error.message);
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
      loggerInst.log('error', `Kesalahan API ${method}: [${res.error_code}] ${res.error_desc || 'Tidak ada keterangan'}`);
      throw new Error(`[${res.error_code}] ${res.error_desc || 'Unknown error'}`);
    }
    return res;
  }


  /**
   * Mengekstrak data dari respons API.
   */
  extractData(response) {
    if (!response) return null;
      // Jika response memiliki properti 'data'
        if (response.data !== undefined) {
            // Neo Feeder sering membungkus lagi: { data: { data: [...] } }
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

  async getProdi() {
    const res = await this.call('GetProdi');
    return this.extractData(res);
  }

  async getPeriode() {
    const res = await this.call('GetPeriode');
    return this.extractData(res);
  }

  async getSemester() {
    const res = await this.call('GetSemester');
    return this.extractData(res);
  }

  async getDetailMataKuliah(kode_mk) {
    // Coba kirim sebagai parameter langsung
    const res = await this.call('GetDetailMataKuliah', {
      filter: `kode_mata_kuliah = '${kode_mk}'`,
      limit: 1
    });
    const data = this.extractData(res);
    // Jika hasilnya array, ambil elemen pertama
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

  async getListDosen() {
    const res = await this.call('GetListDosen');
    return this.extractData(res);
  }

  async getListMataKuliah() {
    const res = await this.call('GetListMataKuliah');
    return this.extractData(res);
  }

  async getListMahasiswa() {
    const res = await this.call('GetListMahasiswa');
    return this.extractData(res);
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

    // Generic method untuk referensi yang hanya butuh act
  async getAgama() { const res = await this.call('GetAgama'); return this.extractData(res); }
  async getJenisTinggal() { const res = await this.call('GetJenisTinggal'); return this.extractData(res); }
  async getAlatTransportasi() { const res = await this.call('GetAlatTransportasi'); return this.extractData(res); }
  async GetLevelWilayah() { const res = await this.call('GetLevelWilayah'); return this.extractData(res); }
  async getJenjangPendidikan() { const res = await this.call('GetJenjangPendidikan'); return this.extractData(res); }
  async getPekerjaan() { const res = await this.call('GetPekerjaan'); return this.extractData(res); }
  async getPenghasilan() { const res = await this.call('GetPenghasilan'); return this.extractData(res); }
  async getKebutuhanKhusus() { const res = await this.call('GetKebutuhanKhusus'); return this.extractData(res); }
  async getPembiayaan() { const res = await this.call('GetPembiayaan'); return this.extractData(res); }
  async getWilayah(level = null) {
    let filterStr = '';
    if (level) filterStr = `id_level_wilayah = ${level}`;
    const res = await this.call('GetWilayah', { filter: filterStr });
    return this.extractData(res);
  }

  // END REFERENCE


  // INSERT

  // Method baru: cari mahasiswa lewat GetBiodataMahasiswa dulu, lalu GetListMahasiswa
  async cariMahasiswaLengkap({ nik, email, nama, jenis_kelamin, tanggal_lahir }) {
    // 1. Cari di GetBiodataMahasiswa berdasarkan NIK / email
    let biodataArr = null;
    if (nik) {
      const res = await this.call('GetBiodataMahasiswa', { filter: `nik = '${nik}'` });
      biodataArr = this.extractData(res);
    }
    if ((!biodataArr || (Array.isArray(biodataArr) && biodataArr.length === 0)) && email) {
      const res = await this.call('GetBiodataMahasiswa', { filter: `email = '${email}'` });
      biodataArr = this.extractData(res);
    }

    // Jika tidak ditemukan di biodata, fallback ke cara lama (GetListMahasiswa dengan filter biasa)
    if (!biodataArr || (Array.isArray(biodataArr) && biodataArr.length === 0)) {
      return this.cariMahasiswa({ nama });
    }

    // Ambil data mahasiswa pertama
    const biodata = Array.isArray(biodataArr) ? biodataArr[0] : biodataArr;
    if (!biodata) return null;

    // 2. Cari di GetListMahasiswa menggunakan nama, jenis kelamin, tanggal lahir dari biodata
    const filterConditions = [];
    if (biodata.nama_mahasiswa) filterConditions.push(`nama_mahasiswa LIKE '%${biodata.nama_mahasiswa}%'`);
    if (biodata.jenis_kelamin) filterConditions.push(`jenis_kelamin = '${biodata.jenis_kelamin}'`);
    if (biodata.tanggal_lahir) {
      // Tanggal dari GetBiodataMahasiswa sudah dalam format DD-MM-YYYY (contoh: 10-02-2008)
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

  async insertMahasiswaLengkap(payload) {
    loggerInst.log('info', 'Memulai proses insert mahasiswa lengkap...', {
        nim: payload.riwayat?.nim,
        nama: payload.biodata?.nama_mahasiswa
    });

    let id_mahasiswa;
    let biodataBaru = false;

    // 1. Coba insert biodata
    try {
      loggerInst.log('info', '🔵 Mencoba insert biodata...');

      const biodataResult = await this.insertBiodataMahasiswa(payload.biodata);

      // Cek tipe hasil
      if (typeof biodataResult === 'string' && biodataResult .length === 36) {
          id_mahasiswa = biodataResult ;
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

    // 2. Cek apakah riwayat sudah ada (hanya jika mahasiswa sudah ada sebelumnya)
    if (!biodataBaru) {
      const riwayatAda = await this.cekRiwayatMahasiswa(id_mahasiswa);
      loggerInst.log('info', '🔍 Cek riwayat mahasiswa:', riwayatAda ? 'sudah ada' : 'belum ada');
      if (riwayatAda) {
        console.log('⏭️ Riwayat sudah ada, tidak perlu insert lagi');
        loggerInst.log('info', 'Riwayat sudah ada, tidak perlu insert', { id_mahasiswa });
        return {
          skipped: true,
          message: 'Riwayat sudah ada, tidak perlu insert',
          id_mahasiswa,
          _display: payload._display || { nama: payload.biodata?.nama_mahasiswa, nim: payload.riwayat?.nim }
        };
      }
    }

    // 3. Insert riwayat
    const riwayat = { ...payload.riwayat, id_mahasiswa };
    try {
      loggerInst.log('info', '🔵 Mencoba insert riwayat...');
      const result = await this.insertRiwayatPendidikanMahasiswa(riwayat);
      loggerInst.log('info', '✅ Insert riwayat berhasil', { message: result });
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

      return { error_code: 0, error_desc: 'Biodata berhasil disimpan', id_mahasiswa };

    } catch (err) {
      // Cari mahasiswa yang sudah ada
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
    return this.callSafe('InsertRiwayatPendidikanMahasiswa', { record: cleanRecord });
  }

  async insertKelasKuliah(record) {
    const { _display, ...cleanRecord } = record;
    return this.callSafe('InsertKelasKuliah', { record: cleanRecord });
  }

  async insertDosenPengajarKelasKuliah(record) {
    const { _display, ...cleanRecord } = record; 
    return this.callSafe('InsertDosenPengajarKelasKuliah', { record: cleanRecord });
  }

  async insertPesertaKelasKuliah(record) {
    const { _display, ...cleanRecord } = record; 
    return this.callSafe('InsertPesertaKelasKuliah', { record: cleanRecord });
  }
  

  async insertKomponenEvaluasiKelas(record) {
    const { _display, ...cleanRecord } = record; 
    return this.callSafe('InsertKomponenEvaluasiKelas', { record: cleanRecord });
  }

  async insertRencanaEvaluasi(record) {
    const { _display, ...cleanRecord } = record; 
    return this.callSafe('InsertRencanaEvaluasi', { record: cleanRecord });
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
    return this.callSafe('DeleteKelasKuliah', { 
      key: { 
        id_kelas_kuliah: payload.id_kelas_kuliah 
      } 
    });
  }

  async deleteDosenPengajarKelasKuliah(payload) {
    return this.callSafe('DeleteDosenPengajarKelasKuliah', { 
      key: { 
        id_aktivitas_mengajar: payload.id_aktivitas_mengajar 
      } 
    });
  }

  async deletePesertaKelasKuliah(payload) {
    return this.callSafe('DeletePesertaKelasKuliah', {
      key: {
        id_kelas_kuliah: payload.id_kelas_kuliah,
        id_registrasi_mahasiswa: payload.id_registrasi_mahasiswa
      }
    });
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