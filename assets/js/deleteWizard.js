import { NeoFeederAPI } from './api.js';
import { LookupEngine } from './lookupEngine.js';
import { GridEditor } from './gridEditor.js';
import { ImportProcess } from './importProcess.js';
import { autoMapHeaders } from './mappingEngine.js';
import { Validator } from './validator.js';
import { sanitizeText, showToast } from './utils.js';

const METHOD_GROUPS = {
  'Kelas Kuliah (KRS)': [
    { value: 'DeleteKelasKuliah', label: '[Delete] Kelas Perkuliah' },
    { value: 'DeleteDosenPengajarKelasKuliah', label: '[Delete] Dosen Pengajar Kelas' },
    { value: 'DeletePesertaKelasKuliah', label: '[Delete] Peserta Kelas' },
  ],
  // 'Evaluasi': [
  //   { value: 'DeleteRencanaEvaluasi', label: '[Delete] Rencana Evaluasi (Mata Kuliah) - hanya bisa UPDATE' },
  //   { value: 'DeleteKomponenEvaluasiKelas', label: '[Delete] Komponen Evaluasi (Kelas) - hanya bisa UPDATE' },
  // ],
  // 'Pembelajaran': [
  //   { value: 'DeleteRencanaPembelajaran', label: '[Delete] Rencana Pembelajaran (Mata Kuliah) - belum dicoba' },
  // ],
  
};

const TEMPLATE_FILES = {
  DeleteKelasKuliah               : 'del_kelas_kuliah.xlsx',
  DeleteDosenPengajarKelasKuliah  : 'del_dosen_ajar_kelas.xlsx',
  DeletePesertaKelasKuliah        : 'del_peserta_kelas.xlsx',
};


