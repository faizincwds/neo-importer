import { autoMapHeaders } from './mappingEngine.js';
import { LookupEngine } from './lookupEngine.js';
import { Validator } from './validator.js';
import { NeoFeederAPI } from './api.js';
import { GridEditor } from './gridEditor.js';
import { ImportProcess } from './importProcess.js';
import { sanitizeText, showToast } from './utils.js';
import { loggerInst } from './loggerView.js';

const METHOD_GROUPS = {
  'Kelas Kuliah (KRS)': [
    { value: 'InsertKelasKuliah', label: '[Add] Kelas Perkuliahan' },
    { value: 'InsertDosenPengajarKelasKuliah', label: '[Add] Dosen Pengajar Kelas' },
    { value: 'InsertPesertaKelasKuliah', label: '[Add] Peserta Kelas' },
    { value: 'InsertKomponenEvaluasiKelas', label: '[Add] Komponen Evaluasi Kelas' },
  ],
  'Nilai Perkuliahan Kelas (KHS)': [
    { value: 'UpdateNilaiLengkap', label: '[Add] Nilai & Komponen Perkuliahan Kelas' },
  ],
  //proses
  'Data Mahasiswa': [
    { value: 'InsertBiodataMahasiswa', label: '[Add] Biodata Mahasiswa' },
    { value: 'InsertRiwayatPendidikanMahasiswa', label: '[Add] Riwayat Pendidikan Mahasiswa' },
    { value: 'UpdateRiwayatPendidikanMahasiswa', label: '[Update] Riwayat Pendidikan Mahasiswa' },
    { value: 'InsertPerubahanRiwayatPendidikan', label: '[Add] Perubahan Riwayat Pendidikan' },
    { value: 'UpdatePerubahanRiwayatPendidikan', label: '[Update] Perubahan Riwayat Pendidikan' },
  ],

  // BELUM dalam perkembangan
  // 'Nilai Transfer': [
  //   { value: 'InsertNilaiTransferPendidikanMahasiswa', label: '[Add] Nilai Transfer Mahasiswa' },
  //   { value: 'UpdateNilaiTransferPendidikanMahasiswa', label: '[Update] Nilai Transfer Mahasiswa' },
  // ],
  // 'Akademik Mahasiswa': [
  //   { value: 'InsertTranskripMahasiswa', label: '[Add] Transkrip Mahasiswa' },
  //   { value: 'InsertMahasiswaLulusDO', label: '[Add] Mahasiswa Lulus/DO' },
  //   { value: 'UpdateMahasiswaLulusDO', label: '[Update] Mahasiswa Lulus/DO' },
  // ],
  // 'Dosen': [
  //   { value: 'InsertDosenPembimbing', label: '[Add] Dosen Pembimbing' },
  //   { value: 'DeleteDosenPembimbing', label: '[Delete] Dosen Pembimbing' },
  // ],
  // 'Mata Kuliah': [
  //   { value: 'InsertMataKuliah', label: '[Add] Mata Kuliah' },
  //   { value: 'UpdateMataKuliah', label: '[Update] Mata Kuliah' },
  //   { value: 'DeleteMataKuliah', label: '[Delete] Mata Kuliah' },
  // ],
  // 'Rencana Pembelajaran': [
  //   { value: 'InsertRencanaPembelajaran', label: '[Add] Rencana Pembelajaran' },
  //   { value: 'UpdateRencanaPembelajaran', label: '[Update] Rencana Pembelajaran' },
  //   { value: 'InsertRencanaEvaluasi', label: '[Add] Rencana Pembelajaran' },
  //   { value: 'UpdateRencanaEvaluasi', label: '[Update] Rencana Evaluasi' },
  // ],
  // 'Kurikulum': [
  //   { value: 'InsertKurikulum', label: '[Add] Kurikulum' },
  //   { value: 'UpdateKurikulum', label: '[Update] Kurikulum' },
  //   { value: 'DeleteKurikulum', label: '[Delete] Kurikulum' },
  //   { value: 'InsertMatkulKurikulum', label: '[Add] Mata Kuliah Kurikulum' },
  //   { value: 'DeleteMatkulKurikulum', label: '[Delete] Mata Kuliah Kurikulum' },
  // ],
  // 'Aktivitas Mahasiswa (Penelitian/Skripsi)': [
  //   { value: 'InsertAktivitasMahasiswa', label: '[Add] Aktivitas Mahasiswa' },
  //   { value: 'UpdateAktivitasMahasiswa', label: '[Update] Aktivitas Mahasiswa' },
  //   { value: 'DeleteAktivitasMahasiswa', label: '[Delete] Aktivitas Mahasiswa' },
  //   { value: 'InsertAnggotaAktivitasMahasiswa', label: '[Add] Anggota Aktivitas Mahasiswa' },
  //   { value: 'DeleteAnggotaAktivitasMahasiswa', label: '[Delete] Anggota Aktivitas Mahasiswa' },
  //   { value: 'InsertBimbingMahasiswa', label: '[Add] Pembimbing Mahasiswa' },
  //   { value: 'UpdateBimbingMahasiswa', label: '[Update] Pembimbing Mahasiswa' },
  //   { value: 'DeleteBimbingMahasiswa', label: '[Delete] Pembimbing Mahasiswa' },
  //   { value: 'InsertUjiMahasiswa', label: '[Add] Penguji Mahasiswa' },
  //   { value: 'UpdateUjiMahasiswa', label: '[Update] Penguji Mahasiswa' },
  //   { value: 'DeleteUjiMahasiswa', label: '[Delete] Penguji Mahasiswa' },
  // ],
  // 'Prestasi Mahasiswa': [
  //   { value: 'InsertPrestasiMahasiswa', label: '[Add] Prestasi Mahasiswa' },
  //   { value: 'UpdatePrestasiMahasiswa', label: '[Update] Prestasi Mahasiswa' },
  //   { value: 'DeletePrestasiMahasiswa', label: '[Delete] Prestasi Mahasiswa' },
  // ],

  // 'Opsi Lainnya': [
  //   { value: 'UpdateKomponenEvaluasiKelas', label: '[Add] Kelas' },
  //   { value: 'UpdateKomponenEvaluasiKelas', label: '[Update] Kelas' },
  //   { value: 'UpdateKomponenEvaluasiKelas', label: '[Delete] Kelas' },
  // ],
};

const TEMPLATE_FILES = {
  InsertKelasKuliah               : '1_insert_kelas.xlsx',
  InsertDosenPengajarKelasKuliah  : '2_insert_dosen_ajar_kelas.xlsx',
  InsertPesertaKelasKuliah        : '3_insert_peserta_kelas_kuliah.xlsx',
  InsertKomponenEvaluasiKelas     : '4_insert_komponen_evaluasi_kelas.xlsx',
  UpdateNilaiLengkap              : '5_insert_input_nilai_perkuliahan_kelas.xlsx',
};

