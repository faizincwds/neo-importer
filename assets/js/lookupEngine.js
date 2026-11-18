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
  async _getOrFetch(key, fetchFn) {
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
    this.cache[key] = result;
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
    const clean = String(kode).trim();
    const key = `prodi_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      if (DEBUG_API) console.log('GetProdi result:', arr);
      const found = arr.find(p => {
        const kodeProdi = String(p.kode_prodi || p.kode_program_studi || p.kd_prodi || '').trim();
        return kodeProdi === clean;
      });
      return found ? this._normalizeProdi(found) : null;
    });
  }

  async lookupProdiByName(nama) {
    if (!nama) return null;
    const clean = String(nama).trim().toLowerCase();
    const key = `prodi_name_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      const found = arr.find(p => {
        const namaProdi = String(p.nama_prodi || p.nama_program_studi || p.nama_resmi || p.prodi || '').trim().toLowerCase();
        return namaProdi === clean;
      });
      return found ? this._normalizeProdi(found) : null;
    });
  }

  // ✅ FIX: type-safe comparison
  async lookupProdiById(id) {
    if (!id) return null;
    const clean = String(id).trim();
    const key = `prodi_id_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getProdi();
      const arr = Array.isArray(list) ? list : (list?.data || list?.result || []);
      const found = arr.find(p => String(p.id_prodi || p.id || '').trim() === clean);
      return found ? this._normalizeProdi(found) : null;
    });
  }

  // ======================== DOSEN ========================
  // ✅ FIX: type-safe comparison
  async lookupDosenByNuptk(nuptk) {
    if (!nuptk) return null;
    const clean = String(nuptk).trim();
    const key = `dosen_nuptk_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(d => String(d.nuptk || '').trim() === clean);
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

  // ✅ FIX: type-safe comparison
  async lookupDosenByNidn(nidn) {
    if (!nidn) return null;
    const clean = String(nidn).trim();
    const key = `dosen_nidn_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(d => String(d.nidn || '').trim() === clean);
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
    const clean = String(nama).trim().toLowerCase();
    const key = `dosen_nama_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListDosen();
      const arr = Array.isArray(list) ? list : (list?.data || []);

      let found = arr.find(d => String(d.nama_dosen || '').toLowerCase() === clean);
      if (!found) {
        found = arr.find(d => String(d.nama_dosen || '').toLowerCase().includes(clean));
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
    const clean = String(nuptk).trim();
    const key = `penugasan_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListPenugasanDosen({ nuptk: clean });
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
        const list = await this.api.getSemester();
        const arr = Array.isArray(list) ? list : (list?.data || []);
        const found = arr.find(s => String(s.id_semester).trim() === clean);
        if (found) {
          return {
            id_semester: found.id_semester,
            nama_semester: found.nama_semester,
            _raw: found
          };
        }
        if (/^\d{4,5}$/.test(clean)) {
          if (DEBUG_API) console.warn(`[Semester] ${clean} tidak ada di list, fallback ke kode mentah`);
          return { id_semester: clean, _raw: {} };
        }
        return null;
      } catch (e) {
        console.warn('Lookup semester gagal:', e);
        return null;
      }
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
    const cleanNim = String(nim).trim();
    const key = `peserta_${cleanNim}_${idKelas}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListPesertaKelasKuliah({
        nim: cleanNim,
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
  // ✅ FIX: type-safe comparison
  async lookupMahasiswaByNim(nim) {
    if (!nim) return null;
    const clean = String(nim).trim();
    const key = `mhs_nim_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListMahasiswa();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const found = arr.find(m => String(m.nim || '').trim() === clean);
      if (found) {
        return { id_mahasiswa: found.id_mahasiswa, nama_mahasiswa: found.nama_mahasiswa };
      }
      return null;
    });
  }

  async lookupRegistrasiMahasiswa(nim) {
    if (!nim) return null;
    const clean = String(nim).trim();
    const key = `registrasi_mhs_${clean}`;
    return this._getOrFetch(key, async () => {
      try {
        const arr = await this._getOrFetch('__all_riwayat_pendidikan', async () => {
          const res = await this.api.call('GetListRiwayatPendidikanMahasiswa', {});
          const data = this.api.extractData(res);
          return Array.isArray(data) ? data : (data?.data || []);
        });

        if (!Array.isArray(arr)) return null;

        const found = arr.find(r => String(r.nim || '').trim() === clean);
        if (found && found.id_registrasi_mahasiswa) {
          return {
            id_registrasi_mahasiswa: found.id_registrasi_mahasiswa,
            id_mahasiswa: found.id_mahasiswa || '',
            nama_mahasiswa: found.nama_mahasiswa || '',
            nim: found.nim || clean,
            _raw: found
          };
        }
        return null;
      } catch (e) {
        console.warn('[Registrasi] gagal:', e);
        return null;
      }
    });
  }

  async lookupMahasiswaByNama(nama) {
    if (!nama) return null;
    const target = String(nama).trim().toLowerCase();
    const key = `mhs_nama_${target}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListMahasiswa();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      let found = arr.find(m => String(m.nama_mahasiswa || '').toLowerCase() === target);
      if (!found) found = arr.find(m => String(m.nama_mahasiswa || '').toLowerCase().includes(target));
      return found || null;
    });
  }

  async lookupMahasiswaByCriteria(row) {
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
    const clean = String(namaKecamatan).trim().toLowerCase();
    const key = `wilayah_${level}_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getWilayah(level);
      const arr = Array.isArray(list?.data) ? list.data : (Array.isArray(list) ? list : []);

      // ✅ FIX: type-safe comparison (string vs number)
      const found = arr.find(item =>
        String(item.id_level_wilayah) === String(level) &&
        String(item.nama_wilayah || '').toLowerCase() === clean
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
    const clean = String(nama).trim().toLowerCase();
    const key = `${method}_${clean}`;
    return this._getOrFetch(key, async () => {
      const arr = await this._getListCached(method);

      let found = arr.find(item => String(item[labelField] || '').toLowerCase() === clean);
      if (!found) {
        found = arr.find(item => {
          const itemName = String(item[labelField] || '').toLowerCase();
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
      if (!row.__errors) row.__errors = {};
      row.__errors[fieldNama] = `Gagal lookup "${nama}": ${e.message || 'error jaringan'}`;
    }
  }

  // ======================== EVALUASI ========================
  async lookupJenisEvaluasi(id) {
    const key = `jenis_eval_${id}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getJenisEvaluasi();
      const arr = Array.isArray(list) ? list : (list?.data || []);
      return arr.find(j => String(j.id_jenis_evaluasi) === String(id)) || null;
    });
  }

  // ✅ FIX: fetch sekali per kelas
  async _getKomponenByKelas(kelasId) {
    return this._getOrFetch(`komponen_list_${kelasId}`, async () => {
      const res = await this.api.getListKomponenEvaluasiKelas({ id_kelas_kuliah: kelasId });
      return Array.isArray(res) ? res : (res?.data || []);
    });
  }

  async lookupKomponenEvaluasi(kelasId, jenisEvaluasi, namaEvaluasi = null) {
    if (!kelasId || !jenisEvaluasi) return null;
    const list = await this._getKomponenByKelas(kelasId);

    let found;
    if (namaEvaluasi && namaEvaluasi.trim() !== '') {
      const target = String(namaEvaluasi).trim().toLowerCase();
      found = list.find(item =>
        String(item.id_jenis_evaluasi) === String(jenisEvaluasi) &&
        String(item.nama || '').toLowerCase() === target
      );
      if (!found) return null;
    } else {
      found = list.find(item => String(item.id_jenis_evaluasi) === String(jenisEvaluasi));
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
  }

  async lookupKomponenEvaluasiByIdUrut(kelasId, jenisEvaluasi, nomorUrut) {
    if (!kelasId || !jenisEvaluasi || !nomorUrut) return null;
    const list = await this._getKomponenByKelas(kelasId);
    const found = list.find(item =>
      String(item.id_jenis_evaluasi) === String(jenisEvaluasi) &&
      String(item.nomor_urut) === String(nomorUrut)
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
  }

  async getRencanaEvaluasiByMatkul(kodeMk, namaEvaluasi) {
    const list = await this.api.getListRencanaEvaluasi({ kode_mata_kuliah: kodeMk });
    const arr = Array.isArray(list) ? list : (list?.data || []);
    return arr.find(e =>
      String(e.kode_mata_kuliah || '').trim() === String(kodeMk).trim() &&
      String(e.nama_evaluasi || '').trim() === String(namaEvaluasi).trim()
    );
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
    const clean = String(nuptk).trim();
    const key = `akt_${clean}_${idKelas}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getDosenPengajarKelasKuliah({
        nuptk: clean,
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
    const cleanJudul = String(judul).trim();
    const key = `akt_${idProdi}_${idSemester}_${cleanJudul.toLowerCase()}`;
    return this._getOrFetch(key, async () => {
      // ✅ Pakai escape SQL (pastikan api._escSql ada)
      const safeJudul = this.api._escSql ? this.api._escSql(cleanJudul) : cleanJudul.replace(/'/g, "''");
      const res = await this.api.call('GetListAktivitasMahasiswa', {
        filter: `id_prodi = '${idProdi}' AND id_semester = '${idSemester}' AND judul LIKE '%${safeJudul}%'`,
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
    const clean = String(nim).trim();
    const key = `aktivitas_by_nim_${clean}`;
    return this._getOrFetch(key, async () => {
      const list = await this.api.getListAnggotaAktivitasMahasiswa({ nim: clean });
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