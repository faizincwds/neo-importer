// hitungTranskrip.js
import { NeoFeederAPI } from './api.js';
import { DEBUG_API } from './config.js';
import { Logger } from './logger.js';

/* ============================================================
 *  NILAI HURUF
 * ============================================================ */
const GRADE_POINTS = {
  'A': 4.00, 'A-': 3.75,
  'B+': 3.25, 'B': 3.00, 'B-': 2.75,
  'C+': 2.25, 'C': 2.00, 'C-': 1.75,
  'D': 1.00, 'E': 0.00,
};
const GRADE_RANK = {
  'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
  'C+': 7, 'C': 6, 'C-': 5, 'D': 2, 'E': 1,
};
const normHuruf = (h) => String(h ?? '').trim().toUpperCase();
const gradePts  = (h) => GRADE_POINTS[normHuruf(h)] ?? 0;
const gradeRank = (h) => GRADE_RANK[normHuruf(h)]   ?? 0;
const fmt       = (n, d = 2) => Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '-';
const esc       = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const tahunDariPeriode = (idPeriode) => String(idPeriode ?? '').slice(0, 4);

/** "20221" → "2022 Ganjil" */
function labelPeriode(idPeriode) {
  const s = String(idPeriode ?? '');
  if (s.length !== 5) return s || '—';
  const year = s.slice(0, 4);
  const sem  = s.slice(4);
  const name = sem === '1' ? 'Ganjil'
             : sem === '2' ? 'Genap'
             : sem === '3' ? 'Pendek'
             : sem;
  return `${year} ${name}`;
}

/* ============================================================
 *  KALKULASI (exported)
 * ============================================================ */
export function hitungTranskripTerbaik(records) {
  const map = new Map();
  for (const r of records || []) {
    const key = r.id_matkul || r.kode_mata_kuliah;
    if (!key) continue;
    const curr = map.get(key);
    if (!curr || gradeRank(r.nilai_huruf) > gradeRank(curr.nilai_huruf)) {
      map.set(key, r);
    }
  }
  return [...map.values()];
}

export function hitungIPK(records) {
  let totalSKS = 0, totalMutu = 0, n = 0;
  for (const r of records || []) {
    const sks = parseFloat(r.sks_mata_kuliah) || 0;
    totalSKS  += sks;
    totalMutu += sks * gradePts(r.nilai_huruf);
    n++;
  }
  return {
    totalSKS, totalMutu, jumlahMK: n,
    ipk: totalSKS > 0 ? totalMutu / totalSKS : 0,
  };
}

export function verifikasiTranskrip(rawRecords) {
  const raw  = Array.isArray(rawRecords) ? rawRecords : [];
  const best = hitungTranskripTerbaik(raw);

  const byMatkul = new Map();
  for (const r of raw) {
    const key = r.id_matkul || r.kode_mata_kuliah;
    if (!key) continue;
    if (!byMatkul.has(key)) byMatkul.set(key, []);
    byMatkul.get(key).push(r);
  }

  const detail = [];
  let dupCount = 0;
  for (const [key, arr] of byMatkul) {
    const bestRec = arr.reduce(
      (b, r) => !b || gradeRank(r.nilai_huruf) > gradeRank(b.nilai_huruf) ? r : b,
      null
    );
    const attempts = arr.map(r => normHuruf(r.nilai_huruf)).filter(Boolean);
    const isDup    = arr.length > 1;
    if (isDup) dupCount++;
    detail.push({
      id_matkul:        key,
      kode_mata_kuliah: bestRec?.kode_mata_kuliah || '',
      nama_mata_kuliah: bestRec?.nama_mata_kuliah || '',
      sks_mata_kuliah:  parseFloat(bestRec?.sks_mata_kuliah) || 0,
      bestHuruf:        normHuruf(bestRec?.nilai_huruf),
      attempts, count:  arr.length, isDup,
    });
  }
  detail.sort((a, b) =>
    String(a.kode_mata_kuliah).localeCompare(String(b.kode_mata_kuliah))
  );

  return {
    raw, best, detail, dupCount,
    summary:       hitungIPK(best),
    rawSummary:    hitungIPK(raw),
    isClean:       raw.length > 0 && dupCount === 0,
    sudahDihitung: raw.length > 0,
  };
}