const METHOD_CONFIG = {

  InsertBiodataMahasiswa: {
    targetFields: [
      'nama', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin',
      'nik', 'agama_nama', 'agama',
      'nisn', 'npwp',
      'kewarganegaraan',
      'jalan', 'rt', 'rw', 'dusun', 'kelurahan', 'kecamatan_nama', 'kode_pos',
      'jenis_tinggal_nama', 'jenis_tinggal',
      'alat_transportasi_nama', 'alat_transportasi',
      'telepon', 'handphone', 'email',
      'penerima_kps', 'nomor_kps',
      'nik_ayah', 'nama_ayah', 'tanggal_lahir_ayah',
      'pendidikan_ayah_nama', 'pendidikan_ayah',
      'pekerjaan_ayah_nama', 'pekerjaan_ayah',
      'penghasilan_ayah_nama', 'penghasilan_ayah',
      'nik_ibu', 'nama_ibu', 'tanggal_lahir_ibu',
      'pendidikan_ibu_nama', 'pendidikan_ibu',
      'pekerjaan_ibu_nama', 'pekerjaan_ibu',
      'penghasilan_ibu_nama', 'penghasilan_ibu',
      'nama_wali', 'tanggal_lahir_wali',
      'pendidikan_wali_nama', 'pendidikan_wali',
      'pekerjaan_wali_nama', 'pekerjaan_wali',
      'penghasilan_wali_nama', 'penghasilan_wali',
      'id_kebutuhan_khusus_mahasiswa_nama', 'id_kebutuhan_khusus_mahasiswa',
      'id_kebutuhan_khusus_ayah_nama', 'id_kebutuhan_khusus_ayah',
      'id_kebutuhan_khusus_ibu_nama', 'id_kebutuhan_khusus_ibu',
    ],
    requiredFields: [
      'nama', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin',
      'nik', 'agama', 'kewarganegaraan',
      'kelurahan',
      'penerima_kps',
      'nama_ibu',
      'id_kebutuhan_khusus_mahasiswa', 'id_kebutuhan_khusus_ayah', 'id_kebutuhan_khusus_ibu'
    ],
    transformFn: function(row) {
      //  Buang field _nama dan _display
      const cleanRow = {};
      for (const key of Object.keys(row)) {
        if (!key.endsWith('_nama') && key !== '_display') {
          cleanRow[key] = row[key];
        }
      }
      // Lanjutkan transformasi menggunakan cleanRow...
      const r = cleanRow;
      return {
        nama_mahasiswa: sanitizeText(r.nama || ''),
        jenis_kelamin: String(r.jenis_kelamin || '').charAt(0).toUpperCase(),
        tempat_lahir: sanitizeText(r.tempat_lahir || ''),
        tanggal_lahir: r.tanggal_lahir ? String(r.tanggal_lahir).trim() : '',
        id_agama: parseInt(r.agama) || 1,
        nik: String(r.nik || '').trim(),
        nisn: String(r.nisn || '').trim(),
        npwp: String(r.npwp || '').trim(),
        kewarganegaraan: String(r.kewarganegaraan || 'ID').trim(),
        jalan: sanitizeText(r.jalan || ''),
        dusun: sanitizeText(r.dusun || ''),
        rt: parseInt(r.rt) || 0,
        rw: parseInt(r.rw) || 0,
        kelurahan: sanitizeText(r.kelurahan || ''),
        kode_pos: String(r.kode_pos || '').trim(),
        id_wilayah: r.__id_wilayah || '',
        id_jenis_tinggal: parseInt(r.jenis_tinggal) || 1,
        id_alat_transportasi: parseInt(r.alat_transportasi) || 1,
        telepon: String(r.telepon || '').trim(),
        handphone: String(r.handphone || '').trim(),
        email: String(r.email || '').trim(),
        penerima_kps: r.penerima_kps === '1' ? 1 : 0,
        nomor_kps: String(r.nomor_kps || '').trim(),
        nik_ayah: String(r.nik_ayah || '').trim(),
        nama_ayah: sanitizeText(r.nama_ayah || ''),
        tanggal_lahir_ayah: r.tanggal_lahir_ayah ? String(r.tanggal_lahir_ayah).trim() : '',
        id_pendidikan_ayah: parseInt(r.pendidikan_ayah) || 0,
        id_pekerjaan_ayah: parseInt(r.pekerjaan_ayah) || 0,
        id_penghasilan_ayah: parseInt(r.penghasilan_ayah) || 0,
        nik_ibu: String(r.nik_ibu || '').trim(),
        nama_ibu_kandung: sanitizeText(r.nama_ibu || ''),
        tanggal_lahir_ibu: r.tanggal_lahir_ibu ? String(r.tanggal_lahir_ibu).trim() : '',
        id_pendidikan_ibu: parseInt(r.pendidikan_ibu) || 0,
        id_pekerjaan_ibu: parseInt(r.pekerjaan_ibu) || 0,
        id_penghasilan_ibu: parseInt(r.penghasilan_ibu) || 0,
        nama_wali: sanitizeText(r.nama_wali || ''),
        tanggal_lahir_wali: r.tanggal_lahir_wali ? String(r.tanggal_lahir_wali).trim() : '',
        id_pendidikan_wali: parseInt(r.pendidikan_wali) || 0,
        id_pekerjaan_wali: parseInt(r.pekerjaan_wali) || 0,
        id_penghasilan_wali: parseInt(r.penghasilan_wali) || 0,
        id_kebutuhan_khusus_mahasiswa: parseInt(r.id_kebutuhan_khusus_mahasiswa) || 0,
        id_kebutuhan_khusus_ayah: parseInt(r.id_kebutuhan_khusus_ayah) || 0,
        id_kebutuhan_khusus_ibu: parseInt(r.id_kebutuhan_khusus_ibu) || 0,
        _display: {
          nama: r.nama,
          nim: r.nim || '(belum ada)',
          prodi: r.kode_prodi || ''
        }
      };
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      const refLookups = [
        ['agama_nama', 'agama', 'GetAgama', 'nama_agama', 'id_agama'],
        ['jenis_tinggal_nama', 'jenis_tinggal', 'GetJenisTinggal', 'nama_jenis_tinggal', 'id_jenis_tinggal'],
        ['alat_transportasi_nama', 'alat_transportasi', 'GetAlatTransportasi', 'nama_alat_transportasi', 'id_alat_transportasi'],
        ['kecamatan_nama', 'id_wilayah', 'GetWilayah', 'nama_wilayah', 'id_wilayah'],
        ['pendidikan_ayah_nama', 'pendidikan_ayah', 'GetJenjangPendidikan', 'nama_jenjang_pendidikan', 'id_jenjang_pendidikan'],
        ['pendidikan_ibu_nama', 'pendidikan_ibu', 'GetJenjangPendidikan', 'nama_jenjang_pendidikan', 'id_jenjang_pendidikan'],
        ['pendidikan_wali_nama', 'pendidikan_wali', 'GetJenjangPendidikan', 'nama_jenjang_pendidikan', 'id_jenjang_pendidikan'],
        ['pekerjaan_ayah_nama', 'pekerjaan_ayah', 'GetPekerjaan', 'nama_pekerjaan', 'id_pekerjaan'],
        ['pekerjaan_ibu_nama', 'pekerjaan_ibu', 'GetPekerjaan', 'nama_pekerjaan', 'id_pekerjaan'],
        ['pekerjaan_wali_nama', 'pekerjaan_wali', 'GetPekerjaan', 'nama_pekerjaan', 'id_pekerjaan'],
        ['penghasilan_ayah_nama', 'penghasilan_ayah', 'GetPenghasilan', 'nama_penghasilan', 'id_penghasilan'],
        ['penghasilan_ibu_nama', 'penghasilan_ibu', 'GetPenghasilan', 'nama_penghasilan', 'id_penghasilan'],
        ['penghasilan_wali_nama', 'penghasilan_wali', 'GetPenghasilan', 'nama_penghasilan', 'id_penghasilan'],
        ['id_kebutuhan_khusus_mahasiswa_nama', 'id_kebutuhan_khusus_mahasiswa', 'GetKebutuhanKhusus', 'nama_kebutuhan_khusus', 'id_kebutuhan_khusus'],
        ['id_kebutuhan_khusus_ayah_nama', 'id_kebutuhan_khusus_ayah', 'GetKebutuhanKhusus', 'nama_kebutuhan_khusus', 'id_kebutuhan_khusus'],
        ['id_kebutuhan_khusus_ibu_nama', 'id_kebutuhan_khusus_ibu', 'GetKebutuhanKhusus', 'nama_kebutuhan_khusus', 'id_kebutuhan_khusus'],
      ];

      for (const args of refLookups) {
        await lookupEngine.lookupReferensi(...args, row);
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  InsertRiwayatPendidikanMahasiswa: {
    targetFields: [
      'nim', 'nama',
      'id_jenis_daftar', 'id_jalur_daftar',
      'id_periode_masuk', 'tanggal_daftar',
      'kode_prodi', 'nama_prodi',
      'id_bidang_minat',
      'sks_diakui',
      'id_pembiayaan', 'biaya_masuk',
    ],
    requiredFields: [
      'nim', 'id_jenis_daftar', 'id_periode_masuk', 'tanggal_daftar',
      'kode_prodi', 'id_pembiayaan', 'biaya_masuk'
    ],
    transformFn: function(row) {
      return {
        id_mahasiswa: row.__id_mahasiswa || '',
        nim: String(row.nim || '').trim(),
        id_jenis_daftar: parseInt(row.id_jenis_daftar) || 1,
        id_jalur_daftar: parseInt(row.id_jalur_daftar) || 1,
        id_periode_masuk: row.__id_semester || '',
        tanggal_daftar: row.tanggal_daftar ? String(row.tanggal_daftar).trim() : '',
        id_perguruan_tinggi: row.__id_perguruan_tinggi || '',
        id_prodi: row.__id_prodi || '',
        id_bidang_minat: null,
        sks_diakui: parseInt(row.sks_diakui) || 0,
        id_perguruan_tinggi_asal: null,
        id_prodi_asal: null,
        id_pembiayaan: parseInt(row.id_pembiayaan) || 1,
        biaya_masuk: parseFloat(row.biaya_masuk) || 0,
        _display: {
          nim: row.nim,
          nama: row.nama_mahasiswa || row.nama
        }
      };
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      // Lookup mahasiswa by NIM → id_mahasiswa
      if (row.nim) {
        const mhs = await lookupEngine.lookupMahasiswaByNim(String(row.nim).trim());
        if (mhs) {
          row.__id_mahasiswa = mhs.id_mahasiswa;
          row.nama_mahasiswa = mhs.nama_mahasiswa || row.nama;
        } else {
          row.__errors.nim = 'Mahasiswa dengan NIM tersebut tidak ditemukan';
        }
      } else {
        row.__errors.nim = 'NIM harus diisi';
      }

      // Lookup prodi
      if (row.kode_prodi) {
        const prodi = await lookupEngine.lookupProdi(String(row.kode_prodi).trim());
        if (prodi) {
          row.__id_prodi = prodi.id_prodi;
          row.nama_prodi = prodi.nama_prodi || row.nama_prodi;
        } else {
          row.__errors.kode_prodi = 'Prodi tidak ditemukan';
        }
      }

      // Lookup semester
      if (row.id_periode_masuk) {
        const sem = await lookupEngine.lookupSemester(String(row.id_periode_masuk).trim());
        row.__id_semester = sem?.id_semester || row.id_periode_masuk;
      }

      // ID PT dari profil
      try {
        const profil = await lookupEngine.api.getProfilPT();
        if (profil && profil.id_perguruan_tinggi) {
          row.__id_perguruan_tinggi = profil.id_perguruan_tinggi;
        }
      } catch (e) {}

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  InsertKelasKuliah: {
    targetFields: [
      'periode',
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'kode_prodi', 'nama_prodi',
      'nama_kelas', 'bahasan',
      'tanggal_mulai_efektif', 'tanggal_akhir_efektif',
      'lingkup', 'mode_kuliah',
    ],
    requiredFields: ['kode_mata_kuliah', 'kode_prodi', 'periode', 'nama_kelas', 'tanggal_mulai_efektif','tanggal_akhir_efektif','lingkup','mode_kuliah'],
    transformFn: function(row) {
      const id_prodi = row.__id_prodi || '';
      const id_semester = String(row.__id_semester || row.periode).trim();
      const id_matkul = row.__id_matkul || '';

      const bahasan = sanitizeText(row.bahasan || '');
      let tgl_mulai = row.tanggal_mulai_efektif ? String(row.tanggal_mulai_efektif).trim() : '';
      let tgl_akhir = row.tanggal_akhir_efektif ? String(row.tanggal_akhir_efektif).trim() : '';
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(tgl_mulai)) tgl_mulai = '';
      if (tgl_akhir && !dateRegex.test(tgl_akhir)) tgl_akhir = '';

      const lingkup = parseInt(row.lingkup) || 1;
      const mode = ['O','F','M'].includes(String(row.mode_kuliah).toUpperCase())
        ? String(row.mode_kuliah).toUpperCase() : 'M';

      return {
        id_prodi, id_semester, id_matkul,
        nama_kelas_kuliah: row.nama_kelas, 
        bahasan,
        tanggal_mulai_efektif: tgl_mulai || null,
        tanggal_akhir_efektif: tgl_akhir || null,
        lingkup, 
        mode,
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_mata_kuliah: row.nama_mata_kuliah,
          kelas: row.nama_kelas,
          bahasan: bahasan
        }
      };
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      // 1. Semester
      if (row.periode) {
        const kodePeriode = String(row.periode).trim();
        if (kodePeriode) {
          const sem = await lookupEngine.lookupSemester(kodePeriode);
          row.__id_semester = sem ? sem.id_semester : kodePeriode;
        }
      }

      // 2. Mata Kuliah
      if (row.kode_mata_kuliah) {
        const kodeMk = String(row.kode_mata_kuliah).trim();
        if (kodeMk) {
          try {
            const mk = await lookupEngine.lookupMataKuliah(kodeMk);
            if (mk) {
              row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
              row.__id_matkul = mk._raw?.id_matkul || mk._raw?.id_mata_kuliah || mk._raw?.id || '';
              if (!row.__id_matkul) row.__id_matkul = kodeMk;
              if (mk.nama_prodi) row.nama_prodi = mk.nama_prodi;

              const idProdiFromMK = mk.id_prodi || mk._raw?.id_prodi;
              if (idProdiFromMK) {
                row.__id_prodi = idProdiFromMK;
                const prodiById = await lookupEngine.lookupProdiById(idProdiFromMK);
                if (prodiById) {
                  row.kode_prodi = prodiById.kode_prodi;
                  row.nama_prodi = prodiById.nama_prodi || row.nama_prodi;
                }
              }
            } else {
              row.__errors.kode_mata_kuliah = 'Mata kuliah tidak ditemukan';
            }
          } catch (err) { console.warn(`Lookup MK ${kodeMk} gagal:`, err); }
        }
      }

      // 3. Prodi
      if (row.kode_prodi || row.nama_prodi) {
        try {
          let prodi = null;
          if (row.kode_prodi && row.kode_prodi.length < 36) {
            prodi = await lookupEngine.lookupProdi(row.kode_prodi);
          } else if (row.nama_prodi) {
            prodi = await lookupEngine.lookupProdiByName(row.nama_prodi);
          }
          if (prodi) {
            row.nama_prodi = prodi.nama_prodi || row.nama_prodi;
            row.kode_prodi = prodi.kode_prodi || row.kode_prodi;
            row.__id_prodi = prodi.id_prodi || prodi._raw?.id_prodi || '';
          } else {
            row.__errors.kode_prodi = 'Prodi tidak ditemukan';
          }
        } catch (err) { console.warn('Lookup prodi gagal:', err); }
      }

      if (!row.__id_matkul || row.__id_matkul.length < 10) row.__errors.kode_mata_kuliah = 'UUID mata kuliah tidak valid';
      if (!row.__id_prodi || row.__id_prodi.length < 10) row.__errors.kode_prodi = 'UUID prodi tidak valid';
      if (!row.__id_semester) row.__errors.periode = 'ID periode tidak valid';

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  InsertDosenPengajarKelasKuliah: {
    targetFields: [
      'periode',
      'kode_mata_kuliah', 'nama_mata_kuliah', 'nama_prodi',
      'nuptk','nama_dosen',
      'nama_kelas',
      'tatap_muka',
      'tatap_muka_realisasi',
      'sks_ajar',
      'jenis_evaluasi',
    ],
    requiredFields: ['periode', 'nuptk', 'kode_mata_kuliah', 'nama_kelas', 'tatap_muka'],
    transformFn: function(row) {
      const id_semester = String(row.__id_semester || row.periode).trim();
      const id_registrasi_dosen = row.__id_registrasi_dosen || '';
      const id_kelas_kuliah = row.__id_kelas_kuliah || '';
      const sks = parseFloat(row.sks_ajar) || 0;
      const rencana = parseInt(row.tatap_muka) || 0;
      const realisasi = parseInt(row.tatap_muka_realisasi) || rencana;
      const jenis = parseInt(row.jenis_evaluasi) || 1;

      return {
        id_registrasi_dosen,
        id_kelas_kuliah,
        id_substansi: null,
        sks_substansi_total: sks,
        rencana_minggu_pertemuan: rencana,
        realisasi_minggu_pertemuan: realisasi,
        id_jenis_evaluasi: jenis,
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_dosen: row.nama_dosen,
          kelas: row.nama_kelas
        }
      };
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      // 1. Dosen & penugasan
      if (row.nuptk) {
        const nuptk = String(row.nuptk).trim();
        const dosen = await lookupEngine.lookupDosenByNuptk(nuptk);
        if (dosen) {
          row.nama_dosen = dosen.nama_dosen || row.nama_dosen;
          const penugasan = await lookupEngine.lookupPenugasanDosen(nuptk);
          if (penugasan) {
            row.__id_registrasi_dosen = penugasan.id_registrasi_dosen;
          } else {
            row.__errors.nuptk = 'Penugasan dosen tidak ditemukan';
          }
        } else {
          row.__errors.nuptk = 'Dosen tidak ditemukan';
        }
      } else {
        row.__errors.nuptk = 'NUPTK harus diisi';
      }

      // 2. Semester
      if (row.periode) {
        const sem = await lookupEngine.lookupSemester(String(row.periode).trim());
        row.__id_semester = sem?.id_semester || String(row.periode).trim();
      } else {
        row.__errors.periode = 'Periode harus diisi';
      }

      // 3. Mata Kuliah
      const kodeMk = String(row.kode_mata_kuliah).trim();
      if (row.kode_mata_kuliah) {
        if (kodeMk) {
          try {
            const mk = await lookupEngine.lookupMataKuliah(kodeMk);
            if (mk) {
              row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
              row.__id_matkul = mk._raw?.id_matkul || mk._raw?.id_mata_kuliah || mk._raw?.id || '';
              if (!row.__id_matkul) row.__id_matkul = kodeMk;
              if (mk.nama_prodi) row.nama_prodi = mk.nama_prodi;

              const idProdiFromMK = mk.id_prodi || mk._raw?.id_prodi;
              if (idProdiFromMK) {
                row.__id_prodi = idProdiFromMK;
                const prodiById = await lookupEngine.lookupProdiById(idProdiFromMK);
                if (prodiById) {
                  row.kode_prodi = prodiById.kode_prodi;
                  row.nama_prodi = prodiById.nama_prodi || row.nama_prodi;
                }
              }
            } else {
              row.__errors.kode_mata_kuliah = 'Mata kuliah tidak ditemukan';
            }
          } catch (err) { console.warn(`Lookup MK ${kodeMk} gagal:`, err); }
        }
      }

      // 4. Prodi
      if (row.kode_prodi || row.nama_prodi) {
        try {
          let prodi = null;
          if (row.kode_prodi && row.kode_prodi.length < 36) {
            prodi = await lookupEngine.lookupProdi(row.kode_prodi);
          } else if (row.nama_prodi) {
            prodi = await lookupEngine.lookupProdiByName(row.nama_prodi);
          }
          if (prodi) {
            row.nama_prodi = prodi.nama_prodi || row.nama_prodi;
            row.kode_prodi = prodi.kode_prodi || row.kode_prodi;
            row.__id_prodi = prodi.id_prodi || prodi._raw?.id_prodi || '';
          } else {
            row.__errors.kode_prodi = 'Prodi tidak ditemukan';
          }
        } catch (err) { console.warn('Lookup prodi gagal:', err); }
      }

      // 5. Kelas kuliah
      const namaKelas = String(row.nama_kelas || '').trim();
      const idSem = row.__id_semester;
      if (kodeMk && namaKelas && idSem) {
        const kelas = await lookupEngine.lookupDetailKelasKuliah(kodeMk, namaKelas, idSem);
        if (kelas) {
          row.__id_kelas_kuliah = kelas.id_kelas_kuliah;
        } else {
          row.__errors.nama_kelas = 'Kelas tidak ditemukan';
        }
      } else {
        if (!kodeMk) row.__errors.kode_mata_kuliah = 'Kode MK kosong';
        if (!namaKelas) row.__errors.nama_kelas = 'Nama kelas kosong';
        if (!idSem) row.__errors.periode = 'Semester tidak valid';
      }

      // 6. SKS dari MK
      if (!row.sks_ajar || parseFloat(row.sks_ajar) === 0) {
        if (kodeMk) {
          const mk = await lookupEngine.lookupMataKuliah(kodeMk);
          if (mk && mk.sks) row.sks_ajar = mk.sks;
        }
      }

      // 7. Tatap muka realisasi default
      if (!row.tatap_muka_realisasi) {
        row.tatap_muka_realisasi = row.tatap_muka;
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  InsertPesertaKelasKuliah: {
    targetFields: [
      'periode',
      'nim',
      'nama_mahasiswa',
      'nama_kelas',
      'kode_mata_kuliah',
      'nama_mata_kuliah',
    ],
    requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'nim'],
    transformFn: function(row) {
      const payload = {
        id_kelas_kuliah: row.__id_kelas_kuliah || '',
        id_registrasi_mahasiswa: row.__id_registrasi_mahasiswa || '',
        // Coba tambahkan id_mahasiswa dan id_semester
        id_mahasiswa: row.__id_mahasiswa || '',
        id_semester: row.__id_semester || ''
      };
      return {
        ...payload,
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_mata_kuliah: row.nama_mata_kuliah,
          kelas: row.nama_kelas,
          nim: row.nim,
          nama_mahasiswa: row.nama_mahasiswa
        }
      };
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      // 1. Semester
      if (row.periode) {
        const sem = await lookupEngine.lookupSemester(String(row.periode).trim());
        row.__id_semester = sem?.id_semester || String(row.periode).trim();
      } else {
        row.__errors.periode = 'Periode harus diisi';
      }

      // 2. Lookup Mata Kuliah (baru)
        if (row.kode_mata_kuliah) {
          const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
          if (mk) {
            row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
            // tidak perlu simpan id_matkul karena tidak dibutuhkan di payload
          } else {
            row.__errors.kode_mata_kuliah = 'Mata kuliah tidak ditemukan';
          }
        }

        // 3. Kelas kuliah
        const kodeMk = String(row.kode_mata_kuliah || '').trim();
        const namaKelas = String(row.nama_kelas || '').trim();
        const idSem = row.__id_semester;
        
        if (kodeMk && namaKelas && idSem) {
          const kelas = await lookupEngine.lookupDetailKelasKuliah(kodeMk, namaKelas, idSem);
          if (kelas) {
            row.__id_kelas_kuliah = kelas.id_kelas_kuliah;
          } else {
            row.__errors.nama_kelas = 'Kelas tidak ditemukan';
          }
        } else {
          if (!kodeMk) row.__errors.kode_mata_kuliah = row.__errors.kode_mata_kuliah || 'Kode MK kosong';
          if (!namaKelas) row.__errors.nama_kelas = 'Nama kelas kosong';
          if (!idSem) row.__errors.periode = 'Semester tidak valid';
        }

      // 3. Mahasiswa by NIM
      if (row.nim) {
        const regMhs = await lookupEngine.lookupRegistrasiMahasiswa(String(row.nim).trim());
        if (regMhs) {
          row.__id_registrasi_mahasiswa = regMhs.id_registrasi_mahasiswa;
          row.__id_mahasiswa = regMhs.id_mahasiswa;
          row.nama_mahasiswa = regMhs.nama_mahasiswa || row.nama_mahasiswa;
        } else {
          row.__errors.nim = 'Mahasiswa tidak ditemukan';
        }
      } else {
        row.__errors.nim = 'NIM harus diisi';
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  InsertKomponenEvaluasiKelas: {
    targetFields: [
      'periode',
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'nama_prodi',
      'nama_kelas',
      'aktivitas_partisipatif',
      'hasil_proyek',
      'tugas',
      'quiz',
      'uts',
      'uas',
    ],
    requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'aktivitas_partisipatif', 'tugas', 'quiz', 'uts', 'uas'],
    // Mengembalikan array dari record (multiple komponen)
    transformFn: function(row) {
      const records = [];

      const komponenDefs = [
        { field: 'aktivitas_partisipatif', jenis: 2, nama_inggris: 'Presence' ,nama: 'Aktivitas Partisipatif', urut: 1 },
        { field: 'hasil_proyek', jenis: 3, nama_inggris: 'Project' ,nama: 'Hasil Proyek', urut: 2 },
        { field: 'tugas', jenis: 4, nama_inggris: 'TGS' ,nama: 'TGS', urut: 3 },
        { field: 'quiz', jenis: 4, nama_inggris: 'QUIZ' ,nama: 'QIZ', urut: 4 },
        { field: 'uts', jenis: 4, nama_inggris: 'UTS' ,nama: 'UTS', urut: 5 },
        { field: 'uas', jenis: 4, nama_inggris: 'UAS' ,nama: 'UAS', urut: 6 },
      ];

      for (const def of komponenDefs) {
        const bobot = parseFloat(row[def.field]) || 0;
        if (bobot > 0) {
          const existingInfo = row.__existing_komponen_info && row.__existing_komponen_info[def.field];
          if (existingInfo) {
            // Komponen sudah ada
            if (Math.abs(existingInfo.bobot - bobot) < 0.01) {
              // Bobot sama → tidak perlu diubah
              records.push({
                type: 'unchanged',
                _display: {
                  kode_mata_kuliah: row.kode_mata_kuliah,
                  komponen: def.nama,
                  bobot: bobot,
                  kelas: row.nama_kelas,
                  aksi: 'sudah sesuai'
                }
              });
            } else {
              // Bobot berbeda → update
              records.push({
                type: 'existing',
                key: { id_komponen_evaluasi: existingInfo.id },
                record: {
                  id_kelas_kuliah: row.__id_kelas_kuliah || '',
                  id_jenis_evaluasi: def.jenis,
                  nama: def.nama,
                  nama_inggris: def.nama_inggris,
                  nomor_urut: def.urut,
                  bobot_evaluasi: bobot
                },
                _display: {
                  kode_mata_kuliah: row.kode_mata_kuliah,
                  komponen: def.nama,
                  bobot: bobot,
                  kelas: row.nama_kelas,
                  aksi: 'update otomatis'
                }
              });
            }
          } else {
            // Belum ada → insert
            records.push({
              id_kelas_kuliah: row.__id_kelas_kuliah || '',
              id_jenis_evaluasi: def.jenis,
              nama: def.nama,
              nama_inggris: def.nama_inggris,
              nomor_urut: def.urut,
              bobot_evaluasi: bobot,
              _display: {
                kode_mata_kuliah: row.kode_mata_kuliah,
                komponen: def.nama,
                bobot: bobot,
                kelas: row.nama_kelas,
                aksi: 'insert'
              }
            });
          }
        }
      }
      return records;
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};
      // 1. Semester
      if (row.periode) {
        const sem = await lookupEngine.lookupSemester(String(row.periode).trim());
        row.__id_semester = sem?.id_semester || String(row.periode).trim();
      } else {
        row.__errors.periode = 'Periode harus diisi';
      }

      // 2. Mata kuliah & Prodi
      if (row.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
        if (mk) {
          row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
          row.__id_matkul = mk._raw?.id_matkul || mk._raw?.id_mata_kuliah || '';
          if (mk.nama_prodi) row.nama_prodi = mk.nama_prodi;
        } else {
          row.__errors.kode_mata_kuliah = 'Mata kuliah tidak ditemukan';
        }
      }

      // 3. Kelas
      const kodeMk = String(row.kode_mata_kuliah || '').trim();
      const namaKelas = String(row.nama_kelas || '').trim();
      const idSem = row.__id_semester;
      if (kodeMk && namaKelas && idSem) {
        const kelas = await lookupEngine.lookupDetailKelasKuliah(kodeMk, namaKelas, idSem);
        if (kelas) row.__id_kelas_kuliah = kelas.id_kelas_kuliah;
        else row.__errors.nama_kelas = 'Kelas tidak ditemukan';
      } else {
        if (!kodeMk) row.__errors.kode_mata_kuliah = 'Kode MK kosong';
        if (!namaKelas) row.__errors.nama_kelas = 'Nama kelas kosong';
        if (!idSem) row.__errors.periode = 'Semester tidak valid';
      }

      // 4. Cek komponen yang sudah ada
      if (row.__id_kelas_kuliah) {
        const komponenDefs = [
          { field: 'aktivitas_partisipatif', jenis: 2, nama_inggris: 'Presence' ,nama: 'Aktivitas Partisipatif', urut: 1 },
          { field: 'hasil_proyek', jenis: 3, nama_inggris: 'Project' ,nama: 'Hasil Proyek', urut: 2 },
          { field: 'tugas', jenis: 4, nama_inggris: 'TGS' ,nama: 'TGS', urut: 3 },
          { field: 'quiz', jenis: 4, nama_inggris: 'QUIZ' ,nama: 'QIZ', urut: 4 },
          { field: 'uts', jenis: 4, nama_inggris: 'UTS' ,nama: 'UTS', urut: 5 },
          { field: 'uas', jenis: 4, nama_inggris: 'UAS' ,nama: 'UAS', urut: 6 },
        ];

        row.__existing_komponen_info = {};
        for (const def of komponenDefs) {
          const komponen = await lookupEngine.lookupKomponenEvaluasiByIdUrut(
            row.__id_kelas_kuliah,
            def.jenis,
            def.urut
          );
          if (komponen && komponen.id_komponen_evaluasi) {
            row.__existing_komponen_info[def.field] = {
              id: komponen.id_komponen_evaluasi,
              bobot: komponen.bobot_evaluasi ? parseFloat(komponen.bobot_evaluasi) : 0
            };
          }
        }
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  InsertRencanaEvaluasi: {
    targetFields: [
      'periode',
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'nama_kelas',
      'id_jenis_evaluasi',
      'nama_evaluasi',
      'nomor_urut', 'bobot_evaluasi', 
    ],
    requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'id_jenis_evaluasi', 'nama_evaluasi', 'nomor_urut', 'bobot_evaluasi'],
    transformFn: function(row) {

      // Pastikan deskripsi selalu string valid, bukan null/undefined
      const deskIndo = row.deskripsi_indonesia ? sanitizeText(row.deskripsi_indonesia) : '';
      const deskInggris = row.deskripsi_inggris ? sanitizeText(row.deskripsi_inggris) : '';

      return {
        id_jenis_evaluasi: parseInt(row.id_jenis_evaluasi) || 1,
        id_matkul: row.__id_matkul || '',
        nama_evaluasi: sanitizeText(row.nama_evaluasi || ''),
        deskripsi_indonesia: deskIndo || '',
        deskripsi_inggris: deskInggris || '',
        nomor_urut: parseInt(row.nomor_urut) || '',
        bobot_evaluasi: parseFloat(row.bobot_evaluasi) || '',
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_mata_kuliah: row.nama_mata_kuliah,
          nama_evaluasi: row.nama_evaluasi,
          kelas: row.nama_kelas
        }
      };
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      // Fallback: jika nama_evaluasi atau nomor_urut kosong, ambil dari __original (data mentah Excel)
      if ((!row.nama_evaluasi || row.nama_evaluasi.trim() === '') && row.__original) {
        const candidates = ['Nama Komponen Evaluasi', 'nama_evaluasi', 'Nama Evaluasi'];
        for (const c of candidates) {
          if (row.__original[c] && String(row.__original[c]).trim() !== '') {
            row.nama_evaluasi = String(row.__original[c]).trim();
            break;
          }
        }
      }
      if ((!row.nomor_urut || row.nomor_urut === '') && row.__original) {
        const candidates = ['Nomor Urut', 'nomor_urut', 'No Urut'];
        for (const c of candidates) {
          if (row.__original[c] && String(row.__original[c]).trim() !== '') {
            row.nomor_urut = String(row.__original[c]).trim();
            break;
          }
        }
      }
      if ((!row.bobot_evaluasi || row.bobot_evaluasi === '') && row.__original) {
        const candidates = ['Bobot Evaluasi', 'bobot_evaluasi', 'Bobot'];
        for (const c of candidates) {
          if (row.__original[c] && String(row.__original[c]).trim() !== '') {
            row.bobot_evaluasi = String(row.__original[c]).trim();
            break;
          }
        }
      }

      // === PASTIKAN DATA DARI EXCEL TERBACA ===
      if (row.__original) {
        const candidates = {
          nama_evaluasi: ['Nama Komponen Evaluasi', 'nama_evaluasi', 'Nama Evaluasi'],
          nomor_urut: ['Nomor Urut', 'nomor_urut', 'No Urut'],
          bobot_evaluasi: ['Bobot Evaluasi', 'bobot_evaluasi', 'Bobot']
        };
        for (const field of Object.keys(candidates)) {
          if (!row[field] || String(row[field]).trim() === '') {
            for (const key of candidates[field]) {
              if (row.__original[key] && String(row.__original[key]).trim() !== '') {
                row[field] = String(row.__original[key]).trim();
                break;
              }
            }
          }
        }
      }

      // 1. Semester dari Periode
      if (row.periode) {
        const sem = await lookupEngine.lookupSemester(String(row.periode).trim());
        row.__id_semester = sem?.id_semester || String(row.periode).trim();
      } else {
        row.__errors.periode = 'Periode harus diisi';
      }

      // 2. Mata Kuliah
      if (row.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
        if (mk) {
          row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
          row.__id_matkul = mk._raw?.id_matkul || mk._raw?.id_mata_kuliah || '';
        } else {
          row.__errors.kode_mata_kuliah = 'Mata kuliah tidak ditemukan';
        }
      }

      // 3. Kelas kuliah
      const kodeMk = String(row.kode_mata_kuliah || '').trim();
      const namaKelas = String(row.nama_kelas || '').trim();
      const idSem = row.__id_semester;
      if (kodeMk && namaKelas && idSem) {
        const kelas = await lookupEngine.lookupDetailKelasKuliah(kodeMk, namaKelas, idSem);
        if (kelas) {
          row.__id_kelas_kuliah = kelas.id_kelas_kuliah;
        } else {
          row.__errors.nama_kelas = 'Kelas tidak ditemukan. Pastikan kelas sudah di-InsertKelasKuliah.';
        }
      } else {
        if (!kodeMk) row.__errors.kode_mata_kuliah = row.__errors.kode_mata_kuliah || 'Kode MK kosong';
        if (!namaKelas) row.__errors.nama_kelas = 'Nama kelas kosong';
        if (!idSem) row.__errors.periode = 'Semester tidak valid';
      }

      // 4. Ambil komponen evaluasi HANYA jika kelas ditemukan
      if (row.__id_kelas_kuliah && row.id_jenis_evaluasi && !row.__errors.nama_kelas) {
        const komponen = await lookupEngine.lookupKomponenEvaluasi(
          row.__id_kelas_kuliah,
          parseInt(row.id_jenis_evaluasi),
          row.nama_evaluasi || undefined
        );
        if (komponen) {
          if (!row.nama_evaluasi || row.nama_evaluasi.trim() === '') {
            row.nama_evaluasi = komponen.nama_evaluasi || '';
          }
          if (!row.nomor_urut || row.nomor_urut === '') {
            row.nomor_urut = komponen.nomor_urut;
          }
          if (!row.bobot_evaluasi || row.bobot_evaluasi === '') {
            row.bobot_evaluasi = komponen.bobot_evaluasi;
          }
        }
      }

      // 5. Validasi
      if (!row.nama_evaluasi || String(row.nama_evaluasi).trim() === '') {
        row.__errors.nama_evaluasi = 'Nama evaluasi harus diisi';
      }
      if (!row.nomor_urut) {
        row.__errors.nomor_urut = 'Nomor urut harus diisi';
      }
      const bobot = parseFloat(row.bobot_evaluasi);
      if (isNaN(bobot) || bobot < 0 || bobot > 100) {
        row.__errors.bobot_evaluasi = 'Bobot harus 0-100';
      }
      const jenis = parseInt(row.id_jenis_evaluasi);
      if (isNaN(jenis) || jenis < 1 || jenis > 4) {
        row.__errors.id_jenis_evaluasi = 'ID jenis evaluasi harus 1-4';
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

  UpdateNilaiLengkap: {
    targetFields: [
      'periode',
      'nama_prodi',
      'nim', 'nama_mahasiswa',
      'kode_mata_kuliah', 'nama_mata_kuliah', 'nama_kelas',
      'nilai_angka', 'nilai_indeks', 'nilai_huruf',
      'aktivitas_partisipatif', 'hasil_proyek', 'quiz', 'tugas', 'uts', 'uas',
    ],
    requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'nim', 'nilai_indeks', 'nilai_huruf', 'aktivitas_partisipatif', 'quiz', 'tugas', 'uts', 'uas',],
    transformFn: function(row) {
      const records = [];

      // --- 1. Record untuk nilai akhir ---
      records.push({
        _action: 'nilai_akhir',
        key: {
          id_registrasi_mahasiswa: row.__id_registrasi_mahasiswa || '',
          id_kelas_kuliah: row.__id_kelas_kuliah || ''
        },
        record: {
          nilai_angka: String(row.nilai_angka || '').trim(),
          nilai_indeks: String(row.nilai_indeks || '').trim(),
          nilai_huruf: String(row.nilai_huruf || '').trim()
        },
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_mahasiswa: row.nama_mahasiswa || row.nim,
          kelas: row.nama_kelas,
          tipe: 'Nilai Akhir'
        }
      });

      // --- 2. Record untuk setiap komponen ---
      const komponenDefs = [
        { field: 'aktivitas_partisipatif', jenis: 2, nama: 'Aktivitas Partisipatif', urut: 1 },
        { field: 'hasil_proyek', jenis: 3, nama: 'Hasil Proyek', urut: 2 },
        { field: 'tugas', jenis: 4, nama: 'TGS', urut: 3 },
        { field: 'quiz', jenis: 4, nama: 'QIZ', urut: 4 },
        { field: 'uts', jenis: 4, nama: 'UTS', urut: 5 },
        { field: 'uas', jenis: 4, nama: 'UAS', urut: 6 },
      ];

      for (const def of komponenDefs) {
        const raw = parseFloat(row[def.field]) || 0;
        const nilai = Math.round(raw);
        if (nilai > 0) {
          const info = row.__existing_komponen_info && row.__existing_komponen_info[def.field];
          const idKomponen = info ? info.id : null;
          if (idKomponen) {
            records.push({
              _action: 'nilai_komponen',
              key: {
                id_komponen_evaluasi: idKomponen,
                id_registrasi_mahasiswa: row.__id_registrasi_mahasiswa || ''
              },
              record: {
                nilai_komponen_evaluasi: nilai
              },
              _display: {
                kode_mata_kuliah: row.kode_mata_kuliah,
                nama_mahasiswa: row.nama_mahasiswa || row.nim,
                kelas: row.nama_kelas,
                komponen: def.nama,
                nilai: nilai,
                tipe: 'Nilai Komponen'
              }
            });
          } else {
            if (!row.__errors) row.__errors = {};
            row.__errors[def.field] = `Komponen ${def.nama} tidak ditemukan`;
          }
        }
      }

      return records;
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      // 1. Semester
      if (row.periode) {
        const sem = await lookupEngine.lookupSemester(String(row.periode).trim());
        row.__id_semester = sem?.id_semester || String(row.periode).trim();
      } else {
        row.__errors.periode = 'Periode harus diisi';
      }

      // 2. Mahasiswa by NIM
      if (row.nim) {
        const mhs = await lookupEngine.lookupRegistrasiMahasiswa(String(row.nim).trim());
        if (mhs) {
          row.__id_registrasi_mahasiswa = mhs.id_registrasi_mahasiswa;
          row.nama_mahasiswa = mhs.nama_mahasiswa || row.nama_mahasiswa;
        } else {
          row.__errors.nim = 'Mahasiswa tidak ditemukan';
        }
      } else {
        row.__errors.nim = 'NIM harus diisi';
      }

      // 3. Mata kuliah (untuk referensi)
      if (row.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
        if (mk) {
          row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
          if (mk.nama_prodi) row.nama_prodi = mk.nama_prodi;
        }
      }

      // 4. Kelas
      const kodeMk = String(row.kode_mata_kuliah || '').trim();
      const namaKelas = String(row.nama_kelas || '').trim();
      const idSem = row.__id_semester;
      if (kodeMk && namaKelas && idSem) {
        const kelas = await lookupEngine.lookupDetailKelasKuliah(kodeMk, namaKelas, idSem);
        if (kelas) {
          row.__id_kelas_kuliah = kelas.id_kelas_kuliah;
        } else {
          row.__errors.nama_kelas = 'Kelas tidak ditemukan';
        }
      } else {
        if (!kodeMk) row.__errors.kode_mata_kuliah = 'Kode MK kosong';
        if (!namaKelas) row.__errors.nama_kelas = 'Nama kelas kosong';
        if (!idSem) row.__errors.periode = 'Semester tidak valid';
      }

      // 5. Dapatkan ID komponen
      if (row.__id_kelas_kuliah) {
        const komponenDefs = [
          { field: 'aktivitas_partisipatif', jenis: 2, urut: 1 },
          { field: 'hasil_proyek', jenis: 3, urut: 2 },
          { field: 'tugas', jenis: 4, urut: 3 },
          { field: 'quiz', jenis: 4, urut: 4 },
          { field: 'uts', jenis: 4, urut: 5 },
          { field: 'uas', jenis: 4, urut: 6 },
        ];

        row.__existing_komponen_info = {};
        for (const def of komponenDefs) {
          const komponen = await lookupEngine.lookupKomponenEvaluasiByIdUrut(
            row.__id_kelas_kuliah,
            def.jenis,
            def.urut
          );
          if (komponen && komponen.id_komponen_evaluasi) {
            row.__existing_komponen_info[def.field] = {
              id: komponen.id_komponen_evaluasi,
              bobot: parseFloat(komponen.bobot) || 0
            };
          }
        }
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
    }
  },

};

export function renderInsertView(container) {
  let currentMethod = 'InsertKelasKuliah';
  let rawExcelData = null;
  let headers = [];
  let mapping = {};
  let gridData = [];
  let gridEditor = null;
  let originalBackup = [];
  const api = new NeoFeederAPI();
  const lookupEngine = new LookupEngine(api);
  let importProcess = null;

  function getConfig() {
    return METHOD_CONFIG[currentMethod] || METHOD_CONFIG['InsertKelasKuliah'];
  }

  container.innerHTML = `
  
    <div id="wizard-container" class="space-y-6">
      <div id="step1" class="glass p-6 rounded-2xl">
        <h3 class="text-xl font-bold mb-4">Step 1: Pilih Method Import</h3>
          <select id="method-select" class="w-full p-3 rounded-xl cursor-pointer bg-white dark:bg-gray-800">
            <option value="">--Pilih Method--</option>
            ${Object.entries(METHOD_GROUPS).map(([groupName, methods]) => `
              <optgroup label="${groupName}">
                ${methods.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
              </optgroup>
            `).join('')}
          </select>
        <button id="template-btn" class="mt-2 px-6 py-2 bg-teal-600 text-white rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" disabled>📝 Unduh Template Xlxs</button>
        <button id="next-to-step2" class="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" disabled>Selanjutnya</button>

      </div>
      <div id="step2" class="glass p-6 rounded-2xl hidden">
        <h3 class="text-xl font-bold mb-4">Step 2: Upload Excel & Auto Mapping</h3>
        <div id="drop-zone" class="border-2 border-dashed border-gray-400 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer">
          <p>Drag & drop file Excel di sini atau klik untuk memilih</p>
          <input type="file" id="file-input" accept=".xlsx,.xls,.csv" class="hidden">
        </div>
        <div id="sheet-selector" class="mt-4 hidden">
          <label>Pilih Sheet:</label>
          <select id="sheet-list" class="p-2 rounded-xl ml-2 bg-white dark:bg-gray-800"></select>
        </div>
        <div id="mapping-status" class="mt-4 text-sm"></div>
        <button id="run-lookup" class="mt-4 px-6 py-2 bg-green-600 text-white rounded-xl hidden">Jalankan Ulang Lookup</button>
        <div id="grid-container" class="mt-6 overflow-auto"></div>
        <div class="mt-4 flex space-x-2 flex-wrap gap-y-2">
          <button id="delete-empty-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-xl cursor-pointer">Hapus Baris Kosong</button>
          <button id="delete-dup-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-xl cursor-pointer">Hapus Duplikat</button>
          <button id="restore-btn" class="px-4 py-2 bg-gray-500 text-white rounded-xl cursor-pointer">Restore</button>
          <button id="next-to-step3" class="px-6 py-2 bg-blue-600 text-white rounded-xl cursor-pointer ml-auto">Import Data</button>
        </div>
      </div>
      <div id="step3" class="glass p-6 rounded-2xl hidden">
        <h3 class="text-xl font-bold mb-4">Step 3: Import Progress</h3>
        <div id="progress-bar" class="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-4 mb-4">
          <div id="progress-fill" class="bg-blue-600 h-4 rounded-full" style="width:0%"></div>
        </div>
        <div id="import-stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>Success: <span id="stat-success">0</span></div>
          <div>Failed: <span id="stat-failed">0</span></div>
          <div>Skipped: <span id="stat-skipped">0</span></div>
          <div>ETA: <span id="stat-eta">-</span></div>
        </div>
        <div id="import-log" class="mt-4 h-48 overflow-y-auto bg-gray-100 dark:bg-gray-800 p-3 rounded-xl text-sm font-mono"></div>
        <div class="flex space-x-2 mt-4">
          <button id="pause-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-xl cursor-pointer">Pause</button>
          <button id="resume-btn" class="px-4 py-2 bg-green-500 text-white rounded-xl cursor-pointer hidden">Resume</button>
          <button id="cancel-btn" class="px-4 py-2 bg-red-500 text-white rounded-xl cursor-pointer">Cancel</button>
        </div>
      </div>
    </div>    
  `;

  const methodSelect = document.getElementById('method-select');
  const templateBtn = document.getElementById('template-btn');
  const nextBtn = document.getElementById('next-to-step2');

  // Aktifkan tombol unduh hanya setelah metode dipilih
  methodSelect.addEventListener('change', () => {
    const selected = methodSelect.value;
    templateBtn.disabled = !selected;
    nextBtn.disabled = !selected;      // ← tambahkan
  });

  // Inisialisasi awal: disable semua jika tidak ada pilihan (fallback)
  nextBtn.disabled = !methodSelect.value;
  templateBtn.disabled = !methodSelect.value;

  templateBtn.addEventListener('click', () => {
    const selectedMethod = methodSelect.value;
    if (!selectedMethod) return showToast('Pilih metode terlebih dahulu', 'warning');

    // Nama file sesuai method
    const templateFileName = TEMPLATE_FILES[selectedMethod] || '';
    const filePath = `template/insert/${templateFileName}`;

    // Buat link unduh sementara
    const link = document.createElement('a');
    link.href = filePath;
    link.download = templateFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });


  nextBtn.addEventListener('click', () => {
    currentMethod = document.getElementById('method-select').value;
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    gridData = [];
    if (gridEditor) gridEditor.setData([]);
  });

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => e.preventDefault());
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetNames = workbook.SheetNames;
      const sheetSelector = document.getElementById('sheet-selector');
      const sheetList = document.getElementById('sheet-list');
      sheetList.innerHTML = sheetNames.map(name => `<option value="${name}">${name}</option>`).join('');
      sheetSelector.classList.remove('hidden');

      const loadSheet = (sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (json.length > 0) {
          headers = json[0].map(h => String(h).trim());
          rawExcelData = json.slice(1).map(row => {
            const obj = {};
            headers.forEach((h, i) => {
              const value = row[i];
              obj[h] = value != null ? String(value).trim() : '';
            });
            return obj;
          });
          runAutoMapping();
        }
      };

      sheetList.addEventListener('change', (ev) => loadSheet(ev.target.value));
      loadSheet(sheetNames[0]);
    };
    reader.readAsArrayBuffer(file);
  }

  async function runAutoMapping() {
    const config = getConfig();
    const fields = config.targetFields.filter(f => f !== 'status');

    mapping = autoMapHeaders(headers, fields);
    const mappingStatus = document.getElementById('mapping-status');
    let html = '<div class="text-sm font-semibold mb-2">Auto Mapping:</div><ul class="list-disc pl-6">';
    for (const [src, map] of Object.entries(mapping)) {
      if (map.automatic) {
        html += `<li class="text-green-600">${src} → ${map.target} (${Math.round(map.confidence*100)}%)</li>`;
      } else {
        html += `<li class="text-red-600">${src} → Manual mapping needed</li>`;
      }
    }
    html += '</ul>';
    mappingStatus.innerHTML = html;

    gridData = rawExcelData.map(row => {
      const newRow = {};
      config.targetFields.forEach(f => newRow[f] = '');
      for (const [src, map] of Object.entries(mapping)) {
        if (map.automatic && map.target) {
          let value = row[src];
          // Jika tidak ditemukan, cari key yang mirip
          if (value === undefined || value === null) {
            const normalizedSrc = src.toLowerCase().replace(/\s+/g, '');
            const foundKey = Object.keys(row).find(k =>
              k.toLowerCase().replace(/\s+/g, '') === normalizedSrc
            );
            if (foundKey) value = row[foundKey];
          }
          newRow[map.target] = String(value ?? '').trim();
        }
      }
      newRow.__original = { ...row };
      newRow.status = 'Processing...';
      return newRow;
    });
    originalBackup = JSON.parse(JSON.stringify(gridData));

    await performAutoLookup();
    renderGrid();
    document.getElementById('run-lookup').classList.remove('hidden');
  }

  async function performAutoLookup() {
    const config = getConfig();
    const lookupStatus = document.getElementById('mapping-status');
    lookupStatus.innerHTML += '<p class="text-blue-500 mt-2">🔍 Menjalankan auto lookup...</p>';

    for (let row of gridData) {
      row.__errors = {};
      await config.performLookup(row, lookupEngine);
    }
    lookupStatus.innerHTML += '<p class="text-green-500">✅ Auto lookup selesai.</p>';
  }

  function renderGrid() {
    const config = getConfig();
    const gridContainer = document.getElementById('grid-container');
    gridEditor = new GridEditor(gridContainer, config.targetFields, gridData, mapping, {
      onCellEdit: (idx, field, value) => {
        if (field !== 'status') gridData[idx][field] = value;
      },
      onDelete: (idx) => { gridData.splice(idx, 1); renderGrid(); },
      onSelectionChange: () => {}
    });
    setTimeout(() => {
      const cells = gridContainer.querySelectorAll('td[data-field="status"]');
      cells.forEach(cell => cell.setAttribute('contenteditable', 'false'));
    }, 0);
  }

  document.getElementById('run-lookup').addEventListener('click', async () => {
    await performAutoLookup();
    gridEditor.setData(gridData);
    showToast('Lookup selesai diperbarui', 'success');
  });

  document.getElementById('delete-empty-btn').addEventListener('click', () => {
    const config = getConfig();
    const fields = config.targetFields.filter(f => f !== 'status');
    gridData = gridData.filter(row => fields.some(f => row[f] && row[f].toString().trim() !== ''));
    gridEditor.setData(gridData);
  });

  document.getElementById('delete-dup-btn').addEventListener('click', () => {
    const config = getConfig();
    const fields = config.targetFields.filter(f => f !== 'status');
    const seen = new Set();
    gridData = gridData.filter(row => {
      const key = fields.map(f => row[f]).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    gridEditor.setData(gridData);
  });

  document.getElementById('restore-btn').addEventListener('click', () => {
    gridData = JSON.parse(JSON.stringify(originalBackup));
    gridEditor.setData(gridData);
  });

  document.getElementById('next-to-step3').addEventListener('click', async () => {
    const config = getConfig();
    const fields = config.targetFields.filter(f => f !== 'status');

    const validator = new Validator(fields, config.requiredFields);
    const errors = validator.validateAll(gridData, mapping);
    gridData.forEach((row, i) => { row.__errors = errors[i]?.errors || {}; });
    gridData.forEach(row => {
      const msgs = Object.values(row.__errors || {}).filter(m => m);
      row.status = msgs.length > 0 ? msgs.join('; ') : 'OK';
    });
    gridEditor.setData(gridData);
    const hasError = errors.some(e => Object.keys(e.errors).length > 0);
    if (hasError) {
      showToast('Terdapat error validasi, periksa sel berwarna merah.', 'error');
      return;
    }

    
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('step3').classList.remove('hidden');

    let apiData = gridData.map(row => config.transformFn(row)); //data siap ke proses import
    if (apiData.some(item => Array.isArray(item))) {
      apiData = apiData.flat();
    }

    if (apiData.length === 0) {
      showToast('Tidak ada data yang perlu diproses. Periksa kembali komponen yang dipilih.', 'warning');
      return;
    }

    const lastIdKelas = apiData[0]?.id_kelas_kuliah || '';
    const lastNim = gridData[0]?.nim || '';
    
    console.log('Data siap import:', apiData);

    importProcess = new ImportProcess(api, apiData, currentMethod);

    importProcess.start(progress => {
      if (progress.stats) {
        const pct = progress.stats.totalBatches > 0 ? (progress.stats.currentBatch / progress.stats.totalBatches) * 100 : 0;
        document.getElementById('progress-fill').style.width = `${pct}%`;
        document.getElementById('stat-success').textContent = progress.stats.success;
        document.getElementById('stat-failed').textContent = progress.stats.failed;
        document.getElementById('stat-skipped').textContent = progress.stats.skipped;
        document.getElementById('stat-eta').textContent = progress.stats.eta;
      }

      const logEl = document.getElementById('import-log');
      if (logEl && progress.logs) {
        logEl.innerHTML = progress.logs.map(log => {
          const icon = log.type === 'success' ? '✅' : (log.type === 'failed' ? '❌' : '⚠️');
          const row = log.row || {};
          const disp = row._display || {};
          
          let mk = disp.kode_mata_kuliah || row.kode_mata_kuliah || row.id_matkul || '?';
          let nama = disp.nama_mata_kuliah || row.nama_mata_kuliah || row.nama_mahasiswa || row.nama_dosen || disp.nama_dosen || disp.nama_mahasiswa || disp.nama_evaluasi || disp.nama_komponen || '';
          let kelas = disp.kelas || disp.nama_kelas || row.kelas || row.nama_kelas_kuliah || '?';
          let aksi = disp.aksi || row.tipe || currentMethod;
          let status = log.message;

          const nim = disp.nim || '';
          const extra = nim ? ` (NIM: ${nim})` : '';
          
          let info = `[${mk}] ${nama} | [${kelas}] ${aksi} | Ket: ${status}`;
          if (info.length > 155) info = info.substring(0, 150) + '...';
          
          let detail = '';
          if (log.type === 'failed') {
            detail = `<br><small class="text-gray-400">Payload: ${JSON.stringify(disp)}</small>`;
            loggerInst.log('error', 'Data Gagal diimport', { detail });
          }
           return `<div class="py-1">${icon} ${info} ${detail}</div>`;
        }).join('');
        logEl.scrollTop = logEl.scrollHeight;
      }
    }).then(async (result) => {
        const logEl = document.getElementById('import-log');
        // Untuk metode yang menghasilkan banyak record (UpdateNilaiLengkap), tampilkan ringkasan
        if (currentMethod === 'UpdateNilaiLengkap' && importProcess.realtimeLogs) {
            const logs = importProcess.realtimeLogs;
            const successLogs = logs.filter(l => l.type === 'success');
            const failedLogs = logs.filter(l => l.type === 'failed');
            const skippedLogs = logs.filter(l => l.type === 'skipped');

            let summaryHTML = '';

            if (successLogs.length > 0) {
                // Kelompokkan berdasarkan tipe aksi
                const nilaiAkhirLogs = successLogs.filter(l => l.row._display?.tipe === 'Nilai Akhir');
                const nilaiKomponenLogs = successLogs.filter(l => l.row._display?.tipe === 'Nilai Komponen');
                const otherLogs = successLogs.filter(l => !nilaiAkhirLogs.includes(l) && !nilaiKomponenLogs.includes(l));

                // Ambil sample log untuk mendapatkan kode MK dan kelas
                let sampleLog = nilaiAkhirLogs[0] || nilaiKomponenLogs[0] || successLogs[0];
                const disp = sampleLog?.row?._display || {};
                const mk = disp.kode_mata_kuliah || disp.id_matkul || '?';
                const nama = disp.nama_mata_kuliah || disp.nama_dosen || disp.nama_mahasiswa || disp.nama_evaluasi || disp.nama_komponen || '';
                const kelas = disp.kelas || disp.nama_kelas_kuliah || '?';
                const aksi = disp.aksi || disp.tipe || currentMethod;

                // Bentuk string aksi
                let aksiStr = '';
                if (nilaiAkhirLogs.length > 0 && nilaiKomponenLogs.length > 0) {
                    aksiStr = 'NA & NK';
                } else if (nilaiAkhirLogs.length > 0) {
                    aksiStr = 'NA';
                } else if (nilaiKomponenLogs.length > 0) {
                    aksiStr = 'NK';
                } else {
                    aksiStr = disp.tipe || currentMethod;
                }

                // Bentuk detail jumlah
                const parts = [];
                if (nilaiAkhirLogs.length > 0) parts.push(`${nilaiAkhirLogs.length} NA`);
                if (nilaiKomponenLogs.length > 0) parts.push(`${nilaiKomponenLogs.length} NK`);
                if (otherLogs.length > 0) parts.push(`${otherLogs.length} Lainnya`);
                const detailStr = `(${successLogs.length}) Berhasil${parts.length > 0 ? ' | ' + parts.join(' + ') : ''}`;

                summaryHTML += `<div class="py-1">✅ [${mk}] ${nama} | [${kelas}] ${aksiStr} | Ket: ${detailStr} </div>`;
            }

            // Detail gagal
            failedLogs.forEach(log => {
                const disp = log.row._display || {};

                const mk = disp.kode_mata_kuliah || '?';
                const nama = disp.nama_mata_kuliah || disp.nama_dosen || disp.nama_mahasiswa || disp.nama_evaluasi || disp.nama_komponen || '';
                const kelas = disp.kelas || disp.nama_kelas_kuliah || '?';
                const aksi = disp.tipe || currentMethod;
                summaryHTML += `<div class="py-1">❌ [${mk}] ${nama} | [${kelas}] ${aksi} Ket: ${log.message}</div>`;
            });

            // Skipped
            if (skippedLogs.length > 0) {
                summaryHTML += `<div class="py-1">⚠️ ${skippedLogs.length} data dilewati.</div>`;
            }

            logEl.innerHTML = summaryHTML;
        }
        // Untuk metode lain, biarkan log realtime yang sudah terbentuk (tidak diubah)
        
        showToast(`Import selesai: ${result.success} sukses, ${result.failed} gagal`, result.failed ? 'error' : 'success');

      });
  });

  document.getElementById('pause-btn').addEventListener('click', () => {
    if (importProcess) importProcess.pause();
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('resume-btn').classList.remove('hidden');
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    if (importProcess) importProcess.resume();
    document.getElementById('resume-btn').classList.add('hidden');
    document.getElementById('pause-btn').classList.remove('hidden');
  });
  document.getElementById('cancel-btn').addEventListener('click', () => {
    if (importProcess) importProcess.cancel();
    showToast('Import di Stop!', 'info');
  });
}
