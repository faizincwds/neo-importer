// ============================================================
// HTML escape utility
// ============================================================
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class GridEditor {
  constructor(container, fields, data, mapping, callbacks = {}) {
    this.container = container;
    this.fields = fields;
    this.data = data;
    this.mapping = mapping;
    this.callbacks = callbacks;
    this.selectedRows = new Set();
    this.pageSize = 50;
    this.currentPage = 1;
    this.searchQuery = '';
    this.errorOnly = false;

    // Cache hasil filter per render
    this._filteredCache = null;
    this._filteredCacheKey = '';

    this._buildLayout();
    this.renderTable();
  }

  // ---------- LAYOUT ----------
  _buildLayout() {
    this.container.innerHTML = `
      <div class="grid-toolbar mb-3 flex flex-wrap items-center gap-2">
        <div class="relative">
          <input type="text"
                 class="grid-search w-64 p-2 pl-8 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                 placeholder="Cari data...">
          <span class="absolute left-2 top-2 text-gray-400 text-sm">🔍</span>
        </div>
        <button class="grid-search-clear text-xs px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hidden">✖ Hapus Filter</button>
        <button class="grid-error-filter text-xs px-3 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
          ⚠️ Hanya Baris Error
        </button>
        <span class="grid-search-info text-xs text-gray-500"></span>
        <div class="ml-auto flex items-center gap-2 text-xs">
          <label class="text-gray-500">Baris/halaman:</label>
          <select class="grid-page-size p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
            ${[25, 50, 100, 200, 500]
              .map(n => `<option value="${n}" ${n === this.pageSize ? 'selected' : ''}>${n}</option>`)
              .join('')}
          </select>
        </div>
      </div>

      <div class="grid-table-wrapper overflow-x-auto"></div>

      <div class="grid-pagination flex flex-wrap items-center justify-between gap-2 mt-3 text-xs">
        <span class="grid-total text-gray-500"></span>
        <div class="flex items-center gap-1">
          <button class="grid-first-page px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40">«</button>
          <button class="grid-prev-page px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40">‹ Sebelumnya</button>
          <span class="grid-page-info px-2"></span>
          <button class="grid-next-page px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40">Berikutnya ›</button>
          <button class="grid-last-page px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40">»</button>
        </div>
      </div>
    `;

    this.tableWrapper = this.container.querySelector('.grid-table-wrapper');
    this.searchInput = this.container.querySelector('.grid-search');
    this.clearBtn = this.container.querySelector('.grid-search-clear');
    this.searchInfo = this.container.querySelector('.grid-search-info');
    this.totalInfo = this.container.querySelector('.grid-total');
    this.pageInfo = this.container.querySelector('.grid-page-info');
    this.errorFilterBtn = this.container.querySelector('.grid-error-filter');

    this.errorFilterBtn.addEventListener('click', () => {
      this.errorOnly = !this.errorOnly;
      this.currentPage = 1;
      this._filteredCache = null;
      this._updateErrorFilterButton();
      this.renderTable();
    });

    let timer;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.searchQuery = e.target.value || '';
        this.currentPage = 1;
        this._filteredCache = null;
        this.clearBtn.classList.toggle('hidden', !this.searchQuery);
        this.renderTable();
      }, 200);
    });

    this.clearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.currentPage = 1;
      this._filteredCache = null;
      this.clearBtn.classList.add('hidden');
      this.renderTable();
    });

    this.container.querySelector('.grid-page-size').addEventListener('change', (e) => {
      this.pageSize = parseInt(e.target.value, 10) || 100;
      this.currentPage = 1;
      this.renderTable();
    });

    this.container.querySelector('.grid-first-page').addEventListener('click', () => {
      if (this.currentPage > 1) { this.currentPage = 1; this.renderTable(); }
    });
    this.container.querySelector('.grid-prev-page').addEventListener('click', () => {
      if (this.currentPage > 1) { this.currentPage--; this.renderTable(); }
    });
    this.container.querySelector('.grid-next-page').addEventListener('click', () => {
      if (this.currentPage < this.totalPages) { this.currentPage++; this.renderTable(); }
    });
    this.container.querySelector('.grid-last-page').addEventListener('click', () => {
      if (this.currentPage < this.totalPages) { this.currentPage = this.totalPages; this.renderTable(); }
    });
  }

  _updateErrorFilterButton() {
    if (!this.errorFilterBtn) return;
    if (this.errorOnly) {
      this.errorFilterBtn.textContent = '✅ Tampilkan Semua';
      this.errorFilterBtn.classList.add('bg-red-500', 'text-white');
      this.errorFilterBtn.classList.remove('bg-red-100', 'text-red-700', 'dark:bg-red-900/40', 'dark:text-red-500');
    } else {
      this.errorFilterBtn.textContent = '⚠️ Hanya Baris Error';
      this.errorFilterBtn.classList.remove('bg-red-500', 'text-white');
      this.errorFilterBtn.classList.add('bg-red-100', 'text-red-700', 'dark:bg-red-900/40', 'dark:text-red-700');
    }
  }

  // ---------- HELPER: cache filtered rows ----------
  _getFilteredKey() {
    return `${this.searchQuery}|${this.errorOnly}|${this.data.length}`;
  }

  getFilteredRows() {
    const key = this._getFilteredKey();
    if (this._filteredCache && this._filteredCacheKey === key) {
      return this._filteredCache;
    }

    const q = this.searchQuery.trim().toLowerCase();
    const indexed = this.data.map((row, i) => ({ row, originalIdx: i }));

    let filtered = this.errorOnly
      ? indexed.filter(({ row }) => row.__errors && Object.keys(row.__errors).length > 0)
      : indexed;

    if (q) {
      filtered = filtered.filter(({ row }) =>
        this.fields.some(f => String(row[f] ?? '').toLowerCase().includes(q))
      );
    }

    this._filteredCache = filtered;
    this._filteredCacheKey = key;
    return filtered;
  }

  get totalPages() {
    const total = this.getFilteredRows().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  clampPage() {
    if (this.currentPage < 1) this.currentPage = 1;
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
  }

  // ---------- RENDER TABEL ----------
  renderTable() {
    this.clampPage();
    const filtered = this.getFilteredRows();
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageRows = filtered.slice(start, end);

    let html = `<table class="w-full text-sm"><thead><tr>
      <th class="p-2"><input type="checkbox" class="select-all"></th>
      <th class="p-2">No</th>`;
    this.fields.forEach(f => html += `<th class="p-2">${escapeHtml(f)}</th>`);
    html += `<th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead><tbody>`;

    if (pageRows.length === 0) {
      const msg = this.searchQuery
        ? `Tidak ada data yang cocok dengan "<strong>${escapeHtml(this.searchQuery)}</strong>".`
        : 'Tidak ada data.';
      html += `<tr><td colspan="${this.fields.length + 4}" class="p-6 text-center text-gray-500">${msg}</td></tr>`;
    } else {
      pageRows.forEach(({ row, originalIdx }, i) => {
        const isChecked = this.selectedRows.has(originalIdx) ? 'checked' : '';

        // Nomor: posisi di halaman (bukan originalIdx)
        const displayNo = start + i + 1;

        html += `<tr class="border-b dark:border-gray-600">
          <td class="p-2"><input type="checkbox" class="row-checkbox" data-index="${originalIdx}" ${isChecked}></td>
          <td class="p-2" title="Baris asli: ${originalIdx + 1}">${displayNo}</td>`;

        this.fields.forEach(f => {
          const val = row[f] ?? '';
          const errorClass = row.__errors && row.__errors[f] ? 'error-cell' : '';
          const safeVal = escapeHtml(val);
          html += `<td class="p-2 ${errorClass}" contenteditable="true" data-field="${escapeHtml(f)}" data-index="${originalIdx}" title="${row.__errors?.[f] ? escapeHtml(row.__errors[f]) : ''}">${safeVal}</td>`;
        });

        // Status: PAKAI statusHtml, bukan status
        const status = row.status || '';
        let statusHtml = escapeHtml(status);
        if (row.__errors && Object.keys(row.__errors).length > 0) {
          const errList = Object.entries(row.__errors)
            .map(([field, msg]) => `${field}: ${msg}`)
            .join('; ');
          statusHtml = `<span class="text-red-500" title="${escapeHtml(errList)}">❌ ${escapeHtml(errList)}</span>`;
        } else if (status === 'OK') {
          statusHtml = `<span class="text-green-500">✅ OK</span>`;
        }

        html += `<td class="p-2">${statusHtml}</td>
          <td class="p-2"><button class="delete-row-btn bg-red-500 text-white px-2 py-1 rounded text-xs" data-index="${originalIdx}">Hapus</button></td>
        </tr>`;
      });
    }
    html += `</tbody></table>`;

    this.tableWrapper.innerHTML = html;
    this._attachTableEvents();
    this._updatePaginationUI(filtered.length);
  }

  _attachTableEvents() {
    // Per‑baris checkbox
    this.tableWrapper.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (e.target.checked) this.selectedRows.add(idx);
        else this.selectedRows.delete(idx);
        this.callbacks.onSelectionChange?.(this.selectedRows);
      });
    });

    // Select‑all
    this.tableWrapper.querySelector('.select-all')?.addEventListener('change', (e) => {
      const filtered = this.getFilteredRows();
      const start = (this.currentPage - 1) * this.pageSize;
      const pageRows = filtered.slice(start, start + this.pageSize);
      this.tableWrapper.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
      });
      pageRows.forEach(({ originalIdx }) => {
        if (e.target.checked) this.selectedRows.add(originalIdx);
        else this.selectedRows.delete(originalIdx);
      });
      this.callbacks.onSelectionChange?.(this.selectedRows);
    });

    // Delete per baris
    this.tableWrapper.querySelectorAll('.delete-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.data.splice(idx, 1);
        this.selectedRows.clear();
        this._filteredCache = null;   // invalidate
        this.clampPage();
        this.renderTable();
        this.callbacks.onDelete?.(idx);
      });
    });

    // Edit cell
    this.tableWrapper.querySelectorAll('[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        const newVal = e.target.innerText.trim();
        if (!this.data[idx]) return;
        if (this.data[idx][field] === newVal) return;   // tidak berubah

        this.data[idx][field] = newVal;
        this.callbacks.onCellEdit?.(idx, field, newVal);

        // Setelah edit, kalau parent tidak render ulang, setidaknya
        // hilangkan error-cell visual untuk field ini
        if (this.data[idx].__errors?.[field]) {
          delete this.data[idx].__errors[field];
          e.target.classList.remove('error-cell');
        }
      });
    });
  }

  _updatePaginationUI(filteredCount) {
    const totalAll = this.data.length;
    // Cache total error — tidak iterate ulang tiap render
    if (this._totalErrorCache === undefined || this._totalErrorCacheKey !== totalAll) {
      this._totalErrorCache = this.data.filter(r => r.__errors && Object.keys(r.__errors).length > 0).length;
      this._totalErrorCacheKey = totalAll;
    }
    const totalError = this._totalErrorCache;

    const parts = [];
    if (this.searchQuery) parts.push(`${filteredCount} / ${totalAll} cocok`);
    if (this.errorOnly) parts.push(`⚠️ ${totalError} baris error`);
    this.searchInfo.textContent = parts.join(' · ');

    this.totalInfo.textContent = this.searchQuery || this.errorOnly
      ? `Total tampil: ${filteredCount} (dari ${totalAll})`
      : `Total: ${totalAll} baris`;

    this.pageInfo.textContent = `Halaman ${this.currentPage} / ${this.totalPages}`;

    const atFirst = this.currentPage === 1;
    const atLast = this.currentPage >= this.totalPages;
    this.container.querySelector('.grid-first-page').disabled = atFirst;
    this.container.querySelector('.grid-prev-page').disabled = atFirst;
    this.container.querySelector('.grid-next-page').disabled = atLast;
    this.container.querySelector('.grid-last-page').disabled = atLast;
  }

  // ---------- PUBLIC API ----------
  setErrorOnly(active) {
    this.errorOnly = !!active;
    this.currentPage = 1;
    this._filteredCache = null;
    this._updateErrorFilterButton();
    this.renderTable();
  }

  getData() { return this.data; }

  setData(newData) {
    this.data = newData;
    this.selectedRows.clear();
    this.currentPage = 1;
    this.errorOnly = false;
    this.searchQuery = '';
    this._filteredCache = null;
    this._totalErrorCache = undefined;
    if (this.searchInput) this.searchInput.value = '';
    if (this.clearBtn) this.clearBtn.classList.add('hidden');
    this._updateErrorFilterButton();
    this.renderTable();
  }

  setSearchQuery(q) {
    this.searchQuery = q || '';
    this.searchInput.value = this.searchQuery;
    this.clearBtn.classList.toggle('hidden', !this.searchQuery);
    this.currentPage = 1;
    this._filteredCache = null;
    this.renderTable();
  }
}