/* ============================================================
 *  MAIN RENDER
 * ============================================================ */
export async function renderHitungTranskrip(container) {
  const api = new NeoFeederAPI();
  const logger = new Logger();

  const state = {
    angkatan: '',
    prodiId:  '',                     // '' = semua prodi
    allMhs: [],
    riwayatAll: [],
    angkatanOptions: [],              // tahun 4 digit
    prodiList: [],                    // [{ id, nama }]
    riwayatByMhsId: new Map(),
    riwayatByRegId: new Map(),
    perStudent: new Map(),
  };

  /* ---------------- HTML ---------------- */
  container.innerHTML = `
    <h2 class="text-2xl font-bold mb-4">Hitung &amp; Verifikasi Transkrip</h2>

    <div class="glass p-4 rounded-xl mb-4 flex flex-wrap items-center gap-3">
      <label class="text-sm font-medium">Angkatan (tahun):</label>
      <select id="ht-angkatan"
              class="px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 min-w-[120px]">
        <option value="">— Pilih —</option>
      </select>

      <label class="text-sm font-medium">Prodi:</label>
      <select id="ht-prodi"
              class="px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 min-w-[200px]">
        <option value="">Semua Prodi</option>
      </select>

      <button id="ht-btn-load"
              class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
        🔄 Muat Data
      </button>
      <button id="ht-btn-hitung"
              class="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
        ▶ Hitung Transkrip Angkatan
      </button>
      <span id="ht-status" class="text-sm text-gray-500 ml-auto"></span>
    </div>

    <div class="glass p-4 rounded-xl mb-4">
      <h3 class="font-semibold mb-2">🔍 Cek Transkrip Mahasiswa</h3>
      <div class="flex gap-2 flex-wrap">
        <input id="ht-search" type="text" placeholder="Ketik NIM atau nama… (lintas angkatan)"
               class="flex-1 min-w-[240px] px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
        <button id="ht-btn-cari"
                class="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Cari
        </button>
      </div>
      <div id="ht-search-result" class="mt-3 text-sm text-gray-500 italic">Belum ada pencarian.</div>
    </div>

    <div class="glass p-4 rounded-xl">
      <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 class="font-semibold">📋 Daftar Mahasiswa <span id="ht-angkatan-label">—</span></h3>
        <div class="flex gap-2 text-xs">
          <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full" id="ht-sum-clean">0 sesuai</span>
          <span class="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full" id="ht-sum-dup">0 perlu hitung</span>
          <span class="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full" id="ht-sum-empty">0 belum</span>
        </div>
      </div>
      <div class="overflow-auto max-h-[60vh]">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-gray-100 dark:bg-gray-900 z-10">
            <tr>
              <th class="px-2 py-2 text-left w-8"></th>
              <th class="px-2 py-2 text-left">NIM</th>
              <th class="px-2 py-2 text-left">Nama</th>
              <th class="px-2 py-2 text-left">Prodi</th>
              <th class="px-2 py-2 text-left">Periode Masuk</th>
              <th class="px-2 py-2 text-right">MK</th>
              <th class="px-2 py-2 text-right">SKS</th>
              <th class="px-2 py-2 text-right">IPK</th>
              <th class="px-2 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody id="ht-tbody">
            <tr><td colspan="9" class="text-center py-6 text-gray-400">
              Pilih angkatan lalu klik "Muat Data".
            </td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        ☑ = sudah dihitung (tidak ada MK berulang) ·
        ☐ = perlu dicek / belum ada transkrip.
      </p>
    </div>

    <div id="ht-modal"
         class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm hidden items-center justify-center p-4"
         onclick="if(event.target===this) window.__htCloseModal()">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 id="ht-modal-title" class="text-lg font-bold">Detail Transkrip</h3>
            <p id="ht-modal-sub" class="text-sm text-gray-500 mt-1">—</p>
          </div>
          <button onclick="window.__htCloseModal()"
                  class="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2">×</button>
        </div>
        <div class="p-4 overflow-auto" id="ht-modal-body">
          <p class="text-center text-gray-400 py-6">Memuat…</p>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);
  const el = {
    angkatan:  $('#ht-angkatan'),
    prodi:     $('#ht-prodi'),
    btnLoad:   $('#ht-btn-load'),
    btnHitung: $('#ht-btn-hitung'),
    status:    $('#ht-status'),
    search:    $('#ht-search'),
    btnCari:   $('#ht-btn-cari'),
    searchRes: $('#ht-search-result'),
    tbody:     $('#ht-tbody'),
    angLabel:  $('#ht-angkatan-label'),
    sumClean:  $('#ht-sum-clean'),
    sumDup:    $('#ht-sum-dup'),
    sumEmpty:  $('#ht-sum-empty'),
    modal:     $('#ht-modal'),
    modalT:    $('#ht-modal-title'),
    modalS:    $('#ht-modal-sub'),
    modalB:    $('#ht-modal-body'),
  };

  const setStatus = (msg, isError = false) => {
    if (!el.status) return;
    el.status.textContent = msg;
    el.status.className = 'text-sm ml-auto ' + (isError ? 'text-red-500' : 'text-gray-500');
  };

  /* ---------------- Modal globals ---------------- */
  window.__htCloseModal = () => {
    el.modal.classList.add('hidden');
    el.modal.classList.remove('flex');
    document.body.classList.remove('modal-open');
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.__htCloseModal?.();
  });

  /* ---------------- Helpers ---------------- */
  const getNim   = (m) => String(m.nim || m.nipd || '');
  const getNama  = (m) => m.nama_mahasiswa || '';
  const getProdi = (m) => m.nama_program_studi || '';
  const getMhsId = (m) => m.id_mahasiswa || '';

  const getRiwayatArr = (m) =>
    state.riwayatByMhsId.get(getMhsId(m)) || [];

  /** Cari riwayat dgn id_periode_masuk berawalan 4 digit tahun. Ambil entry paling awal. */
  const findRiwayat = (m, angkatanYear) =>
    getRiwayatArr(m)
      .filter(r =>
        r.id_periode_masuk &&
        String(r.id_periode_masuk).slice(0, 4) === String(angkatanYear)
      )
      .sort((a, b) =>
        String(a.id_periode_masuk).localeCompare(String(b.id_periode_masuk))
      )[0];

  /** Daftar mahasiswa utk angkatan (+ filter prodi bila dipilih). */
  const getMahasiswaAngkatan = (angkatanYear) => {
    const result = [];
    for (const m of state.allMhs) {
      const r = findRiwayat(m, angkatanYear);
      if (!r || !r.id_registrasi_mahasiswa) continue;

      const prodiId = String(r.id_prodi || m.id_prodi || '');
      if (state.prodiId && prodiId !== String(state.prodiId)) continue;

      result.push({
        ...m,
        id_registrasi_mahasiswa: r.id_registrasi_mahasiswa,
        id_periode_masuk:       String(r.id_periode_masuk || ''),
        id_prodi_entry:         prodiId || null,
      });
    }
    return result;
  };

  /** Nama prodi untuk label header. */
  const prodiLabel = () => {
    if (!state.prodiId) return 'Semua Prodi';
    return state.prodiList.find(p => p.id === state.prodiId)?.nama || state.prodiId.slice(0, 8);
  };

  /* ---------------- 1) Load mahasiswa + riwayat + prodi ---------------- */
  async function loadAllMahasiswa() {
    setStatus('Memuat daftar mahasiswa…');
    try {
      const resM = await api.getListMahasiswa();
      state.allMhs = Array.isArray(resM) ? resM : (resM?.data || []);

      setStatus('Memuat riwayat pendidikan…');

      // Defensif: pakai method baru jika ada, kalau tidak pakai call manual
      const fetchRiwayat =
        typeof api.getAllRiwayatPendidikanMahasiswa === 'function'
          ? () => api.getAllRiwayatPendidikanMahasiswa()
          : async () => {
              const res = await api.call('GetListRiwayatPendidikanMahasiswa', { limit: 100000 });
              return api.extractData(res) || [];
            };
      state.riwayatAll = await fetchRiwayat();

      // === FIX BUG: populasi ulang kedua Map ===
      state.riwayatByMhsId.clear();
      state.riwayatByRegId.clear();

      const angkatanSet = new Set();
      const prodiMap    = new Map();

      for (const r of state.riwayatAll) {
        if (r.id_mahasiswa) {
          const key = String(r.id_mahasiswa);
          if (!state.riwayatByMhsId.has(key)) state.riwayatByMhsId.set(key, []);
          state.riwayatByMhsId.get(key).push(r);
        }
        if (r.id_registrasi_mahasiswa) {
          state.riwayatByRegId.set(String(r.id_registrasi_mahasiswa), r);
        }

        const y = tahunDariPeriode(r.id_periode_masuk);
        if (/^\d{4}$/.test(y)) angkatanSet.add(y);

        if (r.id_prodi) {
          const pid = String(r.id_prodi);
          if (!prodiMap.has(pid)) {
            prodiMap.set(pid,
              r.nama_program_studi || r.nama_prodi || pid.slice(0, 8)
            );
          }
        }
      }

      state.angkatanOptions = [...angkatanSet].sort().reverse();
      state.prodiList = [...prodiMap.entries()]
        .map(([id, nama]) => ({ id, nama }))
        .sort((a, b) => a.nama.localeCompare(b.nama));

      // Populate dropdown angkatan
      el.angkatan.innerHTML = `<option value="">— Pilih —</option>` +
        state.angkatanOptions.map(y =>
          `<option value="${esc(y)}">${esc(y)}</option>`
        ).join('');

      // Populate dropdown prodi
      el.prodi.innerHTML = `<option value="">Semua Prodi</option>` +
        state.prodiList.map(p =>
          `<option value="${esc(p.id)}">${esc(p.nama)}</option>`
        ).join('');

      setStatus(
        `${state.allMhs.length} mahasiswa · ${state.riwayatAll.length} riwayat · ` +
        `${state.angkatanOptions.length} angkatan · ${state.prodiList.length} prodi`
      );

      logger.log('info', `Data mahasiswa siap`, {
        mahasiswa: state.allMhs.length,
        riwayat:   state.riwayatAll.length,
        angkatan:  state.angkatanOptions.length,
        prodi:     state.prodiList.length,
        });

    } catch (e) {
      console.error(e);
      setStatus('Gagal memuat: ' + e.message, true);
    }
  }

  /* ---------------- 2) Load transkrip per angkatan (+prodi) ---------------- */
  async function loadTranskripAngkatan() {
    if (!state.angkatan) { setStatus('Pilih angkatan dulu', true); return; }

    setStatus('Memuat transkrip…');
    state.perStudent.clear();

    const mhs = getMahasiswaAngkatan(state.angkatan);
    if (!mhs.length) {
      renderTable(mhs);
      setStatus(`0 mahasiswa pada angkatan ${state.angkatan}` +
        (state.prodiId ? ` (${prodiLabel()})` : ''));
      return;
    }

    const BATCH = 10;
    for (let i = 0; i < mhs.length; i += BATCH) {
        const chunk = mhs.slice(i, i + BATCH);
        await Promise.all(chunk.map(async (m) => {
            const regId = m.id_registrasi_mahasiswa;
            let raw = [];
            try {
            const r = await api.getTranskripMahasiswa({ id_registrasi_mahasiswa: regId });
            raw = Array.isArray(r) ? r : (r?.data || []);
            } catch (e) {
            if (DEBUG_API) console.warn(`transkrip ${regId} gagal:`, e.message);
            logger.log('warning', `Transkrip ${m.nim || regId} gagal dimuat: ${e.message}`, {
                regId, nim: m.nim,
            });
            }

            state.perStudent.set(regId, { raw, verified: verifikasiTranskrip(raw) });
        }));

        setStatus(
            `(${Math.min(i + BATCH, mhs.length)} dari ${mhs.length}) memuat transkrip…`
        );
    }

    renderTable(mhs);
    setStatus(
      `${mhs.length} mahasiswa · angkatan ${state.angkatan}` +
      (state.prodiId ? ` · ${prodiLabel()}` : '')
    );
  }

  /* ---------------- 3) Render tabel ---------------- */
  function renderTable(mhs) {
    el.angLabel.textContent = state.angkatan
      ? `(angkatan ${state.angkatan} · ${prodiLabel()})`
      : '—';

    if (!mhs.length) {
      el.tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">
        Tidak ada mahasiswa yang cocok dengan filter.
      </td></tr>`;
      updateSummary(0, 0, 0);
      return;
    }

    let clean = 0, dup = 0, empty = 0;

    el.tbody.innerHTML = mhs.map(m => {
      const regId = m.id_registrasi_mahasiswa;
      const v = state.perStudent.get(regId)?.verified;
      const raw = v?.raw || [];

      let badge, checkboxState;
      if (!raw.length) {
        empty++;  checkboxState = false;
        badge = `<span class="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full">Belum</span>`;
      } else if (v.dupCount > 0) {
        dup++;    checkboxState = false;
        badge = `<span class="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">${v.dupCount} MK dobel</span>`;
      } else {
        clean++;  checkboxState = true;
        badge = `<span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">✓ Sesuai</span>`;
      }

      const s = v?.summary || hitungIPK([]);

      return `
        <tr class="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900">
          <td class="px-2 py-2">
            <input type="checkbox" ${checkboxState ? 'checked' : ''} disabled
                   title="${checkboxState ? 'Sudah dihitung' : 'Belum dihitung / perlu dicek'}">
          </td>
          <td class="px-2 py-2 font-mono text-xs">${esc(getNim(m) || '-')}</td>
          <td class="px-2 py-2">
            <button class="text-indigo-600 hover:underline text-left"
                    onclick="window.__htShowDetail('${esc(regId)}')">
              ${esc(getNama(m) || '-')}
            </button>
          </td>
          <td class="px-2 py-2 text-xs">${esc(getProdi(m) || '-')}</td>
          <td class="px-2 py-2 text-xs font-mono"
              title="${esc(labelPeriode(m.id_periode_masuk))}">
            ${esc(m.id_periode_masuk || '-')}
          </td>
          <td class="px-2 py-2 text-right">${s.jumlahMK}</td>
          <td class="px-2 py-2 text-right">${s.totalSKS}</td>
          <td class="px-2 py-2 text-right font-semibold">${fmt(s.ipk)}</td>
          <td class="px-2 py-2 text-center">${badge}</td>
        </tr>`;
    }).join('');

    updateSummary(clean, dup, empty);
  }

  function updateSummary(clean, dup, empty) {
    el.sumClean.textContent = `${clean} sesuai`;
    el.sumDup.textContent   = `${dup} perlu hitung`;
    el.sumEmpty.textContent = `${empty} belum`;
  }

  /* ---------------- 4) Detail per mahasiswa ---------------- */
  window.__htShowDetail = async (regId) => {
    const r = state.riwayatByRegId.get(String(regId));
    if (!r) {
      el.modalT.textContent = 'Transkrip';
      el.modalS.textContent = '';
      el.modalB.innerHTML = `<p class="text-center text-red-500 py-6">
        Riwayat untuk id_registrasi_mahasiswa tidak ditemukan.
      </p>`;
      el.modal.classList.remove('hidden');
      el.modal.classList.add('flex');
      document.body.classList.add('modal-open');
      return;
    }

    const m = state.allMhs.find(x => String(x.id_mahasiswa) === String(r.id_mahasiswa));
    if (!m) return;

    el.modalT.textContent = `Transkrip — ${getNama(m) || '-'}`;
    el.modalS.textContent =
      `NIM: ${getNim(m) || '-'} · ${getProdi(m) || '-'} · ` +
      `Periode: ${r?.id_periode_masuk ? labelPeriode(r.id_periode_masuk) : '-'}`;
    el.modalB.innerHTML = `<p class="text-center text-gray-400 py-6">Memuat transkrip…</p>`;
    el.modal.classList.remove('hidden');
    el.modal.classList.add('flex');
    document.body.classList.add('modal-open');

    try {
      const res = await api.getTranskripMahasiswa(
        { id_registrasi_mahasiswa: String(regId) }, true
      );
      const raw = Array.isArray(res) ? res : (res?.data || []);
      renderDetail(verifikasiTranskrip(raw));
    } catch (e) {
      el.modalB.innerHTML = `<p class="text-center text-red-500 py-6">
        Gagal memuat: ${esc(e.message)}
      </p>`;
    }
  };

  function renderDetail(v) {
    const sum = v.summary;
    const stateTag = v.raw.length === 0 ? 'empty'
                   : v.isClean           ? 'clean'
                   : 'dup';

    const badge = stateTag === 'clean'
      ? `<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">✓ Sudah sesuai</span>`
      : stateTag === 'dup'
      ? `<span class="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">Perlu hitung ulang</span>`
      : `<span class="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs">Belum ada transkrip</span>`;

    const info = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="stat-card p-3">
          <div class="text-xs text-gray-500">Record (raw → unik)</div>
          <div class="text-xl font-bold">${v.raw.length} → ${v.best.length}</div>
        </div>
        <div class="stat-card p-3">
          <div class="text-xs text-gray-500">SKS (hasil hitung)</div>
          <div class="text-xl font-bold">${sum.totalSKS}</div>
        </div>
        <div class="stat-card p-3">
          <div class="text-xs text-gray-500">IPK (hasil hitung)</div>
          <div class="text-xl font-bold text-indigo-600">${fmt(sum.ipk)}</div>
        </div>
        <div class="stat-card p-3">
          <div class="text-xs text-gray-500">Status</div>
          <div class="mt-1">${badge}</div>
        </div>
      </div>`;

    const rows = v.detail.length
      ? v.detail.map(d => `
        <tr class="border-b border-gray-100 dark:border-gray-700 ${d.isDup ? 'bg-orange-50 dark:bg-orange-900/20' : ''}">
          <td class="px-2 py-1.5 font-mono text-xs">${esc(d.kode_mata_kuliah)}</td>
          <td class="px-2 py-1.5">${esc(d.nama_mata_kuliah)}</td>
          <td class="px-2 py-1.5 text-right">${d.sks_mata_kuliah}</td>
          <td class="px-2 py-1.5 text-center text-xs">${d.attempts.join(' → ') || '-'}</td>
          <td class="px-2 py-1.5 text-center font-bold">${esc(d.bestHuruf || '-')}</td>
          <td class="px-2 py-1.5 text-center text-xs ${d.isDup ? 'text-orange-600 font-semibold' : 'text-gray-400'}">
            ${d.isDup ? `⚠ ${d.count}×` : 'OK'}
          </td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="text-center py-4 text-gray-400">Tidak ada transkrip.</td></tr>`;

    el.modalB.innerHTML = `
      ${info}
      <div class="text-xs text-gray-500 mb-2">
        <b>Attempts</b> = semua nilai yang tersimpan untuk MK tsb.
        Baris orange = MK berulang; yang dipakai adalah nilai tertinggi.
      </div>
      <div class="overflow-auto max-h-[55vh] border rounded-lg">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 dark:bg-gray-900 sticky top-0">
            <tr>
              <th class="px-2 py-2 text-left">Kode</th>
              <th class="px-2 py-2 text-left">Mata Kuliah</th>
              <th class="px-2 py-2 text-right">SKS</th>
              <th class="px-2 py-2 text-center">Attempts</th>
              <th class="px-2 py-2 text-center">Dipakai</th>
              <th class="px-2 py-2 text-center">Catatan</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /* ---------------- 5) Cari NIM / nama (global, lintas angkatan) ---------------- */
  async function handleSearch() {
    const q = el.search.value.trim().toLowerCase();
    if (!q) { el.searchRes.innerHTML = 'Masukkan NIM/nama.'; return; }

    const found = state.allMhs.filter(m =>
      getNim(m).toLowerCase().includes(q) ||
      getNama(m).toLowerCase().includes(q)
    );

    if (!found.length) {
      el.searchRes.innerHTML =
        `<span class="text-red-500">Tidak ada mahasiswa cocok dengan "${esc(q)}".</span>`;
      return;
    }

    // Ambil riwayat paling relevan (periode terbaru) per mahasiswa
    const withRegId = found.map(m => {
      const arr = getRiwayatArr(m)
        .filter(r => r.id_registrasi_mahasiswa)
        .sort((a, b) =>
          String(b.id_periode_masuk || '').localeCompare(String(a.id_periode_masuk || ''))
        );
      return { m, riwayat: arr[0] || null };
    }).filter(x => x.riwayat);

    if (!withRegId.length) {
      el.searchRes.innerHTML =
        `<span class="text-red-500">Ditemukan mahasiswa, tapi tidak punya riwayat pendidikan (id_registrasi_mahasiswa kosong).</span>`;
      return;
    }

    if (withRegId.length === 1) {
      const { m, riwayat } = withRegId[0];
      el.searchRes.innerHTML =
        `Menampilkan transkrip: <b>${esc(getNama(m))}</b> (${esc(getNim(m))})`;
      window.__htShowDetail(riwayat.id_registrasi_mahasiswa);
      return;
    }

    el.searchRes.innerHTML = `
      <div class="text-sm mb-1">Ditemukan ${withRegId.length} mahasiswa:</div>
      <div class="space-y-1 max-h-40 overflow-auto">
        ${withRegId.map(({ m, riwayat }) => `
          <button class="block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  onclick="window.__htShowDetail('${esc(riwayat.id_registrasi_mahasiswa)}')">
            <span class="font-mono text-xs">${esc(getNim(m) || '-')}</span>
            · ${esc(getNama(m) || '-')}
            <span class="text-xs text-gray-500">
              (${esc(getProdi(m) || '')} · ${esc(labelPeriode(riwayat.id_periode_masuk))})
            </span>
          </button>
        `).join('')}
      </div>`;
  }

  /* ---------------- 6) Hitung Angkatan ---------------- */
  async function handleHitungAngkatan() {
    if (!state.angkatan) { setStatus('Pilih angkatan dulu', true); return; }

    const mhs = getMahasiswaAngkatan(state.angkatan);
    if (!mhs.length) {
        setStatus(
        `Tidak ada mahasiswa angkatan ${state.angkatan}` +
        (state.prodiId ? ` di ${prodiLabel()}` : ''),
        true
        );
        return;
    }

    const byProdi = new Map();
    for (const m of mhs) {
        const prodiId = m.id_prodi_entry || m.id_prodi;
        if (!prodiId) continue;
        if (!byProdi.has(prodiId)) byProdi.set(prodiId, []);
        byProdi.get(prodiId).push(m);
    }
    if (!byProdi.size) {
        setStatus('id_prodi tidak terdeteksi. Cek data riwayat pendidikan.', true);
        return;
    }

    const prodiList = [...byProdi.entries()];
    const totalProdi = prodiList.length;

    if (!confirm(
        `Hitung transkrip angkatan ${state.angkatan} untuk ${totalProdi} prodi ` +
        `(${mhs.length} mahasiswa)?\n\n` +
        prodiList.map(([pid, list], i) => {
        const nama = list[0]?.nama_program_studi || pid.slice(0, 8);
        return `${i + 1}. ${nama} — ${list.length} mhs`;
        }).join('\n')
    )) return;

    el.btnHitung.disabled = true;
    el.btnHitung.textContent = '⏳ Memproses…';

    // ✅ Log awal
    logger.log('info', `Mulai hitung transkrip angkatan ${state.angkatan}`, {
        angkatan:       state.angkatan,
        totalProdi,
        totalMahasiswa: mhs.length,
        prodiList:      prodiList.map(([pid, list]) => ({
        id:   pid,
        nama: list[0]?.nama_program_studi || pid.slice(0, 8),
        mhs:  list.length,
        })),
    });

    let ok = 0, fail = 0;
    const errors = [];

    for (let i = 0; i < prodiList.length; i++) {
        const [idProdi, students] = prodiList[i];
        const namaProdi = students[0]?.nama_program_studi || idProdi.slice(0, 8);
        const prefix    = totalProdi > 1
        ? `(${i + 1} dari ${totalProdi}) `
        : '';

        // ✅ Progress di UI
        setStatus(
        `${prefix}Hitung transkrip: ${namaProdi} (${students.length} mhs)…`
        );

        // ✅ Log per prodi
        logger.log('info', `${prefix}Hitung transkrip prodi: ${namaProdi}`, {
        angkatan:   state.angkatan,
        id_prodi:   idProdi,
        nama_prodi: namaProdi,
        mhs_count:  students.length,
        step:       `${i + 1}/${totalProdi}`,
        });

        const t0 = performance.now();
        try {
        await api.hitungTranskripAngkatan({
            angkatan: state.angkatan,
            id_prodi: idProdi,
        });
        ok++;
        const dur = Math.round((performance.now() - t0) / 1000);

        // ✅ Log sukses
        logger.log('success', `${prefix}Sukses: ${namaProdi}`, {
            angkatan:   state.angkatan,
            id_prodi:   idProdi,
            nama_prodi: namaProdi,
            mhs_count:  students.length,
            durasi_detik: dur,
        });
        } catch (e) {
        fail++;
        errors.push(`${namaProdi}: ${e.message}`);
        const dur = Math.round((performance.now() - t0) / 1000);

        // ✅ Log gagal
        logger.log('error', `${prefix}Gagal: ${namaProdi} — ${e.message}`, {
            angkatan:   state.angkatan,
            id_prodi:   idProdi,
            nama_prodi: namaProdi,
            mhs_count:  students.length,
            durasi_detik: dur,
            is_timeout:   e.isTimeout === true,
        });

        console.warn(`[HitungTranskrip] ${namaProdi} gagal:`, e.message);
        }
    }

    // ✅ Log ringkasan
    logger.log(
        fail === 0 ? 'success' : 'warning',
        `Hitung transkrip selesai: ${ok} sukses, ${fail} gagal`,
        {
        angkatan: state.angkatan,
        ok, fail,
        errors: errors.slice(0, 10),
        }
    );

    setStatus(
        `✅ ${ok} prodi sukses, ${fail} gagal. ` +
        (fail === 0 ? 'Memuat ulang…' : 'Lihat console untuk detail.')
    );

    if (fail === 0) {
        await loadTranskripAngkatan();
    } else {
        alert(
        `Hitung selesai: ${ok} sukses, ${fail} gagal.\n\n` +
        errors.slice(0, 5).join('\n')
        );
    }

    el.btnHitung.disabled = false;
    el.btnHitung.textContent = '▶ Hitung Transkrip Angkatan';
    }

  /* ---------------- Bindings ---------------- */
  el.angkatan.addEventListener('change', (e) => {
    state.angkatan = e.target.value;
    el.angLabel.textContent = state.angkatan
      ? `(angkatan ${state.angkatan} · ${prodiLabel()})`
      : '—';
  });

  el.prodi.addEventListener('change', (e) => {
    state.prodiId = e.target.value;
    el.angLabel.textContent = state.angkatan
      ? `(angkatan ${state.angkatan} · ${prodiLabel()})`
      : '—';

    // Jika data sudah ter-load, re-render tabel dari cache (tanpa re-fetch)
    if (state.angkatan && state.perStudent.size > 0) {
      renderTable(getMahasiswaAngkatan(state.angkatan));
    }
  });

  el.btnLoad.addEventListener('click', loadTranskripAngkatan);
  el.btnHitung.addEventListener('click', handleHitungAngkatan);
  el.btnCari.addEventListener('click', handleSearch);
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  /* ---------------- Start ---------------- */
  await loadAllMahasiswa();
}