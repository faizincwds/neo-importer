import { NeoFeederAPI } from './api.js';

export class LookupEngine {
  constructor(api) {
    this.api = api;
    this.cache = {};
  }

  // ======================== MATA KULIAH ========================
  _normalizeMK(data) {
    if (!data) return null;
    const kode = data.kode_mata_kuliah || data.kode_mk || data.kd_mk || data.kode || '';
    const nama = data.nama_mata_kuliah || data.nama_mk || data.nama || data.mata_kuliah || data.nama_matkul || '';
    const sks = data.sks_mata_kuliah || data.sks || data.bobot_sks || '';
    const semester = data.semester || data.smt || '';
    const kode_prodi = data.kode_prodi || data.kode_program_studi || data.kd_prodi || data.id_prodi || '';
    const nama_prodi = data.nama_prodi || data.nama_program_studi || data.prodi || '';
    const id_prodi = data.id_prodi || '';   // UUID dari MK
    return {
      kode_mata_kuliah: kode,
      nama_mata_kuliah: nama,
      sks,
      semester,
      kode_prodi,
      nama_prodi,
      id_prodi,
      _raw: data
    };
  }

  async lookupMataKuliah(kode) {
    if (!kode) return null;
    const cleanKode = String(kode).trim();
    const key = `mk_${cleanKode}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const res = await this.api.getDetailMataKuliah(cleanKode);
      console.log('Lookup MK response:', res);
      if (res) {
        const normalized = this._normalizeMK(res);
        this.cache[key] = normalized;
        return normalized;
      }
    } catch (e) {
      console.warn('Lookup MK failed', e);
    }
    return null;
  }

  // ======================== PRODI ========================
  _normalizeProdi(data) {
    return {
      kode_prodi: data.kode_prodi || data.kode_program_studi || data.kd_prodi || '',
      nama_prodi: data.nama_prodi || data.nama_program_studi || data.nama_resmi || data.prodi || data.nama || '',
      id_prodi: data.id_prodi || data.id || '',
      _raw: data
    };
  }

  async lookupProdi(kode) {
    if (!kode) return null;
    const key = `prodi_${kode}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      console.log('GetProdi result:', arr);
      const found = arr.find(p => {
        const kodeProdi = (p.kode_prodi || p.kode_program_studi || p.kd_prodi || '').toString().trim();
        return kodeProdi === kode.toString().trim();
      });
      if (found) {
        const normalized = this._normalizeProdi(found);
        this.cache[key] = normalized;
        return normalized;
      }
    } catch (e) {
      console.warn('Lookup prodi failed', e);
    }
    return null;
  }

  async lookupProdiByName(nama) {
    if (!nama) return null;
    const key = `prodi_name_${nama}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      const found = arr.find(p => {
        const namaProdi = (p.nama_prodi || p.nama_program_studi || p.nama_resmi || p.prodi || '').trim().toLowerCase();
        return namaProdi === nama.trim().toLowerCase();
      });
      if (found) {
        const normalized = this._normalizeProdi(found);
        this.cache[key] = normalized;
        return normalized;
      }
    } catch (e) {
      console.warn('Lookup prodi by name failed', e);
    }
    return null;
  }

  async lookupProdiById(id) {
    if (!id) return null;
    const key = `prodi_id_${id}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      const found = arr.find(p => (p.id_prodi || p.id) === id);
      if (found) {
        const normalized = this._normalizeProdi(found);
        this.cache[key] = normalized;
        return normalized;
      }
    } catch (e) {
      console.warn('Lookup prodi by id failed', e);
    }
    return null;
  }

  // ======================== DOSEN ========================
  
  async lookupDosenByNuptk(nuptk) {

    if (!nuptk) return null;

    const key = `dosen_nuptk_${nuptk}`;

    if (this.cache[key]) return this.cache[key];
    try {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(d => d.nuptk === nuptk);
      if (found) {
        const result = {
          id_dosen: found.id_dosen,
          nuptk: found.nuptk,
          nidn: found.nidn,
          nama_dosen: found.nama_dosen,
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup dosen by NIDN/NUPTK failed', e);
    }
    return null;
  }

  async lookupPenugasanDosen(nuptk) {
    if (!nuptk) return null;

    const key = `penugasan_${nuptk}`;

    if (this.cache[key]) return this.cache[key];

    try {
      const list = await this.api.getListPenugasanDosen({ nuptk: nuptk.trim() });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];   // ambil pertama (biasanya satu dosen punya banyak penugasan, kita ambil yg aktif)
      if (found && found.id_registrasi_dosen) {
        const result = {
          id_registrasi_dosen: found.id_registrasi_dosen,
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup penugasan dosen failed', e);
    }
    return null;
  }

  // ======================== SEMESTER ========================
  async lookupSemester(kodePeriode) {
    if (!kodePeriode) return null;
    const clean = String(kodePeriode).trim();
    const key = `semester_${clean}`;
    if (this.cache[key]) return this.cache[key];

    try {
      const res = await this.api.call('GetSemester');
      const list = this.api.extractData(res) || [];
      const found = list.find(s => s.id_semester == clean);
      if (found) {
        const result = { id_semester: found.id_semester, _raw: found };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup semester gagal, gunakan kodePeriode sebagai fallback', e);
    }

    // Fallback: tetap kembalikan id_semester = kodePeriode
    const fallback = { id_semester: clean, _raw: {} };
    this.cache[key] = fallback;
    return fallback;
  }

  // ======================== KELAS KULIAH ========================
  async lookupDetailKelasKuliah(kodeMk, namaKelas, idSemester) {
    if (!kodeMk || !namaKelas || !idSemester) {
      console.warn('lookupDetailKelasKuliah: parameter tidak lengkap', { kodeMk, namaKelas, idSemester });
      return null;
    }
    const cleanKode = String(kodeMk).trim();
    const cleanNama = String(namaKelas).trim();
    const cleanSem = String(idSemester).trim();
    const key = `kelas_${cleanSem}_${cleanKode}_${cleanNama}`;
    if (this.cache[key]) return this.cache[key];

    try {
      // Cari dengan kode MK + nama kelas + semester
      let res = await this.api.getDetailKelasKuliah({
        id_semester: cleanSem,
        kode_mata_kuliah: cleanKode,
        nama_kelas_kuliah: cleanNama
      });
      let data = Array.isArray(res) ? res[0] : res;

      console.log('Lookup kelas (dengan kode MK):', data);

      // Jika tidak ketemu, coba hanya dengan nama kelas & semester (abaikan kode MK)
      // if (!data || !data.id_kelas_kuliah) {
      //   console.warn('Kelas tidak ditemukan dengan kode MK, coba tanpa kode MK');
      //   res = await this.api.getDetailKelasKuliah({
      //     id_semester: cleanSem,
      //     nama_kelas_kuliah: cleanNama
      //   });
      //   data = Array.isArray(res) ? res[0] : res;
      //   console.log('Lookup kelas (tanpa kode MK):', data);
      // }

      if (data && data.id_kelas_kuliah) {
        const result = { id_kelas_kuliah: data.id_kelas_kuliah, _raw: data };
        this.cache[key] = result;
        return result;
      }

      console.warn(`Kelas tidak ditemukan: ${cleanKode} / ${cleanNama} / ${cleanSem}`);
      return null;
    } catch (e) {
      console.warn('Lookup kelas kuliah failed', e);
      return null;
    }
  }

  async lookupPesertaKelas(nim, idKelas) {
    if (!nim || !idKelas) return null;
    const key = `peserta_${nim}_${idKelas}`;
    if (this.cache[key]) return this.cache[key];

    try {
      const list = await this.api.getListPesertaKelasKuliah({
        nim: nim.trim(),
        id_kelas_kuliah: idKelas
      });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_registrasi_mahasiswa) {
        const result = {
          id_registrasi_mahasiswa: found.id_registrasi_mahasiswa,
          nama_mahasiswa: found.nama_mahasiswa || '',
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup Peserta kelas gagal:', e);
    }
    return null;
  }

  
  // ======================== MAHASISWA ========================
    async lookupRegistrasiMahasiswa(nim) {
    if (!nim) return null;
    const key = `registrasi_mhs_${nim}`;
    if (this.cache[key]) return this.cache[key];

    try {
      const list = await this.api.getListRiwayatPendidikanMahasiswa({ nim: nim.trim() });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_registrasi_mahasiswa) {
        const result = {
          id_registrasi_mahasiswa: found.id_registrasi_mahasiswa,
          id_mahasiswa: found.id_mahasiswa || '',
          nama_mahasiswa: found.nama_mahasiswa || '',
          nim: found.nim || nim,
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup registrasi mahasiswa failed', e);
    }
    return null;
  }

  // ======================= EVALUASI ========================
  async lookupJenisEvaluasi(id) {
    const key = `jenis_eval_${id}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const list = await this.api.getJenisEvaluasi();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(j => j.id_jenis_evaluasi == id);
      if (found) {
        this.cache[key] = found;
        return found;
      }
    } catch (e) {
      console.warn('Lookup jenis evaluasi gagal:', e);
    }
    return null;
  } 
  
  // Cari komponen evaluasi berdasarkan id_kelas_kuliah dan id_jenis_evaluasi
  async lookupKomponenEvaluasi(kelasId, jenisEvaluasi, namaEvaluasi = null) {
    if (!kelasId || !jenisEvaluasi) return null;
    const key = `komponen_${kelasId}_${jenisEvaluasi}_${namaEvaluasi || ''}`;
    if (this.cache[key]) return this.cache[key];

    try {
      const res = await this.api.getListKomponenEvaluasiKelas({ id_kelas_kuliah: kelasId });
      const list = Array.isArray(res) ? res : (res?.data || []);
      
      let found;
      if (namaEvaluasi && namaEvaluasi.trim() !== '') {
        const target = namaEvaluasi.trim().toLowerCase();
        // Hanya ambil yang cocok nama (abaikan yang kosong)
        found = list.find(item => 
          item.id_jenis_evaluasi == jenisEvaluasi &&
          (item.nama || '').toLowerCase() === target
        );
        // Jika tidak ketemu, jangan ambil yang lain – kembalikan null
        if (!found) return null;
      } else {
        // Tanpa nama, ambil pertama dengan id_jenis_evaluasi yang sama
        found = list.find(item => item.id_jenis_evaluasi == jenisEvaluasi);
      }

      if (found) {
        const result = {
          id_komponen_evaluasi: found.id_komponen_evaluasi,
          nama_evaluasi: found.nama || '',
          nama_inggris: found.nama_inggris || '',
          nomor_urut: found.nomor_urut,
          bobot_evaluasi: found.bobot_evaluasi,
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup komponen evaluasi gagal:', e);
    }
    return null;
  }

async lookupKomponenEvaluasiByIdUrut(kelasId, jenisEvaluasi, nomorUrut) {
    if (!kelasId || !jenisEvaluasi || !nomorUrut) return null;
    const key = `komponen_${kelasId}_${jenisEvaluasi}_${nomorUrut}`;
    if (this.cache[key]) return this.cache[key];

    try {
      const res = await this.api.getListKomponenEvaluasiKelas({ id_kelas_kuliah: kelasId });
      const list = Array.isArray(res) ? res : (res?.data || []);
      
      const found = list.find(item =>
        item.id_jenis_evaluasi == jenisEvaluasi &&
        item.nomor_urut == nomorUrut
      );

      if (found && found.id_komponen_evaluasi) {
        const result = {
          id_komponen_evaluasi: found.id_komponen_evaluasi,
          nama: found.nama || '',
          bobot: found.bobot_evaluasi || '0',
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup komponen evaluasi by urut gagal:', e);
    }
    return null;
  }

  async getRencanaEvaluasiByMatkul(kodeMk, namaEvaluasi) {
    const list = await this.api.getListRencanaEvaluasi({ kode_mata_kuliah: kodeMk }); // belum ada? tambahkan di api.js
    const arr = Array.isArray(list) ? list : (list?.data || []);
    return arr.find(e => e.kode_mata_kuliah === kodeMk && e.nama_evaluasi === namaEvaluasi);
  }

  async lookupRencanaPembelajaran(kodeMk, namaEvaluasi) {
    if (!kodeMk || !namaEvaluasi) return null;
    const key = `rencana_${kodeMk}_${namaEvaluasi}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const list = await this.api.getListRencanaPembelajaran({ kode_mata_kuliah: kodeMk });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(item => 
        (item.nama_evaluasi && item.nama_evaluasi === namaEvaluasi) ||
        (item.nama && item.nama === namaEvaluasi)
      );
      if (found && found.id_rencana_ajar) {
        const result = { id_rencana_ajar: found.id_rencana_ajar, _raw: found };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup rencana pembelajaran failed', e);
    }
    return null;
  }

  async lookupAktivitasMengajar(nuptk, idKelas) {
    if (!nuptk || !idKelas) return null;
    const key = `akt_${nuptk}_${idKelas}`;
    if (this.cache[key]) return this.cache[key];

    try {
      const list = await this.api.getDosenPengajarKelasKuliah({
        nuptk: nuptk.trim(),
        id_kelas_kuliah: idKelas
      });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_aktivitas_mengajar) {
        const result = {
          id_aktivitas_mengajar: found.id_aktivitas_mengajar,
          _raw: found
        };
        this.cache[key] = result;
        return result;
      }
    } catch (e) {
      console.warn('Lookup aktivitas mengajar gagal:', e);
    }
    return null;
  }

}