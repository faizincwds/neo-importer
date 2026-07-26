import { API_BASE, STORAGE_KEYS } from './config.js';

export class NeoFeederAPI {
  constructor() {
    this.token = localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  }

  async call(method, params = {}) {
    const payload = {
      act: method,
      token: this.token,
      ...params,
    };

    console.log(`[API] Request ${method}`, payload);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 detik timeout

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API] HTTP ${response.status}`, errorText);
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const text = await response.text();
      if (!text) {
        console.error(`[API] Empty response for ${method}`);
        throw new Error('Server mengembalikan respons kosong');
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        console.error(`[API] Respons bukan JSON: ${text.substring(0, 100)}`);
        throw new Error('Respons server bukan JSON yang valid');
      }

      console.log(`[API] Response ${method}`, json);

      if (json.error) {
        const msg = typeof json.error === 'string' ? json.error : json.error_description || 'Unknown error';
        throw new Error(msg);
      }

      return json;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error(`[API] Timeout untuk ${method}`);
        throw new Error(`Timeout setelah 30 detik untuk ${method}`);
      }
      console.error(`[API] ${method} failed:`, error.message);
      throw error;
    }
  }


  /**
   * Panggil API lalu periksa error_code. Melempar error jika gagal.
   */
  async callSafe(method, params = {}) {
    const res = await this.call(method, params);
    // Neo Feeder biasanya mengembalikan error_code, 0 = sukses
    if (res.error_code === undefined) {
      console.warn('Respons tidak memiliki error_code:', res);
      throw new Error('Respons tidak valid (tidak ada error_code)');
    }
    if (res.error_code !== 0) {
      throw new Error(`[${res.error_code}] ${res.error_desc || 'Unknown error'}`);
    }
    return res;
  }


  /**
   * Mengekstrak data dari respons API.
   * Neo Feeder biasanya mengembalikan { data: [...] } atau { result: [...] } atau langsung array.
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

  // Referensi
  // async getDictionary() {
  //   const res = await this.call('GetDictionary');
  //   return this.extractData(res);
  // }

  async getDictionary(fungsi = null) {
    const params = {};
    if (fungsi) params.fungsi = fungsi;
    const res = await this.call('GetDictionary', params);
    return this.extractData(res);
  }

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

    // Di bagian Referensi
  async getListPenugasanDosen(filter = {}) {
    let filterStr = '';
    if (filter.nidn) filterStr = `nidn = '${filter.nidn}'`;
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


  async insertDosenPengajarKelasKuliah(record) {
    return this.callSafe('InsertDosenPengajarKelasKuliah', { record: JSON.stringify(record) });
  }

  // Mencari aktivitas mengajar dosen
  async getListDosenPengajarKelasKuliah(filter = {}) {
    const conditions = [];
    if (filter.id_semester) conditions.push(`id_semester = '${filter.id_semester}'`);
    if (filter.id_kelas_kuliah) conditions.push(`id_kelas_kuliah = '${filter.id_kelas_kuliah}'`);
    if (filter.nidn) conditions.push(`nidn = '${filter.nidn}'`);
    const filterStr = conditions.length ? conditions.join(' and ') : '';
    const res = await this.call('GetListDosenPengajarKelasKuliah', { filter: filterStr, limit: 1 });
    return this.extractData(res);
  }


  // CRUD
  async insertKelasKuliah(record) {
    return this.callSafe('InsertKelasKuliah', { record: JSON.stringify(record) });
  }

  async insertPesertaKelasKuliah(record) {
    const { _display, ...cleanRecord } = record; 
    return this.callSafe('InsertPesertaKelasKuliah', { record: cleanRecord });
    // return this.callSafe('InsertPesertaKelasKuliah', { record: JSON.stringify(cleanRecord) });
  }
  

  async insertKomponenEvaluasiKelas(record) {
    const { _display, ...cleanRecord } = record; 
    return this.callSafe('InsertKomponenEvaluasiKelas', { record: cleanRecord });
  }

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

  async insertRencanaEvaluasi(record) {
    return this.callSafe('InsertRencanaEvaluasi', { record: JSON.stringify(record) });
  }

  async updateNilaiPerkuliahanKelas(payload) {
    return this.callSafe('UpdateNilaiPerkuliahanKelas', {
      key: payload.key,
      record: payload.record   // objek langsung, tanpa JSON.stringify
    });
  }

  async deleteKomponenEvaluasiKelas(params) {
    // Coba kirim sebagai key terlebih dahulu
    try {
      return await this.callSafe('DeleteKomponenEvaluasiKelas', {
        key: {
          id_kelas_kuliah: params.id_kelas_kuliah,
          id_jenis_evaluasi: params.id_jenis_evaluasi,
          nama: params.nama || ''
        }
      });
    } catch (e) {
      // Jika timeout atau error, coba kirim sebagai parameter langsung
      console.warn('Gagal dengan key, mencoba parameter langsung...');
      return this.callSafe('DeleteKomponenEvaluasiKelas', {
        id_kelas_kuliah: params.id_kelas_kuliah,
        id_jenis_evaluasi: params.id_jenis_evaluasi,
        nama: params.nama || ''
      });
    }
  }
  

  async deleteRencanaPembelajaran(id_rencana_ajar) {
    return this.callSafe('DeleteRencanaPembelajaran', { id_rencana_ajar });
  }
  
  async deleteRencanaEvaluasi(id_rencana_evaluasi) {
    return this.callSafe('DeleteRencanaEvaluasi', { 
      key: id_rencana_evaluasi
    });
  }

  async deleteKelasKuliah(id_kelas_kuliah) {
    return this.callSafe('DeleteKelasKuliah', { id_kelas_kuliah });
  }

  // Menghapus aktivitas mengajar berdasarkan id_aktivitas_mengajar
  async deleteDosenPengajarKelasKuliah(id_aktivitas_mengajar) {
    return this.callSafe('DeleteDosenPengajarKelasKuliah', { key: { id_aktivitas_mengajar } });
  }

  async deletePesertaKelasKuliah(id_peserta) {
    return this.callSafe('DeletePesertaKelasKuliah', { id_peserta });
  }
}