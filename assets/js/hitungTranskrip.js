// hitungTranskrip.js
import { NeoFeederAPI } from './api.js';
import { DEBUG_API } from './config.js';
import { Logger } from './logger.js';

/* ============================================================
 *  KONSTANTA
 * ============================================================ */
const GRADE_POINTS = {
  'A': 4.00, 'A-': 3.75,
  'B+': 3.50, 'B': 3.00, 'B-': 2.75,
  'C+': 2.50, 'C': 2.00, 'C-': 1.75,
  'D': 1.50, 'E': 0.00,
};
const GRADE_RANK = {
  'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
  'C+': 7, 'C': 6, 'C-': 5, 'D': 2, 'E': 1,
};
// Kode status mahasiswa yang menandakan keluar (tidak boleh dihitung)
const STATUS_KELUAR = new Set([
  // Format huruf (Neo Feeder standar)
  'L', 'D', 'M', 'K', 'W',
  // Format angka (id_jenis_keluar)
  '0', '1', '2', '3', '4', '5', '6',
]);

/* ============================================================
 *  HELPER
 * ============================================================ */
const normHuruf = (h) => String(h ?? '').trim().toUpperCase();
const hurufLabel = (h) => normHuruf(h) || '—';
const gradePts  = (h) => GRADE_POINTS[normHuruf(h)] ?? 0;
const gradeRank = (h) => GRADE_RANK[normHuruf(h)]   ?? 0;
const fmt       = (n, d = 2) => Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '-';
const esc       = (v) => String(v ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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

/** smt_diambil dari id_semester (5 digit) & id_periode_masuk (5 digit). */
function hitungSmtDiambil(idSemester, idPeriodeMasuk) {
  const s = String(idSemester || '');
  const e = String(idPeriodeMasuk || '');
  if (s.length < 5 || e.length < 5) return null;

  let semS = parseInt(s.slice(4), 10);
  const semE = parseInt(e.slice(4), 10);
  const yearS = parseInt(s.slice(0, 4), 10);
  const yearE = parseInt(e.slice(0, 4), 10);
  if ([semS, semE, yearS, yearE].some(isNaN)) return null;

  // Semester pendek (3) dianggap lanjutan genap
  if (semS === 3) semS = 2;

  const count = (yearS - yearE) * 2 + (semS - semE) + 1;
  return Math.max(1, count);
}

/**
 * Bangun payload insert dari satu raw transkrip.
 * Sumber: id_kelas_kuliah > id_nilai_transfer > id_konversi_aktivitas.
 * smt_diambil: dari raw jika ada, else hitung dari id_semester & id_periode_masuk.
 */
function buildInsertRecord(rawRecord, regId, idPeriodeMasuk) {
  if (!rawRecord) return { ok: false, error: 'record kosong' };

  // Tentukan idReg dengan prioritas berlapis
  const idReg =
    rawRecord.id_registrasi_mahasiswa ||
    regId ||
    '';   // biarkan string kosong kalau dua-duanya kosong — validasi di api.js akan menangkap

  const idMatkul = rawRecord.id_matkul || '';
  if (!idReg)    return { ok: false, error: 'id_registrasi_mahasiswa kosong (rawRecord & regId)' };
  if (!idMatkul) return { ok: false, error: 'id_matkul kosong' };

  // Tentukan sumber dengan tegas
  const src = rawRecord._source;
  let source = null;

  if (src === 'kelas' || src === 'riwayat') {
    if (!rawRecord.id_kelas_kuliah) return { ok: false, error: 'id_kelas_kuliah kosong' };
    source = { id_kelas_kuliah: rawRecord.id_kelas_kuliah };
  } else if (src === 'transfer') {
    if (!rawRecord.id_nilai_transfer) return { ok: false, error: 'id_nilai_transfer kosong' };
    source = { id_nilai_transfer: rawRecord.id_nilai_transfer };
  } else if (src === 'konversi') {
    if (!rawRecord.id_konversi_aktivitas) return { ok: false, error: 'id_konversi_aktivitas kosong' };
    source = { id_konversi_aktivitas: rawRecord.id_konversi_aktivitas };
  } else {
    return { ok: false, error: `sumber tidak dikenal: ${src}` };
  }

  // smt_diambil
  let smt = rawRecord.smt_diambil;
  if (!smt && rawRecord.id_semester && idPeriodeMasuk) {
    smt = hitungSmtDiambil(rawRecord.id_semester, idPeriodeMasuk);
  }
  if (!smt) return { ok: false, error: 'smt_diambil tidak bisa ditentukan' };

  return {
    ok: true,
    record: {
      id_registrasi_mahasiswa: String(idReg),
      id_matkul:               String(idMatkul),
      ...source,
      smt_diambil:             Number(smt),
    },
  };
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
  return { totalSKS, totalMutu, jumlahMK: n, ipk: totalSKS > 0 ? totalMutu / totalSKS : 0 };
}

/** Normalisasi record dari berbagai sumber ke bentuk seragam. */
function normalizeRawRecord(r, fallbackRegId, idPeriodeMasuk = '') {
  const src = r._source || '?';

  // Default fallback
  const out = {
    id_registrasi_mahasiswa: r.id_registrasi_mahasiswa || fallbackRegId,
    id_matkul:               r.id_matkul || '',
    kode_mata_kuliah:        '',
    nama_mata_kuliah:        '',
    sks_mata_kuliah:         0,
    nilai_huruf:             '',
    nilai_indeks:            null,
    nilai_angka:             null,
    smt_diambil:             null,
    id_semester:             '',
    id_kelas_kuliah:         null,
    id_nilai_transfer:       null,
    id_konversi_aktivitas:   null,
    _source:                 src,
  };

  if (src === 'kelas') {
    // GetDetailNilaiPerkuliahanKelas
    out.kode_mata_kuliah = r.kode_mata_kuliah || '';
    out.nama_mata_kuliah = r.nama_mata_kuliah || '';
    out.sks_mata_kuliah  = parseFloat(r.sks_mata_kuliah) || 0;
    out.nilai_huruf      = r.nilai_huruf || '';
    out.nilai_indeks     = r.nilai_indeks ?? null;
    out.nilai_angka      = r.nilai_angka ?? null;
    out.id_semester      = r.id_semester || '';
    out.id_kelas_kuliah  = r.id_kelas_kuliah || null;
  }
  else if (src === 'transfer') {
    // GetNilaiTransferPendidikanMahasiswa
    out.kode_mata_kuliah     = r.kode_matkul_diakui || r.kode_mata_kuliah || '';
    out.nama_mata_kuliah     = r.nama_mata_kuliah_diakui || r.nama_mata_kuliah || '';
    out.sks_mata_kuliah      = parseFloat(r.sks_mata_kuliah_diakui || r.sks_mata_kuliah) || 0;
    out.nilai_huruf          = r.nilai_huruf_diakui || r.nilai_huruf || '';
    out.nilai_angka          = r.nilai_angka_diakui ?? r.nilai_angka ?? null;
    out.nilai_indeks         = r.nilai_indeks ?? null;
    out.id_semester          = r.id_semester || '';
    out.id_nilai_transfer    = r.id_transfer || r.id_nilai_transfer || null;
    out.id_matkul            = r.id_matkul || '';
  }
  else if (src === 'konversi') {
    // Konversi tidak punya kode_mata_kuliah → grup fallback ke id_matkul
    out.kode_mata_kuliah        = r.kode_mata_kuliah || r.kode_matkul || '';
    out.nama_mata_kuliah        = r.nama_mata_kuliah || '';
    out.sks_mata_kuliah         = parseFloat(r.sks_mata_kuliah) || 0;
    out.nilai_huruf             = r.nilai_huruf || '';
    out.nilai_indeks            = r.nilai_indeks ?? null;
    out.nilai_angka             = r.nilai_angka ?? null;
    out.id_semester             = r.id_semester || '';
    out.id_konversi_aktivitas   = r.id_konversi_aktivitas || null;
    // id_registrasi_mahasiswa sudah di-inject di getAllRawNilaiMahasiswa
  }
  else if (src === 'riwayat') {
    // GetRiwayatNilaiMahasiswa
    out.kode_mata_kuliah = r.kode_mata_kuliah || '';
    out.nama_mata_kuliah = r.nama_mata_kuliah || '';
    out.sks_mata_kuliah  = parseFloat(r.sks_mata_kuliah) || 0;
    out.nilai_huruf      = r.nilai_huruf || '';
    out.nilai_indeks     = r.nilai_indeks ?? null;
    out.nilai_angka      = r.nilai_angka ?? null;
    out.id_semester      = r.id_periode || r.id_semester || '';
    out.id_kelas_kuliah  = r.id_kelas || r.id_kelas_kuliah || null;
  }

  // smt_diambil: hitung jika belum ada
  if (r.smt_diambil) {
    out.smt_diambil = String(r.smt_diambil);
  } else if (out.id_semester && idPeriodeMasuk) {
    out.smt_diambil = String(hitungSmtDiambil(out.id_semester, idPeriodeMasuk) || '');
  }

  return out;
}

export function verifikasiTranskrip(rawRecords) {
  const raw = Array.isArray(rawRecords) ? rawRecords : [];

  /**
   * Kunci grup = kode_mata_kuliah + nama_mata_kuliah (normalized).
   * Jika kode & nama kosong → fallback ke id_matkul.
   * Ini menangkap kasus:
   *   - id_matkul berbeda tapi kode+nama sama (kurikulum berubah, retake lintas kurikulum)
   *   - id_matkul sama, kode+nama sama (retake biasa)
   */
  const groupKey = (r) => {
    const kode = String(r.kode_mata_kuliah || '').trim().toUpperCase();
    const nama = String(r.nama_mata_kuliah || '').trim().toUpperCase()
      .replace(/\s+/g, ' ');
    if (!kode && !nama) return `__id__${r.id_matkul || ''}`;
    return `${kode}|${nama}`;
  };

  const byGroup = new Map();
  for (const r of raw) {
    const key = groupKey(r);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }

  const detail = [];
  let dupCount = 0, hasChange = false;
  let sameIdDup = 0, diffIdDup = 0;

  for (const [key, arr] of byGroup) {
    // Sort kronologis berdasarkan smt_diambil
    const sorted = [...arr].sort((a, b) => {
      const sa = parseInt(a.smt_diambil ?? 0, 10) || 0;
      const sb = parseInt(b.smt_diambil ?? 0, 10) || 0;
      return sa - sb;
    });

    // Pilih terbaik berdasarkan ranking huruf
    const best = sorted.reduce(
      (b, r) => !b || gradeRank(r.nilai_huruf) > gradeRank(b.nilai_huruf) ? r : b,
      null
    );

    const isDup = arr.length > 1;
    const uniqueIdMatkul = new Set(arr.map(r => r.id_matkul));
    const isCrossIdMatkul = uniqueIdMatkul.size > 1;

    if (isDup) {
      dupCount++;
      hasChange = true;
      if (isCrossIdMatkul) diffIdDup++;
      else                 sameIdDup++;
    }

    detail.push({
      // id_matkul utama = record terbaik (untuk delete/insert)
      id_matkul:        best?.id_matkul || '',
      allIdMatkul:      [...uniqueIdMatkul],   // semua id_matkul dalam grup
      kode_mata_kuliah: best?.kode_mata_kuliah || '',
      nama_mata_kuliah: best?.nama_mata_kuliah || '',
      sks_mata_kuliah:  parseFloat(best?.sks_mata_kuliah) || 0,
      bestHuruf:        normHuruf(best?.nilai_huruf) || '—',
      bestRecord:       best,
      attempts:         sorted.map(r => hurufLabel(r.nilai_huruf)),
      // Detail per attempt — untuk tooltip
      attemptsDetail:   sorted.map(r => ({
        huruf:    hurufLabel(r.nilai_huruf),
        smt:      r.smt_diambil || '?',
        idMatkul: r.id_matkul,
        kode:     r.kode_mata_kuliah,
        nama:     r.nama_mata_kuliah,
        sumber:   r._source || '?',
      })),
      count:            arr.length,
      isDup,
      isCrossIdMatkul,          // true = id_matkul berbeda (kurikulum berubah)
      emptyAttempts:    sorted.filter(r => !normHuruf(r.nilai_huruf)).length,
    });
  }

  detail.sort((a, b) =>
    String(a.kode_mata_kuliah).localeCompare(String(b.kode_mata_kuliah))
  );

  const best = detail.map(d => d.bestRecord).filter(Boolean);

  return {
    raw, best, detail, dupCount,
    summary:    hitungIPK(best),
    rawSummary: hitungIPK(raw),
    isClean:    raw.length > 0 && !hasChange,
    hasChange,
    sudahDihitung: raw.length > 0,
    stats: {
      rawCount:   raw.length,
      uniqueMk:   byGroup.size,
      dupMk:      dupCount,
      sameIdDup,                // retake biasa
      diffIdDup,                // kode sama, id_matkul beda
    },
  };
}

/* ============================================================
 *  MAIN RENDER
 * ============================================================ */
export async function renderHitungTranskrip(container) {
  const api    = new NeoFeederAPI();
  const logger = new Logger();

  const state = {
    allMhs: [],
    alumniMhsIds: new Set(),
    matched: [],
    selected: null,        // { m, regId, riwayat }
    verified: null,
    loading: false,
    lastBackup: null,
    selectedMkIds: new Set(),   // ← BARU: id_matkul yang dipilih user
  };

  /* ---------------- HTML ---------------- */
  container.innerHTML = `
    <h2 class="text-2xl font-bold mb-4">Hitung &amp; Verifikasi Transkrip Mahasiswa</h2>

    <div class="glass p-4 rounded-xl mb-4">
      <h3 class="font-semibold mb-2">🔍 Pilih Mahasiswa Aktif</h3>
      <div class="flex gap-2 flex-wrap">
        <input id="ht-search" type="text" placeholder="Ketik NIM atau nama…"
               class="flex-1 min-w-[240px] px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
        <button id="ht-btn-cari"
                class="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Cari
        </button>
      </div>
      <div id="ht-search-result" class="mt-3 text-sm text-gray-500 italic">Belum ada pencarian.</div>
    </div>

    <div class="glass p-4 rounded-xl mb-4 hidden" id="ht-student-card">
      <div class="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 class="font-semibold text-lg" id="ht-student-name">—</h3>
          <p class="text-sm text-gray-500" id="ht-student-meta">—</p>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <span id="ht-status" class="text-sm text-gray-500"></span>
          <button id="ht-btn-refresh"
                  class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
            🔄 Muat Ulang
          </button>
          <button id="ht-btn-backup"
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            💾 Backup
          </button>
          <button id="ht-btn-debug"
                  class="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200"
                  title="Lihat raw JSON transkrip">
            🔍 Debug JSON
          </button>
          <button id="ht-btn-apply"
                  class="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            ✓ Terapkan Hasil Hitung
          </button>
        </div>
      </div>
      <div id="ht-summary" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3"></div>
      <div class="overflow-auto max-h-[60vh] border rounded-lg">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
            <tr>
              <th class="px-2 py-2 text-left w-8"></th>
              <th class="px-2 py-2 text-left">Kode</th>
              <th class="px-2 py-2 text-left">Mata Kuliah</th>
              <th class="px-2 py-2 text-right">SKS</th>
              <th class="px-2 py-2 text-center">Attempts</th>
              <th class="px-2 py-2 text-center">Dipakai</th>
              <th class="px-2 py-2 text-center">Sumber</th>
              <th class="px-2 py-2 text-center">Catatan</th>
            </tr>
          </thead>
          <tbody id="ht-tbody">
            <tr><td colspan="8" class="text-center py-6 text-gray-400">Pilih mahasiswa dulu.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        ☑ = sudah sesuai (1 attempt per MK) ·
        ☐ = perlu diterapkan (ada MK berulang → delete-all + insert nilai tertinggi).
      </p>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);
  const el = {
    search:      $('#ht-search'),
    btnCari:     $('#ht-btn-cari'),
    searchRes:   $('#ht-search-result'),
    studentCard: $('#ht-student-card'),
    studentName: $('#ht-student-name'),
    studentMeta: $('#ht-student-meta'),
    status:      $('#ht-status'),
    btnRefresh:  $('#ht-btn-refresh'),
    btnBackup:   $('#ht-btn-backup'),
    btnDebug:    $('#ht-btn-debug'),
    btnApply:    $('#ht-btn-apply'),
    summary:     $('#ht-summary'),
    tbody:       $('#ht-tbody'),
  };

  const setStatus = (msg, isError = false) => {
    if (!el.status) return;
    el.status.textContent = msg;
    el.status.className = 'text-sm ' + (isError ? 'text-red-500' : 'text-gray-500');
  };

  const getNim   = (m) => String(m.nim || m.nipd || '');
  const getNama  = (m) => m.nama_mahasiswa || '';
  const getProdi = (m) => m.nama_program_studi || '';

  /* ---------------- Filter mahasiswa aktif ---------------- */
  function isMahasiswaAktif(m) {
    const mhsId = String(m.id_mahasiswa || '');
    // Cek dari daftar alumni (lebih akurat)
    if (mhsId && state.alumniMhsIds.has(mhsId)) return false;
    // Cek dari status string
    const status = String(m.id_status_mahasiswa ?? '').trim().toUpperCase();
    if (status && STATUS_KELUAR.has(status)) return false;
    return true;
  }

  /* ---------------- 1) Load mahasiswa + alumni ---------------- */
  async function loadAllMahasiswa() {
    try {
      const res = await api.getListMahasiswa();
      state.allMhs = Array.isArray(res) ? res : (res?.data || []);

      try {
        const alumni = await api.getDetailMahasiswaLulusDO();
        const arr = Array.isArray(alumni) ? alumni : (alumni?.data || []);
        state.alumniMhsIds.clear();
        for (const a of arr) {
          if (a.id_mahasiswa) state.alumniMhsIds.add(String(a.id_mahasiswa));
          if (!a.id_mahasiswa && a.nim) {
            const m = state.allMhs.find(x => String(x.nim) === String(a.nim));
            if (m?.id_mahasiswa) state.alumniMhsIds.add(String(m.id_mahasiswa));
          }
        }
      } catch (e) {
        console.warn('Gagal memuat daftar alumni:', e.message);
        logger.log('warning', `Gagal memuat daftar alumni: ${e.message}`);
      }

      logger.log('info', `Daftar mahasiswa siap`, {
        total:  state.allMhs.length,
        alumni: state.alumniMhsIds.size,
        aktif:  state.allMhs.length - state.alumniMhsIds.size,
      });
    } catch (e) {
      console.error(e);
      logger.log('error', `Gagal memuat mahasiswa: ${e.message}`);
    }
  }

  /* ---------------- 2) Search ---------------- */
  async function handleSearch() {
    const q = el.search.value.trim().toLowerCase();
    if (!q) { el.searchRes.innerHTML = 'Masukkan NIM/nama.'; return; }

    const cocok = state.allMhs.filter(m =>
      getNim(m).toLowerCase().includes(q) ||
      getNama(m).toLowerCase().includes(q)
    );
    state.matched = cocok.filter(isMahasiswaAktif);
    const alumni = cocok.filter(m => !isMahasiswaAktif(m));

    if (!state.matched.length && !alumni.length) {
      el.searchRes.innerHTML =
        `<span class="text-red-500">Tidak ada mahasiswa cocok dengan "${esc(q)}".</span>`;
      return;
    }

    const renderList = (arr, disabled, alasan) => arr.slice(0, 30).map((m, i) => `
      <button ${disabled ? 'disabled' : ''}
              class="block w-full text-left px-3 py-1.5 rounded
                     ${disabled
                       ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800'
                       : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
              data-idx="${disabled ? '' : i}">
        <span class="font-mono text-xs">${esc(getNim(m) || '-')}</span>
        · ${esc(getNama(m) || '-')}
        <span class="text-xs text-gray-500">
          (${esc(getProdi(m) || '')})
          ${disabled ? `<span class="ml-1 text-red-500">· ${alasan}</span>` : ''}
        </span>
      </button>
    `).join('');

    let html = '';
    if (state.matched.length) {
      html += `
        <div class="text-sm mb-1"><b>${state.matched.length}</b> mahasiswa aktif (bisa dihitung):</div>
        <div class="space-y-1 max-h-48 overflow-auto mb-3" id="ht-list-aktif">
          ${renderList(state.matched, false)}
        </div>`;
    }
    if (alumni.length) {
      html += `
        <div class="text-sm mb-1 text-gray-500"><b>${alumni.length}</b> mahasiswa sudah keluar (tidak dihitung):</div>
        <div class="space-y-1 max-h-32 overflow-auto">
          ${renderList(alumni, true, 'sudah keluar')}
        </div>`;
    }
    el.searchRes.innerHTML = html;

    const listAktif = el.searchRes.querySelector('#ht-list-aktif');
    if (listAktif) {
      listAktif.querySelectorAll('button[data-idx]').forEach(btn => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) btn.addEventListener('click', () => selectMahasiswa(state.matched[idx]));
      });
    }

    if (state.matched.length === 1) selectMahasiswa(state.matched[0]);
  }

  /* ---------------- 3) Pilih mahasiswa ---------------- */
  async function selectMahasiswa(m) {
    if (!m) return;
    if (!isMahasiswaAktif(m)) {
      setStatus('Mahasiswa sudah keluar — tidak bisa dihitung.', true);
      logger.log('warning', `Tolak hitung mahasiswa keluar: ${getNama(m)} (${getNim(m)})`);
      return;
    }

    el.studentCard.classList.remove('hidden');
    el.studentName.textContent = getNama(m) || '-';
    el.studentMeta.textContent = `NIM: ${getNim(m) || '-'} · ${getProdi(m) || '-'}`;
    el.summary.innerHTML = '';
    el.tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-400">Memuat transkrip…</td></tr>`;
    setStatus('Mencari riwayat pendidikan…');

    const info = await resolveRiwayat(m);
    if (!info) {
      el.tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500">
        Riwayat pendidikan tidak ditemukan (id_registrasi_mahasiswa kosong).
      </td></tr>`;
      setStatus('Gagal: riwayat pendidikan tidak ditemukan', true);
      logger.log('error', `resolveRiwayat gagal: ${getNim(m)}`);
      return;
    }

    state.selected = { m, regId: info.regId, riwayat: info.riwayat };
    el.studentMeta.textContent =
      `NIM: ${getNim(m) || '-'} · ${getProdi(m) || '-'} · ` +
      `Periode masuk: ${labelPeriode(info.riwayat.id_periode_masuk)}`;

    await loadTranskrip(info.regId);
  }

  async function resolveRiwayat(m) {
    try {
      const res = await api.call('GetListRiwayatPendidikanMahasiswa', {
        filter: `id_mahasiswa='${m.id_mahasiswa}'`,
        limit: 10,
      });
      const arr = api.extractData(res) || [];
      const sorted = arr
        .filter(r => r.id_registrasi_mahasiswa)
        .sort((a, b) =>
          String(b.id_periode_masuk || '').localeCompare(String(a.id_periode_masuk || ''))
        );
      const r = sorted[0];
      return r ? { regId: r.id_registrasi_mahasiswa, riwayat: r } : null;
    } catch (e) {
      if (DEBUG_API) console.warn('resolveRiwayat gagal:', e.message);
      return null;
    }
  }


  /* ---------------- 4) Load transkrip ---------------- */
async function loadTranskrip(regId) {
  setStatus('Memuat transkrip…');
  try {
    const nim = state.selected?.m?.nim || '';
    const result = await api.getAllRawNilaiMahasiswa(regId, {
      nim,
      force: true,
      includeKonversi: true,
    });
    const idPeriodeMasuk = state.selected?.riwayat?.id_periode_masuk || '';

    const normalized = result.records.map(r =>
      normalizeRawRecord(r, regId, idPeriodeMasuk)
    );

    for (const r of normalized) {
      if (!r.id_matkul && r.kode_mata_kuliah) {
        const mk = await lookupEngine.lookupMataKuliah(r.kode_mata_kuliah);
        if (mk) r.id_matkul = mk._raw?.id_matkul || mk.id_matkul || '';
      }
    }

    const valid = normalized.filter(r => r.id_matkul);
    const skipped = normalized.length - valid.length;
    if (skipped > 0) {
      console.warn(`[Transkrip] ${skipped} record tanpa id_matkul dibuang`);
    }

    console.log(`[Transkrip] sumber=${result.source}, raw=${valid.length}`);
    if (DEBUG_API) {
      // Distribusi per MK
      const byMk = new Map();
      for (const r of valid) {
        const k = r.kode_mata_kuliah || r.id_matkul;
        byMk.set(k, (byMk.get(k) || 0) + 1);
      }
      const dobel = [...byMk.entries()].filter(([, n]) => n > 1);
      console.log(`[Transkrip] ${byMk.size} MK unik, ${dobel.length} MK dobel:`,
        dobel.map(([k, n]) => `${k}(${n}×)`).join(', '));
    }

    state.verified = verifikasiTranskrip(valid);
    state.selectedMkIds.clear();
    renderHasil(state.verified);

    const v = state.verified;
    const msg = v.isClean
      ? `✅ ${valid.length} record · ${v.stats.uniqueMk} MK unik · semua tunggal`
      : `⚠ ${valid.length} record · ${v.stats.uniqueMk} MK unik · ${v.dupCount} MK dobel`;
    setStatus(msg, !v.isClean);

    logger.log(
      v.isClean ? 'success' : 'warning',
      `Transkrip dimuat: ${state.selected.m.nama_mahasiswa}`,
      {
        nim: state.selected.m.nim,
        regId,
        source: result.source,
        raw_count: valid.length,
        unique_mk: v.stats.uniqueMk,
        dup_count: v.dupCount,
        same_id_dup: v.stats.sameIdDup,
        diff_id_dup: v.stats.diffIdDup,
      }
    );
  } catch (e) {
    console.error(e);
    el.tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500">
      Gagal memuat transkrip: ${esc(e.message)}
    </td></tr>`;
    setStatus('Gagal: ' + e.message, true);
    logger.log('error', `Gagal memuat transkrip: ${e.message}`, { regId });
  }
}

  /* ---------------- 5) Render hasil ---------------- */
function renderHasil(v) {
  const sum = v.summary, rawSum = v.rawSummary;

  el.summary.innerHTML = `
    <div class="stat-card p-3">
      <div class="text-xs text-gray-500">Record (raw → MK unik)</div>
      <div class="text-xl font-bold">
        ${v.raw.length} → ${v.best.length}
        ${v.dupCount > 0
          ? `<span class="text-xs font-normal text-orange-600 ml-1">(${v.dupCount} dobel)</span>`
          : `<span class="text-xs font-normal text-green-600 ml-1">(semua unik)</span>`}
      </div>
    </div>
    <div class="stat-card p-3">
      <div class="text-xs text-gray-500">SKS (hasil hitung)</div>
      <div class="text-xl font-bold">${sum.totalSKS}</div>
    </div>
    <div class="stat-card p-3">
      <div class="text-xs text-gray-500">IPK</div>
      <div class="text-xl font-bold text-indigo-600">
        ${fmt(sum.ipk)}
        ${rawSum.ipk !== sum.ipk
          ? `<span class="text-xs text-gray-400 line-through ml-1">${fmt(rawSum.ipk)}</span>`
          : ''}
      </div>
    </div>
    <div class="stat-card p-3">
      <div class="text-xs text-gray-500">Status</div>
      <div class="mt-1">
        ${v.isClean
          ? `<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">✓ Sesuai</span>`
          : `<span class="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">${v.dupCount} MK dobel</span>`}
      </div>
    </div>`;

  if (v.raw.length === 0) {
    el.tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-400">
      Tidak ada transkrip.
    </td></tr>`;
    el.btnApply.disabled = true;
    return;
  }

  // === Banner info di atas tabel (BUKAN pengganti baris) ===
  let banner = '';
  if (v.dupCount === 0) {
    banner = `
      <tr class="bg-green-50 dark:bg-green-900/20">
        <td colspan="8" class="text-center py-3 text-green-700 text-sm">
          ✓ Tidak ada MK dobel — ${v.raw.length} record / ${v.stats.uniqueMk} MK unik.
          <div class="text-xs text-gray-500 mt-1">
            Pengecekan dilakukan pada kombinasi <b>kode + nama MK</b>.
            Kalau kamu yakin ada retake, klik 🔍 Debug JSON untuk lihat raw.
          </div>
        </td>
      </tr>`;
  } else {
    banner = `
      <tr class="bg-orange-50 dark:bg-orange-900/20">
        <td colspan="8" class="text-center py-2 text-orange-700 text-sm">
          ⚠ Ditemukan <b>${v.dupCount} MK dobel</b> — centang MK yang ingin diproses
          ${v.stats.diffIdDup > 0
            ? `<br><span class="text-xs">(${v.stats.diffIdDup} karena perubahan kurikulum — id_matkul berbeda)</span>`
            : ''}
        </td>
      </tr>`;
  }

  // === Render SEMUA baris ===
  const rowsHtml = v.detail.map(d => {
    const checkbox = d.isDup
      ? `<input type="checkbox" class="ht-mk-check"
               data-matkul-id="${esc(d.id_matkul)}"
               title="Centang untuk proses MK ini">`
      : `<input type="checkbox" checked disabled title="Sudah sesuai (1 attempt)">`;

    const best = d.bestRecord;
    const srcMap = {
      'kelas':     '<span class="text-blue-600">Kelas</span>',
      'transfer':  '<span class="text-purple-600">Transfer</span>',
      'konversi':  '<span class="text-teal-600">Konversi</span>',
      'riwayat':   '<span class="text-gray-500">Riwayat</span>',
      '?':         '<span class="text-red-500">Tidak ada</span>',
    };
    const srcLabel = srcMap[best?._source || '?'] || srcMap['?'];

    let catatan;
    if (d.isDup) {
      catatan = `<span class="text-orange-600 font-semibold">⚠ ${d.count}× → ${esc(d.bestHuruf)}</span>`;
      if (d.isCrossIdMatkul) {
        catatan += `<br><span class="text-xs text-red-500">⚠ id_matkul berbeda</span>`;
      }
      if (d.emptyAttempts > 0) {
        catatan += `<br><span class="text-xs text-yellow-600">${d.emptyAttempts} attempt kosong</span>`;
      }
    } else {
      catatan = `<span class="text-green-600">✓ OK</span>`;
    }

    const tooltipAttempts = d.attemptsDetail
      ? d.attemptsDetail
          .map(a => `${a.huruf} @smt${a.smt} (${a.sumber}, id:${a.idMatkul?.slice(0,8)})`)
          .join('\n')
      : '';

    return `
      <tr class="border-b border-gray-100 dark:border-gray-700 ${d.isDup ? 'bg-orange-50 dark:bg-orange-900/20' : ''}">
        <td class="px-2 py-2 text-center">${checkbox}</td>
        <td class="px-2 py-2 font-mono text-xs">${esc(d.kode_mata_kuliah)}</td>
        <td class="px-2 py-2">${esc(d.nama_mata_kuliah)}</td>
        <td class="px-2 py-2 text-right">${d.sks_mata_kuliah}</td>
        <td class="px-2 py-2 text-center text-xs font-mono" title="${esc(tooltipAttempts)}">
          ${esc(d.attempts.join(' → ')) || '-'}
        </td>
        <td class="px-2 py-2 text-center font-bold">${esc(d.bestHuruf)}</td>
        <td class="px-2 py-2 text-center text-xs">${srcLabel}</td>
        <td class="px-2 py-2 text-center text-xs">${catatan}</td>
      </tr>`;
  }).join('');

  el.tbody.innerHTML = banner + rowsHtml;

  // Bind checkbox untuk MK dobel
  el.tbody.querySelectorAll('input.ht-mk-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const idMatkul = cb.getAttribute('data-matkul-id');
      if (cb.checked) state.selectedMkIds.add(idMatkul);
      else            state.selectedMkIds.delete(idMatkul);
      updateApplyButton();
    });
  });

  updateApplyButton();
}

  /** Tombol Apply hanya aktif kalau ada MK yang dicentang. */
  function updateApplyButton() {
    const count = state.selectedMkIds.size;
    el.btnApply.disabled = count === 0;
    el.btnApply.textContent = count > 0
      ? `✓ Terapkan (${count} MK)`
      : '✓ Terapkan Hasil Hitung';
  }

  /* ---------------- 6) Backup ---------------- */
  function downloadBackup(records, filename) {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleBackup() {
    if (!state.selected || !state.verified) {
      alert('Pilih mahasiswa dulu.');
      return;
    }
    const m = state.selected.m;
    downloadBackup(
      state.verified.raw,
      `backup-transkrip-${m.nim || m.id_mahasiswa}-${new Date().toISOString().slice(0, 10)}.json`
    );
    logger.log('info', `Backup transkrip diunduh: ${m.nim}`, { count: state.verified.raw.length });
  }

  function handleDebug() {
    if (!state.selected || !state.verified) {
      alert('Pilih mahasiswa dulu.');
      return;
    }
    const v = state.verified;
    const m = state.selected.m;

    // Info ringkas
    const lines = [];
    lines.push(`Mahasiswa : ${m.nama_mahasiswa} (${m.nim})`);
    lines.push(`regId     : ${state.selected.regId}`);
    lines.push(`Raw count : ${v.raw.length}`);
    lines.push(`MK unik   : ${v.stats.uniqueMk}`);
    lines.push(`MK dobel  : ${v.stats.dupMk}`);
    lines.push('');
    lines.push('--- Record per MK (top 30) ---');

    const byMk = new Map();
    for (const r of v.raw) {
      const key = r.id_matkul || r.kode_mata_kuliah || '(tanpa id)';
      if (!byMk.has(key)) byMk.set(key, []);
      byMk.get(key).push(r);
    }
    for (const [key, arr] of [...byMk.entries()].slice(0, 30)) {
      const kode = arr[0]?.kode_mata_kuliah || key.slice(0, 8);
      lines.push(
        `${kode}: ${arr.length}× ` +
        arr.map(r => `${hurufLabel(r.nilai_huruf)}@${r.smt_diambil || '?'}`).join(', ')
      );
    }

    const summaryText = lines.join('\n');
    console.log(summaryText);

    // Salin seluruh raw JSON ke clipboard
    try {
      navigator.clipboard.writeText(JSON.stringify(v.raw, null, 2));
      alert(
        `Debug info tersalin ke clipboard!\n\n` +
        summaryText.substring(0, 500) +
        '\n\n(JSON lengkap juga tersalin — paste ke text editor untuk cek)'
      );
    } catch {
      // Fallback: tampilkan di console
      console.log('RAW JSON:', v.raw);
      alert(
        `Debug info (lihat console untuk JSON lengkap)\n\n` +
        summaryText.substring(0, 500)
      );
    }

  }

  /* ---------------- 7) Terapkan: delete-all + insert best ---------------- */
async function handleApply() {
  if (!state.selected || !state.verified) return;
  const v = state.verified;
  if (!state.selectedMkIds.size) { alert('Belum ada MK yang dicentang.'); return; }

  const { m, regId, riwayat } = state.selected;
  const dupMks = v.detail.filter(d => d.isDup && state.selectedMkIds.has(d.id_matkul));
  if (!dupMks.length) { alert('Tidak ada MK berulang yang dipilih.'); return; }

  // Pra-validasi insert
  const plans = [];
  const preErrors = [];
  for (const d of dupMks) {
    const plan = buildInsertRecord(d.bestRecord, regId, riwayat?.id_periode_masuk);
    if (!plan.ok) {
      preErrors.push(`${d.kode_mata_kuliah} — ${plan.error}`);
    } else {
      plans.push({ mk: d, record: plan.record });
    }
  }
  if (preErrors.length) {
    alert(`Tidak bisa diproses:\n\n${preErrors.join('\n')}`);
    logger.log('error', `Apply ditolak: ${preErrors.length} MK tak bisa di-insert`, {
      nim: m.nim, errors: preErrors,
    });
    return;
  }

  const detailText = plans.map(p =>
    `• ${p.mk.kode_mata_kuliah}: ${p.mk.attempts.join(' → ')} → ${p.mk.bestHuruf}`
  ).join('\n');

  if (!confirm(
    `Proses ${plans.length} MK untuk ${m.nama_mahasiswa} (${m.nim})?\n\n` +
    detailText + '\n\n' +
    `IPK: ${fmt(v.rawSummary.ipk)} → ${fmt(v.summary.ipk)}\n\n` +
    `Transkrip final per MK akan ditimpa dengan nilai tertinggi.\n\n` +
    `Lanjutkan? (backup otomatis diunduh)`
  )) return;

  // downloadBackup(v.raw, `backup-transkrip-${m.nim || m.id_mahasiswa}-${Date.now()}.json`);

  el.btnApply.disabled = true;
  el.btnApply.textContent = '⏳ Menerapkan…';

  logger.log('info', `Mulai terapkan transkrip: ${m.nama_mahasiswa}`, {
    nim: m.nim, regId,
    total_mk: plans.length,
    same_id_dup: v.stats.sameIdDup,
    cross_id_dup: v.stats.diffIdDup,
  });

  let ok = 0, fail = 0;
  const errors = [];

  for (let i = 0; i < plans.length; i++) {
    const { mk, record } = plans[i];
    const prefix = `(${i + 1}/${plans.length})`;
    setStatus(`${prefix} ${mk.kode_mata_kuliah} — ${mk.attempts.join('/')} → ${mk.bestHuruf}…`);

    // 1) Hapus transkrip final untuk SEMUA id_matkul dalam grup
    //    (mendukung kasus kurikulum berubah)
    // for (const idMk of mk.allIdMatkul) {
    //   try {
    //     await api.deleteTranskripMahasiswa({
    //       id_registrasi_mahasiswa: regId,
    //       id_matkul:               idMk,
    //     });
    //   } catch (e) {
    //     // Kalau delete gagal karena record tidak ada, lanjut saja
    //     if (DEBUG_API) console.warn(`delete ${idMk}: ${e.message}`);
    //     logger.log('warning', `${mk.kode_mata_kuliah} delete ${idMk.slice(0, 8)}: ${e.message}`);
    //   }
    // }

    // 2) Insert transkrip baru dengan nilai terbaik
    try {
      await api.insertTranskripMahasiswa(record);
      ok++;
      logger.log('success', `${mk.kode_mata_kuliah} OK: ${mk.attempts.join('/')} → ${mk.bestHuruf}`, {
        nim: m.nim, id_matkul: record.id_matkul, record,
      });
    } catch (e) {
        fail++;
        errors.push(`${mk.kode_mata_kuliah} [insert]: ${e.message}`);
        logger.log('error', `${mk.kode_mata_kuliah} insert gagal: ${e.message}`, {
          nim: m.nim,
          record,
          error: e.message,
        });

        if (DEBUG_API) {
          console.error(`[Apply] ${mk.kode_mata_kuliah} gagal insert:`, {
            error: e.message,
            record: record,
          });
        }
    }
  }

  logger.log(
    fail === 0 ? 'success' : 'warning',
    `Selesai: ${ok} sukses, ${fail} gagal`,
    { nim: m.nim, ok, fail, errors: errors.slice(0, 10) }
  );

  setStatus(`✅ ${ok} sukses, ${fail} gagal. Memuat ulang…`);
  state.selectedMkIds.clear();
  await loadTranskrip(regId);

  if (fail > 0) {
    alert(`Selesai: ${ok} sukses, ${fail} gagal.\n\n${errors.slice(0, 5).join('\n')}`);
  }
}

  /* ---------------- Bindings ---------------- */
  el.btnCari.addEventListener('click', handleSearch);
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  el.btnRefresh.addEventListener('click', () => {
    if (state.selected) loadTranskrip(state.selected.regId);
  });
  el.btnBackup.addEventListener('click', handleBackup);
  el.btnApply.addEventListener('click', handleApply);

  el.btnDebug.addEventListener('click', handleDebug);

  /* ---------------- Start ---------------- */
  await loadAllMahasiswa();
}