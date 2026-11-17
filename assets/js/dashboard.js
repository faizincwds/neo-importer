import { NeoFeederAPI } from './api.js';
import { STORAGE_KEYS, DEBUG_API } from './config.js';
import { Logger } from './logger.js';

export async function renderDashboard(container) {
  const api = new NeoFeederAPI();
  const logger = new Logger();

  // ============================================================
  // CACHE untuk semua modal
  // ============================================================
  const _cache = {
    berjalan: {},
    lalu: {},
    belumKrs: [],
    tidakAktif: [],
    keluar: {},
    statusList: [],
  };
  let _modalData = [];
  let _modalTitle = 'Daftar Mahasiswa';

  // ============================================================
  // HELPER: kunci unik mahasiswa (konsisten di semua sumber)
  // ============================================================
  const getMhsKey = (m) => m.id_registrasi_mahasiswa || m.id_mahasiswa || '';

  const toRow = (m) => ({
    nim: m.nim || m.nipd || '',
    nama: m.nama_mahasiswa || '',
    angkatan: m.nim ? String(m.nim).slice(2, 6) : '',
    prodi: m.nama_program_studi || '',
  });

  // ============================================================
  // MODAL generik
  // ============================================================
  function _renderModalRows(data) {
    const tbody = document.getElementById('modal-tbody');
    const totalInfo = document.getElementById('modal-total-info');
    if (!tbody) return;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-gray-200">Tidak ada data</td></tr>';
      if (totalInfo) totalInfo.textContent = '0 mahasiswa';
      return;
    }
    tbody.innerHTML = data.map((m, i) => `
      <tr class="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900">
        <td class="px-3 py-2 text-gray-100">${i + 1}</td>
        <td class="px-3 py-2 font-mono">${m.nim || '-'}</td>
        <td class="px-3 py-2">${m.nama || '-'}</td>
        <td class="px-3 py-2">${m.angkatan || '-'}</td>
        <td class="px-3 py-2 text-xs">${m.prodi || '-'}</td>
      </tr>
    `).join('');
    if (totalInfo) totalInfo.textContent = `${data.length} mahasiswa`;
  }

  window.__showMahasiswaList = (title, subtitle, data) => {
    const modal = document.getElementById('modal-tidak-aktif');
    if (!modal) return;
    _modalTitle = title;
    _modalData = data || [];

    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = title;
    const subtitleEl = document.getElementById('modal-subtitle');
    if (subtitleEl) subtitleEl.textContent = subtitle || '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('modal-open');

    _renderModalRows(_modalData);

    const filterInput = document.getElementById('modal-filter-nama');
    filterInput.value = '';
    filterInput.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = _modalData.filter(m =>
        (m.nim || '').toLowerCase().includes(q) ||
        (m.nama || '').toLowerCase().includes(q)
      );
      _renderModalRows(filtered);
      const totalInfo = document.getElementById('modal-total-info');
      if (totalInfo) totalInfo.textContent = `${filtered.length} dari ${_modalData.length} mahasiswa`;
    };
  };

  window.__closeTidakAktif = () => {
    const modal = document.getElementById('modal-tidak-aktif');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('modal-open');
  };

  window.__exportTidakAktif = () => {
    if (!_modalData || _modalData.length === 0) {
      alert('Tidak ada data untuk di-export');
      return;
    }
    const headers = ['No', 'NIM', 'Nama', 'Angkatan', 'Prodi'];
    const rows = _modalData.map((m, i) => [
      i + 1,
      m.nim || '',
      `"${(m.nama || '').replace(/"/g, '""')}"`,
      m.angkatan || '',
      `"${(m.prodi || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(_modalTitle || 'mahasiswa').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.__showStatusList = (semesterKey, idStatus) => {
    const cache = semesterKey === 'berjalan' ? _cache.berjalan : _cache.lalu;
    const data = cache[idStatus] || [];
    const semLabel = semesterKey === 'berjalan'
      ? (document.getElementById('sem-berjalan-label')?.textContent || '')
      : (document.getElementById('sem-lalu-label')?.textContent || '');
    const statusInfo = _cache.statusList.find(
      s => String(s.id_status_mahasiswa).toUpperCase() === idStatus
    );
    const statusName = statusInfo?.nama_status_mahasiswa || idStatus;
    window.__showMahasiswaList(
      `Mahasiswa ${statusName} ${semLabel}`,
      `${data.length} mahasiswa · Semester ${semesterKey === 'berjalan' ? 'Berjalan' : 'Sebelumnya'}`,
      data
    );
  };

  window.__showBelumKrs = () => {
    window.__showMahasiswaList(
      'Belum Isi KRS',
      'Aktif di semester lalu, belum ada di semester berjalan',
      _cache.belumKrs
    );
  };

  window.__showTidakAktif = () => {
    window.__showMahasiswaList(
      'Mahasiswa Tanpa Aktivitas Kuliah',
      'Terdaftar tapi tidak ada KRS di semester berjalan maupun sebelumnya',
      _cache.tidakAktif
    );
  };

  window.__showKeluar = (jenisKey, jenisNama) => {
    window.__showMahasiswaList(
      `Mahasiswa ${jenisNama}`,
      'Status keluar (alumni)',
      _cache.keluar[jenisKey] || []
    );
  };

  window.__showKeluar = (jenisKey, jenisNama) => {
    window.__showMahasiswaList(
        `Mahasiswa ${jenisNama}`,
        'Status keluar (alumni)',
        _cache.keluar[jenisKey] || []
    );
  };

  window.__showAllMahasiswa = async () => {
    try {
        const list = await api.getListMahasiswa();
        const allMhs = Array.isArray(list) ? list : (list?.data || []);
        const rows = allMhs.map(toRow).sort((a, b) => (a.nim || '').localeCompare(b.nim || ''));
        window.__showMahasiswaList(
        'Semua Mahasiswa',
        `${rows.length} mahasiswa terdaftar (aktif + alumni)`,
        rows
        );
    } catch (e) {
        console.warn('__showAllMahasiswa gagal:', e);
        alert('Gagal memuat daftar mahasiswa');
    }
  };


  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.__closeTidakAktif?.();
  });

  // ============================================================
  // HTML
  // ============================================================
  container.innerHTML = `
  <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

  <div id="api-status" class=" text-white mb-6 px-4 py-2 rounded-xl inline-flex items-center shadow-sm bg-gray-100 dark:bg-gray-800 ">
    <span id="api-dot" class="inline-block w-3 h-3 rounded-full mr-2 bg-yellow-400 animate-pulse"></span>
    <span id="api-text" class="text-sm text-white font-medium dark:text-gray-400">Memeriksa koneksi...</span>
    <span class="ml-2 text-xs text-gray-200 dark:text-gray-500">(${localStorage.getItem(STORAGE_KEYS.API_URL) || 'http://localhost:3003'} [${localStorage.getItem(STORAGE_KEYS.API_TYPE) || 'Yang belum dikonfigurasi'}])</span>
  </div>

  <div class="text-2xl font-bold mt-1 mb-4" id="profil-pt">Memuat...</div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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
    <div class="stat-card p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        onclick="window.__showAllMahasiswa && window.__showAllMahasiswa()"
        title="Klik untuk lihat daftar semua mahasiswa">
    <div class="text-sm font-medium dark:text-gray-400">Mahasiswa</div>
    <div class="flex items-baseline justify-between mt-1">
        <div class="text-2xl font-bold" id="count-mahasiswa">-</div>
    </div>
    </div>
    <div class="stat-card p-4">
      <div class="text-sm font-medium dark:text-gray-400">Mata Kuliah</div>
      <div class="text-2xl font-bold mt-1" id="count-matakuliah">-</div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <div>
      <h3 class="text-lg font-semibold mb-3">
        Status Mahasiswa — Semester Berjalan
        <span id="sem-berjalan-label" class="text-sm font-normal text-gray-500">—</span>
      </h3>
      <div id="status-cards-berjalan" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
    </div>
    <div>
      <h3 class="text-lg font-semibold mb-3">
        Status Mahasiswa — Semester Sebelumnya
        <span id="sem-lalu-label" class="text-sm font-normal text-gray-500">—</span>
      </h3>
      <div id="status-cards-lalu" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
    <div class="stat-card p-4 border-l-4 border-amber-500 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
         onclick="window.__showBelumKrs()"
         title="Klik untuk lihat daftar">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium dark:text-gray-400">Belum Isi KRS</div>
          <div class="text-xs text-gray-500 mt-1">
            Aktif di semester lalu, belum ada di semester berjalan
            <span class="text-blue-500 font-medium ml-1">· Klik untuk lihat</span>
          </div>
        </div>
        <div class="text-3xl font-bold text-amber-600" id="count-belum-krs">—</div>
      </div>
    </div>
    <div class="stat-card p-4 border-l-4 border-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
         onclick="window.__showTidakAktif()"
         title="Klik untuk lihat daftar">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium dark:text-gray-400">Tidak Ada Aktivitas</div>
          <div class="text-xs text-gray-500 mt-1">
            Terdaftar tapi tidak ada KRS di 2 semester terakhir
            <span class="text-blue-500 font-medium ml-1">· Klik untuk lihat</span>
          </div>
        </div>
        <div class="text-3xl font-bold text-gray-500" id="count-tidak-aktif">—</div>
      </div>
    </div>
  </div>

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

  <div id="modal-tidak-aktif"
       class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm hidden items-center justify-center p-4"
       onclick="if(event.target===this) window.__closeTidakAktif()">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 id="modal-title" class="text-lg font-bold dark:text-gray-100">Daftar Mahasiswa</h3>
          <p id="modal-subtitle" class="text-sm text-gray-200 mt-1">—</p>
        </div>
        <button onclick="window.__closeTidakAktif()"
                class="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2">×</button>
      </div>
      <div class="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <input id="modal-filter-nama" type="text" placeholder="Cari NIM / nama..."
               class="flex-1 px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
        <span class="text-sm text-gray-200" id="modal-total-info">—</span>
        <button onclick="window.__exportTidakAktif()"
                class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">📥 CSV</button>
      </div>
      <div class="flex-1 overflow-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-gray-100 dark:text-gray-200 dark:bg-gray-900 z-10">
            <tr>
              <th class="text-left px-3 py-2 font-semibold">#</th>
              <th class="text-left px-3 py-2 font-semibold">NIM</th>
              <th class="text-left px-3 py-2 font-semibold">Nama</th>
              <th class="text-left px-3 py-2 font-semibold">Angkatan</th>
              <th class="text-left px-3 py-2 font-semibold">Prodi</th>
            </tr>
          </thead>
          <tbody id="modal-tbody">
            <tr><td colspan="5" class="text-center py-6 text-gray-500">Pilih salah satu kartu</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
`;

  // ============================================================
  // 1. Profil PT
  // ============================================================
  try {
    const profilRes = await api.getProfilPT();
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

  // ============================================================
  // Helper
  // ============================================================
  const getCount = (data) => {
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.data)) return data.data.length;
      if (Array.isArray(data.result)) return data.result.length;
      return 0;
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

  // ============================================================
  // renderStatusCards — cascade + cache detail
  // ============================================================
  const renderStatusCards = async () => {
    try {
      const [statusList, semesterAktif] = await Promise.all([
        api.getStatusMahasiswa(),
        api.getSemesterAktif(),
      ]);
      if (!semesterAktif) return;
      _cache.statusList = statusList;

      const idSemBerjalan = semesterAktif.id_semester;
      const labelBerjalan = document.getElementById('sem-berjalan-label');
      if (labelBerjalan) {
        labelBerjalan.textContent = `(${semesterAktif.nama_semester || idSemBerjalan})`;
      }

      // Cascade 3 kandidat
      const distBerjalan = await api.getStatusMahasiswaCounts(idSemBerjalan);
      const candidates = await api.getSemesterListBefore(idSemBerjalan, 3);
      const triedIds = [];
      let distLalu = {};
      let semesterLalu = null;

      for (const sem of candidates) {
        triedIds.push(sem.id_semester + (sem.isPendek ? '(P)' : ''));
        const dist = await api.getStatusMahasiswaCounts(sem.id_semester);
        const total = Object.values(dist || {}).reduce((a, b) => a + b, 0);
        if (DEBUG_API) console.log(`[Status] Coba ${sem.id_semester}: total ${total}`);
        if (total > 0 && !semesterLalu) {
          distLalu = dist;
          semesterLalu = sem;
          if (DEBUG_API) console.log(`[Status]   → dipakai`);
        }
      }

      // Label semester lalu
      const labelLalu = document.getElementById('sem-lalu-label');
      if (labelLalu) {
        if (semesterLalu) {
          const parts = [semesterLalu.nama_semester];
          if (semesterLalu.isPendek) parts.push('Pendek');
          labelLalu.textContent = `(${parts.join(' — ')})`;
        } else {
          labelLalu.textContent = candidates.length
            ? `(semua kandidat kosong: ${triedIds.join(', ')})`
            : '(tidak ada kandidat)';
        }
      }

      // Detail berjalan & lalu
      const [detailBerjalan, detailLalu] = await Promise.all([
        api.getAktivitasKuliahDetail(idSemBerjalan),
        semesterLalu ? api.getAktivitasKuliahDetail(semesterLalu.id_semester) : Promise.resolve([]),
      ]);

      // Kelompokkan per status (dedup)
      _cache.berjalan = {};
      _cache.lalu = {};
      const seenBerjalan = new Set();
      const seenLalu = new Set();

      for (const m of detailBerjalan) {
        const id = getMhsKey(m);
        if (!id || seenBerjalan.has(id)) continue;
        seenBerjalan.add(id);
        const status = String(m.id_status_mahasiswa || '').trim().toUpperCase();
        if (!_cache.berjalan[status]) _cache.berjalan[status] = [];
        _cache.berjalan[status].push(toRow(m));
      }
      for (const m of detailLalu) {
        const id = getMhsKey(m);
        if (!id || seenLalu.has(id)) continue;
        seenLalu.add(id);
        const status = String(m.id_status_mahasiswa || '').trim().toUpperCase();
        if (!_cache.lalu[status]) _cache.lalu[status] = [];
        _cache.lalu[status].push(toRow(m));
      }

      // Render kartu status
      const renderSet = (containerId, dist, semesterKey) => {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = statusList.map(s => {
          const id = String(s.id_status_mahasiswa).trim().toUpperCase();
          const count = dist[id] ?? 0;
          return `
            <div class="stat-card p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                 onclick="window.__showStatusList('${semesterKey}', '${id}')"
                 title="Klik untuk lihat daftar">
              <div class="text-xs font-medium dark:text-gray-400">${s.nama_status_mahasiswa}</div>
              <div class="text-xl font-bold mt-1">${count.toLocaleString('id-ID')}</div>
            </div>
          `;
        }).join('');
      };
      renderSet('status-cards-berjalan', distBerjalan, 'berjalan');
      renderSet('status-cards-lalu', distLalu, 'lalu');

      // Ambil list mahasiswa (punya prodi lengkap)
      const listMhs = await api.getListMahasiswa();
      const allMhs = Array.isArray(listMhs) ? listMhs : (listMhs?.data || []);
      const allMhsMap = new Map();
      for (const m of allMhs) {
        const id = getMhsKey(m);
        if (id) allMhsMap.set(id, m);
      }

      const setBerjalan = new Set([...seenBerjalan]);
      const setLalu = new Set([...seenLalu]);

      // Belum Isi KRS = ada di lalu, belum di berjalan
      const belumKrsList = [...setLalu].filter(id => !setBerjalan.has(id));
      _cache.belumKrs = belumKrsList
        .map(id => allMhsMap.get(id))
        .filter(Boolean)
        .map(toRow);

      // Tidak Ada Aktivitas = belum keluar, tidak di berjalan maupun lalu
      const belumKeluar = allMhs.filter(m => {
        const s = m.id_status_mahasiswa;
        return s === null || s === '' || s === undefined;
      });
      const tidakAktifList = belumKeluar.filter(m => {
        const id = getMhsKey(m);
        return !setBerjalan.has(id) && !setLalu.has(id);
      });
      _cache.tidakAktif = tidakAktifList
        .map(toRow)
        .sort((a, b) => (a.nim || '').localeCompare(b.nim || ''));

      // Isi kartu
      const elBelum = document.getElementById('count-belum-krs');
      if (elBelum) elBelum.textContent = _cache.belumKrs.length.toLocaleString('id-ID');
      const elTidak = document.getElementById('count-tidak-aktif');
      if (elTidak) elTidak.textContent = _cache.tidakAktif.length.toLocaleString('id-ID');

      if (DEBUG_API) {
        console.log(`[Status] Berjalan ${idSemBerjalan}: ${setBerjalan.size}`);
        console.log(`[Status] Sebelumnya ${semesterLalu?.id_semester}: ${setLalu.size}`);
        console.log(`[Status] Belum KRS: ${_cache.belumKrs.length} · Tidak Aktif: ${_cache.tidakAktif.length}`);
      }
    } catch (e) {
      console.warn('renderStatusCards gagal:', e);
      const c1 = document.getElementById('status-cards-berjalan');
      const c2 = document.getElementById('status-cards-lalu');
      if (c1) c1.innerHTML = '<p class="text-gray-400 text-sm">Gagal memuat</p>';
      if (c2) c2.innerHTML = '<p class="text-gray-400 text-sm">Gagal memuat</p>';
    }
  };

  // ============================================================
  // renderJenisKeluar
  // ============================================================
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
      <div class="stat-card p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
           onclick="window.__showKeluar('${j.key}', '${j.nama}')"
           title="Klik untuk lihat daftar">
        <div class="text-sm font-medium dark:text-gray-400">${j.nama}</div>
        <div class="text-2xl font-bold mt-1 ${j.color}" data-jenis="${j.key}">—</div>
      </div>
    `).join('');

    const listMhs = await api.getListMahasiswa();
    const allMhs = Array.isArray(listMhs) ? listMhs : (listMhs?.data || []);

    await Promise.all(JENIS.map(async j => {
      try {
        const count = await api.getCountMahasiswaLulusDO(j.key);
        const el = container.querySelector(`[data-jenis="${j.key}"]`);
        if (el) el.textContent = count == null ? '—' : count.toLocaleString('id-ID');

        _cache.keluar[j.key] = allMhs
          .filter(m => String(m.id_status_mahasiswa ?? '').trim() === j.id)
          .map(toRow);
      } catch (e) {
        const el = container.querySelector(`[data-jenis="${j.key}"]`);
        if (el) el.textContent = '—';
      }
    }));
  };

  // ============================================================
  // JALANKAN SEMUA
  // ============================================================
  await Promise.allSettled([
    withSoftTimeout(fetchRef('getProdi', 'count-prodi'), 15000, 'getProdi'),
    withSoftTimeout(fetchRef('getListDosen', 'count-dosen'), 15000, 'getListDosen'),
    withSoftTimeout(fetchRef('getListMahasiswa', 'count-mahasiswa'), 15000, 'getListMahasiswa'),
    withSoftTimeout(fetchRef('getListMataKuliah', 'count-matakuliah'), 15000, 'getListMataKuliah'),
    withSoftTimeout(renderStatusCards(), 20000, 'renderStatusCards'),
    withSoftTimeout(renderJenisKeluar(), 15000, 'renderJenisKeluar'),
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
}