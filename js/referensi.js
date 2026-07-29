import { NeoFeederAPI } from './api.js';
import { showToast } from './utils.js';

const REFERENSI_LIST = [
  { method: 'GetProfilPT', label: 'Profil PT' },
  { method: 'GetProdi', label: 'Daftar Prodi' },
  { method: 'GetPeriode', label: 'Daftar Periode' },
  { method: 'GetSemester', label: 'Daftar Semester' },
  { method: 'GetListDosen', label: 'Daftar Dosen' },
  { method: 'GetListMahasiswa', label: 'Daftar Mahasiswa' },
  { method: 'GetListMataKuliah', label: 'Daftar Mata Kuliah' },
  { method: 'GetListKelasKuliah', label: 'Daftar Kelas Kuliah' },
  { method: 'GetListRencanaEvaluasi', label: 'Rencana Evaluasi' },
  { method: 'GetListKomponenEvaluasiKelas', label: 'Komponen Evaluasi Kelas' },
  { method: 'GetAgama', label: 'Daftar Agama' },
  { method: 'GetBentukPendidikan', label: 'Daftar Bentuk Pendidikan' },
  { method: 'GetIkatanKerjaSdm', label: 'Daftar Ikatan Kerja SDM' },
  { method: 'GetJabfung', label: 'Daftar Jafung' },
  { method: 'GetJenisSertifikasi', label: 'Daftar Jenis Sertifikasi' },
  { method: 'GetPangkatGolongan', label: 'Daftar Pangkat Golongan' },
  { method: 'GetStatusKeaktifanPegawai', label: 'Daftar Status Keaktifan Pegawai' },
  { method: 'GetStatusKepegawaian', label: 'Daftar Status Kepegawaian' },
  { method: 'GetJenisSMS', label: 'Daftar Jenis SMS' },
  { method: 'GetTahunAjaran', label: 'Daftar Tahun Ajaran' },
  { method: 'GetStatusMahasiswa', label: 'Daftar Status Mahasiswa' },
  { method: 'GetJenisPendaftaran', label: 'Daftar Jenis Pendaftaran' },
  { method: 'GetJenjangPendidikan', label: 'Daftar Jejang Pendidikan' },
  { method: 'GetJenisTinggal', label: 'Daftar Jenis Tinggal' },
  { method: 'GetJalurMasuk', label: 'Daftar Jalur Masuk' },
  { method: 'GetJenisKeluar', label: 'Daftar Jalur Keluar' },
  { method: 'GetKebutuhanKhusus', label: 'Daftar Kebutuhan Khusus' },
  { method: 'GetNegara', label: 'Daftar Negara' },
  { method: 'GetLevelWilayah', label: 'Level Wilayah' },
  { method: 'GetWilayah', label: 'Daftar Wilayah' },
  { method: 'GetPekerjaan', label: 'Pekerjaan' },
  { method: 'GetPenghasilan', label: 'Penghasilan' },
  { method: 'GetAlatTransportasi', label: 'Alat Transportasi' },
  { method: 'GetPembiayaan', label: 'Jenis Pembiayaan' },
  { method: 'GetJenisPrestasi', label: 'Jenis Prestasi' },
  { method: 'GetTingkatPrestasi', label: 'Jenis Tingkat Prestasi' },
  { method: 'GetJenisAktivitasMahasiswa', label: 'Jenis Aktivitas Mahasiswa' },
  { method: 'GetKategoriKegiatan', label: 'Kategori Kegiatan' },
  { method: 'GetJenisEvaluasi', label: 'Jenis Evaluasi' },
];

// Fungsi untuk menghitung semester aktif
function getIdSemesterAktif() {
  const sekarang = new Date();
  const tahun = sekarang.getFullYear();
  const bulan = sekarang.getMonth() + 1;
  let tahunAkademik, kodeSemester;

  if (bulan >= 2 && bulan <= 8) {
    kodeSemester = 2; // Genap
    tahunAkademik = tahun - 1;
  } else {
    kodeSemester = 1; // Ganjil
    tahunAkademik = (bulan === 1) ? tahun - 1 : tahun;
  }
  return `${tahunAkademik}${kodeSemester}`;
}

async function fetchMethodFields(api, method) {
  try {
    const dictRes = await api.call('GetDictionary', { fungsi: method });
    const data = api.extractData(dictRes);
    // data biasanya { request: {...}, response: {...} }
    const responseFields = data?.response || data?.request;
    if (!responseFields) return [];
    return Object.keys(responseFields)
      .filter(key => key.startsWith('data['))
      .map(key => {
        const fieldName = key.match(/data\[(.*?)\]/)?.[1] || key;
        return fieldName;
      });
  } catch (e) {
    console.warn('Gagal mengambil field:', e);
    return [];
  }
}

