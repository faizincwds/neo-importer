import { NeoFeederAPI } from './api.js';
import { showToast } from './utils.js';

// Daftar endpoint referensi yang ingin ditampilkan
const REFERENSI_LIST = [
  { method: 'GetProfilPT', label: 'Profil PT' },
  { method: 'GetProdi', label: 'Daftar Prodi' },
  { method: 'GetListDosen', label: 'Daftar Dosen' },
  { method: 'GetAgama', label: 'Daftar Agama' },
  { method: 'GetListMahasiswa', label: 'Daftar Mahasiswa' },
  { method: 'GetListMataKuliah', label: 'Daftar Mata Kuliah' },
  { method: 'GetListKelasKuliah', label: 'Daftar Kelas Kuliah' },
  { method: 'GetSemester', label: 'Daftar Semester' },
  { method: 'GetJenisEvaluasi', label: 'Jenis Evaluasi' },
  { method: 'GetListRencanaEvaluasi', label: 'Rencana Evaluasi' },
  { method: 'GetListKomponenEvaluasiKelas', label: 'Komponen Evaluasi Kelas' },
  // Tambahkan endpoint lain sesuai kebutuhan
];

export async function renderReferensiView(container) {
  const api = new NeoFeederAPI();

  container.innerHTML = `
    <div class="glass p-6 rounded-2xl">
      <h2 class="text-2xl font-bold mb-4">📚 Data Referensi</h2>
      <p class="mb-4 text-sm opacity-70">Pilih endpoint untuk melihat data. Header diambil dari GetDictionary.</p>
      
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6" id="ref-buttons">
        ${REFERENSI_LIST.map(ref => `
          <button data-method="${ref.method}" class="ref-btn px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition text-sm">
            ${ref.label}
          </button>
        `).join('')}
      </div>

      <div id="ref-status" class="text-sm mb-3"></div>
      
      <!-- Container untuk tabel -->
      <div id="ref-table-container" class="overflow-x-auto">
        <p class="text-gray-500">Silakan pilih salah satu referensi di atas.</p>
      </div>
    </div>
  `;

  // Event listener untuk setiap tombol referensi
  document.querySelectorAll('.ref-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const method = btn.dataset.method;
      await loadReferensiData(method);
    });
  });

  async function loadReferensiData(method) {
    const statusEl = document.getElementById('ref-status');
    const tableContainer = document.getElementById('ref-table-container');
    
    statusEl.innerHTML = `<span class="text-blue-500">⏳ Memuat ${method}...</span>`;
    tableContainer.innerHTML = `<div class="text-center py-8"><span class="animate-spin text-2xl">⏳</span></div>`;

    try {
      // Panggil API sesuai method
      let response;
      switch(method) {
        case 'GetProfilPT':
          response = await api.call('GetProfilPT');
          break;
        case 'GetProdi':
          response = await api.call('GetProdi');
          break;
        case 'GetListDosen':
          response = await api.call('GetListDosen');
          break;
        case 'GetListMahasiswa':
          response = await api.call('GetListMahasiswa');
          break;
        case 'GetAgama':
          response = await api.call('GetAgama');
          break;
        case 'GetListMataKuliah':
          response = await api.call('GetListMataKuliah');
          break;
        case 'GetListKelasKuliah':
          response = await api.call('GetListKelasKuliah', { limit: 20 });
          break;
        case 'GetSemester':
          response = await api.call('GetSemester', { filter: `a_periode_aktif='1'` });
          break;
        case 'GetJenisEvaluasi':
          response = await api.call('GetJenisEvaluasi');
          break;
        case 'GetListRencanaEvaluasi':
          response = await api.call('GetListRencanaEvaluasi', { limit: 20 });
          break;
        case 'GetListKomponenEvaluasiKelas':
          response = await api.call('GetListKomponenEvaluasiKelas', { limit: 100 });
          break;
        default:
          throw new Error(`Method ${method} tidak dikenali`);
      }

      // Ekstrak data dari respons
      const data = api.extractData(response);
      
      if (!data) {
        throw new Error('Data kosong atau format tidak dikenali');
      }

      // Dapatkan dictionary untuk header (opsional, bisa juga langsung dari data)
      let dictionary = null;
      try {
        const dictRes = await api.call('GetDictionary', { fungsi: method });
        dictionary = api.extractData(dictRes);
      } catch (e) {
        console.warn('Gagal mengambil dictionary:', e);
      }

      // Render tabel
      renderTable(tableContainer, data, dictionary, method);
      statusEl.innerHTML = `<span class="text-green-500">✅ Data berhasil dimuat (${Array.isArray(data) ? data.length : 1} record)</span>`;

    } catch (err) {
      statusEl.innerHTML = `<span class="text-red-500">❌ Gagal: ${err.message}</span>`;
      tableContainer.innerHTML = `<p class="text-red-400">Error: ${err.message}</p>`;
    }
  }

  function renderTable(container, data, dictionary, method) {
    // Jika data bukan array, bungkus jadi array
    const records = Array.isArray(data) ? data : [data];
    
    if (records.length === 0) {
      container.innerHTML = '<p class="text-gray-500">Tidak ada data.</p>';
      return;
    }

    // Tentukan header: gunakan dictionary response jika ada, jika tidak ambil dari keys record pertama
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
    
    // Fallback: ambil semua keys dari data pertama
    if (headers.length === 0) {
      headers = Object.keys(records[0]).map(key => ({ field: key, label: key }));
    }

    // Bangun tabel HTML
    let html = `<div class="overflow-x-auto"><table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-gray-200 dark:bg-gray-700 sticky top-0">
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