const METHOD_CONFIG = {

  DeleteKelasKuliah: {
    targetFields: [
      'periode',
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'kode_prodi','nama_prodi',
      'nama_kelas',
    ],
    requiredFields: ['periode','kode_mata_kuliah','nama_kelas',],
    transformFn: function(row) {
      const payload = {
        id_kelas_kuliah: row.__id_kelas_kuliah || '',
      };
      // Simpan _display untuk log
      payload._display = {
        kode_mata_kuliah: row.kode_mata_kuliah,
        nama_mata_kuliah: row.nama_mata_kuliah,
        kode_prodi: row.kode_prodi,
        nama_prodi: row.nama_prodi,
        nama_kelas: row.nama_kelas,
        aksi: 'Hapus Kelas'
      };

      console.log('DeleteKelasKuliah payload:', payload);
      return payload;
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

      // 2. Mata kuliah (ambil id_prodi dari MK)
      if (row.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
        if (mk) {
          row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
          // Simpan id_prodi dari MK untuk lookup prodi
          if (mk.id_prodi || mk._raw?.id_prodi) {
            const prodi = await lookupEngine.lookupProdiById(mk.id_prodi || mk._raw?.id_prodi);
            if (prodi) {
              row.kode_prodi = prodi.kode_prodi;   // kode pendek, misal "86231"
              row.nama_prodi = prodi.nama_prodi || row.nama_prodi;
            }
          }
        }
      }

      // 3. Kelas → id_kelas_kuliah
      const kodeMk = String(row.kode_mata_kuliah || '').trim();
      const namaKelas = String(row.nama_kelas || '').trim();
      const idSem = row.__id_semester;
      if (kodeMk && namaKelas && idSem) {
        const kelas = await lookupEngine.lookupDetailKelasKuliah(kodeMk, namaKelas, idSem);
        if (kelas) {
          row.__id_kelas_kuliah = kelas.id_kelas_kuliah;
          row.status = 'Siap dihapus';
        } else {
          row.__errors.nama_kelas = 'Kelas tidak ditemukan';
        }
      } else {
        if (!kodeMk) row.__errors.kode_mata_kuliah = 'Kode MK kosong';
        if (!namaKelas) row.__errors.nama_kelas = 'Nama kelas kosong';
        if (!idSem) row.__errors.periode = 'Semester tidak valid';
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : row.status || 'OK';
    }
  },

  // WS tidak mendukung DELETE DeleteKomponenEvaluasiKelas
  DeleteRencanaEvaluasi: {
    targetFields: [
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'id_jenis_evaluasi',
      'nama_evaluasi', 
      'nomor_urut',

    ],
    // Hapus 'nama_evaluasi' dari requiredFields
    requiredFields: ['kode_mata_kuliah', 'id_jenis_evaluasi', 'nomor_urut'],

    transformFn: function(row) {
      const payload = {
        id_rencana_evaluasi: row.__id_rencana_evaluasi || '',
      };
      // Simpan _display untuk log
      payload._display = {
        kode_mata_kuliah: row.kode_mata_kuliah,
        nama_evaluasi: row.nama_evaluasi || '',
        nomor_urut: row.nomor_urut
      };

      console.log('DeleteRencanaEvaluasi payload:', payload);
      return payload;
    },

    performLookup: async function(row, lookupEngine) {
      row.__errors = {};

      if (row.kode_mata_kuliah && row.id_jenis_evaluasi && row.nomor_urut) {
          try {
            const list = await lookupEngine.api.getListRencanaEvaluasi({
              kode_mata_kuliah: String(row.kode_mata_kuliah).trim()
            });

            const arr = Array.isArray(list) ? list : (list?.data || []);
            const targetNama = row.nama_evaluasi ? String(row.nama_evaluasi).trim() : null;
            
            const found = arr.find(item =>
              item.id_jenis_evaluasi == parseInt(row.id_jenis_evaluasi) &&
              item.nomor_urut == parseInt(row.nomor_urut) &&
              // jika targetNama ada, cocokkan; jika tidak, abaikan filter nama
              (targetNama === null || item.nama_evaluasi === targetNama)
            );

            if (found && found.id_rencana_evaluasi) {
              row.__id_rencana_evaluasi = found.id_rencana_evaluasi;
              row.nama_mata_kuliah = found.nama_mata_kuliah || '';
              // Isi nama_evaluasi dari server jika di Excel kosong
              if (!row.nama_evaluasi || row.nama_evaluasi.trim() === '') {
                row.nama_evaluasi = found.nama_evaluasi || '';
              }
              row.status = 'Siap dihapus';
            } else {
              row.__errors.nama_evaluasi = 'Data tidak ditemukan';
            }
          } catch (e) {
            row.__errors.kode_mata_kuliah = 'Gagal mengambil data';
          }

      } else {
        if (!row.kode_mata_kuliah) row.__errors.kode_mata_kuliah = 'Kode MK harus diisi';
        if (!row.id_jenis_evaluasi) row.__errors.id_jenis_evaluasi = 'ID jenis evaluasi harus diisi';
        if (!row.nomor_urut) row.__errors.nomor_urut = 'Nomor urut harus diisi';
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : row.status || 'OK';
    }
  },
  
  // WS tidak mendukung DELETE DeleteKomponenEvaluasiKelas 
  DeleteKomponenEvaluasiKelas: {
    targetFields: [
      'periode',
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'nama_prodi',
      'nama_kelas',
      'id_jenis_evaluasi',
      'nama_komponen',
      'nomor_urut'
    ],
    requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'id_jenis_evaluasi', 'nomor_urut'],
    transformFn: function(row) {
      const params = {
        // id_komponen_evaluasi: row.__id_komponen_evaluasi || '',
        id_kelas_kuliah: row.__id_kelas_kuliah || '',
        id_jenis_evaluasi: parseInt(row.id_jenis_evaluasi) || 1,
        nama: sanitizeText(row.nama_komponen || '')
      };
      return {
        ...params,
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_kelas: row.nama_kelas,
          nama_komponen: row.nama_komponen || '(tanpa nama)',
          nomor_urut: row.nomor_urut
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

      // 3. Kelas kuliah → id_kelas_kuliah
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


      // 4. Cari komponen berdasarkan id_kelas, id_jenis, dan nomor_urut (seperti Update)
      if (row.__id_kelas_kuliah && row.id_jenis_evaluasi && row.nomor_urut) {
        try {
          // Gunakan lookupByIdUrut untuk mendapatkan id_komponen_evaluasi secara akurat
          const komponen = await lookupEngine.lookupKomponenEvaluasiByIdUrut(
            row.__id_kelas_kuliah,
            parseInt(row.id_jenis_evaluasi),
            parseInt(row.nomor_urut)
          );
          if (komponen && komponen.id_komponen_evaluasi) {
            // Simpan id_komponen_evaluasi untuk referensi (tidak dikirim ke server)
            row.__id_komponen_evaluasi = komponen.id_komponen_evaluasi;
            // Isi nama_komponen dari server jika di Excel kosong
            if (!row.nama_komponen || String(row.nama_komponen).trim() === '') {
              row.nama_komponen = komponen.nama || '';
            }
            row.status = 'Siap dihapus';
          } else {
            row.__errors.nama_komponen = 'Komponen tidak ditemukan';
          }
        } catch (e) {
          row.__errors.nama_komponen = 'Gagal mengambil data komponen';
        }
      } else {
        if (!row.__id_kelas_kuliah) row.__errors.nama_kelas = 'Kelas tidak valid';
        if (!row.id_jenis_evaluasi) row.__errors.id_jenis_evaluasi = 'ID jenis evaluasi harus diisi';
        if (!row.nomor_urut) row.__errors.nomor_urut = 'Nomor urut harus diisi';
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : row.status || 'OK';
    }
  },

  // belum dicoba, karena WS tidak mendukung DELETE DeleteRencanaPembelajaran
  DeleteRencanaPembelajaran: {
    targetFields: [
      'kode_mata_kuliah', 'nama_mata_kuliah',
      'nama_evaluasi',
   
    ],
    requiredFields: ['kode_mata_kuliah', 'nama_evaluasi'],
    transformFn: function(row) {
      return row.__id_rencana_ajar || '';
    },
    performLookup: async function(row, lookupEngine) {
      row.__errors = {};
      if (row.kode_mata_kuliah && row.nama_evaluasi) {
        const rencana = await lookupEngine.lookupRencanaPembelajaran(
          String(row.kode_mata_kuliah).trim(),
          String(row.nama_evaluasi).trim()
        );
        if (rencana) {
          row.__id_rencana_ajar = rencana.id_rencana_ajar;
          row.nama_mata_kuliah = rencana._raw?.nama_mata_kuliah || '';
          row.status = 'Siap dihapus';
        } else {
          row.__errors.nama_evaluasi = 'Data tidak ditemukan';
        }
      } else {
        if (!row.kode_mata_kuliah) row.__errors.kode_mata_kuliah = 'Kode MK harus diisi';
        if (!row.nama_evaluasi) row.__errors.nama_evaluasi = 'Nama evaluasi harus diisi';
      }
      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : row.status || 'OK';
    }
  },

  // DELETE Dosen Pengajar Kelas
  DeleteDosenPengajarKelasKuliah: {
    targetFields: [
      'periode',
      'nuptk',
      'nama_dosen',
      'nama_kelas',
      'kode_mata_kuliah', 'nama_mata_kuliah',
    
    ],
    requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'nuptk'],
    transformFn: function(row) {
      return {
        id_aktivitas_mengajar: row.__id_aktivitas_mengajar || '',
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_dosen: row.nama_dosen || row.nuptk,
          kelas: row.nama_kelas
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

      // 2. Nama mata kuliah (referensi)
      if (row.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
        if (mk) {
          row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
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

      // 4. Cari aktivitas mengajar berdasarkan nuptk dan id_kelas_kuliah
      if (row.__id_kelas_kuliah && row.nuptk) {
        const aktivitas = await lookupEngine.lookupAktivitasMengajar(
          String(row.nuptk).trim(),
          row.__id_kelas_kuliah
        );
        if (aktivitas) {
          row.__id_aktivitas_mengajar = aktivitas.id_aktivitas_mengajar;
          row.nama_dosen = aktivitas._raw?.nama_dosen || row.nama_dosen || '';
          row.status = 'Siap dihapus';
        } else {
          row.__errors.nuptk = 'Aktivitas mengajar tidak ditemukan';
        }
      } else {
        if (!row.__id_kelas_kuliah) row.__errors.nama_kelas = row.__errors.nama_kelas || 'Kelas tidak valid';
        if (!row.nuptk) row.__errors.nuptk = 'NUPTK harus diisi';
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : row.status || 'OK';
    }
  },

  // DELETE Peserta Kelas
  DeletePesertaKelasKuliah: {
    targetFields: [
      'periode',
      'nim', 'nama_mahasiswa',
      'nama_kelas',
      'kode_mata_kuliah', 'nama_mata_kuliah',
      
    ],
    requiredFields: ['periode', 'nim', 'kode_mata_kuliah', 'nama_kelas'],
    transformFn: function(row) {
      return {
        id_kelas_kuliah: row.__id_kelas_kuliah || '',
        id_registrasi_mahasiswa: row.__id_registrasi_mahasiswa || '',
        _display: {
          kode_mata_kuliah: row.kode_mata_kuliah,
          nama_mahasiswa: row.nama_mahasiswa || row.nim,
          kelas: row.nama_kelas
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

      // 3. Mata kuliah (referensi)
      if (row.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(String(row.kode_mata_kuliah).trim());
        if (mk) {
          row.nama_mata_kuliah = mk.nama_mata_kuliah || row.nama_mata_kuliah;
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

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'Siap dihapus';
    }
  },


};

export function renderDeleteView(container) {
  let currentMethod = 'DeleteKelasKuliah';
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
    return METHOD_CONFIG[currentMethod] || METHOD_CONFIG['DeleteKelasKuliah'];
  }

  container.innerHTML = `
  
    <div id="wizard-container" class="space-y-6">
      <div id="step1" class="glass p-6 rounded-2xl">
        <h3 class="text-xl font-bold mb-4">Step 1: Pilih Method Delete</h3>
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
    const filePath = `template/delete/${templateFileName}`;

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