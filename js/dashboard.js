import { NeoFeederAPI } from './api.js';
import { STORAGE_KEYS } from './config.js';
import { Logger } from './logger.js';
import { log, loggerInst } from './loggerView.js';

export async function renderDashboard(container) {
  const api = new NeoFeederAPI();
  const logger = new Logger();

  // Tampilan awal
  container.innerHTML = `
  <h2 class="text-2xl font-bold mb-6">Dashboard</h2>
  
  <div id="api-status" class=" text-white mb-6 px-4 py-2 rounded-xl inline-flex items-center dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
    <span id="api-dot" class="inline-block w-3 h-3 rounded-full mr-2 bg-yellow-400 animate-pulse"></span>
    <span id="api-text" class="text-sm text-white font-medium dark:text-gray-400">Memeriksa koneksi...</span>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Kode PT</div>
      <div class="text-2xl font-bold mt-1" id="profil-pt">Memuat...</div>
    </div>
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Prodi</div>
      <div class="text-2xl font-bold mt-1" id="count-prodi">-</div>
    </div>
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Dosen</div>
      <div class="text-2xl font-bold mt-1" id="count-dosen">-</div>
    </div>
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Mahasiswa</div>
      <div class="text-2xl font-bold mt-1" id="count-mahasiswa">-</div>
    </div>
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Mata Kuliah</div>
      <div class="text-2xl font-bold mt-1" id="count-matakuliah">-</div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div class="glass p-4 rounded-xl">
      <h3 class="font-semibold mb-3">Import Hari Ini</h3>
      <div id="import-today" class="text-sm text-gray-600 dark:text-gray-400">Menghitung...</div>
    </div>
    <div class="glass p-4 rounded-xl">
      <h3 class="font-semibold mb-3">Aktivitas Terakhir</h3>
      <div id="recent-activity" class="text-sm max-h-48 overflow-y-auto space-y-1 text-gray-600 dark:text-gray-400"></div>
    </div>
  </div>
`;

  // 1. Ambil profil PT (prioritas)
  try {
    const profilRes = await api.getProfilPT();
    // console.log('Profil PT dari API:', profilRes);
    const profil = Array.isArray(profilRes) ? profilRes[0] : profilRes;
    if (profil && profil.nama_perguruan_tinggi) {
      document.getElementById('profil-pt').textContent = `${profil.kode_perguruan_tinggi}`;
      localStorage.setItem(STORAGE_KEYS.PROFIL_PT, JSON.stringify(profil));
      document.getElementById('api-dot').className = 'inline-block w-3 h-3 rounded-full mr-2 bg-green-500';
      document.getElementById('api-text').textContent = 'Terhubung';
    } else {
      document.getElementById('profil-pt').textContent = 'Tidak diketahui';
      document.getElementById('api-dot').className = 'inline-block w-3 h-3 rounded-full mr-2 bg-yellow-400';
      document.getElementById('api-text').textContent = 'Profil tidak lengkap';
    }
  } catch (e) {
    document.getElementById('profil-pt').textContent = 'Gagal memuat';
    document.getElementById('api-dot').className = 'inline-block w-3 h-3 rounded-full mr-2 bg-red-500';
    document.getElementById('api-text').textContent = 'Gagal: ' + e.message;
    console.warn('getProfilPT error:', e);
  }

  // 2. Referensi lainnya (paralel, tidak saling bergantung)
  const getCount = (data) => {
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.data)) return data.data.length;
      if (Array.isArray(data.result)) return data.result.length;
      return Object.keys(data).length;
    }
    return 0;
  };

  const fetchRef = async (method, idCount) => {
    try {
      const data = await api[method]();
      document.getElementById(idCount).textContent = getCount(data);
    } catch (e) {
      document.getElementById(idCount).textContent = 'Error';
      console.warn(method, e);
    }
  };

  await Promise.all([
    fetchRef('getProdi', 'count-prodi'),
    fetchRef('getListDosen', 'count-dosen'),
    fetchRef('getListMahasiswa', 'count-mahasiswa'),
    fetchRef('getListMataKuliah', 'count-matakuliah')
  ]);

  // Import hari ini
  const today = new Date().toISOString().slice(0, 10);
  const logs = logger.getLogs();
  const todayLogs = logs.filter(l => l.timestamp.startsWith(today));
  const successToday = todayLogs.filter(l => l.level === 'info' && l.message === 'Row imported').length;
  const failedToday = todayLogs.filter(l => l.level === 'error').length;
  document.getElementById('import-today').innerHTML = `
    <span class="text-green-500">✅ Sukses: ${successToday}</span> &nbsp;
    <span class="text-red-500">❌ Gagal: ${failedToday}</span>
  `;

  // Aktivitas terakhir
  const recent = logs.slice(-5).reverse();
  const activityDiv = document.getElementById('recent-activity');
  if (recent.length === 0) {
    activityDiv.innerHTML = '<p class=">Belum ada aktivitas.</p>';
  } else {
    activityDiv.innerHTML = recent.map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString();
      return `<div class="py-1"><span class="text-gray-400">${time}</span> ${l.message}</div>`;
    }).join('');
  }
}