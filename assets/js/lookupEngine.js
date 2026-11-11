import { NeoFeederAPI} from './api.js';
import { API_BASE, STORAGE_KEYS, DEBUG_API, CACHE_PREFIX, CACHE_TTL } from './config.js';

export class LookupEngine {
  constructor(api) {
    this.api = api;
    this.cache = {};
  }

  // ============================================================
  // HELPER: in-flight deduplication
  // ============================================================
  /**
   * Ambil dari cache. Jika tidak ada, jalankan fetchFn() sekali,
   * simpan Promise ke cache agar pemanggil paralel berbagi hasil yang sama.
   */
  async _getOrFetch(key, fetchFn) {
    // Gunakan `key in` agar hasil `null` ikut ter-cache (kode invalid tidak di-refetch)
    if (this.cache[key] !== undefined) return this.cache[key];

    const promise = (async () => {
      try {
        return await fetchFn();
      } catch (e) {
        console.warn(`Lookup ${key} gagal:`, e);
        return null;
      }
    })();

    this.cache[key] = promise;
    const result = await promise;
    this.cache[key] = result;   // ← cache juga null, bukan delete
    return result;
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
    const id_prodi = data.id_prodi || '';
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
    return this._getOrFetch(key, async () => {
      const res = await this.api.getDetailMataKuliah(cleanKode);
      if (DEBUG_API) console.log('Lookup MK response:', res);
      if (res) return this._normalizeMK(res);
      return null;
    });
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
    return this._getOrFetch(key, async () => {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      if (DEBUG_API) console.log('GetProdi result:', arr);
      const found = arr.find(p => {
        const kodeProdi = (p.kode_prodi || p.kode_program_studi || p.kd_prodi || '').toString().trim();
        return kodeProdi === kode.toString().trim();
      });
      return found ? this._normalizeProdi(found) : null;
    });
  }

