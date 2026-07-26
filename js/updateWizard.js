import { NeoFeederAPI } from './api.js';
import { LookupEngine } from './lookupEngine.js';
import { GridEditor } from './gridEditor.js';
import { ImportProcess } from './importProcess.js';
import { autoMapHeaders } from './mappingEngine.js';
import { Validator } from './validator.js';
import { sanitizeText, showToast } from './utils.js';


const METHOD_GROUPS = {
  'Komponen Evaluasi': [
    { value: 'UpdateKomponenEvaluasiKelas', label: '[Edit] Komponen Evaluasi Kelas' },
  ],
  'Nilai': [
    { value: 'UpdateNilaiLengkap', label: '[Input] Nilai Perkuliahan & Komponen' },
  ]
};

const METHOD_CONFIG = {

  UpdateKomponenEvaluasiKelas: {
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
      'uas'
      ],
      requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas'],
      transformFn: function(row) {
      const records = [];
      const komponenDefs = [
          { field: 'aktivitas_partisipatif', jenis: 2, nama_inggris: 'Presence' ,nama: 'Aktivitas Partisipatif', urut: 1 },
          { field: 'hasil_proyek', jenis: 3, nama_inggris: 'Project' ,nama: 'Hasil Proyek', urut: 2 },
          { field: 'tugas', jenis: 4, nama_inggris: 'TGS' ,nama: 'TGS', urut: 3 },
          { field: 'quiz', jenis: 4, nama_inggris: 'QIZ' ,nama: 'QIZ', urut: 4 },
          { field: 'uts', jenis: 4, nama_inggris: 'UTS' ,nama: 'UTS', urut: 5 },
          { field: 'uas', jenis: 4, nama_inggris: 'UAS' ,nama: 'UAS', urut: 6 },
      ];

      console.log('UpdateKomponenEvaluasiKelas - existing ids:', row.__existing_komponen_ids);

      for (const def of komponenDefs) {
          const bobot = parseFloat(row[def.field]) || 0;
          const existingId = row.__existing_komponen_ids && row.__existing_komponen_ids[def.field];
          if (existingId) {
          records.push({
              key: { id_komponen_evaluasi: existingId },
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
              aksi: 'update'
              }
          });
          } else if (bobot > 0) {
          // Komponen tidak ditemukan, beri error
          if (!row.__errors) row.__errors = {};
          row.__errors[def.field] = `Komponen ${def.nama} tidak ditemukan untuk diupdate`;
          }
      }
      return records; // array
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

      // 4. Cari id komponen yang sudah ada
      if (row.__id_kelas_kuliah) {
          const komponenDefs = [
          { field: 'aktivitas_partisipatif', jenis: 2, nama: 'Aktivitas Partisipatif' },
          { field: 'hasil_proyek', jenis: 3, nama: 'Hasil Proyek' },
          { field: 'tugas', jenis: 4, nama: 'TGS' },
          { field: 'quiz', jenis: 4, nama: 'QIZ' },
          { field: 'uts', jenis: 4, nama: 'UTS' },
          { field: 'uas', jenis: 4, nama: 'UAS' },
          ];

          row.__existing_komponen_ids = {};
          for (const def of komponenDefs) {
          const komponen = await lookupEngine.lookupKomponenEvaluasi(
              row.__id_kelas_kuliah,
              def.jenis,
              def.nama
          );
          if (komponen && komponen.id_komponen_evaluasi) {
              row.__existing_komponen_ids[def.field] = komponen.id_komponen_evaluasi;
          }
          }
      }

      const errs = Object.values(row.__errors).filter(m => m);
      row.status = errs.length > 0 ? errs.join('; ') : 'OK';
      }
  },

  UpdateNilaiPerkuliahanKelas: {
      targetFields: [
          'periode',
          'nama_prodi',
          'nim', 'nama_mahasiswa',
          'kode_mata_kuliah', 'nama_mata_kuliah', 'nama_kelas',
          'nilai_angka', 'nilai_indeks', 'nilai_huruf',
          
      ],
      requiredFields: ['periode', 'kode_mata_kuliah', 'nama_kelas', 'nim','nilai_indeks', 'nilai_huruf'],
          transformFn: function(row) {
          // Kembalikan objek dengan key dan record terpisah
          return {
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

          // 2. Mata Kuliah & Prodi
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

          // 3. Kelas
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

          // 4. Mahasiswa by NIM
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

          // 5. Validasi nilai
          // if (!row.nilai_angka || isNaN(parseFloat(row.nilai_angka))) row.__errors.nilai_angka = 'Nilai angka tidak valid';
          if (!row.nilai_indeks || isNaN(parseFloat(row.nilai_indeks))) row.__errors.nilai_indeks = 'Nilai indeks tidak valid';
          if (!row.nilai_huruf) row.__errors.nilai_huruf = 'Nilai huruf harus diisi';
          if (!row.__id_prodi || row.__id_prodi.length < 10) row.__errors.kode_prodi = 'UUID prodi tidak valid';

          const errs = Object.values(row.__errors).filter(m => m);
          row.status = errs.length > 0 ? errs.join('; ') : 'OK';
      }
  },
  
  UpdateNilaiPerkuliahanKelasKomponenEvaluasi: {
      targetFields: [
          'nim', 'nama_mahasiswa',
          'kode_mata_kuliah', 'nama_mata_kuliah',
          'nama_prodi', 'periode', 'nama_kelas',
          'aktivitas_partisipatif', 'hasil_proyek', 'quiz', 'tugas', 'uts', 'uas',
      ],
      requiredFields: ['nim', 'kode_mata_kuliah', 'periode', 'nama_kelas','aktivitas_partisipatif', 'quiz', 'tugas', 'uts', 'uas',],
      transformFn: function(row) {
          const records = [];
          const komponenDefs = [
          { field: 'aktivitas_partisipatif', jenis: 2, nama_inggris: 'Presence' ,nama: 'Aktivitas Partisipatif', urut: 1 },
          { field: 'hasil_proyek', jenis: 3, nama_inggris: 'Project' ,nama: 'Hasil Proyek', urut: 2 },
          { field: 'tugas', jenis: 4, nama_inggris: 'TGS' ,nama: 'TGS', urut: 3 },
          { field: 'quiz', jenis: 4, nama_inggris: 'QIZ' ,nama: 'QIZ', urut: 4 },
          { field: 'uts', jenis: 4, nama_inggris: 'UTS' ,nama: 'UTS', urut: 5 },
          { field: 'uas', jenis: 4, nama_inggris: 'UAS' ,nama: 'UAS', urut: 6 },
          ];

          for (const def of komponenDefs) {
          const raw = parseFloat(row[def.field]) || 0;
          const nilai = Math.round(raw); // bulatkan ke integer
          if (nilai > 0) {
              // Gunakan __existing_komponen_info yang sudah diisi performLookup
              const info = row.__existing_komponen_info && row.__existing_komponen_info[def.field];
              const idKomponen = info ? info.id : null;
              if (idKomponen) {
              records.push({
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
                  komponen: def.nama,
                  nilai: nilai
                  }
              });
              } else {
              // Komponen tidak ditemukan → catat error
              if (!row.__errors) row.__errors = {};
              row.__errors[def.field] = `Komponen ${def.nama} tidak ditemukan`;
              }
          }
          }
          return records; // array
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

          // 3. Mata kuliah
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

          // 5. Cek komponen yang sudah ada
          if (row.__id_kelas_kuliah) {
          const komponenDefs = [
              { field: 'aktivitas_partisipatif', jenis: 2, nama_inggris: 'Presence', nama: 'Aktivitas Partisipatif', urut: 1 },
              { field: 'hasil_proyek', jenis: 3, nama_inggris: 'Project', nama: 'Hasil Proyek', urut: 2 },
              { field: 'tugas', jenis: 4, nama_inggris: 'TGS', nama: 'TGS', urut: 3 },
              { field: 'quiz', jenis: 4, nama_inggris: 'QUIZ', nama: 'QIZ', urut: 4 },
              { field: 'uts', jenis: 4, nama_inggris: 'UTS', nama: 'UTS', urut: 5 },
              { field: 'uas', jenis: 4, nama_inggris: 'UAS', nama: 'UAS', urut: 6 },
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


export function renderUpdateView(container) {
  let currentMethod = 'UpdateKomponenEvaluasiKelas';
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
    return METHOD_CONFIG[currentMethod] || METHOD_CONFIG['UpdateKomponenEvaluasiKelas'];
  }

  container.innerHTML = `
    <div id="wizard-container" class="space-y-6">
      <div id="step1" class="glass p-6 rounded-2xl">
        <h3 class="text-xl font-bold mb-4">Step 1: Pilih Method Import</h3>
          <select id="method-select" class="w-full p-3 rounded-xl bg-white dark:bg-gray-800">
            ${Object.entries(METHOD_GROUPS).map(([groupName, methods]) => `
              <optgroup label="${groupName}">
                ${methods.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
              </optgroup>
            `).join('')}
          </select>
        <button id="next-to-step2" class="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl">Selanjutnya</button>
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
          <button id="delete-empty-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-xl">Hapus Baris Kosong</button>
          <button id="delete-dup-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-xl">Hapus Duplikat</button>
          <button id="restore-btn" class="px-4 py-2 bg-gray-500 text-white rounded-xl">Restore</button>
          <button id="next-to-step3" class="px-6 py-2 bg-blue-600 text-white rounded-xl ml-auto">Import Data</button>
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
          <button id="pause-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-xl">Pause</button>
          <button id="resume-btn" class="px-4 py-2 bg-green-500 text-white rounded-xl hidden">Resume</button>
          <button id="cancel-btn" class="px-4 py-2 bg-red-500 text-white rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('next-to-step2').addEventListener('click', () => {
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
          let kelas = disp.kelas || row.kelas || row.nama_kelas_kuliah || '?';
          let aksi = disp.aksi || row.tipe || currentMethod;
          let status = log.message;

          const nim = disp.nim || '';
          const extra = nim ? ` (NIM: ${nim})` : '';
          
          let info = `[${mk}] | kelas: [${kelas}] | ${nama} | aksi: [${aksi}] | status: ${status}`;
          if (info.length > 100) info = info.substring(0, 97) + '...';
          
          let detail = '';
          if (log.type === 'failed') {
            detail = `<br><small class="text-gray-400">Payload: ${JSON.stringify(row)}</small>`;
          }
           return `<div class="py-1">${icon} ${info}${detail}</div>`;
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

                // summaryHTML += `<div class="py-1">✅ [${mk}] | ${kelas} | aksi: ${aksiStr} | status: ${detailStr}</div>`;
                summaryHTML += `<div class="py-1">✅ [${mk}] | [${kelas}] | ${nama} | Aksi: [${aksiStr}] | Status: ${detailStr} </div>`;
            }

            // Detail gagal
            failedLogs.forEach(log => {
                const disp = log.row._display || {};

                const mk = disp.kode_mata_kuliah || '?';
                const nama = disp.nama_mata_kuliah || disp.nama_dosen || disp.nama_mahasiswa || disp.nama_evaluasi || disp.nama_komponen || '';
                const kelas = disp.kelas || disp.nama_kelas_kuliah || '?';
                const aksi = disp.tipe || currentMethod;
                summaryHTML += `<div class="py-1">❌ [${mk}] | kelas: [${kelas}] | ${nama} | aksi: [${aksi}] | status: ${log.message}</div>`;
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