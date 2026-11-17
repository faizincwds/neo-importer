import { NeoFeederAPI } from './api.js';
import { STORAGE_KEYS, DEBUG_API } from './config.js';
import { Logger } from './logger.js';


export async function renderDashboard(container) {
  const api = new NeoFeederAPI();
  const logger = new Logger();

  // Tampilan awal
  container.innerHTML = `
  <h2 class="text-2xl font-bold mb-6">Dashboard</h2>
  
  <div id="api-status" class=" text-white mb-6 px-4 py-2 rounded-xl inline-flex items-center dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
    <span id="api-dot" class="inline-block w-3 h-3 rounded-full mr-2 bg-yellow-400 animate-pulse"></span>
    <span id="api-text" class="text-sm text-white font-medium dark:text-gray-400">Memeriksa koneksi...</span>
    <span class="ml-2 text-xs text-gray-200 dark:text-gray-500">(${localStorage.getItem(STORAGE_KEYS.API_URL ) || 'http://localhost:3003'} [${localStorage.getItem(STORAGE_KEYS.API_TYPE ) || 'Yang belum dikonfigurasi'}])</span>
  </div>

  <div class="text-2xl font-bold mt-1 mb-4" id="profil-pt">Memuat...</div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Kode PT</div>
      <div class="text-2xl font-bold mt-1" id="kode-pt">Memuat...</div>
    </div>
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Program Studi</div>
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

  <!-- Status per semester — 2 kolom berdampingan -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <!-- Semester Berjalan -->
    <div>
      <h3 class="text-lg font-semibold mb-3">
        Status Mahasiswa — Semester Berjalan
        <span id="sem-berjalan-label" class="text-sm font-normal text-gray-500">—</span>
      </h3>
      <div id="status-cards-berjalan" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
    </div>

    <!-- Semester Sebelumnya -->
    <div>
      <h3 class="text-lg font-semibold mb-3">
        Status Mahasiswa — Semester Sebelumnya
        <span id="sem-lalu-label" class="text-sm font-normal text-gray-500">—</span>
      </h3>
      <div id="status-cards-lalu" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
    </div>
  </div>

  <div class="stat-card p-4 border-l-4 border-amber-500 mb-8">
  <div class="flex items-center justify-between">
    <div>
      <div class="text-sm font-medium dark:text-gray-400">Belum Isi KRS</div>
      <div class="text-xs text-gray-500 mt-1">
        Mahasiswa yang aktif di semester lalu tapi belum ada di semester berjalan
      </div>
    </div>
    <div class="text-3xl font-bold text-amber-600" id="count-belum-krs">—</div>
  </div>
</div>

  <!-- Jenis keluar (dari GetListMahasiswaLulusDO) -->
  <h3 class="text-lg font-semibold mb-3">Status Keluar</h3>
  <div id="jenis-keluar-cards" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8"></div>

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
    if (profil && profil.kode_perguruan_tinggi) {
      document.getElementById('kode-pt').textContent = `${profil.kode_perguruan_tinggi}`;
      document.getElementById('profil-pt').textContent = `${profil.nama_perguruan_tinggi}`;
      localStorage.setItem(STORAGE_KEYS.PROFIL_PT, JSON.stringify(profil));
      document.getElementById('api-dot').className = 'inline-block w-3 h-3 rounded-full mr-2 bg-green-500';
      document.getElementById('api-text').textContent = 'Terhubung';
    } else {
      document.getElementById('kode-pt').textContent = 'Tidak diketahui';
      document.getElementById('profil-pt').textContent = 'Tidak diketahui';
      document.getElementById('api-dot').className = 'inline-block w-3 h-3 rounded-full mr-2 bg-yellow-400';
      document.getElementById('api-text').textContent = 'Profil tidak lengkap';
    }
  } catch (e) {
    document.getElementById('kode-pt').textContent = 'Gagal memuat';
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
      if (data.error_code !== undefined) return 0;   // ← API error, jangan hitung field
      return 0;                                       // ← objek tunggal bukan daftar
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

const renderStatusCards = async () => {
  try {
    const [statusList, semesterAktif] = await Promise.all([
      api.getStatusMahasiswa(),
      api.getSemesterAktif(),
    ]);
    if (!semesterAktif) return;

    const idSemBerjalan = semesterAktif.id_semester;

    const labelBerjalan = document.getElementById('sem-berjalan-label');
    if (labelBerjalan) {
      labelBerjalan.textContent = `(${semesterAktif.nama_semester || idSemBerjalan})`;
    }

    const distBerjalan = await api.getStatusMahasiswaCounts(idSemBerjalan);

    // === CASCADE — cek SEMUA kandidat, pakai yang pertama non-zero ===
    const candidates = await api.getSemesterListBefore(idSemBerjalan, 3);
    const triedIds = [];
    const allResults = [];     // ← simpan semua hasil untuk log
    let distLalu = {};
    let semesterLalu = null;

    for (const sem of candidates) {
      const label = sem.id_semester + (sem.isPendek ? '(P)' : '');
      triedIds.push(label);

      const dist = await api.getStatusMahasiswaCounts(sem.id_semester);
      const total = Object.values(dist || {}).reduce((a, b) => a + b, 0);

      allResults.push({
        id: sem.id_semester,
        nama: sem.nama_semester,
        pendek: sem.isPendek,
        total,
        dist,
      });

      if (DEBUG_API) {
        console.log(`[Status] Coba ${sem.id_semester}${sem.isPendek ? ' (Pendek)' : ''}: total ${total}`);
      }

      // Hanya set semesterLalu SEKALI (pertama yang non-zero)
      if (total > 0 && !semesterLalu) {
        distLalu = dist;
        semesterLalu = sem;
        if (DEBUG_API) console.log(`[Status]   → ketemu ✅ (dipakai)`);
      } else if (DEBUG_API) {
        console.log(`[Status]   → ${total === 0 ? 'kosong' : 'tidak dipakai (sudah ketemu)'}`);
      }
    }

    // Label semester lalu
    const labelLalu = document.getElementById('sem-lalu-label');
    if (labelLalu) {
      if (semesterLalu) {
        const parts = [semesterLalu.nama_semester];
        if (semesterLalu.isPendek) parts.push('Pendek');
        if (candidates[0]?.id_semester !== semesterLalu.id_semester) {
          // parts.push(`Skip ${candidates[0]?.id_semester || '?'}`);
        }
        labelLalu.textContent = `(${parts.join(' — ')})`;
      } else {
        labelLalu.textContent = candidates.length
          ? `(semua kandidat kosong: ${triedIds.join(', ')})`
          : '(tidak ada kandidat)';
      }
    }

    // Render dua set kartu
    const renderSet = (containerId, dist) => {
      const c = document.getElementById(containerId);
      if (!c) return;
      c.innerHTML = statusList.map(s => {
        const id = String(s.id_status_mahasiswa).trim().toUpperCase();
        const count = dist[id] ?? 0;
        return `
          <div class="stat-card p-3">
            <div class="text-xs font-medium dark:text-gray-400">${s.nama_status_mahasiswa}</div>
            <div class="text-xl font-bold mt-1">${count.toLocaleString('id-ID')}</div>
          </div>
        `;
      }).join('');
    };
    renderSet('status-cards-berjalan', distBerjalan);
    renderSet('status-cards-lalu', distLalu);

    // Belum Isi KRS
    const totalBerjalan = Object.values(distBerjalan || {}).reduce((a, b) => a + b, 0);
    const totalLalu = Object.values(distLalu || {}).reduce((a, b) => a + b, 0);

    const elBelum = document.getElementById('count-belum-krs');
    if (elBelum) {
      if (!semesterLalu) {
        elBelum.textContent = '—';
        elBelum.title = 'Tidak ada semester sebelumnya yang berisi data';
      } else {
        const belumKrs = Math.max(0, totalLalu - totalBerjalan);
        elBelum.textContent = belumKrs.toLocaleString('id-ID');
        const semLabel = semesterLalu.nama_semester + (semesterLalu.isPendek ? ' (Pendek)' : '');
        elBelum.title = `${semLabel}: ${totalLalu} · Berjalan: ${totalBerjalan}`;
      }
    }

    if (DEBUG_API) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`[Status] Berjalan ${idSemBerjalan}: total ${totalBerjalan}`);
      console.log(`[Status] Dipakai: ${semesterLalu?.id_semester || '(tidak ada)'}` +
        `${semesterLalu?.isPendek ? ' (Pendek)' : ''} → total ${totalLalu}`);
      console.log('[Status] Semua kandidat:');
      console.table(allResults.map(r => ({
        id: r.id,
        nama: r.nama,
        pendek: r.pendek ? '✅' : '',
        total: r.total,
        dipakai: r.id === semesterLalu?.id_semester ? '✅' : '',
      })));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  } catch (e) {
    console.warn('renderStatusCards gagal:', e);
    const c1 = document.getElementById('status-cards-berjalan');
    const c2 = document.getElementById('status-cards-lalu');
    if (c1) c1.innerHTML = '<p class="text-gray-400 text-sm">Gagal memuat</p>';
    if (c2) c2.innerHTML = '<p class="text-gray-400 text-sm">Gagal memuat</p>';
  }


  // 1. Cek duplikat id_registrasi_mahasiswa di belumKeluar
const belumKeluar = arr.filter(m => m.id_status_mahasiswa === null);
const idRegs = belumKeluar.map(m => m.id_registrasi_mahasiswa);
const dupes = idRegs.filter((id, i) => idRegs.indexOf(id) !== i);
console.log('Duplikat id_registrasi_mahasiswa:', dupes.length);
console.log('Sample:', [...new Set(dupes)].slice(0, 5));

// 2. Cek duplikat id_mahasiswa (bukan id_registrasi)
const idMhs = belumKeluar.map(m => m.id_mahasiswa);
const dupeMhs = idMhs.filter((id, i) => idMhs.indexOf(id) !== i);
console.log('Duplikat id_mahasiswa:', dupeMhs.length);

// 3. Cek apakah ada id_registrasi_mahasiswa null di aktivitas
const nullBerjalan = arrBerjalan.filter(m => !m.id_registrasi_mahasiswa).length;
const nullLalu = arrLalu.filter(m => !m.id_registrasi_mahasiswa).length;
console.log('Null id_registrasi di 20261:', nullBerjalan, '/ 43');
console.log('Null id_registrasi di 20252:', nullLalu, '/ 143');



};



const renderJenisKeluar = async () => {
  const container = document.getElementById('jenis-keluar-cards');
  if (!container) return;

  const JENIS = [
    { key: 'lulus',     id: '1', nama: 'Lulus',             color: 'text-green-600' },
    { key: 'do',        id: '3', nama: 'Dikeluarkan (DO)',  color: 'text-red-600' },
    { key: 'mundur',    id: '4', nama: 'Mengundurkan Diri', color: 'text-yellow-600' },
    { key: 'putus',     id: '5', nama: 'Putus Studi',       color: 'text-orange-600' },
    { key: 'mutasi',    id: '2', nama: 'Mutasi',            color: 'text-blue-600' },
    { key: 'meninggal', id: '6', nama: 'Meninggal Dunia',   color: 'text-gray-500' },
    { key: 'nongelar',  id: '0', nama: 'Selesai Non-Gelar', color: 'text-gray-400' },
  ];

  container.innerHTML = JENIS.map(j => `
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">${j.nama}</div>
      <div class="text-2xl font-bold mt-1 ${j.color}" data-jenis="${j.key}">—</div>
    </div>
  `).join('');

  await Promise.all(JENIS.map(async j => {
    try {
      const count = await api.getCountMahasiswaLulusDO(j.key);
      const el = container.querySelector(`[data-jenis="${j.key}"]`);
      if (el) el.textContent = count == null ? '—' : count.toLocaleString('id-ID');
    } catch (e) {
      const el = container.querySelector(`[data-jenis="${j.key}"]`);
      if (el) el.textContent = '—';
    }
  }));
};

  // Helper soft timeout — tidak abort fetch, hanya agar dashboard tidak menunggu
  const withSoftTimeout = (promise, ms, label) => {
    let timer;
    const timeoutPromise = new Promise(resolve => {
      timer = setTimeout(() => {
        if (DEBUG_API) console.warn(`[Soft timeout] ${label} > ${ms}ms`);
        resolve(null);
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  };

  await Promise.allSettled([
    withSoftTimeout(fetchRef('getProdi', 'count-prodi'), 15000, 'getProdi'),
    withSoftTimeout(fetchRef('getListDosen', 'count-dosen'), 15000, 'getListDosen'),
    withSoftTimeout(fetchRef('getListMahasiswa', 'count-mahasiswa'), 15000, 'getListMahasiswa'),
    withSoftTimeout(fetchRef('getListMataKuliah', 'count-matakuliah'), 15000, 'getListMataKuliah'),
    withSoftTimeout(renderStatusCards(), 15000, 'renderStatusCards'),
    withSoftTimeout(renderJenisKeluar(), 15000, 'renderJenisKeluar'),   // ← ganti fetchLulusDO
  ]);

  // Import hari ini
  const today = new Date().toISOString().slice(0, 10);
  const logs = logger.getLogs();
  const todayLogs = logs.filter(l => String(l.timestamp).slice(0, 10) === today);
  const successToday = todayLogs.filter(l =>
      l.level === 'success' || (l.level === 'info' && String(l.message).startsWith('[Success]'))
    ).length;
  const failedToday = todayLogs.filter(l =>
    l.level === 'error' || l.level === 'warning'
  ).length;
  document.getElementById('import-today').innerHTML = `
    <span class="text-green-500">✅ Sukses: ${successToday}</span> &nbsp;
    <span class="text-red-500">❌ Gagal: ${failedToday}</span>
  `;

  // Aktivitas terakhir
  const recent = logs.slice(-5).reverse();
  const activityDiv = document.getElementById('recent-activity');
  if (recent.length === 0) {
    activityDiv.innerHTML = '<p>Belum ada aktivitas.</p>';
  } else {
    activityDiv.innerHTML = recent.map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString('id-ID', { hour12: false });      
      return `<div class="py-1"><span class="text-gray-400">${time}</span> ${l.message}</div>`;
    }).join('');
  }


 const semAktif = await api.getSemesterAktif();
console.log('Semester aktif:', semAktif?.id_semester, semAktif?.nama_semester);

const semLalu = await api.getSemesterSebelumnya(semAktif?.id_semester, true);
console.log('Semester sebelumnya:', semLalu?.id_semester, semLalu?.nama_semester);
}