  async lookupProdiByName(nama) {
    if (!nama) return null;
    const key = `prodi_name_${nama}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      const found = arr.find(p => {
        const namaProdi = (p.nama_prodi || p.nama_program_studi || p.nama_resmi || p.prodi || '').trim().toLowerCase();
        return namaProdi === nama.trim().toLowerCase();
      });
      return found ? this._normalizeProdi(found) : null;
    });
  }

  async lookupProdiById(id) {
    if (!id) return null;
    const key = `prodi_id_${id}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      const found = arr.find(p => (p.id_prodi || p.id) === id);
      return found ? this._normalizeProdi(found) : null;
    });
  }

  // ======================== DOSEN ========================
  async lookupDosenByNuptk(nuptk) {
    if (!nuptk) return null;
    const key = `dosen_nuptk_${nuptk}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(d => d.nuptk === nuptk);
      if (found) {
        return {
          id_dosen: found.id_dosen,
          nama_dosen: found.nama_dosen,
          nuptk: found.nuptk,
          nidn: found.nidn,
          _raw: found
        };
      }
      return null;
    });
  }

  async lookupDosenByNidn(nidn) {
    if (!nidn) return null;
    const key = `dosen_nidn_${nidn}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(d => d.nidn === nidn);
      if (found) {
        return {
          id_dosen: found.id_dosen,
          nama_dosen: found.nama_dosen,
          nidn: found.nidn,
          nuptk: found.nuptk
        };
      }
      return null;
    });
  }

  async lookupDosenByNama(nama) {
    if (!nama) return null;
    const key = `dosen_nama_${nama.trim().toLowerCase()}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const target = nama.trim().toLowerCase();

      let found = arr.find(d => (d.nama_dosen || '').toLowerCase() === target);
      if (!found) {
        found = arr.find(d => (d.nama_dosen || '').toLowerCase().includes(target));
      }
      if (found) {
        return {
          id_dosen: found.id_dosen,
          nidn: found.nidn || '',
          nuptk: found.nuptk || '',
          nama_dosen: found.nama_dosen || ''
        };
      }
      return null;
    });
  }

  async lookupPenugasanDosen(nuptk) {
    if (!nuptk) return null;
    const key = `penugasan_${nuptk}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListPenugasanDosen({ nuptk: nuptk.trim() });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_registrasi_dosen) {
        return { id_registrasi_dosen: found.id_registrasi_dosen, _raw: found };
      }
      return null;
    });
  }

  // ======================== SEMESTER ========================
  async lookupSemester(kodePeriode) {
    if (!kodePeriode) return null;
    const clean = String(kodePeriode).trim();
    const key = `semester_${clean}`;
    return this._getOrFetch(key, async () => {
      try {
        const res = await this.api.call('GetSemester', { filter: `a_periode_aktif='1'` });
        const list = this.api.extractData(res) || [];
        const found = list.find(s => s.id_semester == clean);
        if (found) {
          return { id_semester: found.id_semester, _raw: found };
        }
      } catch (e) {
        console.warn('Lookup semester gagal, gunakan kodePeriode sebagai fallback', e);
      }
      // Fallback: kembalikan kodePeriode apa adanya
      return { id_semester: clean, _raw: {} };
    });
  }

  // ======================== KELAS KULIAH ========================
  async lookupDetailKelasKuliah(kodeMk, namaKelas, idSemester) {
    if (!kodeMk || !namaKelas || !idSemester) {
      if (DEBUG_API) console.warn('lookupDetailKelasKuliah: parameter tidak lengkap', { kodeMk, namaKelas, idSemester });
      return null;
    }
    const cleanKode = String(kodeMk).trim();
    const cleanNama = String(namaKelas).trim();
    const cleanSem = String(idSemester).trim();
    const key = `kelas_${cleanSem}_${cleanKode}_${cleanNama}`;

    return this._getOrFetch(key, async () => {
      const res = await this.api.getDetailKelasKuliah({
        id_semester: cleanSem,
        kode_mata_kuliah: cleanKode,
        nama_kelas_kuliah: cleanNama
      });
      const data = Array.isArray(res) ? res[0] : res;
      if (DEBUG_API) console.log('Lookup kelas (dengan kode MK):', data);

      if (data && data.id_kelas_kuliah) {
        return { id_kelas_kuliah: data.id_kelas_kuliah, _raw: data };
      }
      if (DEBUG_API) console.warn(`Kelas tidak ditemukan: ${cleanKode} / ${cleanNama} / ${cleanSem}`);
      return null;
    });
  }

  async lookupPesertaKelas(nim, idKelas) {
    if (!nim || !idKelas) return null;
    const key = `peserta_${nim}_${idKelas}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListPesertaKelasKuliah({
        nim: nim.trim(),
        id_kelas_kuliah: idKelas
      });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_registrasi_mahasiswa) {
        return {
          id_registrasi_mahasiswa: found.id_registrasi_mahasiswa,
          nama_mahasiswa: found.nama_mahasiswa || '',
          _raw: found
        };
      }
      return null;
    });
  }

  // ======================== MAHASISWA ========================
  async lookupMahasiswaByNim(nim) {
    if (!nim) return null;
    const key = `mhs_nim_${nim}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListMahasiswa();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(m => m.nim === nim);
      if (found) {
        return { id_mahasiswa: found.id_mahasiswa, nama_mahasiswa: found.nama_mahasiswa };
      }
      return null;
    });
  }

  async lookupRegistrasiMahasiswa(nim) {
    if (!nim) return null;
    const key = `registrasi_mhs_${nim}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListRiwayatPendidikanMahasiswa({ nim: nim.trim() });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_registrasi_mahasiswa) {
        return {
          id_registrasi_mahasiswa: found.id_registrasi_mahasiswa,
          id_mahasiswa: found.id_mahasiswa || '',
          nama_mahasiswa: found.nama_mahasiswa || '',
          nim: found.nim || nim,
          _raw: found
        };
      }
      return null;
    });
  }

  async lookupMahasiswaByNama(nama) {
    if (!nama) return null;
    const target = nama.trim().toLowerCase();
    const key = `mhs_nama_${target}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListMahasiswa();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      let found = arr.find(m => (m.nama_mahasiswa || '').toLowerCase() === target);
      if (!found) found = arr.find(m => (m.nama_mahasiswa || '').toLowerCase().includes(target));
      return found || null;
    });
  }

  async lookupMahasiswaByCriteria(row) {
    // Cache key unik per kombinasi kriteria
    const cacheKey = `mhs_criteria_${row.nik || ''}_${row.email || ''}_${row.nama || ''}`;
    return this._getOrFetch(cacheKey, async () => {
      const candidates = [
        { key: 'nik', value: row.nik },
        { key: 'email', value: row.email },
      ];

      let found = null;
      for (const candidate of candidates) {
        if (candidate.value && String(candidate.value).trim() !== '') {
          found = await this.api.cariMahasiswa({ [candidate.key]: candidate.value });
          if (found && Array.isArray(found) && found.length > 0) return found[0];
          if (found && !Array.isArray(found)) return found;
        }
      }

      if (row.nama && String(row.nama).trim() !== '') {
        found = await this.api.cariMahasiswa({ nama: row.nama.trim() });
        if (found && Array.isArray(found) && found.length > 0) return found[0];
        if (found && !Array.isArray(found)) return found;
      }
      return null;
    });
  }

  // ======================== WILAYAH & REFERENSI ========================
  async lookupWilayah(namaKecamatan, level = 3) {
    if (!namaKecamatan) return null;
    const clean = namaKecamatan.trim().toLowerCase();
    const key = `wilayah_${level}_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getWilayah(level);   // ← pakai cache api.js
      const arr = Array.isArray(list?.data) ? list.data : (Array.isArray(list) ? list : []);

      const found = arr.find(item =>
        item.id_level_wilayah === level &&
        (item.nama_wilayah || '').toLowerCase() === clean
      );
      return found || null;
    });
  }

  async _getListCached(method) {
    const cacheKey = `__list_${method}`;
    return this._getOrFetch(cacheKey, async () => {
      const res = await this.api.call(method);
      const arr = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      return arr;
    });
  }

  async lookupByNama(method, nama, labelField) {
    if (!nama) return null;
    const clean = nama.trim().toLowerCase();
    const key = `${method}_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this._getListCached(method);
      const arr = Array.isArray(list?.data) ? list.data : (Array.isArray(list) ? list : []);

      let found = arr.find(item => (item[labelField] || '').toLowerCase() === clean);
      if (!found) {
        found = arr.find(item => {
          const itemName = (item[labelField] || '').toLowerCase();
          return itemName.includes(clean) || clean.includes(itemName);
        });
      }
      return found || null;
    });
  }

  async lookupReferensi(fieldNama, fieldId, method, labelField, idProperty, row) {
    const nama = row[fieldNama];
    const id = row[fieldId];

    if (!nama || String(nama).trim() === '') return;
    if (id && String(id).trim() !== '') return;

    if (/^\d+$/.test(String(nama).trim())) {
      row[fieldId] = nama;
      row[fieldNama] = '';
      return;
    }

    try {
      const ref = await this.lookupByNama(method, String(nama).trim(), labelField);
      if (ref) {
        const idValue = ref[idProperty];
        if (idValue !== undefined && idValue !== null) {
          row[fieldId] = idValue;
          row[fieldNama] = ref[labelField] || nama;
        } else {
          if (!row.__errors) row.__errors = {};
          row.__errors[fieldNama] = `ID untuk ${nama} tidak ditemukan di struktur data`;
        }
      } else {
        if (!row.__errors) row.__errors = {};
        row.__errors[fieldNama] = `Referensi "${nama}" tidak ditemukan`;
      }
    } catch (e) {
      console.warn(`Lookup referensi ${method} gagal:`, e);
    }
  }

  // ======================== EVALUASI ========================
  async lookupJenisEvaluasi(id) {
    const key = `jenis_eval_${id}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getJenisEvaluasi();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      return arr.find(j => j.id_jenis_evaluasi == id) || null;
    });
  }

  async lookupKomponenEvaluasi(kelasId, jenisEvaluasi, namaEvaluasi = null) {
    if (!kelasId || !jenisEvaluasi) return null;
    const key = `komponen_${kelasId}_${jenisEvaluasi}_${namaEvaluasi || ''}`;
    return this._getOrFetch(key, async () => {
      const res = await this.api.getListKomponenEvaluasiKelas({ id_kelas_kuliah: kelasId });
      const list = Array.isArray(res) ? res : (res?.data || []);

      let found;
      if (namaEvaluasi && namaEvaluasi.trim() !== '') {
        const target = namaEvaluasi.trim().toLowerCase();
        found = list.find(item =>
          item.id_jenis_evaluasi == jenisEvaluasi &&
          (item.nama || '').toLowerCase() === target
        );
        if (!found) return null;
      } else {
        found = list.find(item => item.id_jenis_evaluasi == jenisEvaluasi);
      }

      if (found) {
        return {
          id_komponen_evaluasi: found.id_komponen_evaluasi,
          nama_evaluasi: found.nama || '',
          nama_inggris: found.nama_inggris || '',
          nomor_urut: found.nomor_urut,
          bobot_evaluasi: found.bobot_evaluasi,
          _raw: found
        };
      }
      return null;
    });
  }

  async lookupKomponenEvaluasiByIdUrut(kelasId, jenisEvaluasi, nomorUrut) {
    if (!kelasId || !jenisEvaluasi || !nomorUrut) return null;
    const key = `komponen_${kelasId}_${jenisEvaluasi}_${nomorUrut}`;
    return this._getOrFetch(key, async () => {
      const res = await this.api.getListKomponenEvaluasiKelas({ id_kelas_kuliah: kelasId });
      const list = Array.isArray(res) ? res : (res?.data || []);
      const found = list.find(item =>
        item.id_jenis_evaluasi == jenisEvaluasi &&
        item.nomor_urut == nomorUrut
      );
      if (found && found.id_komponen_evaluasi) {
        return {
          id_komponen_evaluasi: found.id_komponen_evaluasi,
          nama: found.nama || '',
          bobot: found.bobot_evaluasi || '0',
          _raw: found
        };
      }
      return null;
    });
  }

  async getRencanaEvaluasiByMatkul(kodeMk, namaEvaluasi) {
    const list = await this.api.getListRencanaEvaluasi({ kode_mata_kuliah: kodeMk });
    const arr = Array.isArray(list) ? list : (list?.data || []);
    return arr.find(e => e.kode_mata_kuliah === kodeMk && e.nama_evaluasi === namaEvaluasi);
  }

  async lookupRencanaPembelajaran(kodeMk, namaEvaluasi) {
    if (!kodeMk || !namaEvaluasi) return null;
    const key = `rencana_${kodeMk}_${namaEvaluasi}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListRencanaPembelajaran({ kode_mata_kuliah: kodeMk });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(item =>
        (item.nama_evaluasi && item.nama_evaluasi === namaEvaluasi) ||
        (item.nama && item.nama === namaEvaluasi)
      );
      if (found && found.id_rencana_ajar) {
        return { id_rencana_ajar: found.id_rencana_ajar, _raw: found };
      }
      return null;
    });
  }

  async lookupAktivitasMengajar(nuptk, idKelas) {
    if (!nuptk || !idKelas) return null;
    const key = `akt_${nuptk}_${idKelas}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getDosenPengajarKelasKuliah({
        nuptk: nuptk.trim(),
        id_kelas_kuliah: idKelas
      });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_aktivitas_mengajar) {
        return { id_aktivitas_mengajar: found.id_aktivitas_mengajar, _raw: found };
      }
      return null;
    });
  }

  // ======================== AKTIVITAS MAHASISWA ========================
  async lookupAktivitas(judul, idProdi, idSemester) {
    if (!judul || !idProdi || !idSemester) return null;
    const key = `akt_${idProdi}_${idSemester}_${judul.trim().toLowerCase()}`;
    return this._getOrFetch(key, async () => {
      const res = await this.api.call('GetListAktivitasMahasiswa', {
        filter: `id_prodi = '${idProdi}' AND id_semester = '${idSemester}' AND judul LIKE '%${judul}%'`,
        limit: 1
      });
      const data = this.api.extractData(res);
      const found = Array.isArray(data) ? data[0] : data;
      if (DEBUG_API) console.log('Lookup AK response:', data);
      return found || null;
    });
  }

  async lookupAktivitasById(idAktivitas) {
    if (!idAktivitas) return null;
    const key = `aktivitas_id_${idAktivitas}`;
    return this._getOrFetch(key, async () => {
      const res = await this.api.call('GetListAktivitasMahasiswa', {
        filter: `id_aktivitas = '${idAktivitas}'`,
        limit: 1
      });
      const data = this.api.extractData(res);
      const found = Array.isArray(data) ? data[0] : data;
      return found || null;
    });
  }

  async lookupAktivitasByNim(nim) {
    if (!nim) return null;
    const key = `aktivitas_by_nim_${nim}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListAnggotaAktivitasMahasiswa({ nim: nim.trim() });
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr[0];
      if (found && found.id_aktivitas) {
        return {
          id_aktivitas: found.id_aktivitas,
          judul: found.judul || '',
          nama_mahasiswa: found.nama_mahasiswa || '',
          id_registrasi_mahasiswa: found.id_registrasi_mahasiswa || '',
          jenis_peran: found.jenis_peran || '',
        };
      }
      return null;
    });
  }
}