export async function renderReferensiView(container) {
  const api = new NeoFeederAPI();

  container.innerHTML = `
    <div class="glass p-6 rounded-2xl">
      <h2 class="text-2xl font-bold mb-4 dark:text-gray-100">📚 Data Referensi</h2>
      <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">Pilih endpoint dan atur parameter untuk melihat data.</p>

      <div class="mb-6">
        <label class="block text-sm font-medium mb-2">1. Pilih Method</label>
        <select id="ref-method-select" class="w-full p-3 rounded-xl dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-gray-100">
          <option value="">-- Pilih Referensi --</option>
          ${REFERENSI_LIST.map(ref => `<option value="${ref.method}">${ref.label}</option>`).join('')}
        </select>
      </div>

      <div id="ref-params-panel" class="hidden space-y-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 dark:text-gray-100">
        <h4 class="font-semibold text-gray-700 dark:text-gray-100">2. Opsi Parameter</h4>

        <!-- Filter Cepat (otomatis dari field) -->
        <div>
          <label class="block text-sm mb-1 text-gray-600 dark:text-gray-400">Filter Cepat (berdasarkan field)</label>
          <select id="ref-filter-field" class="w-full p-2 rounded-lg bg-gray-50 border border-gray-200 dark:border-gray-600 dark:text-gray-100">
            <option value="">-- Pilih Field --</option>
          </select>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600 dark:text-gray-400">Filter (SQL LIKE) – id_='1' </label>
            <input type="text" id="ref-filter" class="w-full p-2 rounded-lg bg-gray-50 border border-gray-200 dark:border-gray-600 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Contoh: nama LIKE '%Agus%'">
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600 dark:text-gray-400">Order</label>
            <input type="text" id="ref-order" class="w-full p-2 rounded-lg bg-gray-50 border border-gray-200 dark:border-gray-600 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Contoh: nama ASC">
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600 dark:text-gray-400">Limit</label>
            <select id="ref-limit" class="w-full p-2 rounded-lg bg-gray-50 border border-gray-200 dark:border-gray-600 dark:text-gray-100">
              <option value="15" selected>15</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="100">100</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600 dark:text-gray-400">Offset</label>
            <input type="number" id="ref-offset" class="w-full p-2 rounded-lg bg-gray-50 border border-gray-200 dark:border-gray-600 dark:text-gray-100" value="0" min="0">
          </div>
        </div>

        <button id="ref-load-btn" class="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">
          Tampilkan Data
        </button>
      </div>

      <div id="ref-status" class="text-sm mb-3 text-gray-600 dark:text-gray-400"></div>
      <div id="ref-table-container" class="overflow-x-auto">
        <p class="text-gray-500 dark:text-gray-400">Silakan pilih salah satu referensi di atas.</p>
      </div>
    </div>
  `;

  // Elemen DOM
  const methodSelect = document.getElementById('ref-method-select');
  const paramsPanel = document.getElementById('ref-params-panel');
  const loadBtn = document.getElementById('ref-load-btn');
  const statusEl = document.getElementById('ref-status');
  const tableContainer = document.getElementById('ref-table-container');
  const filterFieldSelect = document.getElementById('ref-filter-field');
  const filterInput = document.getElementById('ref-filter');

  // Event: saat metode berubah, ambil daftar field dari dictionary dan isi dropdown filter cepat
  methodSelect.addEventListener('change', async () => {
    const method = methodSelect.value;
    if (!method) {
      paramsPanel.classList.add('hidden');
      return;
    }
    paramsPanel.classList.remove('hidden');

    // Ambil field dari dictionary
    const fields = await fetchMethodFields(api, method);
    filterFieldSelect.innerHTML = `
      <option value="">-- Pilih Field --</option>
      <option value="__semester_aktif">Periode Aktif (id_semester = '${getIdSemesterAktif()}')</option>
      ${fields.map(f => `<option value="${f}">${f}</option>`).join('')}
      <option value="__all">Tampilkan Semua (tanpa filter)</option>
    `;
  });

  // Event: saat field dipilih, susun filter otomatis
  filterFieldSelect.addEventListener('change', () => {
    const selected = filterFieldSelect.value;
    if (!selected) {
      filterInput.value = '';
      return;
    }
    if (selected === '__all') {
      filterInput.value = '';
    } else if (selected === '__semester_aktif') {
      filterInput.value = `id_semester = '${getIdSemesterAktif()}'`;
    } else {
      // Untuk field biasa, buat template LIKE kosong
      filterInput.value = `${selected} LIKE '%%'`;
    }
  });

  // Tombol Tampilkan Data
  loadBtn.addEventListener('click', () => {
    const method = methodSelect.value;
    if (!method) {
      return showToast('Pilih metode terlebih dahulu', 'warning');
    }
    loadReferensiData(method);
  });

  async function loadReferensiData(method) {
    statusEl.innerHTML = `<span class="text-blue-500">⏳ Memuat ${method}...</span>`;
    tableContainer.innerHTML = `<div class="text-center py-8"><span class="animate-spin text-2xl">⏳</span></div>`;

    const filter = filterInput.value.trim();
    const order = document.getElementById('ref-order').value.trim();
    const limitValue = document.getElementById('ref-limit').value;
    const offset = parseInt(document.getElementById('ref-offset').value) || 0;

    const params = {};
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (limitValue !== 'all') params.limit = parseInt(limitValue);
    params.offset = offset;

    // Fungsi bantu untuk mengubah LIKE menjadi exact match
    const convertToExactMatch = (filterStr) => {
      // Ubah pola: field LIKE '%value%' menjadi field = 'value'
      // Juga tangani jika tidak ada % di salah satu sisi
      return filterStr.replace(/(\w+)\s+LIKE\s+'%?(.*?)%?'/g, "$1 = '$2'");
    };

    let response, data;

    try {
      // Request pertama
      response = await api.call(method, params);
      data = api.extractData(response);

      // Jika data kosong (tapi tidak error) dan filter pakai LIKE, coba fallback
      if ((!data || (Array.isArray(data) && data.length === 0)) && filter.includes('LIKE')) {
        const altFilter = convertToExactMatch(filter);
        console.log('Data kosong, mencoba fallback exact match:', altFilter);
        params.filter = altFilter;
        response = await api.call(method, params);
        data = api.extractData(response);
      }
    } catch (firstErr) {
      // Jika error pertama adalah error 121 (database error karena LIKE tidak didukung)
      if (firstErr.message.includes('121') && filter.includes('LIKE')) {
        const altFilter = convertToExactMatch(filter);
        console.log('Error 121, mencoba fallback exact match:', altFilter);
        params.filter = altFilter;
        try {
          response = await api.call(method, params);
          data = api.extractData(response);
        } catch (secondErr) {
          throw secondErr; // Jika masih gagal, lempar error aslinya
        }
      } else {
        throw firstErr;
      }
    }

    if (!data) throw new Error('Data kosong atau format tidak dikenali');

    // Dictionary untuk header (opsional)
    let dictionary = null;
    try {
      const dictRes = await api.call('GetDictionary', { fungsi: method });
      dictionary = api.extractData(dictRes);
    } catch (e) {
      console.warn('Gagal mengambil dictionary:', e);
    }

    renderTable(tableContainer, data, dictionary);
    const total = Array.isArray(data) ? data.length : 1;
    statusEl.innerHTML = `<span class="text-green-500">✅ Data berhasil dimuat (${total} record)</span>`;
  }

  function renderTable(container, data, dictionary) {
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) {
      container.innerHTML = '<p class="text-gray-500">Tidak ada data.</p>';
      return;
    }

    // Header dari dictionary jika tersedia
    let headers = [];
    if (dictionary && dictionary.response) {
      headers = Object.keys(dictionary.response)
        .filter(key => key.startsWith('data['))
        .map(key => {
          const fieldName = key.match(/data\[(.*?)\]/)?.[1] || key;
          const info = dictionary.response[key] || {};
          return { field: fieldName, label: info.keterangan || fieldName };
        });
    }

    // Fallback ke key dari data pertama
    if (headers.length === 0) {
      headers = Object.keys(records[0]).map(key => ({ field: key, label: key }));
    }

    let html = `<div class="overflow-x-auto"><table class="w-full text-sm border-collapse">
      <thead>
        <tr class="dark:bg-gray-700 text-white sticky top-0">
          <th class="p-2 border dark:border-gray-600">No</th>
          ${headers.map(h => `<th class="p-2 border dark:border-gray-600 whitespace-nowrap" title="${h.label}">${h.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${records.map((record, idx) => `
          <tr class="border-b dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
            <td class="p-2 border dark:border-gray-600">${idx + 1}</td>
            ${headers.map(h => {
              let value = record[h.field];
              if (value === null || value === undefined) value = '';
              else if (typeof value === 'object') value = JSON.stringify(value);
              return `<td class="p-2 border dark:border-gray-600 max-w-xs truncate" title="${value}">${value}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;

    container.innerHTML = html;
  }
}