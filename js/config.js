// export const API_BASE = 'http://localhost:3003/ws/live2.php';
export const API_BASE = 'http://localhost:3003/ws/sandbox2.php';
export const STORAGE_KEYS = {
  TOKEN: 'nf_token',
  USER: 'nf_user',
  SETTINGS: 'nf_settings',
  LOGS: 'nf_logs',
  DICTIONARY: 'nf_dictionary',
  PROFIL_PT: 'nf_profil_pt',
};

export const IMPORT_DEFAULTS = {
  batchSize: 5,
  delay: 100,
  retry: 2,
  continueOnError: true,
  skipInvalid: true,
  timeout: 30000,
  autoSaveLog: true,
  autoBackup: true,
};

export const FIELD_SYNONYMS = {
  kode_mata_kuliah: ['kode mk','kodemk','kode mata kuliah','kd_mk','kdmk','kode matakuliah','course code','mk code','kode matakuliah baru'],
  nama_mata_kuliah: ['nama mk','matakuliah','nama mata kuliah','namamatkul','nama course','course name','subject','mata kuliah'],
  kode_prodi: ['kode prodi','prodi code','kode program studi','program studi code','kode prod','prodi'],
  nama_prodi: ['nama prodi','program studi','prodi name','nama program studi','prodi'],
  id_dosen: ['id dosen','dosen id','nidn','nuptk','id dosen pengampu'],
  nama_dosen: ['nama dosen','dosen','lecturer name','nama pengajar'],
  semester: ['semester','sem','smt'],
  tahun_ajaran: ['tahun ajaran','tahun akademik','academic year','thn ajaran','ta'],
  kode_kurikulum: ['kode kurikulum','kurikulum code','kode kur','kurikulum kode'],
  periode: ['periode', 'kode periode', 'id periode', 'periode id', 'periode akademik', 'tahun akademik', 'academic period', 'period'],
  kelas: ['kelas', 'class', 'nama kelas', 'ruang kelas', 'classroom'],
  bahasan: ['bahasan', 'topik', 'materi', 'pokok bahasan', 'subject matter'],
  tanggal_mulai_efektif: ['tanggal mulai efektif', 'tgl mulai efektif', 'tanggal mulai', 'tgl mulai', 'start date', 'effective start date'],
  tanggal_akhir_efektif: ['tanggal akhir efektif', 'tgl akhir efektif', 'tanggal akhir', 'tgl akhir', 'end date', 'effective end date'],
  lingkup: ['lingkup', 'scope', 'area', 'cakupan'],
  mode_kuliah: ['mode kuliah', 'mode', 'tipe kuliah', 'jenis kuliah', 'mode perkuliahan', 'lecture mode', 'teaching mode'],
  nomor_urut: ['no urut', 'nomor urut', 'urutan', 'no', 'nomor', 'number'],
  nama_evaluasi: ['nama evaluasi', 'komponen evaluasi', 'evaluasi'],
  nama_komponen: ['nama komponen', 'nama komponen evaluasi', 'komponen', 'nama'],
  nim: ['nim', 'npm', 'mahasiswa id', 'student id', 'nomor induk mahasiswa'],
  nama_mahasiswa: ['nama mahasiswa', 'mahasiswa', 'student name', 'nama siswa'],
  nilai_angka: ['nilai angka', 'nilai', 'angka', 'score', 'grade point'],
  nilai_indeks: ['nilai indeks', 'indeks', 'indeks nilai', 'index'],
  nilai_huruf: ['nilai huruf', 'huruf', 'letter grade', 'grade'],
  nama_kelas: ['nama kelas', 'kelas', 'class name', 'class'],
};

export const DICTIONARY_CACHE_KEY = 'custom_dictionary';